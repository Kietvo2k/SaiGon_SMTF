import http.client
import json
import os
import tempfile
import threading
import time
import unittest
from unittest import mock

import cv2
import numpy as np

from webcam_ai import (VEHICLE_CLASS_IDS, WebcamAI, WebcamInputError)
from web import server as web_server


class FakeBoxes(object):
    def __init__(self):
        self.xyxy = np.asarray([
            [8, 12, 62, 70],       # car
            [74, 15, 118, 74],     # bus
            [2, 2, 20, 35],        # person (must be discarded defensively)
        ], dtype=np.float32)
        self.conf = np.asarray([0.91, 0.82, 0.99], dtype=np.float32)
        self.cls = np.asarray([2, 5, 0], dtype=np.float32)


class FakeResult(object):
    boxes = FakeBoxes()
    names = {
        0: "person", 1: "bicycle", 2: "car", 3: "motorcycle",
        5: "bus", 7: "truck",
    }


class FakeModel(object):
    names = FakeResult.names

    def __init__(self, delay=0.0):
        self.delay = delay
        self.calls = []
        self._counter_lock = threading.Lock()
        self.active_predictions = 0
        self.max_active_predictions = 0

    def predict(self, **kwargs):
        with self._counter_lock:
            self.active_predictions += 1
            self.max_active_predictions = max(
                self.max_active_predictions, self.active_predictions)
        try:
            self.calls.append(kwargs)
            if self.delay:
                time.sleep(self.delay)
            return [FakeResult()]
        finally:
            with self._counter_lock:
                self.active_predictions -= 1


def make_jpeg():
    frame = np.full((90, 130, 3), 40, dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", frame)
    if not ok:  # pragma: no cover - OpenCV environment failure
        raise RuntimeError("test JPEG encoding failed")
    return encoded.tobytes()


class WebcamAITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.model_path = os.path.join(self.temp.name, "yolo26n.pt")
        with open(self.model_path, "wb") as model_file:
            model_file.write(b"fake")
        self.fake_model = FakeModel()
        self.load_calls = []

        def loader(path):
            self.load_calls.append(path)
            return self.fake_model

        self.service = WebcamAI(self.model_path, model_loader=loader,
                                max_jpeg_bytes=1024 * 1024)

    def tearDown(self):
        self.temp.cleanup()

    def test_lazy_single_model_filters_vehicles_and_annotates_jpeg(self):
        self.assertFalse(self.service.status()["loaded"])
        original = make_jpeg()

        output, metadata = self.service.infer_jpeg(original, conf=0.4, imgsz=480)
        self.service.infer_jpeg(original)

        self.assertEqual(self.load_calls, [self.model_path])
        self.assertEqual(self.fake_model.calls[0]["classes"],
                         list(VEHICLE_CLASS_IDS))
        self.assertEqual(self.fake_model.calls[0]["conf"], 0.4)
        self.assertEqual(self.fake_model.calls[0]["imgsz"], 480)
        self.assertEqual(metadata["detection_count"], 2)
        self.assertEqual(metadata["counts"]["car"], 1)
        self.assertEqual(metadata["counts"]["bus"], 1)
        self.assertNotEqual(output, original)
        self.assertIsNotNone(cv2.imdecode(np.frombuffer(output, np.uint8),
                                         cv2.IMREAD_COLOR))

    def test_rejects_corrupt_empty_and_oversize_frames_without_loading_model(self):
        invalid_frames = [
            b"",
            b"not a jpeg",
            b"\xff\xd8broken\xff\xd9",
            b"\xff\xd8" + (b"x" * (1024 * 1024)) + b"\xff\xd9",
        ]
        for frame in invalid_frames:
            with self.assertRaises(WebcamInputError):
                self.service.infer_jpeg(frame)
        self.assertEqual(self.load_calls, [])

    def test_predict_calls_are_serialized_across_http_worker_threads(self):
        self.fake_model.delay = 0.08
        jpeg = make_jpeg()
        errors = []

        def infer():
            try:
                self.service.infer_jpeg(jpeg)
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)

        workers = [threading.Thread(target=infer) for _ in range(3)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(2.0)

        self.assertEqual(errors, [])
        self.assertEqual(self.fake_model.max_active_predictions, 1)
        self.assertEqual(len(self.fake_model.calls), 3)

    def test_release_unloads_and_next_frame_loads_again(self):
        self.service.infer_jpeg(make_jpeg())
        released = self.service.release()
        self.assertTrue(released["released"])
        self.assertFalse(released["loaded"])

        self.service.infer_jpeg(make_jpeg())
        self.assertEqual(len(self.load_calls), 2)


class WebcamHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        model_path = os.path.join(self.temp.name, "yolo26n.pt")
        with open(model_path, "wb") as model_file:
            model_file.write(b"fake")
        self.fake_model = FakeModel()
        self.service = WebcamAI(
            model_path, model_loader=lambda _path: self.fake_model,
            max_jpeg_bytes=1024 * 1024,
        )
        self.ai_patch = mock.patch.object(web_server, "WEBCAM_AI", self.service)
        self.active_patch = mock.patch.object(
            web_server, "webcam_video_job_active", return_value=False)
        self.ai_patch.start()
        self.active_mock = self.active_patch.start()
        self.httpd = web_server.ThreadingHTTPServer(
            ("127.0.0.1", 0), web_server.Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever)
        self.thread.daemon = True
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(2.0)
        self.active_patch.stop()
        self.ai_patch.stop()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1", self.httpd.server_address[1], timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        result = (response.status, dict(response.getheaders()), payload)
        connection.close()
        return result

    def test_status_infer_metadata_and_release_endpoints(self):
        status_code, _headers, body = self.request("GET", "/api/webcam/status")
        status = json.loads(body.decode("utf-8"))
        self.assertEqual(status_code, 200)
        self.assertFalse(status["loaded"])
        self.assertFalse(status["video_job_active"])

        status_code, headers, body = self.request(
            "POST", "/api/webcam/infer?conf=0.45&imgsz=480",
            make_jpeg(), {"Content-Type": "image/jpeg"})
        self.assertEqual(status_code, 200)
        self.assertEqual(headers["Content-Type"], "image/jpeg")
        self.assertIn("no-store", headers["Cache-Control"])
        self.assertEqual(headers["X-Detection-Count"], "2")
        self.assertEqual(headers["X-AI-Model"], "yolo26n.pt")
        self.assertIn("car=1", headers["X-AI-Counts"])
        self.assertIn("X-AI-FPS", headers)
        self.assertIn("X-AI-Latency-Ms", headers)
        self.assertTrue(body.startswith(b"\xff\xd8"))

        status_code, _headers, body = self.request(
            "POST", "/api/webcam/release", b"")
        released = json.loads(body.decode("utf-8"))
        self.assertEqual(status_code, 200)
        self.assertTrue(released["released"])
        self.assertFalse(released["loaded"])

    def test_http_rejects_corrupt_oversize_and_active_video_job(self):
        status, _headers, body = self.request(
            "POST", "/api/webcam/infer", b"\xff\xd8broken\xff\xd9",
            {"Content-Type": "image/jpeg"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body.decode("utf-8"))["code"], "invalid_jpeg")

        with mock.patch.object(web_server, "MAX_WEBCAM_JPEG_BYTES", 8):
            status, _headers, body = self.request(
                "POST", "/api/webcam/infer", b"123456789",
                {"Content-Type": "image/jpeg"})
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body.decode("utf-8"))["code"],
                         "frame_too_large")

        self.active_mock.return_value = True
        status, _headers, body = self.request(
            "POST", "/api/webcam/infer", make_jpeg(),
            {"Content-Type": "image/jpeg"})
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(body.decode("utf-8"))["code"],
                         "video_job_active")
        self.assertEqual(self.fake_model.calls, [])


if __name__ == "__main__":
    unittest.main()

