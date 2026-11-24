import json
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from evidence_auto_sync import (
    BackendError,
    EvidenceQueue,
    EvidenceSyncService,
    LocalFolderBackend,
    QueueCorruptError,
    RcloneBackend,
    _load_config,
    create_sync_service,
)


class _FailOnceBackend:
    name = "fake"

    def __init__(self):
        self.calls = 0

    def put(self, source, event_folder, target_name):
        self.calls += 1
        if self.calls == 1:
            raise BackendError("temporary network failure")
        return {"backend": self.name, "destination": f"{event_folder}/{target_name}"}


class EvidenceQueueTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.queue_path = self.root / "state" / "queue.json"

    def tearDown(self):
        self.temporary.cleanup()

    def queue(self, **kwargs):
        defaults = {
            "stable_seconds": 0,
            "missing_poll_seconds": 3,
            "backoff_base_seconds": 2,
            "backoff_cap_seconds": 30,
        }
        defaults.update(kwargs)
        return EvidenceQueue(self.queue_path, **defaults)

    def test_enqueue_is_atomic_and_idempotent(self):
        source = self.root / "scene.jpg"
        queue = self.queue()
        first = queue.enqueue("event-001", [source], {"plate": "43A12345"})
        second = queue.enqueue("event-001", [source], {"lane": "DOC"})

        self.assertEqual(len(first["files"]), 1)
        self.assertEqual(len(second["files"]), 1)
        self.assertEqual(second["metadata"], {"plate": "43A12345", "lane": "DOC"})
        with self.queue_path.open("r", encoding="utf-8") as stream:
            on_disk = json.load(stream)
        self.assertEqual(on_disk["schema_version"], 1)
        self.assertEqual(list(on_disk["events"]), ["event-001"])
        self.assertFalse(list(self.queue_path.parent.glob("*.tmp")))

    def test_late_file_waits_then_syncs_to_local_folder(self):
        source = self.root / "late_clip.mp4"
        destination = self.root / "drive"
        queue = self.queue()
        queue.enqueue("late-event", [source])

        waiting = queue.run_once(LocalFolderBackend(destination), now=100)
        self.assertEqual(waiting["uploaded"], 0)
        self.assertEqual(waiting["file_statuses"], {"waiting_file": 1})

        source.write_bytes(b"finished evidence clip")
        synced = queue.run_once(LocalFolderBackend(destination), now=103)
        self.assertEqual(synced["uploaded"], 1)
        copied = destination / "late-event" / "late_clip.mp4"
        self.assertEqual(copied.read_bytes(), source.read_bytes())
        self.assertEqual(queue.status()["event_statuses"], {"complete": 1})

        repeated = queue.run_once(LocalFolderBackend(destination), now=200)
        self.assertEqual(repeated["claimed"], 0)
        self.assertEqual(repeated["uploaded"], 0)

    def test_queue_only_never_marks_files_uploaded(self):
        source = self.root / "evidence.jpg"
        source.write_bytes(b"pixels")
        queue = self.queue()
        queue.enqueue("offline-event", [source])

        result = queue.run_once(None)
        self.assertEqual(result["mode"], "queue-only")
        self.assertEqual(result["uploaded"], 0)
        self.assertEqual(queue.status()["file_statuses"], {"pending": 1})

        reloaded = self.queue()
        self.assertEqual(reloaded.status()["events_total"], 1)

    def test_reenqueue_modified_uploaded_file_schedules_replacement(self):
        source = self.root / "review.csv"
        source.write_text("raw,reviewed\nAF454O2M,\n", encoding="utf-8")
        destination = self.root / "drive"
        queue = self.queue()
        queue.enqueue("review-event", [source])
        queue.run_once(LocalFolderBackend(destination), now=10)
        self.assertEqual(queue.status()["event_statuses"], {"complete": 1})

        source.write_text("raw,reviewed\nAF454O2M,BG65USJ\n", encoding="utf-8")
        queue.enqueue("review-event", [source], {"review": "HUMAN_REVIEWED"})
        self.assertEqual(queue.status()["file_statuses"], {"pending": 1})
        queue.run_once(LocalFolderBackend(destination), now=20)

        self.assertEqual(
            (destination / "review-event" / "review.csv").read_text(encoding="utf-8"),
            source.read_text(encoding="utf-8"),
        )

    def test_external_acknowledgement_requires_matching_remote_size(self):
        source = self.root / "clip.mp4"
        source.write_bytes(b"verified clip")
        queue = self.queue()
        queue.enqueue("external-event", [source])
        with self.assertRaisesRegex(ValueError, "size mismatch"):
            queue.acknowledge_uploaded(
                "external-event", source, {"backend": "connector"}, expected_size=1
            )
        self.assertTrue(queue.acknowledge_uploaded(
            "external-event",
            source,
            {"backend": "connector", "destination": "drive-file-id"},
            expected_size=source.stat().st_size,
        ))
        self.assertEqual(queue.status()["event_statuses"], {"complete": 1})

    def test_retry_uses_exponential_backoff(self):
        source = self.root / "evidence.csv"
        source.write_text("plate,speed\n43A,60\n", encoding="utf-8")
        queue = self.queue()
        queue.enqueue("retry-event", [source])
        backend = _FailOnceBackend()

        failed = queue.run_once(backend, now=100)
        self.assertEqual(failed["failed"], 1)
        record = next(iter(queue.snapshot()["events"]["retry-event"]["files"].values()))
        self.assertEqual(record["attempts"], 1)
        self.assertEqual(record["next_attempt_at"], 102)

        too_early = queue.run_once(backend, now=101)
        self.assertEqual(too_early["claimed"], 0)
        self.assertEqual(backend.calls, 1)

        success = queue.run_once(backend, now=102)
        self.assertEqual(success["uploaded"], 1)
        self.assertEqual(backend.calls, 2)

    def test_two_same_basenames_get_distinct_targets(self):
        first = self.root / "camera_a" / "frame.jpg"
        second = self.root / "camera_b" / "frame.jpg"
        first.parent.mkdir()
        second.parent.mkdir()
        first.write_bytes(b"a")
        second.write_bytes(b"b")
        queue = self.queue()
        event = queue.enqueue("collision", [first, second])
        targets = {item["target_name"] for item in event["files"].values()}
        self.assertEqual(len(targets), 2)

        destination = self.root / "drive"
        result = queue.run_once(LocalFolderBackend(destination), now=10)
        self.assertEqual(result["uploaded"], 2)
        self.assertEqual(
            {path.read_bytes() for path in (destination / "collision").iterdir()},
            {b"a", b"b"},
        )

    def test_corrupt_queue_is_not_silently_overwritten(self):
        self.queue_path.parent.mkdir(parents=True)
        self.queue_path.write_text("{broken", encoding="utf-8")
        with self.assertRaises(QueueCorruptError):
            self.queue().enqueue("event", [self.root / "x.jpg"])
        self.assertEqual(self.queue_path.read_text(encoding="utf-8"), "{broken")


class BackendTests(unittest.TestCase):
    def test_rclone_uses_argument_vector_no_shell_and_timeout(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "scene.jpg"
            source.write_bytes(b"image")
            completed = subprocess.CompletedProcess([], 0, stdout="", stderr="")
            with mock.patch("evidence_auto_sync.subprocess.run", return_value=completed) as run:
                backend = RcloneBackend("drive:Smart Traffic", executable="rclone-test", timeout=17)
                receipt = backend.put(source, "event 1", "scene.jpg")

            arguments, keyword = run.call_args
            self.assertEqual(arguments[0][0:3], ["rclone-test", "copyto", str(source.resolve())])
            self.assertEqual(arguments[0][3], "drive:Smart Traffic/event 1/scene.jpg")
            self.assertIs(keyword["shell"], False)
            self.assertEqual(keyword["timeout"], 17)
            self.assertEqual(receipt["backend"], "rclone")

    def test_rclone_timeout_becomes_backend_error(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "clip.mp4"
            source.write_bytes(b"video")
            with mock.patch(
                "evidence_auto_sync.subprocess.run",
                side_effect=subprocess.TimeoutExpired(["rclone"], 4),
            ):
                with self.assertRaisesRegex(BackendError, "timed out"):
                    RcloneBackend("drive:evidence", timeout=4).put(source, "e1", "clip.mp4")

    def test_rclone_calls_are_serialized_across_backend_instances(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "scene.jpg"
            source.write_bytes(b"image")
            active = 0
            overlap = []
            guard = threading.Lock()

            def fake_run(*_args, **_kwargs):
                nonlocal active
                with guard:
                    if active:
                        overlap.append(True)
                    active += 1
                time.sleep(0.04)
                with guard:
                    active -= 1
                return subprocess.CompletedProcess([], 0, stdout="", stderr="")

            first = RcloneBackend("drive:serialized-test", min_interval=0)
            second = RcloneBackend("drive:serialized-test", min_interval=0)
            self.assertEqual(first._process_lock_path, second._process_lock_path)
            with mock.patch("evidence_auto_sync.subprocess.run", side_effect=fake_run):
                threads = [
                    threading.Thread(target=first.put, args=(source, "event", "a.jpg")),
                    threading.Thread(target=second.put, args=(source, "event", "b.jpg")),
                ]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join(3)
            self.assertFalse(overlap)
            self.assertFalse(any(thread.is_alive() for thread in threads))

    def test_config_rejects_embedded_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            config = Path(temporary) / "config.json"
            config.write_text(
                json.dumps({"backend": "rclone", "oauth_token": "must-not-live-here"}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Do not store credentials"):
                _load_config(str(config))


class EvidenceSyncServiceTests(unittest.TestCase):
    def test_local_config_delivers_bundle_automatically(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "scene.jpg"
            source.write_bytes(b"annotated xyxy evidence")
            queue_path = root / "queue.json"
            destination = root / "drive"
            config = root / "sync.json"
            config.write_text(json.dumps({
                "enabled": True,
                "backend": "local",
                "local_folder": str(destination),
                "queue": str(queue_path),
                "stable_seconds": 0,
                "poll_seconds": 0.05,
            }), encoding="utf-8")

            service = create_sync_service(config_path=config)
            service.enqueue("event-auto", [source], {"model": "YOLO"})
            result = service.close(2)

            self.assertEqual(result["event_statuses"], {"complete": 1})
            self.assertEqual(
                (destination / "event-auto" / "scene.jpg").read_bytes(),
                source.read_bytes(),
            )

    def test_backend_failure_stays_queued_and_does_not_raise(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "clip.mp4"
            source.write_bytes(b"clip")
            queue = EvidenceQueue(
                root / "queue.json",
                stable_seconds=0,
                backoff_base_seconds=10,
                backoff_cap_seconds=10,
            )
            service = EvidenceSyncService(queue, _FailOnceBackend(), interval=0.05)
            self.assertIsNotNone(service.enqueue("event-retry", [source]))
            service.close(0)
            self.assertIn(
                queue.status()["event_statuses"],
                ({"retry": 1}, {"uploading": 1}),
            )

    def test_invalid_secret_config_falls_back_to_queue_only(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = root / "sync.json"
            config.write_text(json.dumps({"oauth_token": "not-allowed"}), encoding="utf-8")
            service = create_sync_service(
                config_path=config,
                queue_path=root / "queue.json",
            )
            self.assertTrue(service.queue_only)
            service.close(0)

    def test_corrupt_queue_does_not_crash_service_shutdown(self):
        with tempfile.TemporaryDirectory() as temporary:
            queue_path = Path(temporary) / "queue.json"
            queue_path.write_text("{broken", encoding="utf-8")
            service = EvidenceSyncService(EvidenceQueue(queue_path))
            result = service.close(0)
            self.assertEqual(result["mode"], "queue-error")


if __name__ == "__main__":
    unittest.main()
