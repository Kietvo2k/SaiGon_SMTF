"""Stateless browser-webcam vehicle inference for the dashboard.

The browser owns the physical camera and sends individual JPEG frames to the
server.  This module deliberately does not open a camera, write evidence, run
OCR, or touch GPIO.  A single YOLOv26n instance is loaded on first use and all
``model.predict`` calls are serialized because Jetson/PyTorch inference is not
safe (or useful) when several HTTP worker threads enter it concurrently.
"""

from __future__ import division

import gc
import os
import sys
import threading
import time


MODEL_FILENAME = "yolo26n.pt"
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  MODEL_FILENAME)
MAX_WEBCAM_JPEG_BYTES = 4 * 1024 * 1024

# Ultralytics COCO class IDs.  Keep this order stable for predictable labels
# and response metadata.
VEHICLE_CLASS_IDS = (1, 2, 3, 5, 7)
VEHICLE_CLASS_NAMES = {
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}


class WebcamInputError(ValueError):
    """The request body is not a usable, bounded JPEG frame."""


class WebcamInferenceError(RuntimeError):
    """The inference engine could not load or process the frame."""


def _default_model_loader(model_path):
    # Importing ultralytics can take seconds and allocates substantial memory on
    # a Jetson Nano, so it must remain inside the first-inference path.
    from ultralytics import YOLO
    return YOLO(model_path)


def _plain_list(value):
    """Convert NumPy/Torch-like values to a regular Python list."""
    if value is None:
        return []
    try:
        value = value.detach()
    except AttributeError:
        pass
    try:
        value = value.cpu()
    except AttributeError:
        pass
    try:
        return value.tolist()
    except AttributeError:
        return list(value)


class WebcamAI(object):
    """Lazy, reusable YOLO vehicle detector for browser JPEG frames."""

    def __init__(self, model_path=DEFAULT_MODEL_PATH, model_loader=None,
                 max_jpeg_bytes=MAX_WEBCAM_JPEG_BYTES, clock=None):
        self.model_path = os.path.abspath(model_path)
        self.model_loader = model_loader or _default_model_loader
        self.max_jpeg_bytes = int(max_jpeg_bytes)
        self.clock = clock or time.perf_counter
        self._model = None
        self._predict_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._load_count = 0
        self._inference_count = 0
        self._last_latency_ms = 0.0
        self._last_fps = 0.0
        self._last_detection_count = 0
        self._last_error = ""

    def _load_model_locked(self):
        if self._model is not None:
            return self._model
        if not os.path.isfile(self.model_path):
            raise WebcamInferenceError(
                "Khong tim thay model %s" % os.path.basename(self.model_path))
        try:
            model = self.model_loader(self.model_path)
        except Exception as exc:
            raise WebcamInferenceError("Khong nap duoc YOLO: %s" % exc)
        self._model = model
        with self._state_lock:
            self._load_count += 1
            self._last_error = ""
        return model

    @staticmethod
    def _decode_jpeg(jpeg_bytes):
        try:
            import cv2
            import numpy as np
        except Exception as exc:
            raise WebcamInferenceError("OpenCV/NumPy khong san sang: %s" % exc)

        encoded = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if frame is None or getattr(frame, "size", 0) == 0:
            raise WebcamInputError("Anh JPEG bi hong hoac khong doc duoc")
        if len(frame.shape) != 3 or frame.shape[2] != 3:
            raise WebcamInputError("JPEG phai la anh mau 3 kenh")
        return frame

    @staticmethod
    def _detections(result, model):
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            return []
        xyxy_rows = _plain_list(getattr(boxes, "xyxy", None))
        confidence_rows = _plain_list(getattr(boxes, "conf", None))
        class_rows = _plain_list(getattr(boxes, "cls", None))
        names = getattr(result, "names", None) or getattr(model, "names", None) or {}

        detections = []
        for coords, confidence, class_id in zip(
                xyxy_rows, confidence_rows, class_rows):
            try:
                class_id = int(class_id)
                confidence = float(confidence)
                x1, y1, x2, y2 = [int(round(float(number))) for number in coords[:4]]
            except (TypeError, ValueError, IndexError):
                continue
            # The classes argument already asks YOLO to filter these.  Filter a
            # second time so an unusual/custom model cannot leak other classes.
            if class_id not in VEHICLE_CLASS_IDS:
                continue
            if isinstance(names, dict):
                name = names.get(class_id, VEHICLE_CLASS_NAMES[class_id])
            else:
                try:
                    name = names[class_id]
                except (IndexError, KeyError, TypeError):
                    name = VEHICLE_CLASS_NAMES[class_id]
            detections.append({
                "class_id": class_id,
                "class_name": str(name),
                "confidence": confidence,
                "xyxy": (x1, y1, x2, y2),
            })
        return detections

    @staticmethod
    def _annotate(frame, detections, fps):
        import cv2

        height, width = frame.shape[:2]
        colors = {
            "bicycle": (255, 180, 0),
            "car": (80, 220, 80),
            "motorcycle": (0, 200, 255),
            "bus": (255, 100, 40),
            "truck": (180, 80, 255),
        }
        for detection in detections:
            x1, y1, x2, y2 = detection["xyxy"]
            x1 = max(0, min(width - 1, x1))
            x2 = max(0, min(width - 1, x2))
            y1 = max(0, min(height - 1, y1))
            y2 = max(0, min(height - 1, y2))
            if x2 <= x1 or y2 <= y1:
                continue
            name = detection["class_name"]
            color = colors.get(name, (80, 220, 80))
            label = "%s %.0f%%" % (name, detection["confidence"] * 100.0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            (text_width, text_height), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            label_top = max(0, y1 - text_height - baseline - 5)
            cv2.rectangle(frame, (x1, label_top),
                          (min(width - 1, x1 + text_width + 6), y1), color, -1)
            cv2.putText(frame, label, (x1 + 3, max(text_height + 1, y1 - 5)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (10, 10, 10), 2,
                        cv2.LINE_AA)

        summary = "YOLOv26n | vehicles: %d | %.1f FPS" % (len(detections), fps)
        cv2.rectangle(frame, (0, 0), (min(width - 1, 420), 34), (16, 24, 38), -1)
        cv2.putText(frame, summary, (10, 23), cv2.FONT_HERSHEY_SIMPLEX,
                    0.58, (255, 255, 255), 2, cv2.LINE_AA)

    def infer_jpeg(self, jpeg_bytes, conf=0.30, imgsz=640, jpeg_quality=86):
        """Return ``(annotated_jpeg, metadata)`` for one browser frame."""
        if not isinstance(jpeg_bytes, (bytes, bytearray)):
            raise WebcamInputError("Body phai la du lieu JPEG")
        size = len(jpeg_bytes)
        if size <= 0:
            raise WebcamInputError("Anh JPEG dang rong")
        if size > self.max_jpeg_bytes:
            raise WebcamInputError("Anh JPEG vuot gioi han %d byte" % self.max_jpeg_bytes)
        # A cheap signature check avoids feeding obviously arbitrary bodies to
        # OpenCV.  imdecode below remains the authoritative corruption check.
        if size < 4 or jpeg_bytes[:2] != b"\xff\xd8" or jpeg_bytes[-2:] != b"\xff\xd9":
            raise WebcamInputError("Body khong phai JPEG hop le")

        frame = self._decode_jpeg(jpeg_bytes)
        try:
            conf = max(0.05, min(0.95, float(conf)))
        except (TypeError, ValueError):
            conf = 0.30
        try:
            imgsz = max(320, min(960, int(imgsz)))
        except (TypeError, ValueError):
            imgsz = 640

        started = self.clock()
        try:
            # Loading and the complete synchronous predict call share this lock.
            # HTTP requests may decode in parallel, but never enter PyTorch in
            # parallel or release the model while inference is running.
            with self._predict_lock:
                model = self._load_model_locked()
                results = model.predict(
                    source=frame,
                    classes=list(VEHICLE_CLASS_IDS),
                    conf=conf,
                    imgsz=imgsz,
                    verbose=False,
                )
        except WebcamInferenceError:
            raise
        except Exception as exc:
            with self._state_lock:
                self._last_error = str(exc)[:240]
            raise WebcamInferenceError("YOLO khong xu ly duoc khung hinh: %s" % exc)

        elapsed = max(0.000001, self.clock() - started)
        try:
            result = results[0] if results is not None and len(results) else None
        except TypeError:
            result = results
        detections = self._detections(result, model) if result is not None else []
        fps = 1.0 / elapsed
        self._annotate(frame, detections, fps)

        try:
            import cv2
            quality = max(60, min(95, int(jpeg_quality)))
            ok, encoded = cv2.imencode(
                ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        except Exception as exc:
            raise WebcamInferenceError("Khong ma hoa duoc anh ket qua: %s" % exc)
        if not ok:
            raise WebcamInferenceError("Khong ma hoa duoc anh ket qua")

        counts = dict((name, 0) for name in VEHICLE_CLASS_NAMES.values())
        for detection in detections:
            name = detection["class_name"]
            counts[name] = counts.get(name, 0) + 1
        metadata = {
            "model": os.path.basename(self.model_path),
            "fps": round(fps, 2),
            "latency_ms": round(elapsed * 1000.0, 1),
            "detection_count": len(detections),
            "counts": counts,
        }
        with self._state_lock:
            self._inference_count += 1
            self._last_latency_ms = metadata["latency_ms"]
            self._last_fps = metadata["fps"]
            self._last_detection_count = len(detections)
            self._last_error = ""
        return encoded.tobytes(), metadata

    def status(self):
        with self._state_lock:
            return {
                "model": os.path.basename(self.model_path),
                "model_file_available": os.path.isfile(self.model_path),
                "loaded": self._model is not None,
                "busy": self._predict_lock.locked(),
                "vehicle_classes": [VEHICLE_CLASS_NAMES[class_id]
                                    for class_id in VEHICLE_CLASS_IDS],
                "max_jpeg_bytes": self.max_jpeg_bytes,
                "load_count": self._load_count,
                "inference_count": self._inference_count,
                "last_latency_ms": self._last_latency_ms,
                "last_fps": self._last_fps,
                "last_detection_count": self._last_detection_count,
                "last_error": self._last_error,
            }

    def release(self):
        """Unload YOLO after any in-flight prediction has completed."""
        with self._predict_lock:
            released = self._model is not None
            self._model = None
        gc.collect()
        torch = sys.modules.get("torch")
        try:
            if torch is not None and torch.cuda.is_available():
                torch.cuda.empty_cache()
        except (AttributeError, RuntimeError):
            pass
        response = self.status()
        response["released"] = released
        return response


# Process-wide singleton used by web/server.py.  It contains no camera handle
# and performs no work until the first POST /api/webcam/infer request.
WEBCAM_AI = WebcamAI()

