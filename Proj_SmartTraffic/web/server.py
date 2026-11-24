"""
web/server.py – Dashboard giám sát giao thông thời gian thực (TP. Đà Nẵng).

KHÔNG cần cài thư viện ngoài (dùng http.server chuẩn của Python) → chạy được
ngay cả trên Jetson Nano. Chạy 1 lệnh:

    python web/server.py                # chỉ mở http://localhost:8090
    python web/server.py --port 9000    # đổi port
    python web/server.py --host 0.0.0.0 # cho phép máy khác trong LAN truy cập

Dữ liệu THẬT lấy từ:
  - logs/live_state.json : trạng thái đèn 2 trục + đếm ngược + số xe (main.py ghi)
  - logs/violations_*.csv : danh sách vi phạm (ViolationLogger ghi)
  - violations/*.jpg      : ảnh bằng chứng

Chỉ dùng --host 0.0.0.0 trên mạng LAN tin cậy; không chuyển tiếp port 8090 ra Internet.
"""

import argparse
import hmac
import csv
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse, unquote


# ThreadingHTTPServer chỉ có từ Python 3.7; tự dựng để chạy cả Python 3.6 (Jetson Nano)
class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

# Console Windows mặc định cp1252 → ép UTF-8 để in tiếng Việt không lỗi
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# Thư mục gốc dự án (cha của web/)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from webcam_ai import (MAX_WEBCAM_JPEG_BYTES, WEBCAM_AI,
                       WebcamInferenceError, WebcamInputError)
from mobile_app_bridge import find_event_for_cccd, read_events_for_cccd
from demo_notification_bridge import (dispatch_uploaded_redlight_demo,
                                      recipient_status, save_recipient)

WEB_DIR = os.path.join(ROOT, "web")
LOGS_DIR = os.path.join(ROOT, "logs")
VIOLATIONS_DIR = os.path.join(ROOT, "violations")
DEMO_VIDEOS_DIR = os.path.join(ROOT, "demo_videos")
STATE_FILE = os.path.join(LOGS_DIR, "live_state.json")
SYNC_QUEUE_FILE = os.path.join(LOGS_DIR, "evidence_sync_queue.json")
SYNC_CONFIG_FILE = os.path.join(ROOT, "config", "evidence_sync.json")
VIDEO_JOBS_DIR = os.path.join(ROOT, "uploads", "video_jobs")
UPLOAD_AI_PAUSE_FILE = os.path.join(LOGS_DIR, "video_upload_job.active")
MAX_UPLOAD_BYTES = 256 * 1024 * 1024
UPLOAD_SOCKET_TIMEOUT_SECONDS = 30
MOBILE_APP_KEY_ENV = "SMART_TRAFFIC_MOBILE_APP_KEY"
MOBILE_APP_KEY = os.environ.get(MOBILE_APP_KEY_ENV, "").strip()
MOBILE_CCCD_RE = re.compile(r"^\d{12}$")
MOBILE_EVIDENCE_KINDS = {"scene", "vehicle_crop", "plate_crop", "clip"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}
JOB_ID_RE = re.compile(r"^[0-9]{8}_[0-9]{6}_[a-f0-9]{8}$")


def _mobile_request_authorized(handler):
    """Require an explicit LAN app key; do not expose evidence by CCCD alone."""
    if not MOBILE_APP_KEY:
        return False
    received = handler.headers.get("X-SmartTraffic-App-Key", "")
    return hmac.compare_digest(received, MOBILE_APP_KEY)


def _is_loopback_request(handler):
    return str(handler.client_address[0]) in {"127.0.0.1", "::1"}


def _demo_recipient_payload():
    status = recipient_status()
    return {"configured": bool(status.get("configured")), "tail": status.get("tail", "")}


def _mobile_events_payload(handler, parsed):
    if not _mobile_request_authorized(handler):
        handler._send_json(401, {"error": "Mobile app authorization is required"})
        return None
    cccd = str((parse_qs(parsed.query).get("cccd") or [""])[-1]).strip()
    if not MOBILE_CCCD_RE.fullmatch(cccd):
        handler._send_json(400, {"error": "cccd must contain exactly 12 digits"})
        return None
    events = read_events_for_cccd(cccd)
    public_events = []
    for event in events:
        evidence = event.get("evidence") or {}
        urls = {}
        for kind in MOBILE_EVIDENCE_KINDS:
            if evidence.get(kind):
                urls[kind] = "/api/mobile/evidence/%s/%s?cccd=%s" % (event["id"], kind, cccd)
        item = dict(event)
        item.pop("owner_cccd", None)
        item.pop("owner_display_name", None)
        item["evidence_urls"] = urls
        public_events.append(item)
    return {"status": "OK", "review_notice": "AI detections require human review.",
            "violations": public_events}


def _serve_mobile_evidence(handler, parsed):
    if not _mobile_request_authorized(handler):
        return handler._send_json(401, {"error": "Mobile app authorization is required"})
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 5 or parts[:3] != ["api", "mobile", "evidence"]:
        return handler._send_json(404, {"error": "Evidence not found"})
    event_id, kind = parts[3], parts[4]
    if kind not in MOBILE_EVIDENCE_KINDS:
        return handler._send_json(404, {"error": "Evidence not found"})
    cccd = str((parse_qs(parsed.query).get("cccd") or [""])[-1]).strip()
    event = find_event_for_cccd(event_id, cccd)
    name = os.path.basename(str((event or {}).get("evidence", {}).get(kind, "")))
    if not name:
        return handler._send_json(404, {"error": "Evidence not found"})
    extension = os.path.splitext(name)[1].lower()
    content_type = "video/mp4" if extension == ".mp4" else "image/jpeg"
    return handler._serve_file(os.path.join(VIOLATIONS_DIR, name), content_type)


def _atomic_write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError, TypeError):
        return {} if default is None else default


def _bounded_number(value, default, minimum, maximum, integer=False):
    try:
        number = int(value) if integer else float(value)
    except (TypeError, ValueError):
        number = default
    number = max(minimum, min(maximum, number))
    return int(number) if integer else float(number)


def read_drive_link():
    """Return a user-facing evidence folder link without exposing OAuth data."""
    link = os.environ.get("SMART_TRAFFIC_DRIVE_URL", "").strip()
    cfg = _read_json(SYNC_CONFIG_FILE, {})
    if not link:
        link = str(cfg.get("drive_folder_url", "")).strip()
    return {
        "available": bool(link),
        "url": link,
        "label": "Google Drive - Bằng chứng tự động",
    }


class VideoJobManager:
    """Single-worker, persistent queue for safe local presentation videos.

    The fixed traffic/Jetson stream continues to own logs/live_frame.jpg.  Every
    uploaded job writes only inside uploads/video_jobs/<job_id>, so a test video
    cannot overwrite the hardware demo state.
    """

    def __init__(self, root=VIDEO_JOBS_DIR):
        self.root = os.path.abspath(root)
        self.lock = threading.RLock()
        self.active_id = None
        self.process = None
        self.sync_service = None
        os.makedirs(self.root, exist_ok=True)
        self._repair_interrupted_jobs()

    def _repair_interrupted_jobs(self):
        try:
            os.remove(UPLOAD_AI_PAUSE_FILE)
        except OSError:
            pass
        for path in glob.glob(os.path.join(self.root, "*", "job.json")):
            job = _read_json(path, {})
            if job.get("status") in ("uploading", "queued", "running", "cancelling"):
                job["status"] = "interrupted"
                job["message"] = "Server được khởi động lại trước khi job hoàn tất."
                job["finished_at"] = time.time()
                _atomic_write_json(path, job)

    def _job_dir(self, job_id):
        if not JOB_ID_RE.match(str(job_id or "")):
            return None
        path = os.path.abspath(os.path.join(self.root, job_id))
        if os.path.commonpath([self.root, path]) != self.root:
            return None
        return path

    def _job_path(self, job_id):
        folder = self._job_dir(job_id)
        return os.path.join(folder, "job.json") if folder else None

    def _write_job(self, job_id, **updates):
        path = self._job_path(job_id)
        job = _read_json(path, {})
        job.update(updates)
        _atomic_write_json(path, job)
        return job

    def _latest_job_id(self):
        candidates = []
        for path in glob.glob(os.path.join(self.root, "*", "job.json")):
            job_id = os.path.basename(os.path.dirname(path))
            if JOB_ID_RE.match(job_id):
                candidates.append((os.path.getmtime(path), job_id))
        return max(candidates)[1] if candidates else None

    def _artifacts(self, folder):
        allowed = {".jpg", ".jpeg", ".png", ".mp4", ".csv", ".json"}
        rows = []
        for current, _dirs, names in os.walk(folder):
            for name in sorted(names):
                path = os.path.join(current, name)
                ext = os.path.splitext(name)[1].lower()
                relative = os.path.relpath(path, folder).replace(os.sep, "/")
                if (ext not in allowed or relative in ("job.json", "progress.json")):
                    continue
                rows.append({"name": relative, "bytes": os.path.getsize(path)})
        rows.sort(key=lambda item: item["name"])
        return rows

    def artifact_path(self, job_id, relative_name):
        folder = self._job_dir(job_id)
        if not folder:
            return None
        relative_name = unquote(str(relative_name or "")).replace("\\", "/").lstrip("/")
        candidate = os.path.abspath(os.path.join(folder, relative_name.replace("/", os.sep)))
        try:
            if os.path.commonpath([folder, candidate]) != folder:
                return None
        except ValueError:
            return None
        return candidate

    def read(self, job_id=None):
        with self.lock:
            job_id = job_id or self.active_id or self._latest_job_id()
            folder = self._job_dir(job_id)
            if not folder:
                return None
            job = _read_json(os.path.join(folder, "job.json"), {})
            if not job:
                return None
            progress = _read_json(os.path.join(folder, "progress.json"), {})
            result = _read_json(os.path.join(folder, "result.json"), {})
            public = dict(job)
            public.pop("source_path", None)
            public["progress"] = progress
            public["result"] = result
            public["artifacts"] = self._artifacts(folder)
            public["preview_available"] = os.path.isfile(os.path.join(folder, "preview.jpg"))
            queue = _read_json(SYNC_QUEUE_FILE, {})
            queued_event = (queue.get("events") or {}).get("video_job_" + job_id)
            if queued_event:
                public["drive_sync"] = queued_event.get("status", "pending")
                if public["drive_sync"] == "complete":
                    public.pop("drive_message", None)
            # Remain active through the short post-processing/Drive enqueue
            # phase so the UI cannot submit a second job into the single worker.
            public["active"] = bool(job_id == self.active_id)
            return public

    def _video_info(self, source_path):
        try:
            import cv2
            cap = cv2.VideoCapture(source_path)
            if not cap.isOpened():
                return {}
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
            frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            info = {
                "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
                "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
                "fps": fps,
                "frames": frames,
                "duration": frames / fps if frames and fps > 0 else 0.0,
            }
            cap.release()
            return info
        except Exception:
            return {}

    def _build_command(self, mode, source_path, folder, options):
        python = sys.executable
        stride = _bounded_number(options.get("stride"), 2, 1, 12, integer=True)
        imgsz = _bounded_number(options.get("imgsz"), 480, 320, 960, integer=True)
        conf = _bounded_number(options.get("conf"), 0.30, 0.05, 0.95)
        max_frames = _bounded_number(options.get("max_frames"), 0, 0, 50000, integer=True)

        if mode in ("vehicle", "redlight"):
            command = [
                python, os.path.join(ROOT, "uploaded_video_processor.py"),
                "--video", source_path,
                "--job-dir", folder,
                "--mode", mode,
                "--stride", str(stride),
                "--imgsz", str(imgsz),
                "--conf", str(conf),
                "--stop-line-ratio", str(_bounded_number(
                    options.get("stop_line_ratio"), 0.72, 0.10, 0.95)),
            ]
            if max_frames:
                command.extend(["--max-frames", str(max_frames)])
            if mode == "redlight" and str(options.get("force_red_simulation", "1")) != "0":
                command.append("--force-red-simulation")
            return command

        if mode == "heatmap":
            command = [
                python, os.path.join(ROOT, "traffic_density_heatmap.py"),
                "--video", source_path,
                "--job-dir", folder,
                "--output", os.path.join(folder, "output.mp4"),
                "--imgsz", str(imgsz),
                "--conf", str(conf),
                "--stride", str(stride),
            ]
            if max_frames:
                command.extend(["--max-frames", str(max_frames)])
            return command

        if mode == "speed":
            info = self._video_info(source_path)
            height = max(2, int(info.get("height") or 720))
            duration = float(info.get("duration") or 30.0)
            end_sec = max(1.0, min(duration, _bounded_number(
                options.get("end_sec"), duration, 1.0, 600.0)))
            line_a = round(height * _bounded_number(options.get("line_a_ratio"), 0.45, 0.05, 0.90))
            line_b = round(height * _bounded_number(options.get("line_b_ratio"), 0.72, 0.10, 0.95))
            if line_a == line_b:
                line_b = min(height - 1, line_a + max(2, height // 10))
            direction = str(options.get("direction", "auto"))
            if direction not in ("up", "down", "auto"):
                direction = "auto"
            return [
                python, os.path.join(ROOT, "speed_demo.py"),
                "--video", source_path,
                "--start-sec", "0",
                "--end-sec", str(end_sec),
                "--line-a", str(line_a),
                "--line-b", str(line_b),
                "--distance-m", str(_bounded_number(options.get("distance_m"), 8.0, 0.5, 500.0)),
                "--limit-kmh", str(_bounded_number(options.get("limit_kmh"), 50.0, 1.0, 300.0)),
                "--direction", direction,
                "--stride", str(stride),
                "--inference-width", "960",
                "--imgsz", str(imgsz),
                "--conf", str(conf),
                "--max-events", "3",
                "--xlsx", os.path.join(folder, "speed_evidence.xlsx"),
                "--job-dir", folder,
            ]
        raise ValueError("Chế độ xử lý không hợp lệ")

    def create_from_request(self, stream, content_length, filename, mode, options):
        if content_length <= 0:
            raise ValueError("Video tải lên đang rỗng")
        if content_length > MAX_UPLOAD_BYTES:
            raise ValueError("Video vượt giới hạn 256 MB; hãy cắt clip ngắn trước khi tải.")
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise ValueError("Chỉ nhận video MP4/MOV/AVI/MKV/M4V")
        if mode not in ("vehicle", "redlight", "speed", "heatmap"):
            raise ValueError("Chế độ xử lý không hợp lệ")
        free = shutil.disk_usage(self.root).free
        if free < content_length + 256 * 1024 * 1024:
            raise ValueError("Không đủ dung lượng an toàn để xử lý video này")

        # Reserve the single-worker slot briefly, then release the manager lock
        # before reading the potentially slow HTTP body. Status GETs therefore
        # remain responsive while a client is uploading.
        with self.lock:
            if (self.active_id is not None or
                    (self.process is not None and self.process.poll() is None)):
                raise RuntimeError("Một video khác đang được AI xử lý. Hãy chờ hoàn tất hoặc bấm dừng.")
            job_id = time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:8]
            folder = os.path.join(self.root, job_id)
            os.makedirs(folder, exist_ok=False)
            source_name = "source" + ext
            source_path = os.path.join(folder, source_name)
            part_path = source_path + ".part"
            safe_original = os.path.basename(filename).replace("\x00", "")[:180]
            job = {
                "id": job_id,
                "mode": mode,
                "status": "uploading",
                "message": "Đang nhận video an toàn…",
                "original_name": safe_original,
                "source_name": source_name,
                "source_bytes": content_length,
                "created_at": time.time(),
                "options": options,
                "source_path": source_path,
                "simulation": mode in ("redlight", "speed"),
            }
            _atomic_write_json(os.path.join(folder, "job.json"), job)
            self.active_id = job_id

        remaining = content_length
        try:
            with open(part_path, "wb") as f:
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError("Kết nối bị ngắt khi đang tải video")
                    f.write(chunk)
                    remaining -= len(chunk)
                f.flush()
                os.fsync(f.fileno())
            os.replace(part_path, source_path)
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            with self.lock:
                if self.active_id == job_id:
                    self.active_id = None
            raise

        try:
            self._write_job(job_id, status="queued",
                            message="Đã tải video; đang khởi động model AI…")
            command = self._build_command(mode, source_path, folder, options)
            worker = threading.Thread(
                target=self._run, args=(job_id, command),
                name="video-job-" + job_id, daemon=True,
            )
            with self.lock:
                worker.start()
        except Exception as exc:
            with self.lock:
                self._write_job(job_id, status="failed", finished_at=time.time(),
                                message="Không khởi chạy được AI: %s" % exc)
                if self.active_id == job_id:
                    self.active_id = None
            raise
        return self.read(job_id)

    def _run(self, job_id, command):
        folder = self._job_dir(job_id)
        stdout_path = os.path.join(folder, "worker.log")
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        try:
            os.makedirs(LOGS_DIR, exist_ok=True)
            with open(UPLOAD_AI_PAUSE_FILE + ".tmp", "w", encoding="ascii") as pause:
                pause.write(job_id)
            os.replace(UPLOAD_AI_PAUSE_FILE + ".tmp", UPLOAD_AI_PAUSE_FILE)
            with open(stdout_path, "w", encoding="utf-8", errors="replace") as output:
                process = subprocess.Popen(
                    command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL, shell=False, creationflags=creationflags,
                )
                with self.lock:
                    self.process = process
                    self._write_job(job_id, status="running", pid=process.pid,
                                    started_at=time.time(),
                                    message="Model AI đang phân tích video…")
                code = process.wait()
            progress = _read_json(os.path.join(folder, "progress.json"), {})
            requested_status = _read_json(os.path.join(folder, "job.json"), {}).get("status")
            if requested_status == "cancelling":
                status = "cancelled"
                message = "Đã hủy xử lý video theo yêu cầu."
            elif code == 0:
                status = "completed"
                message = "AI đã xử lý xong video."
            elif code == 2 and progress.get("status") not in ("error", "failed"):
                status = "completed_no_event"
                message = "Đã xử lý xong nhưng không có sự kiện phù hợp với hiệu chỉnh hiện tại."
            else:
                status = "failed"
                message = progress.get("error") or "Worker AI kết thúc với mã lỗi %s." % code
            with self.lock:
                self._write_job(job_id, status=status, exit_code=code,
                                finished_at=time.time(), message=message)
            if status in ("completed", "completed_no_event"):
                self._enqueue_evidence(job_id)
                job = _read_json(os.path.join(folder, "job.json"), {})
                options = job.get("options") or {}
                notify_demo = str(options.get("notify_demo", "0")).strip().lower()
                if job.get("mode") == "redlight" and notify_demo in ("1", "true", "yes", "on"):
                    self._notify_uploaded_redlight_demo(job_id)
        except Exception as exc:
            with self.lock:
                requested_status = _read_json(os.path.join(folder, "job.json"), {}).get("status")
                if requested_status == "cancelling":
                    self._write_job(job_id, status="cancelled", finished_at=time.time(),
                                    message="Đã hủy xử lý video theo yêu cầu.")
                else:
                    self._write_job(job_id, status="failed", finished_at=time.time(),
                                    message="Không khởi chạy được AI: %s" % exc)
        finally:
            try:
                with open(UPLOAD_AI_PAUSE_FILE, "r", encoding="ascii") as pause:
                    owner = pause.read().strip()
                if owner == job_id:
                    os.remove(UPLOAD_AI_PAUSE_FILE)
            except OSError:
                pass
            with self.lock:
                self.process = None
                if self.active_id == job_id:
                    self.active_id = None

    def _notify_uploaded_redlight_demo(self, job_id):
        """Send only an explicit local video DEMO to Telegram and the chosen app."""
        folder = self._job_dir(job_id)
        if not folder:
            return
        try:
            outcome = dispatch_uploaded_redlight_demo(
                job_id=job_id,
                job_dir=folder,
                violations_dir=VIOLATIONS_DIR,
            )
            self._write_job(
                job_id,
                notification_status=str(outcome.get("status", "queued")),
                notification_message=str(outcome.get("message", "")),
                notification_events=int(outcome.get("events", 0)),
            )
        except Exception as exc:
            self._write_job(
                job_id,
                notification_status="failed",
                notification_message="Demo notification failed: %s" % exc,
            )

    def _enqueue_evidence(self, job_id):
        """Queue red-light/speed job artifacts; never upload the raw source video."""
        folder = self._job_dir(job_id)
        job = _read_json(os.path.join(folder, "job.json"), {}) if folder else {}
        if not folder or job.get("mode") not in ("redlight", "speed"):
            return
        artifacts = []
        for item in self._artifacts(folder):
            name = item["name"]
            if name.startswith("source.") or name == "preview.jpg":
                continue
            artifacts.append(os.path.join(folder, name))
        if not artifacts:
            return
        try:
            from evidence_auto_sync import create_sync_service
            self._write_job(job_id, drive_sync="queued", drive_message="")
            with self.lock:
                if self.sync_service is None:
                    self.sync_service = create_sync_service(config_path=SYNC_CONFIG_FILE)
                service = self.sync_service
            service.enqueue("video_job_" + job_id, artifacts, metadata={
                "mode": job.get("mode"),
                "simulation": bool(job.get("simulation")),
                "original_name": job.get("original_name", ""),
                "created_at": job.get("created_at"),
            })
            # Delivery is asynchronous.  Holding the video-worker slot until a
            # Drive upload finishes would unnecessarily pause the fixed Jetson
            # AI stream; the durable queue and dashboard status provide retry.
            self._write_job(job_id, drive_sync="queued")
        except Exception as exc:
            # Local evidence remains valid; the persistent queue can be retried.
            self._write_job(job_id, drive_sync="pending", drive_message=str(exc))

    def cancel(self, job_id):
        with self.lock:
            if job_id != self.active_id or self.process is None or self.process.poll() is not None:
                return False
            self._write_job(job_id, status="cancelling", message="Đang dừng worker AI…")
            self.process.terminate()
            return True


VIDEO_JOBS = VideoJobManager()


def webcam_video_job_active():
    """Return True while the separate single-video worker owns the AI device."""
    with VIDEO_JOBS.lock:
        process_running = (VIDEO_JOBS.process is not None and
                           VIDEO_JOBS.process.poll() is None)
        return bool(VIDEO_JOBS.active_id is not None or process_running)


def read_sync_summary():
    """Return only safe aggregate upload state, never local paths or metadata."""
    if not os.path.isfile(SYNC_QUEUE_FILE):
        return {"events_total": 0, "complete": 0, "pending": 0}
    try:
        with open(SYNC_QUEUE_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        events = list((payload.get("events") or {}).values())
        complete = sum(1 for event in events if event.get("status") == "complete")
        return {
            "events_total": len(events),
            "complete": complete,
            "pending": max(0, len(events) - complete),
        }
    except (OSError, json.JSONDecodeError, AttributeError):
        return {"events_total": 0, "complete": 0, "pending": 0, "error": True}


def read_state():
    """Đọc trạng thái đèn/số xe từ live_state.json (main.py ghi mỗi vòng lặp)."""
    if not os.path.exists(STATE_FILE):
        return {"available": False}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        updated_at = data.get("updated_at")
        try:
            age = time.time() - float(updated_at)
        except (TypeError, ValueError):
            age = time.time() - os.path.getmtime(STATE_FILE)
        # Inference CPU có thể mất vài giây/frame; chỉ coi là đứng khi quá 8s.
        reported_running = data.get("camera_running", True)
        data["camera_running"] = bool(reported_running and age <= 8.0)
        data["state_age_sec"] = max(0.0, round(age, 1))
        data["sync"] = read_sync_summary()
        data["available"] = True
        return data
    except (json.JSONDecodeError, OSError):
        return {"available": False}


def _latest_violation_csv():
    """Chọn CSV mới nhất có ít nhất một bản ghi, bỏ qua lượt count-only rỗng."""
    files = sorted(glob.glob(os.path.join(LOGS_DIR, "violations_*.csv")),
                   key=os.path.getmtime, reverse=True)
    for path in files:
        try:
            with open(path, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.reader(f)
                next(reader, None)
                if any(len(r) >= 4 for r in reader):
                    return path
        except OSError:
            continue
    return files[0] if files else None


def read_violations(limit=100):
    """Đọc vi phạm từ file CSV mới nhất trong logs/. Trả về list dict (mới nhất trước)."""
    rows = []
    csv_path = _latest_violation_csv()
    if not csv_path:
        return rows
    try:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            # Newer evidence rows add speed-demo fields at the end.  Read by
            # header where possible so existing 10-column CSV files remain
            # fully compatible with the dashboard.
            columns = {str(name).strip(): i for i, name in enumerate(header or [])}

            def value(row, name, fallback_index=None):
                idx = columns.get(name, fallback_index)
                return row[idx] if idx is not None and idx < len(row) else ""

            for r in reader:
                if len(r) < 4:
                    continue
                img = value(r, "Evidence image", 4)
                clip = value(r, "Clip", 5)
                plate_conf = value(r, "Plate confidence", 6)
                plate_status = value(r, "Plate status", 7)
                vehicle_crop = value(r, "Vehicle crop", 8)
                plate_crop = value(r, "Plate crop", 9)
                # ClipRecorder ghi atomic qua file .part.mp4. Chỉ hiện nút xem
                # sau khi MP4 hoàn chỉnh đã xuất hiện, tránh người dùng mở lúc
                # file chưa có metadata và thấy 0:00.
                clip_name = os.path.basename(clip) if clip else ""
                if clip_name and not os.path.isfile(os.path.join(VIOLATIONS_DIR, clip_name)):
                    clip_name = ""
                vehicle_crop_name = os.path.basename(vehicle_crop) if vehicle_crop else ""
                if (vehicle_crop_name and
                        not os.path.isfile(os.path.join(VIOLATIONS_DIR, vehicle_crop_name))):
                    vehicle_crop_name = ""
                plate_crop_name = os.path.basename(plate_crop) if plate_crop else ""
                if (plate_crop_name and
                        not os.path.isfile(os.path.join(VIOLATIONS_DIR, plate_crop_name))):
                    plate_crop_name = ""
                rows.append({
                    "time": r[0], "lane": r[1], "type": r[2],
                    "plate": r[3] or "Không đọc được",
                    "image": os.path.basename(img) if img else "",
                    "clip": clip_name,
                    "plate_conf": plate_conf,
                    "plate_status": plate_status,
                    "vehicle_crop": vehicle_crop_name,
                    "plate_crop": plate_crop_name,
                    "event_type": value(r, "Event type"),
                    "measurement_status": value(r, "Measurement status"),
                    "speed_kmh": value(r, "Speed km/h"),
                    "speed_limit_kmh": value(r, "Speed limit km/h"),
                    "distance_m": value(r, "Distance m"),
                    "elapsed_s": value(r, "Elapsed s"),
                    "source_time_s": value(r, "Source video time s"),
                    "reviewed_plate": value(r, "Reviewed plate"),
                    "review_status": value(r, "Review status"),
                })
    except OSError:
        return rows
    rows.reverse()
    return rows[:limit]


def read_stats():
    """Tổng hợp thống kê vi phạm cho biểu đồ dashboard (Feature #3).

    Đọc toàn bộ CSV mới nhất, trả về:
      - by_hour: đếm vi phạm theo giờ trong ngày (0-23)
      - by_type: đếm theo loại xe
      - by_lane: đếm theo tuyến
      - total: tổng vi phạm
    """
    csv_path = _latest_violation_csv()
    by_hour = [0] * 24
    by_type = {}
    by_lane = {}
    total = 0
    if not csv_path:
        return {"by_hour": by_hour, "by_type": by_type, "by_lane": by_lane, "total": 0}
    try:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            next(reader, None)  # bỏ header
            for r in reader:
                if len(r) < 4:
                    continue
                total += 1
                # timestamp dạng YYYYMMDD_HHMMSS → giờ ở ký tự 9-10
                ts = r[0]
                if len(ts) >= 11 and ts[8] == "_":
                    try:
                        hh = int(ts[9:11])
                        if 0 <= hh <= 23:
                            by_hour[hh] += 1
                    except ValueError:
                        pass
                vtype = (r[2] or "khác").strip()
                by_type[vtype] = by_type.get(vtype, 0) + 1
                lane = (r[1] or "?").strip()
                by_lane[lane] = by_lane.get(lane, 0) + 1
    except OSError:
        pass
    return {"by_hour": by_hour, "by_type": by_type, "by_lane": by_lane, "total": total}


def read_telegram_link():
    """Suy ra link Telegram để gắn vào QR (đọc telegram_config.json nếu có)."""
    cfg_path = os.path.join(ROOT, "telegram_config.json")
    default = {"link": "", "name": "Quét để nhận cảnh báo"}
    if not os.path.exists(cfg_path):
        return default
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except (json.JSONDecodeError, OSError):
        return default
    username = str(cfg.get("bot_username", "")).strip().lstrip("@")
    if username:
        return {"link": f"https://t.me/{username}", "name": f"@{username}"}
    return default


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # tắt log request cho gọn console

    def _send(self, code, body, content_type="application/json; charset=utf-8",
              head_only=False):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _send_json(self, code, payload, head_only=False):
        return self._send(code, json.dumps(payload, ensure_ascii=False),
                          head_only=head_only)

    def _send_webcam_jpeg(self, body, metadata):
        """Send one annotated frame with compact, browser-readable AI metrics."""
        counts = metadata.get("counts") or {}
        counts_header = ",".join(
            "%s=%s" % (name, counts.get(name, 0))
            for name in ("bicycle", "car", "motorcycle", "bus", "truck")
        )

        def ascii_header(value):
            return str(value).encode("ascii", "replace").decode("ascii")

        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-AI-FPS", ascii_header(metadata.get("fps", 0)))
        self.send_header("X-AI-Latency-Ms",
                         ascii_header(metadata.get("latency_ms", 0)))
        self.send_header("X-Detection-Count",
                         ascii_header(metadata.get("detection_count", 0)))
        self.send_header("X-AI-Counts", ascii_header(counts_header))
        self.send_header("X-AI-Model",
                         ascii_header(metadata.get("model", "yolo26n.pt")))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/demo-recipient":
            if not _is_loopback_request(self):
                return self._send_json(403, {"error": "Demo recipient settings are local-only"})
            return self._send_json(200, _demo_recipient_payload())

        if path == "/api/mobile/violations":
            payload = _mobile_events_payload(self, parsed)
            if payload is not None:
                return self._send_json(200, payload)
            return
        if path.startswith("/api/mobile/evidence/"):
            return _serve_mobile_evidence(self, parsed)

        if path in ("/", "/index.html"):
            return self._serve_file(os.path.join(WEB_DIR, "dashboard.html"),
                                    "text/html; charset=utf-8")

        if path == "/app.js":
            return self._serve_file(os.path.join(WEB_DIR, "app.js"),
                                    "application/javascript; charset=utf-8")

        if path == "/api/state":
            return self._send(200, json.dumps(read_state(), ensure_ascii=False))

        if path == "/api/violations":
            return self._send(200, json.dumps(read_violations(), ensure_ascii=False))

        if path == "/api/stats":
            return self._send(200, json.dumps(read_stats(), ensure_ascii=False))

        if path == "/api/telegram":
            return self._send(200, json.dumps(read_telegram_link(), ensure_ascii=False))

        if path == "/api/drive":
            return self._send_json(200, read_drive_link())

        if path == "/api/webcam/status":
            status = WEBCAM_AI.status()
            status["video_job_active"] = webcam_video_job_active()
            return self._send_json(200, status)

        if path == "/api/video-jobs/current":
            return self._send_json(200, {"job": VIDEO_JOBS.read()})

        if path.startswith("/api/video-jobs/"):
            parts = [part for part in path.split("/") if part]
            # /api/video-jobs/<job-id>
            if len(parts) == 3:
                job = VIDEO_JOBS.read(parts[2])
                return self._send_json(200 if job else 404,
                                       {"job": job} if job else {"error": "Không tìm thấy job"})
            # /api/video-jobs/<job-id>/preview.jpg
            if len(parts) == 4 and parts[3] == "preview.jpg":
                folder = VIDEO_JOBS._job_dir(parts[2])
                if not folder:
                    return self._send_json(404, {"error": "Không tìm thấy job"})
                return self._serve_file(os.path.join(folder, "preview.jpg"), "image/jpeg")
            # /api/video-jobs/<job-id>/artifact/<safe relative path>
            if len(parts) >= 5 and parts[3] == "artifact":
                marker = "/api/video-jobs/%s/artifact/" % parts[2]
                relative = path.split(marker, 1)[1] if marker in path else ""
                artifact = VIDEO_JOBS.artifact_path(parts[2], relative)
                name = os.path.basename(artifact) if artifact else ""
                if not artifact or not name:
                    return self._send_json(404, {"error": "Không tìm thấy tệp"})
                extension = os.path.splitext(name)[1].lower()
                types = {
                    ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png", ".csv": "text/csv; charset=utf-8-sig",
                    ".json": "application/json; charset=utf-8",
                }
                if extension not in types:
                    return self._send_json(403, {"error": "Loại tệp không được công khai"})
                return self._serve_file(artifact, types[extension])

        if path == "/qr.png":
            return self._serve_file(os.path.join(WEB_DIR, "qr.png"), "image/png")

        if path.startswith("/demo-videos/"):
            name = os.path.basename(unquote(path[len("/demo-videos/"):]))
            if not name.lower().endswith(".mp4"):
                return self._send_json(403, {"error": "Chỉ công khai video demo MP4"})
            return self._serve_file(os.path.join(DEMO_VIDEOS_DIR, name), "video/mp4")

        # Frame camera da ve box nhan dien (main.py ghi logs/live_frame.jpg)
        if path == "/frame.jpg":
            fp = os.path.join(LOGS_DIR, "live_frame.jpg")
            if not os.path.isfile(fp):
                return self._send(404, json.dumps({"error": "no frame"}))
            try:
                with open(fp, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                self._send(500, json.dumps({"error": "read error"}))
            return

        # Ảnh/clip bằng chứng: /violations/<tên file> (chống path traversal)
        if path.startswith("/violations/"):
            name = os.path.basename(unquote(path[len("/violations/"):]))
            ctype = "video/mp4" if name.lower().endswith(".mp4") else "image/jpeg"
            return self._serve_file(os.path.join(VIOLATIONS_DIR, name), ctype)

        return self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/demo-recipient":
            if not _is_loopback_request(self):
                return self._send_json(403, {"error": "Demo recipient settings are local-only"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 1024:
                    raise ValueError("Invalid request body")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                status = save_recipient((payload or {}).get("cccd", ""))
                return self._send_json(200, {"ok": True, "configured": True, "tail": status.get("tail", "")})
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                return self._send_json(400, {"error": str(exc)})

        if path == "/api/webcam/infer":
            # The upload-video worker and live webcam inference intentionally do
            # not compete for the same Jetson RAM/GPU.  Reject before reading the
            # body so the browser can retry after the job completes.
            if webcam_video_job_active():
                return self._send_json(409, {
                    "error": "AI dang xu ly video tai len; hay cho job hoan tat.",
                    "code": "video_job_active",
                })
            content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type not in ("image/jpeg", "image/jpg"):
                return self._send_json(415, {
                    "error": "Webcam chi nhan Content-Type image/jpeg",
                    "code": "unsupported_media_type",
                })
            content_length_header = self.headers.get("Content-Length")
            if content_length_header is None:
                return self._send_json(411, {
                    "error": "Thieu Content-Length cho khung JPEG",
                    "code": "length_required",
                })
            try:
                content_length = int(content_length_header)
            except (TypeError, ValueError):
                return self._send_json(411, {
                    "error": "Content-Length khong hop le",
                    "code": "length_required",
                })
            if content_length <= 0:
                return self._send_json(400, {
                    "error": "Khung JPEG dang rong",
                    "code": "empty_frame",
                })
            if content_length > MAX_WEBCAM_JPEG_BYTES:
                return self._send_json(413, {
                    "error": "Khung JPEG vuot gioi han %d byte" % MAX_WEBCAM_JPEG_BYTES,
                    "code": "frame_too_large",
                })
            try:
                previous_timeout = self.connection.gettimeout()
                self.connection.settimeout(10)
                try:
                    body = self.rfile.read(content_length)
                finally:
                    self.connection.settimeout(previous_timeout)
                if len(body) != content_length:
                    return self._send_json(400, {
                        "error": "Ket noi bi ngat khi dang nhan JPEG",
                        "code": "incomplete_frame",
                    })
                query = parse_qs(parsed.query, keep_blank_values=True)
                conf = (query.get("conf") or [0.30])[-1]
                imgsz = (query.get("imgsz") or [640])[-1]
                jpeg, metadata = WEBCAM_AI.infer_jpeg(body, conf=conf, imgsz=imgsz)
                return self._send_webcam_jpeg(jpeg, metadata)
            except WebcamInputError as exc:
                return self._send_json(400, {
                    "error": str(exc), "code": "invalid_jpeg",
                })
            except WebcamInferenceError as exc:
                return self._send_json(503, {
                    "error": str(exc), "code": "ai_unavailable",
                })
            except (OSError, ValueError) as exc:
                return self._send_json(400, {
                    "error": str(exc), "code": "frame_read_error",
                })
            except Exception as exc:
                return self._send_json(500, {
                    "error": "Webcam AI gap loi: %s" % exc,
                    "code": "internal_error",
                })

        if path == "/api/webcam/release":
            status = WEBCAM_AI.release()
            status["video_job_active"] = webcam_video_job_active()
            return self._send_json(200, status)

        if path == "/api/video-jobs":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._send_json(411, {"error": "Thiếu Content-Length hợp lệ"})
            filename = unquote(self.headers.get("X-File-Name", "video.mp4"))
            query = parse_qs(parsed.query, keep_blank_values=True)
            options = {key: values[-1] for key, values in query.items() if values}
            mode = str(options.pop("mode", "vehicle")).lower()
            try:
                previous_timeout = self.connection.gettimeout()
                self.connection.settimeout(UPLOAD_SOCKET_TIMEOUT_SECONDS)
                try:
                    job = VIDEO_JOBS.create_from_request(
                        self.rfile, content_length, filename, mode, options,
                    )
                finally:
                    self.connection.settimeout(previous_timeout)
                return self._send_json(202, {"job": job})
            except RuntimeError as exc:
                return self._send_json(409, {"error": str(exc)})
            except (ValueError, OSError) as exc:
                return self._send_json(400, {"error": str(exc)})
            except Exception as exc:
                return self._send_json(500, {"error": "Không tạo được job: %s" % exc})

        parts = [part for part in path.split("/") if part]
        if len(parts) == 4 and parts[:2] == ["api", "video-jobs"] and parts[3] == "cancel":
            if VIDEO_JOBS.cancel(parts[2]):
                return self._send_json(202, {"ok": True})
            return self._send_json(409, {"error": "Job này không còn chạy"})
        return self._send_json(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        """Serve metadata for browser probes (notably HTML5 video)."""
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._serve_file(os.path.join(WEB_DIR, "dashboard.html"),
                                    "text/html; charset=utf-8", head_only=True)
        if path == "/app.js":
            return self._serve_file(os.path.join(WEB_DIR, "app.js"),
                                    "application/javascript; charset=utf-8",
                                    head_only=True)
        if path == "/qr.png":
            return self._serve_file(os.path.join(WEB_DIR, "qr.png"), "image/png",
                                     head_only=True)
        if path.startswith("/demo-videos/"):
            name = os.path.basename(unquote(path[len("/demo-videos/"):]))
            if name.lower().endswith(".mp4"):
                return self._serve_file(os.path.join(DEMO_VIDEOS_DIR, name),
                                        "video/mp4", head_only=True)
        if path == "/frame.jpg":
            return self._serve_file(os.path.join(LOGS_DIR, "live_frame.jpg"),
                                    "image/jpeg", head_only=True)
        if path.startswith("/violations/"):
            name = os.path.basename(unquote(path[len("/violations/"):]))
            ctype = "video/mp4" if name.lower().endswith(".mp4") else "image/jpeg"
            return self._serve_file(os.path.join(VIOLATIONS_DIR, name), ctype,
                                    head_only=True)
        if path == "/api/state":
            return self._send(200, json.dumps(read_state(), ensure_ascii=False),
                              head_only=True)
        if path == "/api/violations":
            return self._send(200, json.dumps(read_violations(), ensure_ascii=False),
                              head_only=True)
        if path == "/api/stats":
            return self._send(200, json.dumps(read_stats(), ensure_ascii=False),
                              head_only=True)
        if path == "/api/telegram":
            return self._send(200, json.dumps(read_telegram_link(), ensure_ascii=False),
                               head_only=True)
        if path == "/api/drive":
            return self._send_json(200, read_drive_link(), head_only=True)
        if path == "/api/webcam/status":
            status = WEBCAM_AI.status()
            status["video_job_active"] = webcam_video_job_active()
            return self._send_json(200, status, head_only=True)
        if path == "/api/video-jobs/current":
            return self._send_json(200, {"job": VIDEO_JOBS.read()}, head_only=True)
        if path.startswith("/api/video-jobs/"):
            parts = [part for part in path.split("/") if part]
            if len(parts) == 4 and parts[3] == "preview.jpg":
                folder = VIDEO_JOBS._job_dir(parts[2])
                if folder:
                    return self._serve_file(os.path.join(folder, "preview.jpg"),
                                            "image/jpeg", head_only=True)
            if len(parts) >= 5 and parts[3] == "artifact":
                marker = "/api/video-jobs/%s/artifact/" % parts[2]
                relative = path.split(marker, 1)[1] if marker in path else ""
                artifact = VIDEO_JOBS.artifact_path(parts[2], relative)
                name = os.path.basename(artifact) if artifact else ""
                extension = os.path.splitext(name)[1].lower()
                types = {
                    ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png", ".csv": "text/csv; charset=utf-8-sig",
                    ".json": "application/json; charset=utf-8",
                }
                if artifact and name and extension in types:
                    return self._serve_file(artifact, types[extension],
                                            head_only=True)
        return self._send(404, json.dumps({"error": "not found"}), head_only=True)

    def _serve_file(self, filepath, content_type, head_only=False):
        """Serve a static file, including single-range requests used by HTML5 video.

        The old implementation always returned a complete 200 response.  Chromium
        commonly asks for an MP4 with ``Range: bytes=...`` while probing its moov
        metadata; answering that request with a proper 206 response is required for
        duration/seek controls to become available.
        """
        if not os.path.isfile(filepath):
            return self._send(404, json.dumps({"error": "file not found"}),
                              head_only=head_only)
        try:
            file_size = os.path.getsize(filepath)
            start = 0
            end = max(0, file_size - 1)
            status = 200
            range_header = self.headers.get("Range")
            if range_header:
                # Single ranges are sufficient for the browser video element.  A
                # multipart response would add complexity and is not needed here.
                if not range_header.startswith("bytes=") or "," in range_header:
                    return self._range_not_satisfiable(file_size, head_only)
                spec = range_header[6:].strip()
                try:
                    left, right = spec.split("-", 1)
                    if left.strip():
                        start = int(left)
                        if start < 0 or start >= file_size:
                            raise ValueError
                        if right.strip():
                            end = min(int(right), file_size - 1)
                        else:
                            end = file_size - 1
                    else:
                        suffix = int(right)
                        if suffix <= 0:
                            raise ValueError
                        start = max(0, file_size - suffix)
                        end = file_size - 1
                    if end < start:
                        raise ValueError
                except (TypeError, ValueError):
                    return self._range_not_satisfiable(file_size, head_only)
                status = 206

            length = 0 if file_size == 0 else (end - start + 1)
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store" if content_type.startswith("video/") else "no-cache")
            if status == 206:
                self.send_header("Content-Range",
                                 "bytes %d-%d/%d" % (start, end, file_size))
            self.end_headers()
            if head_only or length == 0:
                return
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining:
                    chunk = f.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except OSError:
            # If headers have already been sent, there is no safe way to replace
            # them with a JSON error; just terminate this response.
            try:
                self._send(500, json.dumps({"error": "read error"}),
                           head_only=head_only)
            except OSError:
                pass

    def _range_not_satisfiable(self, file_size, head_only=False):
        self.send_response(416)
        self.send_header("Content-Range", "bytes */%d" % file_size)
        self.send_header("Content-Length", "0")
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()


def get_lan_ip():
    """Đoán IP LAN của máy để in hướng dẫn mở từ điện thoại."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--host", default="127.0.0.1",
                    help="bind address; use 0.0.0.0 only on a trusted LAN")
    args = ap.parse_args()

    os.makedirs(LOGS_DIR, exist_ok=True)
    os.makedirs(VIOLATIONS_DIR, exist_ok=True)
    os.makedirs(VIDEO_JOBS_DIR, exist_ok=True)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("=" * 56)
    print("  DASHBOARD GIÁM SÁT GIAO THÔNG – TP. ĐÀ NẴNG")
    print("=" * 56)
    print(f"  Máy này        : http://localhost:{args.port}")
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"  Điện thoại/PC  : http://{get_lan_ip()}:{args.port}   (LAN tin cậy)")
    else:
        print("  Chế độ an toàn : chỉ máy này truy cập; dùng --host 0.0.0.0 nếu cần LAN")
    print("=" * 56)
    print("  Ctrl+C để dừng.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng dashboard.")
        server.shutdown()


if __name__ == "__main__":
    main()
