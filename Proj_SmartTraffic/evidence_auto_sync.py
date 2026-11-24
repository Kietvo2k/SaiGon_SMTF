"""Durable, idempotent evidence synchronization.

The detector can enqueue an event before all of its artifacts exist.  This is
important for evidence clips, which are normally finalized a few seconds after
the event image and CSV row.  A worker keeps the missing file in the queue and
retries it when it appears.

Two upload backends are intentionally small and credential-free:

* ``local`` atomically copies artifacts into a local folder.  Point that folder
  at a Google Drive for desktop directory and the Drive client performs the
  network sync (and retains its own offline queue).
* ``rclone`` invokes an already configured rclone installation.  OAuth tokens
  stay in rclone's external configuration; this module never stores them.

With no backend configured, ``run-once`` and ``watch`` operate in queue-only
mode.  Nothing is removed or marked as uploaded, so configuration can be added
later without losing an event.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterable, Mapping, MutableMapping, Optional, Sequence


SCHEMA_VERSION = 1
DEFAULT_QUEUE_PATH = Path("logs") / "evidence_sync_queue.json"
SECRET_KEY_FRAGMENTS = ("token", "secret", "password", "credential", "client_secret")


class EvidenceSyncError(RuntimeError):
    """Base error for queue and backend failures."""


class QueueCorruptError(EvidenceSyncError):
    """Raised instead of replacing a queue that cannot be decoded safely."""


class BackendError(EvidenceSyncError):
    """Raised when an artifact could not be copied or uploaded."""


def _utc_iso(epoch: Optional[float] = None) -> str:
    import datetime as _datetime

    moment = _datetime.datetime.fromtimestamp(
        time.time() if epoch is None else epoch, tz=_datetime.timezone.utc
    )
    return moment.isoformat().replace("+00:00", "Z")


def _empty_queue() -> dict[str, Any]:
    return {"schema_version": SCHEMA_VERSION, "events": {}}


def _fsync_directory(path: Path) -> None:
    """Best-effort directory fsync for durable rename on POSIX."""

    if os.name == "nt":
        return
    try:
        descriptor = os.open(str(path), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        # Windows virus scanners/readers can briefly deny the rename even
        # though our queue lock is correct.  Retry the same atomic replace;
        # never fall back to truncating the live queue in place.
        for attempt in range(20):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if os.name != "nt" or attempt == 19:
                    raise
                time.sleep(0.025 * (attempt + 1))
        _fsync_directory(path.parent)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


@contextlib.contextmanager
def _exclusive_file_lock(lock_path: Path, timeout: float = 10.0):
    """Cross-platform advisory lock around queue read/modify/write cycles."""

    lock_path.parent.mkdir(parents=True, exist_ok=True)
    stream = open(lock_path, "a+b")
    try:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b"0")
            stream.flush()
        deadline = time.monotonic() + max(0.0, timeout)
        while True:
            try:
                stream.seek(0)
                if os.name == "nt":
                    import msvcrt

                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"Timed out locking queue: {lock_path}")
                time.sleep(0.05)
        try:
            yield stream
        finally:
            stream.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
    finally:
        stream.close()


def _safe_component(value: str, fallback: str = "item") -> str:
    invalid = '<>:"/\\|?*'
    cleaned = "".join(
        "_" if character in invalid or ord(character) < 32 else character
        for character in str(value).strip()
    ).rstrip(" .")
    if not cleaned:
        cleaned = fallback
    if cleaned.upper() in {
        "CON", "PRN", "AUX", "NUL",
        *(f"COM{number}" for number in range(1, 10)),
        *(f"LPT{number}" for number in range(1, 10)),
    }:
        cleaned = f"_{cleaned}"
    return cleaned[:180]


def _path_key(path: Path) -> str:
    normalized = os.path.normcase(os.path.abspath(str(path)))
    return hashlib.sha256(normalized.encode("utf-8", errors="surrogatepass")).hexdigest()


def _json_copy(value: Any) -> Any:
    """Validate JSON serializability and detach caller-owned objects."""

    return json.loads(json.dumps(value, ensure_ascii=False))


def _short_error(error: BaseException, limit: int = 1000) -> str:
    message = f"{type(error).__name__}: {error}".replace("\x00", "")
    return message[-limit:]


class _QueueStore:
    def __init__(self, path: os.PathLike[str] | str, lock_timeout: float = 10.0):
        self.path = Path(path).expanduser().resolve(strict=False)
        self.lock_path = self.path.with_name(f"{self.path.name}.lock")
        self.lock_timeout = lock_timeout

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.path.exists():
            return _empty_queue()
        try:
            with self.path.open("r", encoding="utf-8") as stream:
                value = json.load(stream)
        except (OSError, json.JSONDecodeError) as error:
            raise QueueCorruptError(f"Cannot read queue {self.path}: {error}") from error
        if not isinstance(value, dict) or value.get("schema_version") != SCHEMA_VERSION:
            raise QueueCorruptError(
                f"Unsupported queue schema in {self.path}; expected {SCHEMA_VERSION}"
            )
        if not isinstance(value.get("events"), dict):
            raise QueueCorruptError(f"Queue events must be an object: {self.path}")
        return value

    def snapshot(self) -> dict[str, Any]:
        with _exclusive_file_lock(self.lock_path, self.lock_timeout):
            return _json_copy(self._read_unlocked())

    def mutate(self, callback):
        with _exclusive_file_lock(self.lock_path, self.lock_timeout):
            data = self._read_unlocked()
            result = callback(data)
            _atomic_write_json(self.path, data)
            return result


class LocalFolderBackend:
    """Atomically copy evidence under ``root/event_id/file_name``."""

    name = "local"

    def __init__(self, root: os.PathLike[str] | str):
        if not str(root).strip():
            raise ValueError("Local destination folder is empty")
        self.root = Path(root).expanduser().resolve(strict=False)

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()

    def put(self, source: Path, event_folder: str, target_name: str) -> dict[str, Any]:
        source = source.resolve(strict=True)
        if not source.is_file():
            raise BackendError(f"Evidence source is not a file: {source}")

        destination_dir = (self.root / _safe_component(event_folder, "event")).resolve(
            strict=False
        )
        destination = (destination_dir / _safe_component(target_name, "evidence.bin")).resolve(
            strict=False
        )
        try:
            destination.relative_to(self.root)
        except ValueError as error:
            raise BackendError("Destination escaped the configured local root") from error

        destination_dir.mkdir(parents=True, exist_ok=True)
        before = source.stat()
        source_hash = self._sha256(source)
        if destination.exists() and destination.is_file():
            if destination.stat().st_size == before.st_size:
                if self._sha256(destination) == source_hash:
                    return {
                        "backend": self.name,
                        "destination": str(destination),
                        "sha256": source_hash,
                        "size": before.st_size,
                        "already_present": True,
                    }

        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", suffix=".part", dir=str(destination_dir)
        )
        temporary = Path(temporary_name)
        try:
            with source.open("rb") as input_stream, os.fdopen(descriptor, "wb") as output_stream:
                shutil.copyfileobj(input_stream, output_stream, length=1024 * 1024)
                output_stream.flush()
                os.fsync(output_stream.fileno())
            after = source.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise BackendError(f"Evidence changed while being copied: {source}")
            os.replace(temporary, destination)
            _fsync_directory(destination_dir)
        finally:
            with contextlib.suppress(FileNotFoundError):
                temporary.unlink()

        return {
            "backend": self.name,
            "destination": str(destination),
            "sha256": source_hash,
            "size": before.st_size,
            "already_present": False,
        }


class RcloneBackend:
    """Upload through an existing rclone configuration without storing OAuth."""

    name = "rclone"

    def __init__(
        self,
        remote: str,
        executable: os.PathLike[str] | str = "rclone",
        timeout: float = 120.0,
        min_interval: float = 1.5,
    ):
        remote = str(remote).strip().rstrip("/")
        if not remote:
            raise ValueError("rclone remote is empty")
        if timeout <= 0:
            raise ValueError("rclone timeout must be positive")
        if min_interval < 0:
            raise ValueError("rclone minimum interval cannot be negative")
        self.remote = remote
        self.executable = str(executable)
        self.timeout = float(timeout)
        self.min_interval = float(min_interval)
        self._call_lock = threading.Lock()
        self._last_call_finished = 0.0
        # Different detector/dashboard processes can share one queue/backend.
        # Serialize rclone itself across processes; otherwise Google Drive may
        # create two same-named event folders when two copyto calls race while
        # the first remote folder is still being created.
        remote_key = hashlib.sha256(remote.encode("utf-8")).hexdigest()[:20]
        self._process_lock_path = (
            Path(tempfile.gettempdir()) / f"smart_traffic_rclone_{remote_key}.lock"
        )

    def put(self, source: Path, event_folder: str, target_name: str) -> dict[str, Any]:
        source = source.resolve(strict=True)
        destination = (
            f"{self.remote}/{_safe_component(event_folder, 'event')}/"
            f"{_safe_component(target_name, 'evidence.bin')}"
        )
        command = [
            self.executable,
            "copyto",
            str(source),
            destination,
            "--checksum",
            "--retries",
            "1",
            "--low-level-retries",
            "1",
            "--tpslimit",
            "1",
            "--tpslimit-burst",
            "1",
        ]
        try:
            # One long-lived service may have several files in a bundle.  Pace
            # independent copyto processes so Google's per-client quota is not
            # hit by a burst at the exact moment an event is recorded.
            with self._call_lock:
                with _exclusive_file_lock(
                    self._process_lock_path, timeout=self.timeout + 30.0
                ) as process_lock:
                    process_lock.seek(0)
                    try:
                        last_global_call = float(
                            process_lock.read().decode("ascii", errors="ignore") or 0.0
                        )
                    except ValueError:
                        last_global_call = 0.0
                    wait_for = self.min_interval - (time.time() - last_global_call)
                    if wait_for > 0:
                        time.sleep(wait_for)
                    try:
                        completed = subprocess.run(
                            command,
                            shell=False,
                            capture_output=True,
                            text=True,
                            timeout=self.timeout,
                            check=False,
                        )
                    finally:
                        process_lock.seek(0)
                        process_lock.truncate()
                        process_lock.write(("%.6f" % time.time()).encode("ascii"))
                        process_lock.flush()
                        os.fsync(process_lock.fileno())
                        self._last_call_finished = time.monotonic()
        except subprocess.TimeoutExpired as error:
            raise BackendError(f"rclone timed out after {self.timeout:g}s") from error
        except TimeoutError as error:
            raise BackendError("Timed out waiting for the shared rclone lock") from error
        except OSError as error:
            raise BackendError(f"Cannot start rclone: {error}") from error
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "unknown rclone error").strip()
            raise BackendError(f"rclone exit {completed.returncode}: {detail[-800:]}")
        return {
            "backend": self.name,
            "destination": destination,
            "size": source.stat().st_size,
        }


class EvidenceQueue:
    """Persistent queue coordinating late files, retries, and worker leases."""

    def __init__(
        self,
        queue_path: os.PathLike[str] | str = DEFAULT_QUEUE_PATH,
        *,
        missing_poll_seconds: float = 5.0,
        stable_seconds: float = 2.0,
        backoff_base_seconds: float = 5.0,
        backoff_cap_seconds: float = 300.0,
        lease_seconds: float = 300.0,
        lock_timeout: float = 10.0,
    ):
        if min(missing_poll_seconds, stable_seconds, backoff_base_seconds) < 0:
            raise ValueError("Polling, stability, and backoff values cannot be negative")
        if backoff_cap_seconds < backoff_base_seconds:
            raise ValueError("Backoff cap cannot be smaller than backoff base")
        if lease_seconds <= 0:
            raise ValueError("Lease duration must be positive")
        self.store = _QueueStore(queue_path, lock_timeout=lock_timeout)
        self.missing_poll_seconds = float(missing_poll_seconds)
        self.stable_seconds = float(stable_seconds)
        self.backoff_base_seconds = float(backoff_base_seconds)
        self.backoff_cap_seconds = float(backoff_cap_seconds)
        self.lease_seconds = float(lease_seconds)

    @property
    def path(self) -> Path:
        return self.store.path

    def enqueue(
        self,
        event_id: str,
        file_paths: Iterable[os.PathLike[str] | str],
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Any]:
        event_id = str(event_id).strip()
        if not event_id:
            raise ValueError("event_id is empty")
        paths = [Path(path).expanduser().resolve(strict=False) for path in file_paths]
        if not paths:
            raise ValueError("At least one evidence path is required")
        metadata_copy = _json_copy(dict(metadata or {}))
        now = time.time()

        def mutate(data: MutableMapping[str, Any]):
            events = data["events"]
            event = events.get(event_id)
            if event is None:
                event_folder = _safe_component(event_id, "event")
                used_folders = {item.get("event_folder") for item in events.values()}
                if event_folder in used_folders:
                    suffix = hashlib.sha256(event_id.encode("utf-8")).hexdigest()[:8]
                    event_folder = f"{event_folder[:170]}_{suffix}"
                event = {
                    "event_id": event_id,
                    "event_folder": event_folder,
                    "metadata": {},
                    "created_at": _utc_iso(now),
                    "updated_at": _utc_iso(now),
                    "status": "queued",
                    "files": {},
                }
                events[event_id] = event
            event["metadata"].update(metadata_copy)

            targets = {record["target_name"]: key for key, record in event["files"].items()}
            for source in paths:
                key = _path_key(source)
                if key in event["files"]:
                    # Human review may update CSV/XLSX/manifest after the raw
                    # AI bundle was uploaded.  Re-enqueueing the same path must
                    # schedule a replacement when its fingerprint changed;
                    # otherwise Drive would silently keep stale review data.
                    record = event["files"][key]
                    try:
                        stat = source.stat()
                        current = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
                    except OSError:
                        current = None
                    observed = record.get("observed")
                    changed = bool(
                        current
                        and isinstance(observed, dict)
                        and (current["size"], current["mtime_ns"])
                        != (observed.get("size"), observed.get("mtime_ns"))
                    )
                    lease_active = (
                        record.get("status") == "uploading"
                        and float(record.get("lease_until", 0.0)) > now
                    )
                    if changed and not lease_active:
                        record.update({
                            "status": "pending",
                            "attempts": 0,
                            "next_attempt_at": 0.0,
                            "last_error": None,
                            "observed": None,
                            "lease_id": None,
                            "lease_until": 0.0,
                            "uploaded_at": None,
                            "receipt": None,
                        })
                    continue
                target_name = _safe_component(source.name, "evidence.bin")
                if target_name in targets and targets[target_name] != key:
                    stem, suffix = os.path.splitext(target_name)
                    target_name = f"{stem[:145]}_{key[:8]}{suffix[:20]}"
                targets[target_name] = key
                event["files"][key] = {
                    "source": str(source),
                    "target_name": target_name,
                    "status": "pending",
                    "attempts": 0,
                    "next_attempt_at": 0.0,
                    "last_error": None,
                    "observed": None,
                    "lease_id": None,
                    "lease_until": 0.0,
                    "uploaded_at": None,
                    "receipt": None,
                }
            self._refresh_event(event, now)
            return _json_copy(event)

        return self.store.mutate(mutate)

    @staticmethod
    def _refresh_event(event: MutableMapping[str, Any], now: float) -> None:
        records = list(event.get("files", {}).values())
        statuses = {record.get("status", "pending") for record in records}
        if records and statuses == {"uploaded"}:
            status = "complete"
        elif "uploading" in statuses:
            status = "uploading"
        elif "retry" in statuses:
            status = "retry"
        elif "waiting_file" in statuses:
            status = "waiting_file"
        elif "waiting_stable" in statuses:
            status = "waiting_stable"
        else:
            status = "queued"
        event["status"] = status
        event["updated_at"] = _utc_iso(now)

    def snapshot(self) -> dict[str, Any]:
        return self.store.snapshot()

    def acknowledge_uploaded(
        self,
        event_id: str,
        source_path: os.PathLike[str] | str,
        receipt: Mapping[str, Any],
        *,
        expected_size: int,
    ) -> bool:
        """Acknowledge a separately uploaded file after remote readback.

        This is a controlled fallback for connector/manual recovery.  It
        requires the observed remote byte size to match the local file and
        never accepts a missing source.
        """

        source = Path(source_path).expanduser().resolve(strict=True)
        if not source.is_file():
            raise ValueError(f"Evidence source is not a file: {source}")
        stat = source.stat()
        if int(expected_size) != stat.st_size:
            raise ValueError(
                f"Remote/local size mismatch: remote={expected_size}, local={stat.st_size}"
            )
        key = _path_key(source)
        receipt_copy = _json_copy(dict(receipt))
        now = time.time()

        def mutate(data: MutableMapping[str, Any]):
            event = data["events"].get(str(event_id))
            if event is None or key not in event.get("files", {}):
                raise ValueError(f"Queued artifact not found: {event_id} / {source}")
            record = event["files"][key]
            record.update({
                "status": "uploaded",
                "attempts": int(record.get("attempts", 0)),
                "next_attempt_at": 0.0,
                "last_error": None,
                "observed": {
                    "size": stat.st_size,
                    "mtime_ns": stat.st_mtime_ns,
                    "since": now,
                },
                "lease_id": None,
                "lease_until": 0.0,
                "uploaded_at": _utc_iso(now),
                "receipt": receipt_copy,
            })
            self._refresh_event(event, now)
            return True

        return bool(self.store.mutate(mutate))

    def status(self) -> dict[str, Any]:
        snapshot = self.snapshot()
        counts: dict[str, int] = {}
        file_counts: dict[str, int] = {}
        summaries = []
        for event in snapshot["events"].values():
            event_status = event.get("status", "queued")
            counts[event_status] = counts.get(event_status, 0) + 1
            for record in event.get("files", {}).values():
                file_status = record.get("status", "pending")
                file_counts[file_status] = file_counts.get(file_status, 0) + 1
            summaries.append(
                {
                    "event_id": event["event_id"],
                    "status": event_status,
                    "files": len(event.get("files", {})),
                    "updated_at": event.get("updated_at"),
                }
            )
        return {
            "queue_path": str(self.path),
            "events_total": len(snapshot["events"]),
            "event_statuses": counts,
            "file_statuses": file_counts,
            "events": summaries,
        }

    def _claim_next(self, now: float) -> Optional[dict[str, Any]]:
        lease_id = uuid.uuid4().hex

        def mutate(data: MutableMapping[str, Any]):
            changed = False
            for event_id in sorted(data["events"]):
                event = data["events"][event_id]
                for key in sorted(event.get("files", {})):
                    record = event["files"][key]
                    if record.get("status") == "uploaded":
                        continue
                    if record.get("status") == "uploading" and float(
                        record.get("lease_until", 0.0)
                    ) > now:
                        continue
                    if float(record.get("next_attempt_at", 0.0)) > now:
                        continue

                    source = Path(record["source"])
                    try:
                        stat = source.stat()
                        if not source.is_file():
                            raise FileNotFoundError(str(source))
                    except (FileNotFoundError, OSError):
                        record["status"] = "waiting_file"
                        record["next_attempt_at"] = now + self.missing_poll_seconds
                        record["last_error"] = "File has not appeared yet"
                        record["lease_id"] = None
                        record["lease_until"] = 0.0
                        changed = True
                        self._refresh_event(event, now)
                        continue

                    fingerprint = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
                    observed = record.get("observed")
                    if self.stable_seconds > 0 and (
                        not isinstance(observed, dict)
                        or observed.get("size") != fingerprint["size"]
                        or observed.get("mtime_ns") != fingerprint["mtime_ns"]
                    ):
                        record["observed"] = {**fingerprint, "since": now}
                        record["status"] = "waiting_stable"
                        record["next_attempt_at"] = now + self.stable_seconds
                        record["last_error"] = None
                        changed = True
                        self._refresh_event(event, now)
                        continue
                    if self.stable_seconds > 0 and now - float(observed.get("since", now)) < self.stable_seconds:
                        record["status"] = "waiting_stable"
                        record["next_attempt_at"] = float(observed["since"]) + self.stable_seconds
                        changed = True
                        self._refresh_event(event, now)
                        continue

                    record["observed"] = record.get("observed") or {**fingerprint, "since": now}
                    record["status"] = "uploading"
                    record["lease_id"] = lease_id
                    record["lease_until"] = now + self.lease_seconds
                    record["last_error"] = None
                    changed = True
                    self._refresh_event(event, now)
                    return {
                        "event_id": event_id,
                        "event_folder": event["event_folder"],
                        "file_key": key,
                        "source": record["source"],
                        "target_name": record["target_name"],
                        "lease_id": lease_id,
                        "fingerprint": fingerprint,
                    }
            return None

        return self.store.mutate(mutate)

    def _finish_success(
        self, job: Mapping[str, Any], receipt: Mapping[str, Any], now: float
    ) -> bool:
        receipt_copy = _json_copy(dict(receipt))

        def mutate(data: MutableMapping[str, Any]):
            event = data["events"].get(job["event_id"])
            if event is None:
                return False
            record = event.get("files", {}).get(job["file_key"])
            if record is None or record.get("lease_id") != job["lease_id"]:
                return False
            record.update(
                {
                    "status": "uploaded",
                    "next_attempt_at": 0.0,
                    "last_error": None,
                    "lease_id": None,
                    "lease_until": 0.0,
                    "uploaded_at": _utc_iso(now),
                    "receipt": receipt_copy,
                }
            )
            self._refresh_event(event, now)
            return True

        return bool(self.store.mutate(mutate))

    def _finish_failure(self, job: Mapping[str, Any], error: BaseException, now: float) -> bool:
        def mutate(data: MutableMapping[str, Any]):
            event = data["events"].get(job["event_id"])
            if event is None:
                return False
            record = event.get("files", {}).get(job["file_key"])
            if record is None or record.get("lease_id") != job["lease_id"]:
                return False
            attempts = int(record.get("attempts", 0)) + 1
            delay = min(
                self.backoff_cap_seconds,
                self.backoff_base_seconds * (2 ** max(0, attempts - 1)),
            )
            record.update(
                {
                    "status": "retry",
                    "attempts": attempts,
                    "next_attempt_at": now + delay,
                    "last_error": _short_error(error),
                    "lease_id": None,
                    "lease_until": 0.0,
                }
            )
            self._refresh_event(event, now)
            return True

        return bool(self.store.mutate(mutate))

    def run_once(
        self,
        backend: Optional[LocalFolderBackend | RcloneBackend] = None,
        *,
        limit: int = 100,
        now: Optional[float] = None,
    ) -> dict[str, Any]:
        """Process currently due files once; ``None`` is safe queue-only mode."""

        if limit <= 0:
            raise ValueError("limit must be positive")
        if backend is None:
            status = self.status()
            return {
                "mode": "queue-only",
                "backend": None,
                "uploaded": 0,
                "failed": 0,
                **status,
            }

        operation_now = time.time() if now is None else float(now)
        uploaded = 0
        failed = 0
        claimed = 0
        for _ in range(limit):
            job = self._claim_next(operation_now)
            if job is None:
                break
            claimed += 1
            source = Path(job["source"])
            try:
                receipt = backend.put(source, job["event_folder"], job["target_name"])
                after = source.stat()
                expected = job["fingerprint"]
                if (after.st_size, after.st_mtime_ns) != (
                    expected["size"],
                    expected["mtime_ns"],
                ):
                    raise BackendError(f"Evidence changed during upload: {source}")
                if self._finish_success(job, receipt, operation_now):
                    uploaded += 1
            except Exception as error:  # backend failures must never discard the job
                if self._finish_failure(job, error, operation_now):
                    failed += 1

        status = self.status()
        return {
            "mode": "sync",
            "backend": backend.name,
            "claimed": claimed,
            "uploaded": uploaded,
            "failed": failed,
            **status,
        }


def find_rclone_executable(configured: os.PathLike[str] | str = "rclone") -> str:
    """Resolve rclone without requiring a shell restart after a winget install."""

    candidate = str(configured or "rclone").strip()
    if not candidate:
        candidate = "rclone"
    expanded = Path(candidate).expanduser()
    if expanded.is_absolute() and expanded.is_file():
        return str(expanded)
    located = shutil.which(candidate)
    if located:
        return located

    # winget updates the user PATH for future processes, but a long-running
    # dashboard may still have the old environment.  Resolve the portable
    # package location as a safe fallback; no executable is copied into the
    # project and no OAuth material is inspected here.
    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data and candidate.lower() in ("rclone", "rclone.exe"):
        package_root = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
        matches = sorted(
            package_root.glob("Rclone.Rclone_*/*/rclone.exe"),
            key=lambda item: item.stat().st_mtime_ns if item.exists() else 0,
            reverse=True,
        )
        if matches:
            return str(matches[0])
    return candidate


class EvidenceSyncService:
    """Non-blocking queue facade with a best-effort background worker.

    Upload failures are deliberately contained inside this service: detecting
    and recording a traffic event must continue even when Drive is offline.
    """

    def __init__(
        self,
        queue: EvidenceQueue,
        backend: Optional[LocalFolderBackend | RcloneBackend] = None,
        *,
        interval: float = 5.0,
        logger=None,
    ):
        if interval <= 0:
            raise ValueError("Sync interval must be positive")
        self.queue = queue
        self.backend = backend
        self.interval = float(interval)
        self.logger = logger
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _log(self, level: str, message: str, *args) -> None:
        if self.logger is not None:
            getattr(self.logger, level)(message, *args)

    @property
    def queue_only(self) -> bool:
        return self.backend is None

    def start(self) -> "EvidenceSyncService":
        if self.backend is None or (self._thread is not None and self._thread.is_alive()):
            return self
        self._thread = threading.Thread(
            target=self._worker,
            name="evidence-drive-sync",
            daemon=True,
        )
        self._thread.start()
        return self

    def _worker(self) -> None:
        while not self._stop.is_set():
            try:
                result = self.queue.run_once(self.backend, limit=100)
                if result.get("uploaded"):
                    self._log(
                        "info",
                        "Drive sync: uploaded %d artifact(s); queue=%s",
                        result["uploaded"],
                        self.queue.path,
                    )
                if result.get("failed"):
                    self._log(
                        "warning",
                        "Drive sync: %d artifact(s) will retry; AI continues normally.",
                        result["failed"],
                    )
            except Exception as error:  # never let sync kill the AI loop
                self._log("warning", "Drive sync worker error; will retry: %s", error)
            self._stop.wait(self.interval)

    def enqueue(
        self,
        event_id: str,
        file_paths: Iterable[os.PathLike[str] | str],
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        paths = [path for path in file_paths if str(path or "").strip()]
        if not paths:
            return None
        try:
            event = self.queue.enqueue(event_id, paths, metadata=metadata)
            if self.backend is None:
                self._log(
                    "warning",
                    "Evidence queued locally (%s); Drive backend is not configured yet.",
                    self.queue.path,
                )
            else:
                self.start()
            return event
        except Exception as error:
            self._log("error", "Cannot enqueue evidence for Drive sync: %s", error)
            return None

    def flush(self, timeout: float = 10.0) -> dict[str, Any]:
        """Try to deliver stable artifacts before shutdown, leaving the rest queued."""

        deadline = time.monotonic() + max(0.0, float(timeout))
        try:
            last_result = self.queue.run_once(self.backend, limit=100)
        except Exception as error:
            self._log("error", "Cannot flush evidence sync queue: %s", error)
            return {
                "mode": "queue-error",
                "events_total": 0,
                "event_statuses": {},
                "error": _short_error(error),
            }
        while self.backend is not None and time.monotonic() < deadline:
            statuses = last_result.get("event_statuses", {})
            if statuses and set(statuses) == {"complete"}:
                break
            if not statuses:
                break
            time.sleep(min(0.25, max(0.0, deadline - time.monotonic())))
            try:
                last_result = self.queue.run_once(self.backend, limit=100)
            except Exception as error:
                self._log("error", "Cannot flush evidence sync queue: %s", error)
                return {
                    "mode": "queue-error",
                    "events_total": 0,
                    "event_statuses": {},
                    "error": _short_error(error),
                }
        return last_result

    def close(self, flush_timeout: float = 10.0) -> dict[str, Any]:
        result = self.flush(flush_timeout)
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=max(1.0, min(5.0, flush_timeout)))
        return result


def create_sync_service(
    *,
    config_path: Optional[os.PathLike[str] | str] = None,
    queue_path: Optional[os.PathLike[str] | str] = None,
    logger=None,
) -> EvidenceSyncService:
    """Build an auto-sync service; invalid/missing backend falls back to queue-only."""

    config: dict[str, Any] = {}
    if config_path:
        path = Path(config_path).expanduser().resolve(strict=False)
        if path.is_file():
            try:
                config = _load_config(str(path))
            except Exception as error:
                if logger is not None:
                    logger.warning("Invalid evidence sync config; queue-only: %s", error)
        elif logger is not None:
            logger.warning("Evidence sync config not found; queue-only: %s", path)

    resolved_queue = queue_path or config.get("queue") or DEFAULT_QUEUE_PATH
    queue = EvidenceQueue(
        resolved_queue,
        missing_poll_seconds=float(config.get("missing_poll_seconds", 5.0)),
        stable_seconds=float(config.get("stable_seconds", 2.0)),
        backoff_base_seconds=float(config.get("backoff_base_seconds", 5.0)),
        backoff_cap_seconds=float(config.get("backoff_cap_seconds", 300.0)),
    )
    backend = None
    if config.get("enabled", True):
        backend_name = str(config.get("backend", "none")).strip().lower()
        try:
            if backend_name == "local":
                backend = LocalFolderBackend(config.get("local_folder", ""))
            elif backend_name == "rclone":
                executable = find_rclone_executable(config.get("rclone_bin", "rclone"))
                backend = RcloneBackend(
                    config.get("rclone_remote", ""),
                    executable=executable,
                    timeout=float(config.get("timeout", 120.0)),
                    min_interval=float(config.get("rclone_min_interval_seconds", 1.5)),
                )
            elif backend_name not in ("", "none"):
                raise ValueError(f"Unknown backend: {backend_name}")
        except Exception as error:
            if logger is not None:
                logger.warning("Drive backend unavailable; queue-only: %s", error)
            backend = None
    service = EvidenceSyncService(
        queue,
        backend,
        interval=float(config.get("poll_seconds", 5.0)),
        logger=logger,
    )
    service.start()
    return service


def _load_config(path: Optional[str]) -> dict[str, Any]:
    if not path:
        return {}
    config_path = Path(path).expanduser().resolve(strict=True)
    with config_path.open("r", encoding="utf-8") as stream:
        config = json.load(stream)
    if not isinstance(config, dict):
        raise ValueError("Sync config must be a JSON object")
    for key in config:
        lowered = str(key).lower()
        if any(fragment in lowered for fragment in SECRET_KEY_FRAGMENTS):
            raise ValueError(
                f"Do not store credentials in sync config ({key}); configure rclone externally"
            )
    return config


def _make_backend(arguments, config: Mapping[str, Any]):
    backend_name = arguments.backend or config.get("backend")
    if backend_name in (None, "", "none"):
        return None
    if backend_name == "local":
        destination = arguments.local_folder or config.get("local_folder")
        if not destination:
            raise ValueError("local backend requires --local-folder or config.local_folder")
        return LocalFolderBackend(destination)
    if backend_name == "rclone":
        remote = arguments.rclone_remote or config.get("rclone_remote")
        if not remote:
            raise ValueError("rclone backend requires --rclone-remote or config.rclone_remote")
        executable = arguments.rclone_bin or config.get("rclone_bin", "rclone")
        timeout = arguments.timeout or config.get("timeout", 120.0)
        return RcloneBackend(
            remote,
            executable=find_rclone_executable(executable),
            timeout=float(timeout),
            min_interval=float(config.get("rclone_min_interval_seconds", 1.5)),
        )
    raise ValueError(f"Unknown backend: {backend_name}")


def _parse_metadata(items: Sequence[str]) -> dict[str, str]:
    metadata = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Metadata must use key=value: {item}")
        key, value = item.split("=", 1)
        if not key.strip():
            raise ValueError("Metadata key is empty")
        metadata[key.strip()] = value
    return metadata


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", help="Credential-free JSON backend configuration")
    parser.add_argument("--queue", help=f"Queue JSON (default: {DEFAULT_QUEUE_PATH})")
    parser.add_argument("--backend", choices=("none", "local", "rclone"))
    parser.add_argument("--local-folder", help="Google Drive Desktop/local destination")
    parser.add_argument("--rclone-remote", help="Configured rclone remote, e.g. drive:folder")
    parser.add_argument("--rclone-bin", help="rclone executable path/name")
    parser.add_argument("--timeout", type=float, help="Per-rclone-operation timeout seconds")

    commands = parser.add_subparsers(dest="command", required=True)
    enqueue = commands.add_parser("enqueue", help="Persist an event before files exist")
    enqueue.add_argument("event_id")
    enqueue.add_argument("files", nargs="+")
    enqueue.add_argument("--meta", action="append", default=[], metavar="KEY=VALUE")

    acknowledge = commands.add_parser(
        "acknowledge", help="Mark a connector fallback uploaded after remote size readback"
    )
    acknowledge.add_argument("event_id")
    acknowledge.add_argument("file")
    acknowledge.add_argument("--destination", required=True)
    acknowledge.add_argument("--remote-size", required=True, type=int)
    acknowledge.add_argument("--backend", default="google-drive-connector-verified")

    commands.add_parser("status", help="Print queue state as JSON")
    run_once = commands.add_parser("run-once", help="Process due queue items once")
    run_once.add_argument("--limit", type=int, default=100)
    watch = commands.add_parser("watch", help="Continuously process the queue")
    watch.add_argument("--interval", type=float, default=5.0)
    watch.add_argument("--limit", type=int, default=100)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_parser()
    arguments = parser.parse_args(argv)
    try:
        config = _load_config(arguments.config)
        queue_path = arguments.queue or config.get("queue") or DEFAULT_QUEUE_PATH
        queue = EvidenceQueue(
            queue_path,
            missing_poll_seconds=float(config.get("missing_poll_seconds", 5.0)),
            stable_seconds=float(config.get("stable_seconds", 2.0)),
            backoff_base_seconds=float(config.get("backoff_base_seconds", 5.0)),
            backoff_cap_seconds=float(config.get("backoff_cap_seconds", 300.0)),
        )

        if arguments.command == "enqueue":
            result = queue.enqueue(
                arguments.event_id,
                arguments.files,
                metadata=_parse_metadata(arguments.meta),
            )
        elif arguments.command == "acknowledge":
            acknowledged = queue.acknowledge_uploaded(
                arguments.event_id,
                arguments.file,
                {
                    "backend": arguments.backend,
                    "destination": arguments.destination,
                    "size": arguments.remote_size,
                    "verified_by_readback": True,
                },
                expected_size=arguments.remote_size,
            )
            result = {"acknowledged": acknowledged, **queue.status()}
        elif arguments.command == "status":
            result = queue.status()
        else:
            backend = _make_backend(arguments, config)
            if arguments.command == "run-once":
                result = queue.run_once(backend, limit=arguments.limit)
            else:
                if arguments.interval <= 0:
                    raise ValueError("watch interval must be positive")
                while True:
                    result = queue.run_once(backend, limit=arguments.limit)
                    print(json.dumps(result, ensure_ascii=False), flush=True)
                    time.sleep(arguments.interval)
                return 0
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except KeyboardInterrupt:
        return 130
    except (OSError, ValueError, EvidenceSyncError) as error:
        print(f"evidence_auto_sync: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
