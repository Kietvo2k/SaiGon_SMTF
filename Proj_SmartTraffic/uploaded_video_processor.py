"""Isolated AI worker for videos uploaded from the local dashboard.

The worker deliberately writes *only* inside ``--job-dir``.  It does not touch
the dashboard live files, the project's shared violation workbook/CSV, Google
Drive, Telegram, or GPIO.  This makes it safe to run next to the fixed Jetson
demonstration process.

Two modes are supported:

``vehicle``
    Real YOLO/ByteTrack vehicle detection with labelled bounding boxes.

``redlight``
    The same detector plus a configurable horizontal stop line.  A red-light
    event can be emitted only when ``--force-red-simulation`` is explicitly
    supplied.  The evidence is therefore clearly labelled as a simulation and
    must not be presented as legal enforcement evidence.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import shutil
import sys
import time
import traceback
import uuid
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Iterable

try:
    import cv2
except Exception:  # pragma: no cover - exercised only on a broken deployment
    cv2 = None

try:
    import numpy as np
except Exception:  # pragma: no cover - exercised only on a broken deployment
    np = None


REPO_ROOT = Path(__file__).resolve().parent
VEHICLE_MODEL_PATH = REPO_ROOT / "yolo26n.pt"
FALLBACK_VEHICLE_MODEL_PATH = REPO_ROOT / "yolov8n.pt"
PLATE_MODEL_PATH = REPO_ROOT / "models" / "license_plate" / "license_plate_detection.pt"
OCR_MODEL_PATH = REPO_ROOT / "models" / "license_plate" / "license_plate_ocr.pt"

VEHICLE_TYPES = ("car", "motorcycle", "bus", "truck", "bicycle")
NAME_ALIASES = {
    "car": "car",
    "motorcycle": "motorcycle",
    "motorbike": "motorcycle",
    "motor bike": "motorcycle",
    "bus": "bus",
    "truck": "truck",
    "lorry": "truck",
    "bicycle": "bicycle",
    "bike": "bicycle",
}

SIMULATION_LABEL = "RED-LIGHT SIMULATION - NOT LEGAL ENFORCEMENT"
REDLIGHT_DISABLED_LABEL = (
    "RED-LIGHT EVENT DISABLED (enable --force-red-simulation explicitly)"
)
VEHICLE_LABEL = "AI VEHICLE DETECTION (YOLO)"

CSV_FIELDS = (
    "event_id",
    "timestamp_utc",
    "frame_index",
    "video_time_s",
    "track_id",
    "vehicle_type",
    "detection_confidence",
    "plate_text",
    "plate_confidence",
    "plate_status",
    "scene_path",
    "vehicle_crop_path",
    "plate_crop_path",
    "simulation_label",
)


@dataclass(frozen=True)
class VideoJobConfig:
    video: Path
    job_dir: Path
    mode: str = "vehicle"
    stop_line_ratio: float = 0.65
    force_red_simulation: bool = False
    direction: str = "auto"
    stride: int = 1
    imgsz: int = 480
    conf: float = 0.35
    max_frames: int = 0
    preview_interval_s: float = 0.12

    def validate(self) -> None:
        if self.mode not in {"vehicle", "redlight"}:
            raise ValueError("mode must be vehicle or redlight")
        if self.direction not in {"up", "down", "auto"}:
            raise ValueError("direction must be up, down, or auto")
        if not 0.05 <= float(self.stop_line_ratio) <= 0.95:
            raise ValueError("stop-line-ratio must be between 0.05 and 0.95")
        if int(self.stride) < 1:
            raise ValueError("stride must be >= 1")
        if int(self.imgsz) < 160:
            raise ValueError("imgsz must be >= 160")
        if not 0.01 <= float(self.conf) <= 1.0:
            raise ValueError("conf must be between 0.01 and 1.0")
        if int(self.max_frames) < 0:
            raise ValueError("max-frames must be >= 0")


def _atomic_replace(tmp: Path, target: Path, attempts: int = 6) -> None:
    """Replace a file with short retries for Windows readers/antivirus."""

    last_error: OSError | None = None
    for attempt in range(attempts):
        try:
            os.replace(tmp, target)
            return
        except OSError as exc:
            last_error = exc
            time.sleep(0.02 * (attempt + 1))
    if last_error is not None:
        raise last_error


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        _atomic_replace(tmp, path)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


def atomic_write_preview(path: Path, frame: Any) -> None:
    if cv2 is None:
        raise RuntimeError("OpenCV is unavailable; cannot write preview.jpg")
    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not ok:
        raise RuntimeError("OpenCV could not encode preview frame")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp, "wb") as handle:
            handle.write(encoded.tobytes())
            handle.flush()
            os.fsync(handle.fileno())
        _atomic_replace(tmp, path)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


def _relative_to_job(path: Path | str | None, job_dir: Path) -> str:
    if not path:
        return ""
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = job_dir / candidate
    try:
        return candidate.resolve().relative_to(job_dir.resolve()).as_posix()
    except (OSError, ValueError):
        return ""


def _to_numpy(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "numpy"):
        return value.numpy()
    if np is None:
        return value
    return np.asarray(value)


def _normalise_names(names: Any) -> dict[int, str]:
    if isinstance(names, dict):
        return {int(key): str(value) for key, value in names.items()}
    if isinstance(names, (list, tuple)):
        return {index: str(value) for index, value in enumerate(names)}
    return {}


def _canonical_vehicle_name(name: str) -> str | None:
    return NAME_ALIASES.get(str(name).strip().lower())


def _vehicle_class_ids(names: Any) -> list[int]:
    return [
        class_id
        for class_id, name in _normalise_names(names).items()
        if _canonical_vehicle_name(name) is not None
    ]


@dataclass
class Detection:
    box: tuple[int, int, int, int]
    class_id: int
    label: str
    confidence: float
    track_id: int | None


def extract_vehicle_detections(result: Any, names: Any) -> list[Detection]:
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return []

    xyxy = _to_numpy(getattr(boxes, "xyxy", None))
    confidences = _to_numpy(getattr(boxes, "conf", None))
    classes = _to_numpy(getattr(boxes, "cls", None))
    track_ids = _to_numpy(getattr(boxes, "id", None))
    if xyxy is None or confidences is None or classes is None:
        return []

    name_map = _normalise_names(names)
    detections: list[Detection] = []
    for index in range(len(xyxy)):
        class_id = int(classes[index])
        canonical = _canonical_vehicle_name(name_map.get(class_id, str(class_id)))
        if canonical is None:
            continue
        coords = [int(round(float(value))) for value in xyxy[index][:4]]
        track_id: int | None = None
        if track_ids is not None and index < len(track_ids):
            raw_id = float(track_ids[index])
            if math.isfinite(raw_id):
                track_id = int(raw_id)
        detections.append(
            Detection(
                box=(coords[0], coords[1], coords[2], coords[3]),
                class_id=class_id,
                label=canonical,
                confidence=float(confidences[index]),
                track_id=track_id,
            )
        )
    return detections


class CentroidFallbackTracker:
    """Small deterministic tracker used only when Ultralytics returns no IDs."""

    def __init__(self, max_age: int = 8) -> None:
        self.max_age = max_age
        self.next_id = 1_000_000
        self.tracks: dict[int, tuple[str, float, float, int]] = {}

    def assign(self, detections: list[Detection], step: int) -> None:
        used: set[int] = set()
        for detection in detections:
            if detection.track_id is not None:
                continue
            x1, y1, x2, y2 = detection.box
            cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            diagonal = math.hypot(x2 - x1, y2 - y1)
            max_distance = max(35.0, diagonal * 0.7)
            best_id: int | None = None
            best_distance = float("inf")
            for track_id, (label, old_x, old_y, last_step) in self.tracks.items():
                if (
                    track_id in used
                    or label != detection.label
                    or step - last_step > self.max_age
                ):
                    continue
                distance = math.hypot(cx - old_x, cy - old_y)
                if distance < best_distance and distance <= max_distance:
                    best_id, best_distance = track_id, distance
            if best_id is None:
                best_id = self.next_id
                self.next_id += 1
            detection.track_id = best_id
            self.tracks[best_id] = (detection.label, cx, cy, step)
            used.add(best_id)

        expired = [
            track_id
            for track_id, (_, _, _, last_step) in self.tracks.items()
            if step - last_step > self.max_age
        ]
        for track_id in expired:
            self.tracks.pop(track_id, None)


@dataclass
class _CrossingState:
    origin_side: int | None = None
    candidate_side: int | None = None
    candidate_frames: int = 0
    history: deque[float] | None = None
    emitted: bool = False

    def __post_init__(self) -> None:
        if self.history is None:
            self.history = deque(maxlen=12)


class StopLineCrossingDetector:
    """Track bottom-centre crossings with direction and two-frame debounce."""

    def __init__(self, line_y: int, direction: str = "auto", confirm_frames: int = 2):
        if direction not in {"up", "down", "auto"}:
            raise ValueError("direction must be up, down, or auto")
        self.line_y = int(line_y)
        self.direction = direction
        self.confirm_frames = max(1, int(confirm_frames))
        self.states: dict[int, _CrossingState] = {}

    def update(self, track_id: int, box: Iterable[int]) -> bool:
        if track_id is None:
            return False
        x1, y1, x2, y2 = [float(value) for value in box]
        del x1, y1, x2
        state = self.states.setdefault(int(track_id), _CrossingState())
        if state.emitted:
            return False

        bottom_y = y2
        state.history.append(bottom_y)
        hysteresis = 2.0
        side = -1 if bottom_y < self.line_y - hysteresis else (
            1 if bottom_y > self.line_y + hysteresis else 0
        )
        if side == 0:
            return False
        if state.origin_side is None:
            state.origin_side = side
            return False
        if side == state.origin_side:
            state.candidate_side = None
            state.candidate_frames = 0
            return False

        expected = self.direction
        if expected == "auto":
            expected = "up" if state.origin_side == 1 else "down"
        crossing_direction = "up" if state.origin_side == 1 and side == -1 else "down"
        if crossing_direction != expected:
            return False

        if state.candidate_side == side:
            state.candidate_frames += 1
        else:
            state.candidate_side = side
            state.candidate_frames = 1

        history = list(state.history)
        movement = abs(history[-1] - history[0]) if len(history) >= 2 else 0.0
        if state.candidate_frames >= self.confirm_frames and movement >= 5.0:
            state.emitted = True
            return True
        return False


class PlateReader:
    """Lazy adapter around the project's existing evidence OCR utility."""

    def __init__(self, imgsz: int, job_dir: Path) -> None:
        self.imgsz = int(imgsz)
        self.job_dir = Path(job_dir).resolve()
        self._loaded = False
        self._models: dict[str, Any] = {}
        self._ocr: Any = None
        self._args: Any = None
        self._recognize: Callable[..., Any] | None = None
        self._load_error = ""

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            if not PLATE_MODEL_PATH.is_file() or not OCR_MODEL_PATH.is_file():
                missing = [
                    str(path)
                    for path in (PLATE_MODEL_PATH, OCR_MODEL_PATH)
                    if not path.is_file()
                ]
                raise FileNotFoundError("missing OCR model(s): " + ", ".join(missing))
            from ultralytics import YOLO
            from main import PlateOCRYolo, recognize_plate_for_evidence

            plate_model = YOLO(str(PLATE_MODEL_PATH))
            ocr_model = YOLO(str(OCR_MODEL_PATH))
            self._models = {"plate": plate_model, "ocr": ocr_model}
            self._ocr = PlateOCRYolo(ocr_model, device="cpu", conf=0.35)
            self._recognize = recognize_plate_for_evidence
            self._args = SimpleNamespace(
                skip_ocr=False,
                imgsz=self.imgsz,
                device="cpu",
                plate_min_confidence=0.45,
            )
        except Exception as exc:
            self._load_error = f"{type(exc).__name__}: {exc}"

    def recognize(
        self,
        frame: Any,
        box: tuple[int, int, int, int],
        label: str,
        timestamp: str,
        event_id: str,
        event_dir: Path,
    ) -> dict[str, Any]:
        self._load()
        if self._recognize is None:
            return {
                "plate_text": "NO_PLATE_DETECTED",
                "plate_confidence": 0.0,
                "plate_status": "NO_PLATE_DETECTED",
                "plate_crop_path": "",
                "ocr_error": self._load_error,
            }

        old_cwd = Path.cwd()
        generated_dir = self.job_dir / "violations"
        generated_dir.mkdir(parents=True, exist_ok=True)
        try:
            # The existing utility writes a relative ``violations/...`` path.
            # Running it from the isolated job directory keeps that write local.
            os.chdir(self.job_dir)
            text, confidence, status, generated_path = self._recognize(
                frame,
                box,
                self._models,
                self._ocr,
                self._args,
                label,
                timestamp,
                event_id,
            )
        except Exception as exc:
            return {
                "plate_text": "NO_PLATE_DETECTED",
                "plate_confidence": 0.0,
                "plate_status": "NO_PLATE_DETECTED",
                "plate_crop_path": "",
                "ocr_error": f"{type(exc).__name__}: {exc}",
            }
        finally:
            os.chdir(old_cwd)

        plate_path = ""
        if generated_path:
            source = Path(generated_path)
            if not source.is_absolute():
                source = self.job_dir / source
            if source.is_file():
                destination = event_dir / "plate.jpg"
                try:
                    os.replace(source, destination)
                except OSError:
                    shutil.copy2(source, destination)
                    source.unlink(missing_ok=True)
                plate_path = _relative_to_job(destination, self.job_dir)

        return {
            "plate_text": str(text or "UNREADABLE"),
            "plate_confidence": round(float(confidence or 0.0), 4),
            "plate_status": str(status or "NO_PLATE_DETECTED"),
            "plate_crop_path": plate_path,
            "ocr_error": "",
        }


def _draw_detection(frame: Any, detection: Detection, violated: bool = False) -> None:
    x1, y1, x2, y2 = detection.box
    colour = (0, 0, 255) if violated else (0, 220, 60)
    cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
    track_text = "?" if detection.track_id is None else str(detection.track_id)
    label = f"{detection.label} ID:{track_text} {detection.confidence:.2f}"
    text_y = max(20, y1 - 7)
    cv2.putText(frame, label, (x1, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, colour, 2)


def _draw_header(
    frame: Any,
    config: VideoJobConfig,
    frame_index: int,
    total_frames: int,
    unique_count: int,
    line_y: int | None,
    simulation_label: str,
) -> None:
    height, width = frame.shape[:2]
    if line_y is not None:
        cv2.line(frame, (0, line_y), (width - 1, line_y), (0, 0, 255), 3)
        cv2.putText(
            frame,
            f"STOP LINE ({config.direction})",
            (12, max(24, line_y - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 0, 255),
            2,
        )
    cv2.rectangle(frame, (0, 0), (width, 70), (12, 18, 28), -1)
    total_text = str(total_frames) if total_frames > 0 else "?"
    cv2.putText(
        frame,
        f"YOLO AI | {config.mode.upper()} | FRAME {frame_index}/{total_text} | UNIQUE {unique_count}",
        (12, 26),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.62,
        (255, 255, 255),
        2,
    )
    colour = (0, 210, 255) if config.mode == "redlight" else (0, 220, 60)
    cv2.putText(
        frame,
        simulation_label,
        (12, 55),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        colour,
        2,
    )


def _write_image(path: Path, frame: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), frame):
        raise OSError(f"could not save image: {path}")


def _open_video_writer(
    path: Path, source_fps: float, stride: int, frame_size: tuple[int, int]
) -> tuple[Any | None, str]:
    """Prefer browser-friendly H.264 and fall back to broadly available mp4v."""

    output_fps = max(1.0, float(source_fps) / max(1, int(stride)))
    path.parent.mkdir(parents=True, exist_ok=True)
    for codec in ("avc1", "H264", "mp4v"):
        try:
            writer = cv2.VideoWriter(
                str(path),
                cv2.VideoWriter_fourcc(*codec),
                output_fps,
                frame_size,
            )
            if writer.isOpened():
                return writer, codec
            writer.release()
        except Exception:
            pass
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
    return None, ""


def _save_event(
    config: VideoJobConfig,
    frame: Any,
    annotated_frame: Any,
    detection: Detection,
    frame_index: int,
    source_fps: float,
    plate_reader: PlateReader,
) -> dict[str, Any]:
    timestamp_dt = datetime.now(timezone.utc)
    timestamp = timestamp_dt.strftime("%Y%m%d_%H%M%S_%f")[:-3]
    event_id = f"redlight_{frame_index:08d}_{detection.track_id}_{timestamp}"
    event_dir = config.job_dir / "events" / event_id
    event_dir.mkdir(parents=True, exist_ok=False)

    scene = annotated_frame.copy()
    _draw_detection(scene, detection, violated=True)
    cv2.putText(
        scene,
        "SIMULATED RED-LIGHT EVENT",
        (12, max(92, scene.shape[0] - 18)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (0, 0, 255),
        3,
    )
    scene_path = event_dir / "scene.jpg"
    _write_image(scene_path, scene)

    height, width = frame.shape[:2]
    x1, y1, x2, y2 = detection.box
    x1, x2 = max(0, x1), min(width, x2)
    y1, y2 = max(0, y1), min(height, y2)
    vehicle_path = event_dir / "vehicle.jpg"
    vehicle_crop = frame[y1:y2, x1:x2]
    if vehicle_crop.size:
        _write_image(vehicle_path, vehicle_crop)
        vehicle_relative = _relative_to_job(vehicle_path, config.job_dir)
    else:
        vehicle_relative = ""

    plate = plate_reader.recognize(
        frame,
        detection.box,
        detection.label,
        timestamp,
        event_id,
        event_dir,
    )
    event = {
        "event_id": event_id,
        "timestamp_utc": timestamp_dt.isoformat(),
        "frame_index": int(frame_index),
        "video_time_s": round(frame_index / source_fps, 3) if source_fps > 0 else 0.0,
        "track_id": int(detection.track_id) if detection.track_id is not None else -1,
        "vehicle_type": detection.label,
        "detection_confidence": round(float(detection.confidence), 4),
        "plate_text": plate["plate_text"],
        "plate_confidence": plate["plate_confidence"],
        "plate_status": plate["plate_status"],
        "scene_path": _relative_to_job(scene_path, config.job_dir),
        "vehicle_crop_path": vehicle_relative,
        "plate_crop_path": plate["plate_crop_path"],
        "simulation_label": SIMULATION_LABEL,
    }
    if plate.get("ocr_error"):
        event["ocr_error"] = plate["ocr_error"]
    atomic_write_json(event_dir / "event.json", event)
    return event


def _open_csv(path: Path) -> tuple[Any, csv.DictWriter]:
    handle = open(path, "w", encoding="utf-8-sig", newline="")
    writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="ignore")
    writer.writeheader()
    handle.flush()
    return handle, writer


def _load_vehicle_model(model_path: Path) -> Any:
    if not model_path.is_file() and model_path == VEHICLE_MODEL_PATH and FALLBACK_VEHICLE_MODEL_PATH.is_file():
        model_path = FALLBACK_VEHICLE_MODEL_PATH
    if not model_path.is_file():
        raise FileNotFoundError(f"YOLO vehicle model not found: {model_path}")
    try:
        from ultralytics import YOLO
    except Exception as exc:
        raise RuntimeError(f"Ultralytics YOLO is unavailable: {exc}") from exc
    return YOLO(str(model_path))


def _progress_payload(
    *,
    status: str,
    config: VideoJobConfig,
    frame_index: int,
    total_frames: int,
    processed_frames: int,
    started: float,
    counts_by_class: dict[str, int],
    unique_vehicles: int,
    simulation_label: str,
    inference_method: str,
    event_count: int,
    error: str = "",
) -> dict[str, Any]:
    effective_total = total_frames
    if config.max_frames > 0:
        effective_total = min(total_frames, config.max_frames) if total_frames > 0 else config.max_frames
    if status == "completed":
        progress_pct = 100.0
    elif effective_total > 0:
        progress_pct = min(99.9, 100.0 * frame_index / effective_total)
    else:
        progress_pct = 0.0
    elapsed = max(0.001, time.perf_counter() - started)
    return {
        "status": status,
        "progress_pct": round(progress_pct, 1),
        "frame_index": int(frame_index),
        "total_frames": int(effective_total),
        "fps": round(processed_frames / elapsed, 2),
        "counts_by_class": {name: int(counts_by_class.get(name, 0)) for name in VEHICLE_TYPES},
        "unique_vehicles": int(unique_vehicles),
        "mode": config.mode,
        "simulation_label": simulation_label,
        "inference_method": inference_method,
        "event_count": int(event_count),
        "error": str(error or ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def run_job(
    config: VideoJobConfig,
    *,
    model_factory: Callable[[Path], Any] | None = None,
    capture_factory: Callable[[str], Any] | None = None,
) -> dict[str, Any]:
    """Process one uploaded video and return the same summary as result.json."""

    config = VideoJobConfig(
        video=Path(config.video).resolve(),
        job_dir=Path(config.job_dir).resolve(),
        mode=config.mode,
        stop_line_ratio=config.stop_line_ratio,
        force_red_simulation=config.force_red_simulation,
        direction=config.direction,
        stride=config.stride,
        imgsz=config.imgsz,
        conf=config.conf,
        max_frames=config.max_frames,
        preview_interval_s=config.preview_interval_s,
    )
    config.validate()
    config.job_dir.mkdir(parents=True, exist_ok=True)
    progress_path = config.job_dir / "progress.json"
    result_path = config.job_dir / "result.json"
    preview_path = config.job_dir / "preview.jpg"
    output_video_path = config.job_dir / "output.mp4"
    csv_path = config.job_dir / "violations.csv"
    started = time.perf_counter()
    simulation_label = (
        SIMULATION_LABEL
        if config.mode == "redlight" and config.force_red_simulation
        else REDLIGHT_DISABLED_LABEL
        if config.mode == "redlight"
        else VEHICLE_LABEL
    )

    frame_index = 0
    processed_frames = 0
    total_frames = 0
    source_fps = 0.0
    inference_method = "track"
    events: list[dict[str, Any]] = []
    unique_by_class: dict[str, set[int]] = {name: set() for name in VEHICLE_TYPES}
    warnings: list[str] = []
    capture: Any = None
    csv_handle: Any = None
    video_writer: Any = None
    video_codec = ""

    def counts() -> dict[str, int]:
        return {name: len(track_ids) for name, track_ids in unique_by_class.items()}

    def write_progress(status: str, error: str = "") -> dict[str, Any]:
        payload = _progress_payload(
            status=status,
            config=config,
            frame_index=frame_index,
            total_frames=total_frames,
            processed_frames=processed_frames,
            started=started,
            counts_by_class=counts(),
            unique_vehicles=sum(len(value) for value in unique_by_class.values()),
            simulation_label=simulation_label,
            inference_method=inference_method,
            event_count=len(events),
            error=error,
        )
        if warnings:
            payload["warnings"] = list(warnings)
        atomic_write_json(progress_path, payload)
        return payload

    atomic_write_json(
        progress_path,
        {
            "status": "initializing",
            "progress_pct": 0.0,
            "frame_index": 0,
            "total_frames": 0,
            "fps": 0.0,
            "counts_by_class": {name: 0 for name in VEHICLE_TYPES},
            "unique_vehicles": 0,
            "mode": config.mode,
            "simulation_label": simulation_label,
            "error": "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    try:
        if cv2 is None or np is None:
            raise RuntimeError("OpenCV and NumPy are required for video processing")
        if not config.video.is_file():
            raise FileNotFoundError(f"uploaded video does not exist: {config.video}")

        model = (model_factory or _load_vehicle_model)(VEHICLE_MODEL_PATH)
        names = getattr(model, "names", {})
        class_ids = _vehicle_class_ids(names)
        if not class_ids:
            raise RuntimeError("YOLO model has no supported vehicle classes")

        capture = (capture_factory or cv2.VideoCapture)(str(config.video))
        if not capture or not capture.isOpened():
            raise RuntimeError(f"OpenCV could not open video: {config.video}")
        total_frames = max(0, int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0))
        source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if not math.isfinite(source_fps) or source_fps <= 0:
            source_fps = 25.0
            warnings.append("Video FPS metadata missing; 25 FPS fallback used")

        csv_handle, csv_writer = _open_csv(csv_path)
        fallback_tracker = CentroidFallbackTracker()
        crossing_detector: StopLineCrossingDetector | None = None
        plate_reader = PlateReader(config.imgsz, config.job_dir)
        last_preview = 0.0
        last_progress = 0.0
        result_names = names

        write_progress("processing")
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            frame_index += 1
            if config.max_frames > 0 and frame_index > config.max_frames:
                frame_index = config.max_frames
                break
            if (frame_index - 1) % config.stride != 0:
                continue

            processed_frames += 1
            if crossing_detector is None and config.mode == "redlight":
                line_y = int(round(frame.shape[0] * config.stop_line_ratio))
                crossing_detector = StopLineCrossingDetector(
                    line_y=line_y,
                    direction=config.direction,
                    confirm_frames=2,
                )

            inference_kwargs = {
                "conf": config.conf,
                "imgsz": config.imgsz,
                "device": "cpu",
                "classes": class_ids,
                "verbose": False,
            }
            if inference_method == "track":
                try:
                    results = model.track(
                        frame,
                        persist=True,
                        tracker="bytetrack.yaml",
                        **inference_kwargs,
                    )
                except Exception as exc:
                    inference_method = "predict+centroid"
                    warnings.append(
                        f"ByteTrack unavailable; centroid fallback active: {type(exc).__name__}: {exc}"
                    )
                    results = model.predict(frame, **inference_kwargs)
            else:
                results = model.predict(frame, **inference_kwargs)

            first_result = results[0] if results else None
            if first_result is not None and getattr(first_result, "names", None):
                result_names = first_result.names
            detections = extract_vehicle_detections(first_result, result_names) if first_result is not None else []
            fallback_tracker.assign(detections, processed_frames)

            annotated = frame.copy()
            violated_ids: set[int] = set()
            for detection in detections:
                if detection.track_id is not None:
                    unique_by_class[detection.label].add(int(detection.track_id))
                _draw_detection(annotated, detection)
                if (
                    config.mode == "redlight"
                    and config.force_red_simulation
                    and crossing_detector is not None
                    and detection.track_id is not None
                    and crossing_detector.update(detection.track_id, detection.box)
                ):
                    violated_ids.add(int(detection.track_id))

            _draw_header(
                annotated,
                config,
                frame_index,
                total_frames,
                sum(len(value) for value in unique_by_class.values()),
                crossing_detector.line_y if crossing_detector else None,
                simulation_label,
            )

            for detection in detections:
                if detection.track_id not in violated_ids:
                    continue
                # Publish the red box immediately; OCR may take a few seconds on
                # a CPU-only Jetson/laptop, but the dashboard should still show
                # the exact crossing moment without appearing frozen.
                _draw_detection(annotated, detection, violated=True)
                atomic_write_preview(preview_path, annotated)
                last_preview = time.perf_counter()
                event = _save_event(
                    config,
                    frame,
                    annotated,
                    detection,
                    frame_index,
                    source_fps,
                    plate_reader,
                )
                events.append(event)
                csv_writer.writerow(event)
                csv_handle.flush()
                os.fsync(csv_handle.fileno())

            if video_writer is None and not video_codec:
                video_writer, video_codec = _open_video_writer(
                    output_video_path,
                    source_fps,
                    config.stride,
                    (annotated.shape[1], annotated.shape[0]),
                )
                if video_writer is None:
                    # Sentinel prevents retrying codecs on every frame.
                    video_codec = "unavailable"
                    warnings.append("OpenCV has no usable MP4 encoder; output.mp4 was not created")
            if video_writer is not None:
                video_writer.write(annotated)

            now = time.perf_counter()
            if now - last_preview >= config.preview_interval_s or frame_index == 1:
                atomic_write_preview(preview_path, annotated)
                last_preview = now
            if now - last_progress >= 0.25:
                write_progress("processing")
                last_progress = now

        if processed_frames == 0:
            raise RuntimeError("video contains no decodable frame")

        # Finalise the MP4 before result.json announces that it is ready.  This
        # matters on Windows, where the MP4 index is commonly written on release.
        if video_writer is not None:
            video_writer.release()
            video_writer = None

        progress = write_progress("completed")
        result = {
            **progress,
            "source_video": config.video.name,
            "source_fps": round(source_fps, 3),
            "processed_frames": processed_frames,
            "stride": config.stride,
            "stop_line_ratio": config.stop_line_ratio if config.mode == "redlight" else None,
            "direction": config.direction if config.mode == "redlight" else None,
            "force_red_simulation": bool(config.force_red_simulation),
            "event_count": len(events),
            "events": events,
            "evidence_csv": _relative_to_job(csv_path, config.job_dir),
            "preview": _relative_to_job(preview_path, config.job_dir),
            "output_video": (
                _relative_to_job(output_video_path, config.job_dir)
                if video_writer is not None or output_video_path.is_file()
                else ""
            ),
            "video_codec": video_codec,
            "warnings": warnings,
        }
        atomic_write_json(result_path, result)
        return result
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        try:
            progress = write_progress("error", error)
        except Exception:
            progress = {
                "status": "error",
                "mode": config.mode,
                "simulation_label": simulation_label,
                "error": error,
            }
        result = {
            **progress,
            "source_video": config.video.name,
            "event_count": len(events),
            "events": events,
            "evidence_csv": _relative_to_job(csv_path, config.job_dir),
            "traceback": traceback.format_exc(limit=8),
        }
        try:
            atomic_write_json(result_path, result)
        except Exception:
            pass
        return result
    finally:
        if csv_handle is not None:
            try:
                csv_handle.close()
            except OSError:
                pass
        if capture is not None:
            try:
                capture.release()
            except Exception:
                pass
        if video_writer is not None:
            try:
                video_writer.release()
            except Exception:
                pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Process one dashboard-uploaded video with isolated YOLO AI output."
    )
    parser.add_argument("--video", required=True, help="Uploaded local video path")
    parser.add_argument("--job-dir", required=True, help="Isolated output directory")
    parser.add_argument("--mode", choices=("vehicle", "redlight"), default="vehicle")
    parser.add_argument("--stop-line-ratio", type=float, default=0.65)
    parser.add_argument(
        "--force-red-simulation",
        action="store_true",
        help="Explicitly enable simulated red-light events (never legal enforcement)",
    )
    parser.add_argument("--direction", choices=("up", "down", "auto"), default="auto")
    parser.add_argument("--stride", type=int, default=1)
    parser.add_argument("--imgsz", type=int, default=480)
    parser.add_argument("--conf", type=float, default=0.35)
    parser.add_argument("--max-frames", type=int, default=0, help="0 processes the full video")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    config = VideoJobConfig(
        video=Path(args.video),
        job_dir=Path(args.job_dir),
        mode=args.mode,
        stop_line_ratio=args.stop_line_ratio,
        force_red_simulation=args.force_red_simulation,
        direction=args.direction,
        stride=args.stride,
        imgsz=args.imgsz,
        conf=args.conf,
        max_frames=args.max_frames,
    )
    try:
        config.validate()
    except ValueError as exc:
        parser.error(str(exc))
    result = run_job(config)
    print(json.dumps({
        "status": result.get("status"),
        "job_dir": str(config.job_dir.resolve()),
        "result": str((config.job_dir / "result.json").resolve()),
        "error": result.get("error", ""),
    }, ensure_ascii=False))
    return 0 if result.get("status") == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
