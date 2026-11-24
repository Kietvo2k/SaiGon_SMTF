import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

from web.server import VideoJobManager


class VideoJobManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.manager = VideoJobManager(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def _write_job(self, job_id="20260718_210000_abcdef12"):
        folder = os.path.join(self.temp.name, job_id)
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "job.json"), "w", encoding="utf-8") as f:
            json.dump({
                "id": job_id,
                "mode": "vehicle",
                "status": "completed",
                "source_path": os.path.join(folder, "source.mp4"),
            }, f)
        return job_id, folder

    def test_read_merges_public_progress_and_hides_source_path(self):
        job_id, folder = self._write_job()
        with open(os.path.join(folder, "progress.json"), "w", encoding="utf-8") as f:
            json.dump({"progress_pct": 42.5}, f)
        with open(os.path.join(folder, "preview.jpg"), "wb") as f:
            f.write(b"jpg")
        with open(os.path.join(folder, "metrics.csv"), "wb") as f:
            f.write(b"a,b\n")
        nested = os.path.join(folder, "events", "event_1")
        os.makedirs(nested)
        with open(os.path.join(nested, "vehicle.jpg"), "wb") as f:
            f.write(b"crop")

        job = self.manager.read(job_id)

        self.assertEqual(job["progress"]["progress_pct"], 42.5)
        self.assertTrue(job["preview_available"])
        self.assertNotIn("source_path", job)
        self.assertIn("metrics.csv", [item["name"] for item in job["artifacts"]])
        self.assertIn("events/event_1/vehicle.jpg",
                      [item["name"] for item in job["artifacts"]])

    def test_job_id_and_artifact_scope_reject_traversal(self):
        self.assertIsNone(self.manager._job_dir("../../outside"))
        self.assertIsNone(self.manager._job_dir("not-a-job"))
        job_id, folder = self._write_job()
        self.assertIsNone(self.manager.artifact_path(job_id, "../../secret.txt"))
        self.assertEqual(self.manager.artifact_path(job_id, "events/a.jpg"),
                         os.path.join(folder, "events", "a.jpg"))

    def test_commands_keep_outputs_inside_job_folder(self):
        job_id, folder = self._write_job()
        source = os.path.join(folder, "source.mp4")
        vehicle = self.manager._build_command("vehicle", source, folder, {})
        heatmap = self.manager._build_command("heatmap", source, folder, {})

        self.assertIn("uploaded_video_processor.py", " ".join(vehicle))
        self.assertEqual(vehicle[vehicle.index("--job-dir") + 1], folder)
        self.assertIn("traffic_density_heatmap.py", " ".join(heatmap))
        self.assertEqual(heatmap[heatmap.index("--output") + 1],
                         os.path.join(folder, "output.mp4"))

    def test_rejects_unsupported_upload_before_writing(self):
        with self.assertRaisesRegex(ValueError, "MP4"):
            self.manager.create_from_request(
                io.BytesIO(b"not-video"), len(b"not-video"), "payload.exe",
                "vehicle", {},
            )
        self.assertEqual(os.listdir(self.temp.name), [])

    def test_slow_upload_does_not_block_status_reads(self):
        entered = threading.Event()
        release = threading.Event()
        upload_done = threading.Event()
        read_done = threading.Event()
        errors = []

        class BlockingStream:
            def read(self, _size):
                entered.set()
                release.wait(2.0)
                return b"x"

        def upload():
            try:
                self.manager.create_from_request(
                    BlockingStream(), 1, "sample.mp4", "vehicle", {},
                )
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)
            finally:
                upload_done.set()

        def read_status():
            self.manager.read()
            read_done.set()

        pause_file = os.path.join(self.temp.name, "pause.active")
        command = [sys.executable, "-c", "pass"]
        with mock.patch("web.server.UPLOAD_AI_PAUSE_FILE", pause_file), \
                mock.patch.object(self.manager, "_build_command", return_value=command):
            uploader = threading.Thread(target=upload)
            uploader.start()
            self.assertTrue(entered.wait(1.0))
            reader = threading.Thread(target=read_status)
            reader.start()
            responsive = read_done.wait(0.5)
            release.set()
            uploader.join(2.0)
            reader.join(2.0)
            deadline = time.time() + 2.0
            while self.manager.active_id and time.time() < deadline:
                time.sleep(0.01)

        self.assertTrue(responsive, "status read was blocked by the upload body")
        self.assertTrue(upload_done.is_set())
        self.assertEqual(errors, [])

    def test_cancelled_worker_is_not_reported_as_failed(self):
        pause_file = os.path.join(self.temp.name, "pause.active")
        command = [sys.executable, "-c", "import time; time.sleep(30)"]
        with mock.patch("web.server.UPLOAD_AI_PAUSE_FILE", pause_file), \
                mock.patch.object(self.manager, "_build_command", return_value=command):
            job = self.manager.create_from_request(
                io.BytesIO(b"x"), 1, "sample.mp4", "vehicle", {},
            )
            job_id = job["id"]
            deadline = time.time() + 2.0
            while self.manager.process is None and time.time() < deadline:
                time.sleep(0.01)
            self.assertIsNotNone(self.manager.process)
            self.assertTrue(self.manager.cancel(job_id))
            deadline = time.time() + 3.0
            while self.manager.active_id and time.time() < deadline:
                time.sleep(0.01)

        final = self.manager.read(job_id)
        self.assertEqual(final["status"], "cancelled")
        self.assertFalse(final["active"])


if __name__ == "__main__":
    unittest.main()
