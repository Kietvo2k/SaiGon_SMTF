import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from uploaded_video_processor import (
    SIMULATION_LABEL,
    StopLineCrossingDetector,
    VideoJobConfig,
    atomic_write_json,
    run_job,
)


class FakeBoxes:
    def __init__(self, y2, track_id=7):
        self.xyxy = np.asarray([[10.0, 10.0, 48.0, float(y2)]], dtype=np.float32)
        self.conf = np.asarray([0.91], dtype=np.float32)
        self.cls = np.asarray([2.0], dtype=np.float32)
        self.id = np.asarray([float(track_id)], dtype=np.float32)


class FakeResult:
    names = {1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

    def __init__(self, y2):
        self.boxes = FakeBoxes(y2)


class FakeModel:
    names = FakeResult.names

    def __init__(self, positions):
        self.positions = list(positions)
        self.index = 0

    def track(self, frame, **kwargs):
        del frame, kwargs
        value = self.positions[min(self.index, len(self.positions) - 1)]
        self.index += 1
        return [FakeResult(value)]

    def predict(self, frame, **kwargs):
        return self.track(frame, **kwargs)


class FakeCapture:
    def __init__(self, frames, fps=10.0):
        self.frames = [frame.copy() for frame in frames]
        self.fps = fps
        self.index = 0

    def isOpened(self):
        return True

    def read(self):
        if self.index >= len(self.frames):
            return False, None
        frame = self.frames[self.index]
        self.index += 1
        return True, frame.copy()

    def get(self, prop):
        if prop == cv2.CAP_PROP_FRAME_COUNT:
            return len(self.frames)
        if prop == cv2.CAP_PROP_FPS:
            return self.fps
        return 0

    def release(self):
        pass


class FakeWriter:
    def __init__(self, path):
        self.path = Path(path)
        self.frames = 0

    def write(self, frame):
        del frame
        self.frames += 1

    def release(self):
        self.path.write_bytes(b"fake-mp4")


def fake_writer_factory(path, source_fps, stride, frame_size):
    del source_fps, stride, frame_size
    return FakeWriter(path), "avc1-test"


class StopLineCrossingTests(unittest.TestCase):
    def test_auto_detects_upward_crossing_once(self):
        detector = StopLineCrossingDetector(50, direction="auto", confirm_frames=2)
        boxes = [
            (0, 20, 20, 80),
            (0, 15, 20, 62),
            (0, 8, 20, 46),
            (0, 4, 20, 40),
            (0, 2, 20, 35),
        ]
        events = [detector.update(11, box) for box in boxes]
        self.assertEqual(events, [False, False, False, True, False])

    def test_direction_rejects_opposite_crossing(self):
        detector = StopLineCrossingDetector(50, direction="down", confirm_frames=1)
        self.assertFalse(detector.update(2, (0, 20, 20, 80)))
        self.assertFalse(detector.update(2, (0, 5, 20, 40)))


class UploadedVideoProcessorTests(unittest.TestCase):
    def _files(self, directory):
        source = Path(directory) / "upload.mp4"
        source.write_bytes(b"test-placeholder")
        job_dir = Path(directory) / "job"
        return source, job_dir

    def test_atomic_json_replaces_complete_document(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            atomic_write_json(path, {"status": "first", "value": 1})
            atomic_write_json(path, {"status": "second", "value": 2})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["value"], 2)
            self.assertEqual(list(Path(directory).glob("*.tmp")), [])

    @patch("uploaded_video_processor._open_video_writer", side_effect=fake_writer_factory)
    def test_vehicle_mode_writes_preview_progress_result_and_video(self, _writer):
        with tempfile.TemporaryDirectory() as directory:
            source, job_dir = self._files(directory)
            frames = [np.zeros((100, 160, 3), dtype=np.uint8) for _ in range(3)]
            capture = FakeCapture(frames)
            result = run_job(
                VideoJobConfig(source, job_dir, mode="vehicle", imgsz=320),
                model_factory=lambda _path: FakeModel([80, 75, 70]),
                capture_factory=lambda _path: capture,
            )

            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["counts_by_class"]["car"], 1)
            self.assertEqual(result["unique_vehicles"], 1)
            self.assertEqual(result["event_count"], 0)
            self.assertEqual(result["video_codec"], "avc1-test")
            self.assertTrue((job_dir / "preview.jpg").is_file())
            self.assertTrue((job_dir / "output.mp4").is_file())
            self.assertTrue((job_dir / "violations.csv").is_file())
            progress = json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(progress["status"], "completed")
            self.assertEqual(progress["progress_pct"], 100.0)

    @patch("uploaded_video_processor._open_video_writer", side_effect=fake_writer_factory)
    @patch(
        "uploaded_video_processor.PlateReader.recognize",
        return_value={
            "plate_text": "NO_PLATE_DETECTED",
            "plate_confidence": 0.0,
            "plate_status": "NO_PLATE_DETECTED",
            "plate_crop_path": "",
            "ocr_error": "fake-test-no-plate",
        },
    )
    def test_redlight_simulation_saves_isolated_event_and_csv(self, _ocr, _writer):
        with tempfile.TemporaryDirectory() as directory:
            source, job_dir = self._files(directory)
            frames = [np.full((100, 160, 3), 90, dtype=np.uint8) for _ in range(4)]
            result = run_job(
                VideoJobConfig(
                    source,
                    job_dir,
                    mode="redlight",
                    stop_line_ratio=0.5,
                    force_red_simulation=True,
                    direction="auto",
                    imgsz=320,
                ),
                model_factory=lambda _path: FakeModel([80, 62, 46, 40]),
                capture_factory=lambda _path: FakeCapture(frames),
            )

            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["simulation_label"], SIMULATION_LABEL)
            self.assertEqual(result["event_count"], 1)
            event = result["events"][0]
            self.assertEqual(event["plate_text"], "NO_PLATE_DETECTED")
            self.assertTrue((job_dir / event["scene_path"]).is_file())
            self.assertTrue((job_dir / event["vehicle_crop_path"]).is_file())
            csv_text = (job_dir / "violations.csv").read_text(encoding="utf-8-sig")
            self.assertIn(event["event_id"], csv_text)
            self.assertFalse((Path(directory) / "violations.xlsx").exists())

    @patch("uploaded_video_processor._open_video_writer", side_effect=fake_writer_factory)
    def test_redlight_events_require_explicit_simulation_flag(self, _writer):
        with tempfile.TemporaryDirectory() as directory:
            source, job_dir = self._files(directory)
            frames = [np.zeros((100, 160, 3), dtype=np.uint8) for _ in range(4)]
            result = run_job(
                VideoJobConfig(
                    source,
                    job_dir,
                    mode="redlight",
                    stop_line_ratio=0.5,
                    force_red_simulation=False,
                    imgsz=320,
                ),
                model_factory=lambda _path: FakeModel([80, 62, 46, 40]),
                capture_factory=lambda _path: FakeCapture(frames),
            )
            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["event_count"], 0)
            self.assertIn("DISABLED", result["simulation_label"])

    def test_model_failure_is_persisted_as_clear_error(self):
        with tempfile.TemporaryDirectory() as directory:
            source, job_dir = self._files(directory)

            def fail_model(_path):
                raise RuntimeError("model unavailable for test")

            result = run_job(
                VideoJobConfig(source, job_dir, imgsz=320),
                model_factory=fail_model,
                capture_factory=lambda _path: FakeCapture([]),
            )
            self.assertEqual(result["status"], "error")
            self.assertIn("model unavailable", result["error"])
            persisted = json.loads((job_dir / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(persisted["status"], "error")


if __name__ == "__main__":
    unittest.main()
