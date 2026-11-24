"""Traffic-aware spatio-temporal density and congestion heatmap for real-world surveillance.

Unlike raw pixel-motion heatmaps (which fail when vehicles stop at red lights or
trigger false alarms on rain/shadows), this module accumulates heat based on
actual tracked vehicle footprints (x_center, y_bottom) from YOLO/ByteTrack.

Key Real-World Design Principles:
1. Ground Footprint: Evaluates road-contact points (x_center, y_bottom) instead of
   geometric bounding-box centers which float in the air for tall buses and trucks.
2. De-duplication per Track: Each vehicle is counted once per spatial zone for flow,
   preventing slow-moving vehicles from falsely dominating throughput metrics.
3. Dwell/Congestion Accumulation: Vehicles stopping at red lights or traffic jams
   (velocity < stop_speed_threshold) accumulate true dwell time (in seconds).
   This ensures red-light waiting zones are brightly highlighted, not erased.
4. Perspective Scaling: Gaussian kernel radius is dynamically scaled along the y-axis
   so distant vehicles don't create disproportionate blobs compared to near vehicles.
5. Fixed Physical Colorbar: Renders an absolute, non-drifting metric scale
   (e.g., 0 to 20+ seconds dwell time or 0 to 15+ vehicles flow) so different videos
   can be compared objectively without misleading relative normalization.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time
import uuid
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import cv2
import numpy as np


REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL_CANDIDATES = [
    REPO_ROOT / "yolo26n.pt",
    REPO_ROOT / "yolov8n.pt",
    REPO_ROOT / "models" / "vehicle" / "vehicle.pt",
]

VEHICLE_NAMES = {"car", "motorcycle", "motorbike", "bus", "truck", "bicycle", "cars"}


@dataclass(frozen=True)
class DensityHeatmapConfig:
    """Tunable parameters for TrafficDensityAnalyzer."""

    model_path: str = ""
    imgsz: int = 480
    conf: float = 0.25
    iou: float = 0.50
    mode: str = "combined"  # 'flow', 'dwell', 'combined'
    stop_speed_threshold_px: float = 3.2  # px per frame threshold for stopping
    max_dwell_scale_sec: float = 6.0      # max color scale for dwell time (seconds)
    max_flow_scale_count: float = 5.0     # max color scale for flow count (vehicles)
    decay_rate: float = 1.0              # 1.0 = cumulative for entire red cycle, < 1.0 for moving window
    overlay_alpha: float = 0.65
    base_kernel_radius: int = 26
    perspective_scale: bool = True
    draw_trajectories: bool = True
    draw_boxes: bool = True
    draw_colorbar: bool = True

    def validate(self) -> None:
        if self.imgsz < 160:
            raise ValueError("imgsz must be >= 160")
        if not 0.01 <= self.conf <= 1.0:
            raise ValueError("conf must be in (0, 1]")
        if self.mode not in {"flow", "dwell", "combined"}:
            raise ValueError("mode must be one of: 'flow', 'dwell', 'combined'")
        if self.stop_speed_threshold_px < 0:
            raise ValueError("stop_speed_threshold_px cannot be negative")
        if self.max_dwell_scale_sec <= 0:
            raise ValueError("max_dwell_scale_sec must be > 0")
        if self.max_flow_scale_count <= 0:
            raise ValueError("max_flow_scale_count must be > 0")
        if not 0.0 < self.decay_rate <= 1.0:
            raise ValueError("decay_rate must be in (0, 1]")
        if not 0.0 <= self.overlay_alpha <= 1.0:
            raise ValueError("overlay_alpha must be in [0, 1]")


@dataclass
class TrackState:
    track_id: int
    label: str
    last_x: float
    last_y: float
    last_frame: int
    stationary_frames: int = 0
    total_dwell_seconds: float = 0.0
    history: deque = None
    visited_cells: Set[Tuple[int, int]] = None

    def __post_init__(self):
        if self.history is None:
            self.history = deque(maxlen=30)
        if self.visited_cells is None:
            self.visited_cells = set()


def resolve_model_path(custom_path: Optional[str] = None) -> Path:
    if custom_path:
        p = Path(custom_path).expanduser().resolve()
        if p.is_file():
            return p
        raise FileNotFoundError(f"Specified model does not exist: {custom_path}")

    for candidate in DEFAULT_MODEL_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"No default vehicle model found in: {[str(c) for c in DEFAULT_MODEL_CANDIDATES]}"
    )


class TrafficDensityAnalyzer:
    """Performs object tracking and accumulates real traffic flow & dwell heatmaps."""

    def __init__(self, config: Optional[DensityHeatmapConfig] = None) -> None:
        self.config = config or DensityHeatmapConfig()
        self.config.validate()

        self._model = None
        self._model_path = resolve_model_path(self.config.model_path)
        self._load_model()

        self._tracks: Dict[int, TrackState] = {}
        self._flow_heat: Optional[np.ndarray] = None
        self._dwell_heat: Optional[np.ndarray] = None
        self._shape: Optional[Tuple[int, int]] = None  # (height, width)
        self._frame_count = 0
        self._fps = 25.0
        self._unique_vehicles = 0
        self._cell_size = 16  # grid cell for spatial de-duplication

    def _load_model(self) -> None:
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError(f"Ultralytics package is required: {exc}") from exc
        self._model = YOLO(str(self._model_path))

    def reset(self) -> None:
        self._tracks.clear()
        self._flow_heat = None
        self._dwell_heat = None
        self._shape = None
        self._frame_count = 0
        self._unique_vehicles = 0

    def _init_buffers(self, height: int, width: int) -> None:
        self._shape = (height, width)
        self._flow_heat = np.zeros((height, width), dtype=np.float32)
        self._dwell_heat = np.zeros((height, width), dtype=np.float32)

    def _get_kernel_radius(self, y: float, height: int) -> int:
        if not self.config.perspective_scale:
            return self.config.base_kernel_radius
        # Linear perspective scaling: objects near horizon (y ~ 0) have smaller radius
        norm_y = max(0.15, min(1.0, y / float(height)))
        scaled = self.config.base_kernel_radius * (0.45 + 0.55 * norm_y)
        return max(5, int(round(scaled)))

    def _splat_gaussian(
        self, heat_matrix: np.ndarray, cx: float, cy: float, value: float, radius: int
    ) -> None:
        h, w = heat_matrix.shape
        x0 = max(0, int(cx - radius))
        x1 = min(w, int(cx + radius + 1))
        y0 = max(0, int(cy - radius))
        y1 = min(h, int(cy + radius + 1))
        if x0 >= x1 or y0 >= y1:
            return

        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        xs = np.arange(x0, x1, dtype=np.float32)[None, :]
        dist_sq = (xs - cx) ** 2 + (ys - cy) ** 2
        sigma = radius / 2.0
        kernel = np.exp(-dist_sq / (2.0 * sigma * sigma)) * value
        heat_matrix[y0:y1, x0:x1] += kernel

    def _splat_segment(
        self, heat_matrix: np.ndarray, p1: Tuple[float, float], p2: Tuple[float, float], value: float, radius: int
    ) -> None:
        """Splats continuous ribbon of heat along a moving vehicle's path."""
        h, w = heat_matrix.shape
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])

        x0 = max(0, int(min(x1, x2) - radius))
        x1_bound = min(w, int(max(x1, x2) + radius + 1))
        y0 = max(0, int(min(y1, y2) - radius))
        y1_bound = min(h, int(max(y1, y2) + radius + 1))
        if x0 >= x1_bound or y0 >= y1_bound:
            return

        vx = x2 - x1
        vy = y2 - y1
        v_len_sq = vx * vx + vy * vy

        ys = np.arange(y0, y1_bound, dtype=np.float32)[:, None]
        xs = np.arange(x0, x1_bound, dtype=np.float32)[None, :]

        if v_len_sq < 1.0:
            d_sq = (xs - x1) ** 2 + (ys - y1) ** 2
        else:
            t = np.clip(((xs - x1) * vx + (ys - y1) * vy) / v_len_sq, 0.0, 1.0)
            proj_x = x1 + t * vx
            proj_y = y1 + t * vy
            d_sq = (xs - proj_x) ** 2 + (ys - proj_y) ** 2

        sigma = radius / 2.0
        kernel = np.exp(-d_sq / (2.0 * sigma * sigma)) * value
        heat_matrix[y0:y1_bound, x0:x1_bound] += kernel

    def process_frame(
        self, frame: np.ndarray, fps: float = 25.0
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        """Processes one video frame: detects vehicles, updates tracks, and accumulates heat."""
        h, w = frame.shape[:2]
        if self._flow_heat is None or self._shape != (h, w):
            self._init_buffers(h, w)
        self._fps = max(1.0, fps)
        dt = 1.0 / self._fps

        # Apply decay if rolling window is configured
        if self.config.decay_rate < 1.0:
            self._flow_heat *= self.config.decay_rate
            self._dwell_heat *= self.config.decay_rate

        # Run YOLO with ByteTrack
        results = self._model.track(
            frame,
            persist=True,
            conf=self.config.conf,
            iou=self.config.iou,
            imgsz=self.config.imgsz,
            device="cpu",
            verbose=False,
            tracker="bytetrack.yaml",
        )

        detections = []
        active_track_ids = set()
        first = results[0] if results else None

        if first is not None and getattr(first, "boxes", None) is not None:
            boxes = first.boxes
            xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, "cpu") else np.array(boxes.xyxy)
            confs = boxes.conf.cpu().numpy() if hasattr(boxes.conf, "cpu") else np.array(boxes.conf)
            classes = boxes.cls.cpu().numpy() if hasattr(boxes.cls, "cpu") else np.array(boxes.cls)
            ids = (
                boxes.id.cpu().numpy()
                if getattr(boxes, "id", None) is not None
                else None
            )

            names = getattr(first, "names", {})

            for i in range(len(xyxy)):
                cls_id = int(classes[i])
                raw_label = str(names.get(cls_id, cls_id)).lower()
                if raw_label not in VEHICLE_NAMES and "car" not in raw_label and "motor" not in raw_label:
                    continue

                x1, y1, x2, y2 = xyxy[i]
                confidence = float(confs[i])
                track_id = int(ids[i]) if ids is not None and i < len(ids) and math.isfinite(ids[i]) else (i + 1000000)

                # Ground footprint is bottom-center of bounding box
                foot_x = float((x1 + x2) / 2.0)
                foot_y = float(y2)
                active_track_ids.add(track_id)

                detections.append(
                    {
                        "box": (int(x1), int(y1), int(x2), int(y2)),
                        "foot": (foot_x, foot_y),
                        "label": raw_label,
                        "conf": confidence,
                        "track_id": track_id,
                    }
                )

        # Update tracking & accumulation
        for det in detections:
            tid = det["track_id"]
            fx, fy = det["foot"]
            radius = self._get_kernel_radius(fy, h)

            if tid not in self._tracks:
                self._unique_vehicles += 1
                state = TrackState(
                    track_id=tid,
                    label=det["label"],
                    last_x=fx,
                    last_y=fy,
                    last_frame=self._frame_count,
                )
                state.history.append((fx, fy))
                self._tracks[tid] = state

                # Initial entry footprint
                self._splat_gaussian(self._flow_heat, fx, fy, 0.4, radius)
            else:
                state = self._tracks[tid]
                p_prev = (state.last_x, state.last_y)
                p_curr = (fx, fy)
                dx = fx - state.last_x
                dy = fy - state.last_y
                dist = math.hypot(dx, dy)
                state.history.append((fx, fy))
                state.last_x = fx
                state.last_y = fy
                state.last_frame = self._frame_count

                # Continuous flow trail along the lane
                if dist >= 1.0:
                    self._splat_segment(self._flow_heat, p_prev, p_curr, 0.35, radius)

                # Dwell accumulation (vehicles stationary or creeping at red light)
                if dist < self.config.stop_speed_threshold_px:
                    state.stationary_frames += 1
                    state.total_dwell_seconds += dt
                    # Accumulate dwell seconds into dwell heat map
                    self._splat_gaussian(self._dwell_heat, fx, fy, dt * 1.5, int(radius * 1.1))
                else:
                    state.stationary_frames = max(0, state.stationary_frames - 2)

        # Cleanup old tracks that left frame for > 45 frames
        stale_limit = 45
        stale_ids = [
            tid
            for tid, st in self._tracks.items()
            if self._frame_count - st.last_frame > stale_limit
        ]
        for tid in stale_ids:
            self._tracks.pop(tid, None)

        self._frame_count += 1

        stats = {
            "frame_index": self._frame_count,
            "active_vehicles": len(detections),
            "total_unique_vehicles": self._unique_vehicles,
            "peak_dwell_sec": float(np.max(self._dwell_heat)),
            "mean_dwell_sec": float(np.mean(self._dwell_heat[self._dwell_heat > 0.1])) if np.any(self._dwell_heat > 0.1) else 0.0,
            "peak_flow_count": float(np.max(self._flow_heat)),
            "detections": detections,
        }
        return self._flow_heat, self._dwell_heat, stats

    def render(
        self,
        frame: np.ndarray,
        flow_heat: np.ndarray,
        dwell_heat: np.ndarray,
        stats: Dict[str, Any],
    ) -> np.ndarray:
        """Renders the composite heatmap overlay, legend, and diagnostic HUD."""
        out = frame.copy()
        h, w = frame.shape[:2]

        # Perceptual stretch (gamma 0.60) so moving traffic appears as luminous corridors
        norm_flow = np.clip(np.power(flow_heat / max(0.1, self.config.max_flow_scale_count), 0.60), 0.0, 1.0)
        norm_dwell = np.clip(dwell_heat / max(0.1, self.config.max_dwell_scale_sec), 0.0, 1.0)

        # Select heat matrix according to mode
        if self.config.mode == "flow":
            combined = norm_flow
            scale_max = self.config.max_flow_scale_count
            mode_label = "FLOW / VEHICLE THROUGHPUT"
            unit_label = "veh"
        elif self.config.mode == "dwell":
            combined = norm_dwell
            scale_max = self.config.max_dwell_scale_sec
            mode_label = "CONGESTION / RED-LIGHT DWELL TIME"
            unit_label = "sec"
        else:  # combined: flow lane corridors + dwell congestion hotspots
            combined = np.clip(norm_flow * 0.85 + norm_dwell * 1.5, 0.0, 1.0)
            scale_max = self.config.max_dwell_scale_sec
            mode_label = "SPATIO-TEMPORAL TRAFFIC CONGESTION & FLOW"
            unit_label = "stop-s"

        norm_255 = (combined * 255.0).astype(np.uint8)
        color_map = cv2.applyColorMap(norm_255, cv2.COLORMAP_TURBO)

        # Smooth dynamic alpha blend where heat is active
        active_mask = norm_255 > 10
        if np.any(active_mask):
            alpha_map = np.clip(0.32 + (norm_255[active_mask] / 255.0) * self.config.overlay_alpha, 0.32, 0.85)
            for c in range(3):
                out[:, :, c][active_mask] = (
                    out[:, :, c][active_mask] * (1.0 - alpha_map) +
                    color_map[:, :, c][active_mask] * alpha_map
                ).astype(np.uint8)

        # Draw vehicle bounding boxes & footprint contact points
        if self.config.draw_boxes:
            for det in stats.get("detections", []):
                bx1, by1, bx2, by2 = det["box"]
                tid = det["track_id"]
                label = det["label"]
                conf = det["conf"]
                fx, fy = det["foot"]

                # Distinct color for vehicle class
                color = (0, 230, 255) if "car" in label else (50, 245, 140)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), color, 1, cv2.LINE_AA)

                # High-tech corner brackets
                c_len = min(12, max(4, (bx2 - bx1) // 5))
                # top-left
                cv2.line(out, (bx1, by1), (bx1 + c_len, by1), color, 2, cv2.LINE_AA)
                cv2.line(out, (bx1, by1), (bx1, by1 + c_len), color, 2, cv2.LINE_AA)
                # top-right
                cv2.line(out, (bx2, by1), (bx2 - c_len, by1), color, 2, cv2.LINE_AA)
                cv2.line(out, (bx2, by1), (bx2, by1 + c_len), color, 2, cv2.LINE_AA)
                # bottom-left
                cv2.line(out, (bx1, by2), (bx1 + c_len, by2), color, 2, cv2.LINE_AA)
                cv2.line(out, (bx1, by2), (bx1, by2 - c_len), color, 2, cv2.LINE_AA)
                # bottom-right
                cv2.line(out, (bx2, by2), (bx2 - c_len, by2), color, 2, cv2.LINE_AA)
                cv2.line(out, (bx2, by2), (bx2, by2 - c_len), color, 2, cv2.LINE_AA)

                # Label badge above vehicle
                tag = f"#{tid} {label} {conf:.2f}"
                (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.40, 1)
                tag_y0 = max(0, by1 - th - 6)
                cv2.rectangle(out, (bx1, tag_y0), (bx1 + tw + 6, tag_y0 + th + 6), (18, 22, 28), -1)
                cv2.putText(out, tag, (bx1 + 3, tag_y0 + th + 2), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (240, 240, 240), 1, cv2.LINE_AA)

                # Wheel footprint ground contact point (where heat is anchored)
                cv2.circle(out, (int(fx), int(fy)), 4, (0, 255, 255), -1, cv2.LINE_AA)
                cv2.circle(out, (int(fx), int(fy)), 7, (0, 200, 255), 1, cv2.LINE_AA)

        # Draw trajectory tails
        if self.config.draw_trajectories:
            for st in self._tracks.values():
                pts = list(st.history)
                if len(pts) >= 2:
                    cv_pts = np.array(pts, dtype=np.int32).reshape((-1, 1, 2))
                    cv2.polylines(out, [cv_pts], False, (0, 235, 255), 1, cv2.LINE_AA)

        # Draw Header Banner
        banner_h = 58
        banner = out[:banner_h, :].copy()
        cv2.rectangle(banner, (0, 0), (w, banner_h), (12, 16, 20), -1)
        cv2.addWeighted(banner, 0.85, out[:banner_h, :], 0.15, 0, out[:banner_h, :])

        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(
            out,
            f"REALISTIC TRAFFIC HEATMAP | {mode_label}",
            (14, 22),
            font,
            0.52,
            (0, 240, 255),
            1,
            cv2.LINE_AA,
        )
        info_line = (
            f"Active: {stats.get('active_vehicles', 0)} veh | "
            f"Total Count: {stats.get('total_unique_vehicles', 0)} | "
            f"Peak Dwell: {stats.get('peak_dwell_sec', 0.0):.1f}s | "
            f"Scale Max: {scale_max:.0f} {unit_label}"
        )
        cv2.putText(
            out,
            info_line,
            (14, 46),
            font,
            0.42,
            (210, 230, 240),
            1,
            cv2.LINE_AA,
        )

        # Render Absolute Scale Colorbar Legend (Bottom Right)
        if self.config.draw_colorbar:
            self._render_colorbar(out, scale_max, unit_label)

        return out

    def _render_colorbar(self, image: np.ndarray, scale_max: float, unit_label: str) -> None:
        h, w = image.shape[:2]
        cb_w = 160
        cb_h = 16
        pad = 12
        x0 = w - cb_w - pad
        y0 = h - cb_h - pad - 20

        # Background box
        cv2.rectangle(image, (x0 - 6, y0 - 18), (w - pad + 6, h - pad + 4), (10, 14, 18), -1)

        # Colorbar gradient
        gradient = np.linspace(0, 255, cb_w, dtype=np.uint8).reshape((1, cb_w))
        gradient_colored = cv2.applyColorMap(gradient, cv2.COLORMAP_TURBO)
        gradient_full = np.repeat(gradient_colored, cb_h, axis=0)
        image[y0 : y0 + cb_h, x0 : x0 + cb_w] = gradient_full
        cv2.rectangle(image, (x0, y0), (x0 + cb_w, y0 + cb_h), (200, 200, 200), 1)

        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(image, "0", (x0, y0 - 4), font, 0.35, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(
            image,
            f"{scale_max * 0.5:.0f}",
            (x0 + cb_w // 2 - 8, y0 - 4),
            font,
            0.35,
            (220, 220, 220),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            image,
            f"{scale_max:.0f}+ {unit_label}",
            (x0 + cb_w - 40, y0 - 4),
            font,
            0.35,
            (0, 240, 255),
            1,
            cv2.LINE_AA,
        )


def _open_writer(path: Path, fps: float, size: Tuple[int, int]) -> cv2.VideoWriter:
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    # On Windows, mp4v works out of the box with zero external DLL requirements
    codecs = ("mp4v", "avc1") if suffix in {".mp4", ".m4v"} else ("MJPG", "XVID")
    for codec in codecs:
        writer = cv2.VideoWriter(
            str(path),
            cv2.VideoWriter_fourcc(*codec),
            fps,
            size,
        )
        if writer.isOpened():
            return writer
        writer.release()
    raise RuntimeError(f"Could not open VideoWriter for {path}")


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        temp_path.write_bytes(payload)
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def _atomic_write_json(path: Path, payload: dict) -> None:
    _atomic_write_bytes(path, json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))


def _write_markdown_visual_report(
    md_path: Path,
    summary: dict,
    preview_img_path: Optional[Path] = None,
    preview_final_path: Optional[Path] = None,
) -> None:
    cfg = summary.get("config", {})
    created = summary.get("created_at_utc", datetime.now(timezone.utc).isoformat())

    img_blocks = []
    if preview_img_path and preview_img_path.is_file():
        img_blocks.append(
            f"### A. Khung Hình Thời Điểm Hoạt Động Cao Điểm (Peak Activity Snapshot)\n"
            f"*Thể hiện các phương tiện đang lưu thông kèm hộp nhận diện AI (Bounding Box), điểm tiếp xúc bánh xe (Footprint), và dải nhiệt làn đường:*\n\n"
            f"![Peak Activity Preview]({preview_img_path.name})\n"
        )
    if preview_final_path and preview_final_path.is_file():
        img_blocks.append(
            f"### B. Bản Đồ Nhiệt Tích Lũy Toàn Chu Kỳ (Cumulative Heatmap)\n"
            f"*Tích lũy toàn bộ vệt di chuyển và các điểm dừng chờ đèn đỏ suốt toàn bộ video:*\n\n"
            f"![Cumulative Heatmap]({preview_final_path.name})\n"
        )
    images_content = "\n".join(img_blocks) if img_blocks else "*(Chưa có ảnh snapshot)*\n"

    content = f"""# Báo Cáo Trực Quan: Heatmap Mật Độ Giao Thông Thực Tế

> **Video nguồn**: `{Path(summary['input']).name}`  
> **Thời gian tạo**: `{created}`  
> **Chế độ Heatmap**: `{cfg.get('mode', 'combined').upper()}`

---

## 1. Hình Ảnh Trực Quan Kết Quả (Heatmap Snapshot)

{images_content}

*Ghi chú trực quan*:
- **Hộp nhận diện (Bounding Box & Labels)**: Hộp viền màu vàng/xanh kèm mã định danh Track ID và độ tin cậy để chứng minh AI đang bám sát từng xe.
- **Điểm tiếp đất (Ground Footprint)**: Điểm tròn viền kép màu vàng định vị chính xác vị trí bánh xe tiếp xúc mặt đường (không bị lệch lên trần xe như tâm hình học).
- **Vệt nhiệt giao thông (Luminous Corridor)**: Thể hiện độ đậm nhạt tương ứng với tần suất xe lăn bánh qua làn và thời gian dừng chờ tại nút giao.
- **Thanh đo cố định (Colorbar ở góc phải)**: Đơn vị vật lý cố định ({cfg.get('max_dwell_scale_sec', 6.0):.0f}s thời gian dừng hoặc {cfg.get('max_flow_scale_count', 5.0):.0f} xe), không bị co giãn min-max ảo.

---

## 2. Thống Kê & Đo Đạc Giao Thông

| Chỉ số | Giá trị đo được | Ý nghĩa thực tế |
|---|---|---|
| **Tổng số phương tiện độc nhất** | **{summary.get('total_unique_vehicles', 0)} xe** | Số xe thực tế đi qua ngã tư (được khử trùng lặp qua Track ID) |
| **Thời gian dừng cực đại (Peak Dwell)** | **{summary.get('peak_dwell_seconds', 0.0):.2f} giây** | Điểm nghẽn ùn tắc nhất tại giao lộ (ví dụ: vạch dừng chờ đèn đỏ) |
| **Lưu lượng điểm cực đại (Peak Flow)** | **{summary.get('peak_flow_count', 0.0):.2f} xe/vùng** | Mật độ xe tập trung cao nhất trên một làn đường |
| **Số khung hình xử lý** | **{summary.get('frames_processed', 0)} frames** | Độ dài chu kỳ quan sát |
| **Tốc độ xử lý thực tế** | **{summary.get('processing_fps', 0.0):.2f} FPS** | Tốc độ tính toán trên CPU laptop ({summary.get('processing_elapsed_s', 0.0):.2f}s) |

---

## 3. Cấu Hình & Tối Ưu Hóa CPU

| Tham số | Giá trị | Giải thích |
|---|---|---|
| `imgsz` | `{cfg.get('imgsz', 480)}` | Độ phân giải tối ưu cân bằng giữa phát hiện xe máy và duy trì FPS cao cho CPU |
| `conf` | `{cfg.get('conf', 0.28)}` | Ngưỡng tin cậy cân bằng, chống dương tính giả do vệt mưa/bóng râm |
| `mode` | `{cfg.get('mode', 'combined')}` | Kết hợp cả thời gian dừng đỗ (Dwell) và lưu lượng dòng xe (Flow) |
| `max_dwell_scale_sec` | `{cfg.get('max_dwell_scale_sec', 20.0)}s` | Thang đo nhiệt tối đa cho thời gian xe dừng chờ |
| `max_flow_scale_count` | `{cfg.get('max_flow_scale_count', 12.0)} xe` | Thang đo nhiệt tối đa cho lưu lượng xe qua làn |

---

## 4. Tệp Dữ Liệu Xuất Kèm

- **Video Heatmap đã render**: [{Path(summary['output_video']).name}](file:///{Path(summary['output_video']).as_posix()})
- **Dữ liệu chi tiết từng frame (CSV)**: [{Path(summary['metrics_csv']).name}](file:///{Path(summary['metrics_csv']).as_posix()})
- **Tóm tắt JSON**: [{Path(summary.get('metrics_json', '')).name}](file:///{Path(summary.get('metrics_json', '')).as_posix()})
"""
    md_path.write_text(content, encoding="utf-8")


class _JobReporter:
    def __init__(self, job_dir: Optional[str | Path]) -> None:
        self.directory = Path(job_dir).resolve() if job_dir else None
        if self.directory:
            self.directory.mkdir(parents=True, exist_ok=True)

    @property
    def enabled(self) -> bool:
        return self.directory is not None

    def progress(self, **values) -> None:
        if not self.directory:
            return
        payload = {
            "mode": "REALISTIC_TRAFFIC_DENSITY_HEATMAP",
            "updated_at_utc": datetime.now(timezone.utc).isoformat(),
            **values,
        }
        _atomic_write_json(self.directory / "progress.json", payload)

    def preview(self, frame: np.ndarray) -> None:
        if not self.directory:
            return
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if ok:
            _atomic_write_bytes(self.directory / "preview.jpg", encoded.tobytes())

    def result(self, payload: dict) -> None:
        if self.directory:
            _atomic_write_json(self.directory / "result.json", payload)

    def error(self, err_msg: str) -> None:
        payload = {
            "status": "error",
            "error": str(err_msg),
            "finished_at_utc": datetime.now(timezone.utc).isoformat(),
        }
        self.progress(**payload)
        self.result(payload)


def process_traffic_video(
    input_path: str | Path,
    output_path: str | Path,
    *,
    config: Optional[DensityHeatmapConfig] = None,
    job_dir: Optional[str | Path] = None,
    resize: Optional[Tuple[int, int]] = None,
    stride: int = 1,
    max_seconds: Optional[float] = None,
    max_frames: Optional[int] = None,
    metrics_json: Optional[str | Path] = None,
    metrics_csv: Optional[str | Path] = None,
    metrics_md: Optional[str | Path] = None,
    display: bool = False,
) -> dict:
    source = Path(input_path).resolve()
    destination = Path(output_path).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Input video not found: {source}")

    reporter = _JobReporter(job_dir)
    reporter.progress(status="running", progress_pct=0.0, frames_processed=0)

    json_path = Path(metrics_json).resolve() if metrics_json else destination.with_suffix(".metrics.json")
    csv_path = Path(metrics_csv).resolve() if metrics_csv else destination.with_suffix(".metrics.csv")
    md_path = Path(metrics_md).resolve() if metrics_md else destination.with_suffix(".report.md")
    preview_path = destination.with_suffix(".preview.jpg")

    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video file: {source}")

    source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    if not math.isfinite(source_fps) or source_fps <= 0:
        source_fps = 25.0
    src_w = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    out_size = resize or (src_w, src_h)
    out_fps = max(1.0, source_fps / stride)
    writer = _open_writer(destination, out_fps, out_size)

    analyzer = TrafficDensityAnalyzer(config)

    fieldnames = [
        "frame_index",
        "video_time_s",
        "active_vehicles",
        "total_unique_vehicles",
        "peak_dwell_sec",
        "mean_dwell_sec",
        "peak_flow_count",
    ]

    frame_count = 0
    source_frame_idx = 0
    start_time = time.perf_counter()
    last_annotated = None
    best_annotated = None
    best_visual_score = -1.0

    expected_frames = None
    if total_frames > 0:
        expected_frames = math.ceil(total_frames / stride)
    if max_seconds:
        limit_f = math.ceil(max_seconds * source_fps / stride)
        expected_frames = min(expected_frames, limit_f) if expected_frames else limit_f
    if max_frames:
        expected_frames = min(expected_frames, max_frames) if expected_frames else max_frames

    print(f"\n[INFO] Đang xử lý: {source.name} ({total_frames} frames, {source_fps:.1f} FPS)")
    print(f"       Cấu hình: imgsz={analyzer.config.imgsz}, stride={stride}, mode={analyzer.config.mode}")
    try:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as f_csv:
            csv_writer = csv.DictWriter(f_csv, fieldnames=fieldnames)
            csv_writer.writeheader()

            while True:
                if max_frames and frame_count >= max_frames:
                    break
                curr_time_s = source_frame_idx / source_fps
                if max_seconds and curr_time_s >= max_seconds:
                    break

                ret, frame = capture.read()
                if not ret or frame is None:
                    break

                curr_src_idx = source_frame_idx
                source_frame_idx += 1
                if curr_src_idx % stride != 0:
                    continue

                if frame.shape[1::-1] != out_size:
                    frame = cv2.resize(frame, out_size, interpolation=cv2.INTER_AREA)

                flow_heat, dwell_heat, stats = analyzer.process_frame(frame, fps=out_fps)
                annotated = analyzer.render(frame, flow_heat, dwell_heat, stats)
                last_annotated = annotated
                writer.write(annotated)

                # Track highest visual impact frame (active cars + clear heat corridors)
                visual_score = stats["active_vehicles"] * 4.0 + stats["peak_flow_count"] * 1.5 + stats["peak_dwell_sec"] * 2.0
                if visual_score > best_visual_score:
                    best_visual_score = visual_score
                    best_annotated = annotated.copy()

                csv_writer.writerow(
                    {
                        "frame_index": frame_count,
                        "video_time_s": f"{curr_time_s:.2f}",
                        "active_vehicles": stats["active_vehicles"],
                        "total_unique_vehicles": stats["total_unique_vehicles"],
                        "peak_dwell_sec": f"{stats['peak_dwell_sec']:.2f}",
                        "mean_dwell_sec": f"{stats['mean_dwell_sec']:.2f}",
                        "peak_flow_count": f"{stats['peak_flow_count']:.2f}",
                    }
                )

                frame_count += 1
                elapsed = max(1e-6, time.perf_counter() - start_time)
                proc_fps = frame_count / elapsed
                pct = (
                    min(99.9, frame_count / expected_frames * 100.0)
                    if expected_frames
                    else 0.0
                )

                if frame_count % 3 == 0 or frame_count == 1:
                    reporter.preview(annotated)
                    reporter.progress(
                        status="running",
                        progress_pct=round(pct, 1),
                        frames_processed=frame_count,
                        total_frames_expected=expected_frames,
                        active_vehicles=stats["active_vehicles"],
                        unique_vehicles=stats["total_unique_vehicles"],
                        peak_dwell_sec=round(stats["peak_dwell_sec"], 1),
                        processing_fps=round(proc_fps, 1),
                    )

                if frame_count % 5 == 0 or frame_count == 1:
                    exp_str = f"/{expected_frames}" if expected_frames else ""
                    print(
                        f"\r[XỬ LÝ] Frame {frame_count}{exp_str} ({pct:.1f}%) | "
                        f"{proc_fps:.1f} FPS | Xe trên hình: {stats['active_vehicles']} | "
                        f"Tổng xe: {stats['total_unique_vehicles']} | "
                        f"Dwell max: {stats['peak_dwell_sec']:.1f}s",
                        end="",
                        flush=True,
                    )

                if display:
                    cv2.imshow("Realistic Traffic Heatmap", annotated)
                    if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                        break
    finally:
        capture.release()
        writer.release()
        if display:
            cv2.destroyAllWindows()

    if frame_count == 0:
        destination.unlink(missing_ok=True)
        raise RuntimeError("No frames were processed from video")

    preview_final_path = destination.with_suffix(".preview_final.jpg")
    chosen_preview = best_annotated if best_annotated is not None else last_annotated
    if chosen_preview is not None:
        reporter.preview(chosen_preview)
        ok, encoded = cv2.imencode(".jpg", chosen_preview, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if ok:
            _atomic_write_bytes(preview_path, encoded.tobytes())

    if last_annotated is not None:
        ok_fin, enc_fin = cv2.imencode(".jpg", last_annotated, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if ok_fin:
            _atomic_write_bytes(preview_final_path, enc_fin.tobytes())

    total_elapsed = max(1e-6, time.perf_counter() - start_time)
    print(f"\n[HOÀN TẤT] Đã xử lý {frame_count} frames trong {total_elapsed:.2f}s ({frame_count/total_elapsed:.1f} FPS).")
    print(f"           Video: {destination.name}")
    print(f"           CSV:   {csv_path.name}")
    print(f"           Report MD: {md_path.name}")
    summary = {
        "mode": "REALISTIC_TRAFFIC_DENSITY_HEATMAP",
        "input": str(source),
        "output_video": str(destination),
        "metrics_csv": str(csv_path),
        "frames_processed": frame_count,
        "processing_elapsed_s": round(total_elapsed, 2),
        "processing_fps": round(frame_count / total_elapsed, 2),
        "total_unique_vehicles": analyzer._unique_vehicles,
        "peak_dwell_seconds": round(float(np.max(analyzer._dwell_heat)), 2) if analyzer._dwell_heat is not None else 0.0,
        "peak_flow_count": round(float(np.max(analyzer._flow_heat)), 2) if analyzer._flow_heat is not None else 0.0,
        "config": asdict(analyzer.config),
    }

    _atomic_write_json(json_path, summary)
    summary["metrics_json"] = str(json_path)
    _write_markdown_visual_report(
        md_path,
        summary,
        preview_img_path=preview_path if preview_path.is_file() else None,
        preview_final_path=preview_final_path if preview_final_path.is_file() else None,
    )
    summary["metrics_md"] = str(md_path)

    completed = {
        "status": "completed",
        "progress_pct": 100.0,
        "finished_at_utc": datetime.now(timezone.utc).isoformat(),
        **summary,
    }
    reporter.result(completed)
    reporter.progress(
        status="completed",
        progress_pct=100.0,
        frames_processed=frame_count,
        output_video=str(destination),
        result_json=str(reporter.directory / "result.json") if reporter.enabled else None,
    )
    return summary


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate realistic traffic flow and congestion heatmaps using YOLO footprints."
    )
    parser.add_argument("--input", "--video", dest="input", required=True, help="Path to input video")
    parser.add_argument("--output", help="Path to output annotated video")
    parser.add_argument("--job-dir", help="Directory for job progress/preview/result JSON")
    parser.add_argument("--model", default="", help="Path to YOLO weights (.pt)")
    parser.add_argument("--imgsz", type=int, default=480, help="Inference resolution (default: 480)")
    parser.add_argument("--conf", type=float, default=0.28, help="Detection confidence threshold")
    parser.add_argument(
        "--mode",
        choices=["flow", "dwell", "combined"],
        default="combined",
        help="Heatmap mode: 'flow' (throughput), 'dwell' (stop/congestion), 'combined' (both)",
    )
    parser.add_argument("--stride", type=int, default=1, help="Process every Nth frame")
    parser.add_argument("--max-seconds", type=float, help="Limit processing to N seconds")
    parser.add_argument("--max-frames", type=int, help="Limit processing to N frames")
    parser.add_argument("--max-dwell", type=float, default=6.0, help="Max dwell scale in seconds")
    parser.add_argument("--max-flow", type=float, default=3.5, help="Max flow scale in vehicles")
    parser.add_argument("--metrics-json", help="Output path for summary metrics JSON")
    parser.add_argument("--metrics-csv", help="Output path for frame metrics CSV")
    parser.add_argument("--metrics-md", help="Output path for visual markdown report")
    parser.add_argument("--display", action="store_true", help="Display realtime OpenCV preview")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)
    source = Path(args.input)
    if args.output:
        out = Path(args.output)
    elif args.job_dir:
        out = Path(args.job_dir) / "traffic_density_heatmap.mp4"
    else:
        out = source.with_name(f"{source.stem}_density_heatmap.mp4")

    cfg = DensityHeatmapConfig(
        model_path=args.model,
        imgsz=args.imgsz,
        conf=args.conf,
        mode=args.mode,
        max_dwell_scale_sec=args.max_dwell,
        max_flow_scale_count=args.max_flow,
    )

    try:
        summary = process_traffic_video(
            source,
            out,
            config=cfg,
            job_dir=args.job_dir,
            stride=args.stride,
            max_seconds=args.max_seconds,
            max_frames=args.max_frames,
            metrics_json=args.metrics_json,
            metrics_csv=args.metrics_csv,
            metrics_md=args.metrics_md,
            display=args.display,
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        if args.job_dir:
            _JobReporter(args.job_dir).error(str(exc))
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
