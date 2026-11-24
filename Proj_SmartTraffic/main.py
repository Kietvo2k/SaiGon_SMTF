"""
main.py – Ngã tư thông minh: AI nhận diện + Jetson Nano điều khiển đèn + lưu vi phạm Excel

Kiến trúc:
  - Camera (cắm laptop) dùng YOLO ĐẾM XE theo 2 trục: dọc (Bắc-Nam) + ngang (Đông-Tây)
  - Laptop AI gửi số xe (COUNT) cho Jetson Nano qua TCP
  - Jetson Nano ĐIỀU KHIỂN ĐÈN thích ứng theo số xe, gửi TRẠNG THÁI ĐÈN về AI
  - AI lấy trạng thái đèn TỪ JETSON để phát hiện vượt đèn đỏ → lưu Excel + CSV + ảnh

Cách chạy:
  # 1 camera (test trước – tuyến ngang coi như 0 xe)
  python main.py --camera-v 0 --jetson 192.168.16.210

  # 2 camera đầy đủ (dọc = index 0, ngang = index 1)
  python main.py --camera-v 0 --camera-h 1 --jetson 192.168.16.210

  # Chạy thử không có phần cứng (ép đỏ để test bắt vi phạm)
  python main.py --camera-v 0 --offline --force-red

Cấu trúc thư mục cần có:
  models/
    vehicle/vehicle.pt
    license_plate/license_plate_detection.pt
    license_plate/license_plate_ocr.pt
  violations/  logs/  plates_cropped/   (tự tạo)
"""

import cv2
import numpy as np
import torch
from ultralytics import YOLO
import re
import os
import csv
import json
import time
import logging
import argparse
import threading
import glob
import shutil
import subprocess
from datetime import datetime
from collections import defaultdict, deque

from camera_manager import CameraManager
from violation_detector import ViolationDetector
from vehicle_counter import VehicleCounter
from jetson_comm import JetsonComm
from telegram_notifier import TelegramNotifier
from evidence_auto_sync import create_sync_service
from mobile_app_bridge import create_mobile_app_store

# Bắt buộc stdout/stderr dùng UTF-8 trên Windows (tránh lỗi cp1252 với tiếng Việt)
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ======================================================================
# THƯ MỤC ĐẦU RA (tạo TRƯỚC khi cấu hình logging vì FileHandler ghi vào logs/)
# ======================================================================
os.makedirs("violations", exist_ok=True)
os.makedirs("logs", exist_ok=True)
os.makedirs("plates_cropped", exist_ok=True)

# ======================================================================
# LOGGING
# ======================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("logs/system.log", encoding="utf-8"),
    ]
)
logger = logging.getLogger(__name__)

DEFAULT_JETSON_HOST = "192.168.16.210"

# ======================================================================
# THƯ MỤC ĐẦU RA
# ======================================================================
os.makedirs("violations", exist_ok=True)
os.makedirs("logs", exist_ok=True)
os.makedirs("plates_cropped", exist_ok=True)

# ======================================================================
# ARGUMENT PARSER
# ======================================================================
def parse_args():
    ap = argparse.ArgumentParser(description="Ngã tư thông minh – đếm xe + phát hiện vượt đèn đỏ")
    # --- Camera 2 trục ---
    ap.add_argument("--camera-v", default="0",
                    help="Nguồn DỌC: webcam index, RTSP URL hoặc file video .mp4. Mặc định: 0")
    ap.add_argument("--camera-h", default=None,
                    help="Nguồn NGANG: webcam, RTSP hoặc file video. Bỏ trống = chạy 1 tuyến")
    ap.add_argument("--no-video-loop", dest="video_loop", action="store_false", default=True,
                    help="Không lặp lại khi nguồn là file video (mặc định: lặp liên tục)")
    ap.add_argument("--video-fps", type=float, default=None,
                    help="Giới hạn FPS khi nguồn là file video (vd: 5); bỏ trống = FPS gốc")
    ap.add_argument("--video-stride", type=int, default=1,
                    help="Với file video: lấy mỗi N frame nguồn (mặc định: 1; tăng để demo CPU chậm)")
    ap.add_argument("--width", type=int, default=1280, help="Chiều rộng frame")
    ap.add_argument("--height", type=int, default=720, help="Chiều cao frame")
    # --- Vạch dừng (vi phạm) + vạch đếm cho từng trục ---
    ap.add_argument("--stop-line-v", type=int, default=None,
                    help="Y vạch dừng trục dọc (px). Mặc định 65%% chiều cao")
    ap.add_argument("--stop-line-h", type=int, default=None,
                    help="Y vạch dừng trục ngang (px). Mặc định 65%% chiều cao")
    ap.add_argument("--count-line-v", type=int, default=None,
                    help="Y vạch đếm xe trục dọc (px). Mặc định = vạch dừng")
    ap.add_argument("--count-line-h", type=int, default=None,
                    help="Y vạch đếm xe trục ngang (px). Mặc định = vạch dừng")
    ap.add_argument("--count-interval", type=float, default=10.0,
                    help="Chu kỳ (giây) gửi số xe cho Jetson Nano. Mặc định: 10")
    ap.add_argument("--count-mode", choices=["crossing", "visible"], default="crossing",
                    help="crossing = xe cắt vạch; visible = số xe đang thấy (hợp demo video)")
    # --- Jetson Nano: bộ điều khiển đèn chính ---
    ap.add_argument("--jetson", default=DEFAULT_JETSON_HOST,
                    help="IP Jetson Nano GPIO. Mặc định: %(default)s")
    ap.add_argument("--jetson-port", type=int, default=8080,
                    help="Cổng TCP dịch vụ Jetson Nano. Mặc định: %(default)s")
    ap.add_argument("--offline", action="store_true",
                    help="Không kết nối Jetson (chỉ dùng cho test phần mềm)")
    # Alias ẩn để các lệnh cũ không hỏng trong lúc chuyển đổi sang Jetson.
    ap.add_argument("--arduino", dest="jetson", default=argparse.SUPPRESS,
                    help=argparse.SUPPRESS)
    ap.add_argument("--arduino-port", dest="jetson_port", type=int,
                    default=argparse.SUPPRESS, help=argparse.SUPPRESS)
    ap.add_argument("--force-red", action="store_true",
                    help="Ép đèn = đỏ cả 2 trục (test vi phạm không cần Jetson)")
    ap.add_argument("--count-only", action="store_true",
                    help="Chỉ nhận diện/đếm xe, không ghi vi phạm hoặc kích còi/relay")
    ap.add_argument("--preview-only", action="store_true",
                    help="Smooth dashboard video preview; no AI model or hardware control")
    ap.add_argument("--demo-red-seconds", type=int, default=0,
                    help="Yêu cầu Jetson giữ cả hai hướng đỏ N giây cho demo video (0 = tắt)")
    ap.add_argument("--evidence-only", action="store_true",
                    help="Vẫn lưu bằng chứng nhưng không kích còi/relay hoặc gửi Telegram")
    ap.add_argument("--skip-ocr", action="store_true",
                    help="Bỏ nhận dạng biển số để demo video chạy nhanh hơn; bản ghi ghi DEMO_UNKNOWN")
    # --- Hiển thị / hiệu năng ---
    ap.add_argument("--no-display", action="store_true",
                    help="Không hiển thị cửa sổ video (chạy server mode)")
    ap.add_argument("--max-runtime", type=float, default=0.0,
                    help="Tự dừng sạch sau N giây kể từ lúc bắt đầu xử lý (0 = chạy đến khi dừng tay)")
    ap.add_argument("--frame-skip", type=int, default=3,
                    help="Xử lý 1 trong N frame (giảm tải CPU). Mặc định: 3")
    ap.add_argument("--torch-threads", type=int, default=2,
                    help="Số luồng CPU cho PyTorch (mặc định: 2; ổn định cho demo CPU)")
    # --- Model ---
    ap.add_argument("--vehicle-model", default="yolo26n.pt",
                    help="Model YOLO nhận diện xe. Mặc định yolo26n.pt (YOLOv26n NMS-Free nhẹ, nhanh). "
                         "Dùng models/vehicle/vehicle.pt nếu muốn model đã train")
    ap.add_argument("--vehicle-classes", default="auto",
                    help="Lọc class xe: 'auto' (tự nhận COCO→car/moto/bus/truck), "
                         "'all', hoặc danh sách id vd '2,3,5,7'")
    ap.add_argument("--plate-model",   default="models/license_plate/license_plate_detection.pt")
    ap.add_argument("--ocr-model",     default="models/license_plate/license_plate_ocr.pt",
                    help="Model YOLO đọc ký tự biển số (0-9, A-Z)")
    ap.add_argument("--ocr-engine", choices=["yolo", "easyocr"], default="yolo",
                    help="yolo = dùng license_plate_ocr.pt (nhẹ, khuyến nghị); easyocr = fallback")
    ap.add_argument("--conf", type=float, default=0.35, help="Ngưỡng confidence tối thiểu (chuẩn cho YOLOv26)")
    ap.add_argument("--imgsz", type=int, default=480,
                    help="Kích thước ảnh khi inference (giảm để nhanh hơn trên CPU, tối thiểu 320 cho YOLOv26)")
    ap.add_argument("--plate-min-confidence", type=float, default=0.45,
                    help="Minimum OCR confidence for a saved plate (0-1)")
    ap.add_argument("--ocr-near-line", action="store_true",
                    help="Run OCR for every vehicle near the stop line (slower)")
    ap.add_argument("--direction", choices=["up", "down", "auto"], default="up",
                    help="Hướng xe vi phạm khi vượt vạch. up=đi lên (mặc định), down, auto")
    ap.add_argument("--violation-confirm-frames", type=int, default=4,
                    help="Số frame liên tiếp qua vạch để xác nhận vi phạm (mặc định: 4)")
    # --- Xuất ---
    ap.add_argument("--xlsx", default="violations.xlsx",
                    help="File Excel lưu vi phạm. Mặc định: violations.xlsx")
    ap.add_argument("--fresh-xlsx", action="store_true",
                    help="Tạo mới file Excel cho lượt chạy này, không giữ dòng của lượt cũ")
    ap.add_argument("--sync-config", default="config/evidence_sync.json",
                    help="Cấu hình đẩy bằng chứng tự động (không chứa OAuth/token)")
    ap.add_argument("--sync-queue", default=None,
                    help="Ghi đè đường dẫn hàng đợi bằng chứng cục bộ")
    ap.add_argument("--sync-flush-timeout", type=float, default=10.0,
                    help="Số giây thử gửi nốt bằng chứng khi dừng (còn lỗi sẽ giữ queue)")
    # Persisted mobile evidence and the verified plate-to-CCCD registry are
    # explicit paths so the live detector and dashboard share one store.
    ap.add_argument("--mobile-events-path",
                    default=os.path.join("logs", "mobile_app_events.json"),
                    help="Mobile app event JSON path")
    ap.add_argument("--plate-owner-registry",
                    default=os.path.join("config", "plate_owner_registry.json"),
                    help="Verified plate-to-CCCD registry path")
    ap.add_argument("--device", default="cpu", help="cpu hoặc cuda:0")
    args = ap.parse_args()
    if args.frame_skip < 1:
        ap.error("--frame-skip phải >= 1")
    if args.video_stride < 1:
        ap.error("--video-stride phải >= 1")
    if args.torch_threads < 1:
        ap.error("--torch-threads phải >= 1")
    if args.preview_only:
        # Preview is always safe: it never connects to Jetson, creates a violation,
        # sends Telegram, or changes external GPIO state.
        args.offline = True
        args.count_only = True
        args.skip_ocr = True
        args.evidence_only = True
        args.demo_red_seconds = 0
    if not 0.0 <= args.plate_min_confidence <= 1.0:
        ap.error("--plate-min-confidence must be between 0 and 1")
    if "yolo26" in os.path.basename(str(args.vehicle_model)).lower() and args.imgsz < 320:
        logger.warning("YOLOv26 (C2PSA/C3k2) cần imgsz >= 320 để giữ quỹ đạo xe ổn định; tự động nâng --imgsz từ %d lên 320.", args.imgsz)
        args.imgsz = 320
    return args

# ======================================================================
# LOAD MODEL
# ======================================================================
def load_models(args):
    logger.info("Đang tải model AI...")
    models = {}

    def _load(path, name, required=False, fallback_paths=()):
        candidates = [path] + [p for p in fallback_paths if p and p != path]
        for candidate in candidates:
            if os.path.exists(candidate):
                if candidate != path:
                    logger.warning("Không thấy %s, dùng model dự phòng: %s", path, candidate)
                m = YOLO(candidate)
                logger.info("✓ %s: %s  (classes: %s)", name, candidate, m.names)
                return m
        if required:
            logger.error("✗ %s KHÔNG tìm thấy (bắt buộc): %s", name, path)
        else:
            logger.warning("✗ %s không tìm thấy: %s", name, path)
        return None

    models["vehicle"] = _load(args.vehicle_model, "Vehicle model", required=True,
                              fallback_paths=("yolo26n.pt", "yolov8n.pt"))
    if models["vehicle"] is None:
        raise FileNotFoundError(f"Không tìm thấy vehicle model: {args.vehicle_model}")

    # Đếm xe không cần OCR. Ở video demo có thể chủ động --skip-ocr để bảo đảm
    # tracker theo kịp video; ảnh bằng chứng sẽ được ghi rõ DEMO_UNKNOWN.
    skip_ocr = args.skip_ocr or args.count_only
    if skip_ocr:
        models["plate"] = None
        models["ocr"] = None
        logger.info("OCR biển số: TẮT (%s)",
                    "count-only" if args.count_only else "demo tốc độ cao")
    else:
        models["plate"] = _load(args.plate_model, "Plate detection model")
        models["ocr"] = _load(args.ocr_model, "Plate OCR model") if args.ocr_engine == "yolo" else None
    # Jetson Nano điều khiển đèn và báo về → không cần model traffic_light.

    return models

# ======================================================================
# OCR BIỂN SỐ BẰNG YOLO – dùng model license_plate_ocr.pt đã train
# ======================================================================
class PlateOCRYolo:
    """
    Đọc biển số bằng model YOLO nhận diện ký tự (classes: 0-9, A-Z).
    Gom ký tự thành hàng (biển 1 dòng hoặc 2 dòng VN), sort trái→phải, ghép chuỗi.
    Nhẹ và chính xác hơn EasyOCR cho biển số đã train.
    """

    def __init__(self, model, device="cpu", conf=0.35):
        self.model  = model
        self.device = device
        self.conf   = conf

    def recognize(self, plate_img):
        if plate_img is None or plate_img.size == 0 or self.model is None:
            return "Unknown", 0.0

        # Scale nhỏ lên để ký tự rõ hơn
        h, w = plate_img.shape[:2]
        if w < 160:
            scale = max(2, 200 // max(w, 1))
            plate_img = cv2.resize(plate_img, (w * scale, h * scale),
                                   interpolation=cv2.INTER_CUBIC)

        results = self.model(plate_img, conf=self.conf, device=self.device, verbose=False)

        chars = []  # (cx, cy, char, conf, height)
        for r in results:
            for b in r.boxes:
                c = float(b.conf)
                if c < self.conf:
                    continue
                x1, y1, x2, y2 = b.xyxy[0].tolist()
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                ch = r.names[int(b.cls)]
                chars.append((cx, cy, ch, c, y2 - y1))

        if not chars:
            return "Unknown", 0.0

        # Gom hàng: nếu chênh lệch y > nửa chiều cao ký tự trung bình → hàng khác
        avg_h = sum(c[4] for c in chars) / len(chars)
        chars.sort(key=lambda c: c[1])  # sort theo y trước
        rows, cur = [], [chars[0]]
        for c in chars[1:]:
            if abs(c[1] - cur[-1][1]) > avg_h * 0.6:
                rows.append(cur); cur = [c]
            else:
                cur.append(c)
        rows.append(cur)

        text = ""
        for row in rows:
            row.sort(key=lambda c: c[0])  # trong hàng: trái → phải
            text += "".join(c[2] for c in row)

        avg_conf = sum(c[3] for c in chars) / len(chars)
        return text, avg_conf


# ======================================================================
# OCR BIỂN SỐ – EasyOCR (FALLBACK tùy chọn)
# ======================================================================
class LicensePlateOCR:
    """OCR biển số xe Việt Nam dùng EasyOCR + preprocessing (fallback)."""

    # Pattern biển số VN
    VN_PATTERNS = [
        r'^\d{2}[A-Z]\d{4,5}$',
        r'^\d{2}[A-Z]{1,2}\d{4,5}$',
        r'^\d{2}[A-Z]\d{4,5}[A-Z]$',
    ]

    def __init__(self, gpu=False):
        logger.info("Đang khởi tạo EasyOCR...")
        import easyocr  # lazy import – chỉ nạp khi thực sự dùng fallback
        self.reader = easyocr.Reader(['en'], gpu=gpu, verbose=False)
        logger.info("✓ EasyOCR sẵn sàng")

    def preprocess(self, img):
        """Tiền xử lý ảnh để tăng chất lượng OCR."""
        if img is None or img.size == 0:
            return None

        # Scale ảnh lên 4x để OCR chính xác hơn
        h, w = img.shape[:2]
        if w < 80:
            scale = max(4, 240 // w)
        else:
            scale = 3
        img = cv2.resize(img, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)

        # Chuyển grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # CLAHE tăng độ tương phản cục bộ
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

        # Sharpen
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        gray = cv2.filter2D(gray, -1, kernel)

        # Denoise
        gray = cv2.fastNlMeansDenoising(gray, h=10)

        return gray

    def clean_text(self, text):
        """Làm sạch text OCR – chỉ giữ chữ và số."""
        return re.sub(r'[^A-Z0-9]', '', text.upper())

    def is_valid_vn_plate(self, text):
        """Kiểm tra có khớp định dạng biển số VN không."""
        for p in self.VN_PATTERNS:
            if re.match(p, text):
                return True
        # Fallback: ít nhất 5 ký tự, có cả số và chữ
        if 5 <= len(text) <= 10 and any(c.isdigit() for c in text) and any(c.isalpha() for c in text):
            return True
        return False

    def recognize(self, plate_img):
        """
        Nhận dạng biển số. Trả về (text, confidence).
        """
        if plate_img is None or plate_img.size == 0:
            return "Unknown", 0.0

        preprocessed = self.preprocess(plate_img)
        if preprocessed is None:
            return "Unknown", 0.0

        candidates = []

        try:
            # EasyOCR – chạy trên ảnh đã xử lý
            results = self.reader.readtext(preprocessed, detail=1,
                                           allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
            for (_, text, conf) in results:
                cleaned = self.clean_text(text)
                if len(cleaned) >= 4:
                    candidates.append((cleaned, conf))

            # Thử thêm với ảnh binary
            _, thresh = cv2.threshold(preprocessed, 0, 255,
                                      cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            results2 = self.reader.readtext(thresh, detail=1,
                                            allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
            for (_, text, conf) in results2:
                cleaned = self.clean_text(text)
                if len(cleaned) >= 4:
                    candidates.append((cleaned, conf * 0.9))

        except Exception as e:
            logger.debug("OCR lỗi: %s", e)

        if not candidates:
            return "Unknown", 0.0

        # Chọn kết quả tốt nhất: ưu tiên valid VN plate, rồi theo confidence
        valid = [(t, c) for t, c in candidates if self.is_valid_vn_plate(t)]
        if valid:
            best = max(valid, key=lambda x: x[1])
        else:
            best = max(candidates, key=lambda x: x[1])

        return best[0], best[1]


# ======================================================================
# CACHE BIỂN SỐ – Lưu biển số tốt nhất cho mỗi track_id
# ======================================================================
class PlateCache:
    def __init__(self):
        self._cache: dict[int, tuple[str, float]] = {}  # {track_id: (plate, conf)}

    def update(self, track_id, plate, conf, min_confidence=0.0):
        """Keep only a plausibly useful reading above the caller's threshold."""
        text = str(plate or "").strip().upper()
        try:
            confidence = float(conf)
        except (TypeError, ValueError):
            return False
        if (text in ("UNKNOWN", "", "UNREADABLE", "DEMO_UNKNOWN")
                or confidence < float(min_confidence)):
            return False
        current = self._cache.get(track_id, ("Unknown", 0.0))
        if confidence > current[1]:
            self._cache[track_id] = (text, confidence)
            return True
        return False

    def get(self, track_id):
        return self._cache.get(track_id, ("Unknown", 0.0))[0]

    def get_with_confidence(self, track_id):
        return self._cache.get(track_id, ("Unknown", 0.0))

    def cleanup(self, active_ids):
        dead = [k for k in self._cache if k not in active_ids]
        for k in dead:
            del self._cache[k]

# ======================================================================
# VẼ UI TRÊN FRAME
# ======================================================================
def draw_ui(frame, stop_line_y, count_line_y, light_status, light_time,
            lane_name, count_cycle, violations_count, fps, connected_jetson):
    h, w = frame.shape[:2]

    # Vạch dừng (vi phạm) – đỏ khi đèn đỏ
    line_color = (0, 0, 255) if light_status == "red" else (0, 255, 0)
    cv2.line(frame, (0, stop_line_y), (w, stop_line_y), line_color, 3)
    cv2.putText(frame, "STOP LINE", (10, stop_line_y - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, line_color, 2)

    # Vạch đếm xe – vàng
    if count_line_y != stop_line_y:
        cv2.line(frame, (0, count_line_y), (w, count_line_y), (0, 200, 200), 2)
        cv2.putText(frame, "COUNT LINE", (10, count_line_y - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 200), 1)

    # Góc trên trái – thông tin hệ thống
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (360, 140), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

    cv2.putText(frame, f"TUYEN: {lane_name}", (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    lc = {"red": (0, 0, 255), "green": (0, 255, 0), "yellow": (0, 255, 255)}.get(light_status, (200, 200, 200))
    light_txt = f"DEN: {light_status.upper()}"
    if light_time > 0:
        light_txt += f" ({light_time}s)"
    cv2.putText(frame, light_txt, (10, 56),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, lc, 2)
    cv2.putText(frame, f"XE (chu ky): {count_cycle}", (10, 84),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    cv2.putText(frame, f"VI PHAM: {violations_count}", (10, 110),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 134),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

    # Trạng thái bộ điều khiển Jetson Nano
    jetson_color = (0, 255, 0) if connected_jetson else (0, 0, 255)
    jetson_text = "JETSON NANO: OK" if connected_jetson else "JETSON NANO: OFFLINE"
    cv2.putText(frame, jetson_text, (w - 280, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, jetson_color, 2)

    return frame

def draw_vehicle(frame, box, track_id, label, violated, plate_text=""):
    x1, y1, x2, y2 = map(int, box)
    color = (0, 0, 255) if violated else (0, 220, 0)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    tag = f"{label}#{track_id}"
    if plate_text and plate_text != "Unknown":
        tag += f" [{plate_text}]"
    if violated:
        tag += " !VI PHAM!"

    cv2.putText(frame, tag, (x1, max(y1 - 8, 15)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

# ======================================================================
# LƯU ẢNH VI PHẠM
# ======================================================================
def save_violation_image(frame, box, plate_text, vehicle_type, timestamp, stop_line_y=None,
                         simulation=False, event_tag=""):
    """
    Lưu 2 ảnh bằng chứng:
      - violations/<type>_<plate>_<ts>.jpg      : TOÀN CẢNH có khung xe + vạch + thông tin
      - violations/crop_<type>_<plate>_<ts>.jpg : ảnh cắt sát chiếc xe
    Trả về đường dẫn ảnh toàn cảnh (dùng cho CSV).
    """
    x1, y1, x2, y2 = map(int, box)
    h, w = frame.shape[:2]
    safe_plate = re.sub(r'[^A-Z0-9_]', '', plate_text.upper()) or "UNKNOWN"
    safe_tag = re.sub(r'[^A-Z0-9_]', '', str(event_tag).upper())
    suffix = f"_{safe_tag}" if safe_tag else ""

    # --- Ảnh toàn cảnh (bằng chứng chính) ---
    scene = frame.copy()
    cv2.rectangle(scene, (x1, y1), (x2, y2), (0, 0, 255), 3)
    if stop_line_y is not None:
        cv2.line(scene, (0, stop_line_y), (w, stop_line_y), (0, 0, 255), 2)
    prefix = "MO PHONG VIDEO | " if simulation else "VI PHAM | "
    banner = f"{prefix}{vehicle_type} | {plate_text} | {timestamp}"
    cv2.rectangle(scene, (0, h - 34), (w, h), (0, 0, 0), -1)
    cv2.putText(scene, banner, (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    scene_path = f"violations/{vehicle_type}_{safe_plate}_{timestamp}{suffix}.jpg"
    if not cv2.imwrite(scene_path, scene):
        logger.error("Could not save violation scene: %s", scene_path)
        scene_path = ""

    # --- Ảnh cắt sát xe ---
    pad = 20
    crop = frame[max(0, y1 - pad):min(h, y2 + pad), max(0, x1 - pad):min(w, x2 + pad)]
    vehicle_crop_path = ""
    if crop.size > 0:
        vehicle_crop_path = f"violations/crop_{vehicle_type}_{safe_plate}_{timestamp}{suffix}.jpg"
        if not cv2.imwrite(vehicle_crop_path, crop):
            logger.error("Could not save vehicle crop: %s", vehicle_crop_path)
            vehicle_crop_path = ""

    logger.info("Lưu ảnh vi phạm: %s", scene_path)
    return scene_path, vehicle_crop_path


def _safe_evidence_stem(vehicle_type, plate_text, timestamp, event_tag):
    """Build a filesystem-safe evidence name shared by vehicle/plate crops."""
    safe_type = re.sub(r"[^A-Z0-9_]", "", str(vehicle_type).upper()) or "VEHICLE"
    safe_plate = re.sub(r"[^A-Z0-9_]", "", str(plate_text).upper()) or "UNREADABLE"
    safe_tag = re.sub(r"[^A-Z0-9_]", "", str(event_tag).upper())
    return f"{safe_type}_{safe_plate}_{timestamp}" + (f"_{safe_tag}" if safe_tag else "")


def save_plate_crop(plate_crop, vehicle_type, plate_text, timestamp, event_tag):
    """Persist the actual plate crop; return an empty path when no crop exists."""
    if plate_crop is None or plate_crop.size == 0:
        return ""
    path = f"violations/plate_{_safe_evidence_stem(vehicle_type, plate_text, timestamp, event_tag)}.jpg"
    return path if cv2.imwrite(path, plate_crop) else ""


def _is_plausible_plate_text(value):
    """A lightweight sanity check; it does not certify a legal plate reading."""
    text = re.sub(r"[^A-Z0-9]", "", str(value or "").upper())
    return 5 <= len(text) <= 12 and any(ch.isdigit() for ch in text)


def recognize_plate_for_evidence(frame, box, models, ocr, args,
                                 vehicle_type, timestamp, event_tag):
    """Read and save one plate only when a vehicle has actually violated.

    This keeps the expensive plate/OCR stage off the continuous counting path and
    never invents text: an insufficient result is reported as ``UNREADABLE``.
    """
    if args.skip_ocr or models.get("plate") is None or ocr is None:
        return "UNREADABLE", 0.0, "OCR_DISABLED", ""

    x1, y1, x2, y2 = map(int, box)
    h, w = frame.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    vehicle_crop = frame[y1:y2, x1:x2]
    if vehicle_crop.size == 0:
        return "UNREADABLE", 0.0, "NO_VEHICLE_CROP", ""

    best_crop = None
    best_det_conf = -1.0
    best_text = "Unknown"
    best_ocr_conf = 0.0
    try:
        results = models["plate"](vehicle_crop, conf=0.30,
                                   imgsz=args.imgsz, device=args.device,
                                   verbose=False)
        for result in results:
            for pb in result.boxes:
                det_conf = float(pb.conf)
                px1, py1, px2, py2 = map(int, pb.xyxy[0].tolist())
                px1, px2 = max(0, px1), min(vehicle_crop.shape[1], px2)
                py1, py2 = max(0, py1), min(vehicle_crop.shape[0], py2)
                candidate = vehicle_crop[py1:py2, px1:px2]
                if candidate.size == 0:
                    continue
                text, ocr_conf = ocr.recognize(candidate)
                cleaned = re.sub(r"[^A-Z0-9]", "", str(text).upper())
                if det_conf > best_det_conf:
                    best_crop, best_det_conf = candidate.copy(), det_conf
                if len(cleaned) >= 4 and float(ocr_conf) >= best_ocr_conf:
                    best_text, best_ocr_conf = cleaned, float(ocr_conf)
                    best_crop = candidate.copy()
    except Exception as exc:
        logger.warning("OCR evidence failed: %s", exc)
        return "UNREADABLE", 0.0, "OCR_ERROR", ""

    if best_crop is None:
        return "UNREADABLE", 0.0, "NO_PLATE_DETECTED", ""

    threshold = float(getattr(args, "plate_min_confidence", 0.45))
    if _is_plausible_plate_text(best_text) and best_ocr_conf >= threshold:
        plate_path = save_plate_crop(best_crop, vehicle_type, best_text,
                                     timestamp, event_tag)
        # A video demo has no trusted ground-truth label.  Keep the machine
        # result, but require a human reviewer before treating it as a plate.
        return best_text, best_ocr_conf, "READ_UNVERIFIED", plate_path

    plate_path = save_plate_crop(best_crop, vehicle_type, "UNREADABLE",
                                 timestamp, event_tag)
    return "UNREADABLE", best_ocr_conf, "LOW_CONFIDENCE", plate_path

# ======================================================================
# GHI VI PHẠM RA EXCEL (.xlsx) + CSV
# ======================================================================
class ViolationLogger:
    """
    Lưu vi phạm ra Excel (openpyxl) và CSV song song.
    Excel append từng dòng và save ngay để không mất dữ liệu nếu tắt đột ngột.
    """
    COLUMNS = [
        "Time", "Lane", "Vehicle type", "Plate", "Evidence image", "Clip",
        "Plate confidence", "Plate status", "Vehicle crop", "Plate crop",
        # Optional fields.  Normal red-light events leave these blank; the
        # isolated speed demonstration fills them and never claims a legal
        # enforcement result.
        "Event type", "Measurement status", "Speed km/h", "Speed limit km/h",
        "Distance m", "Elapsed s", "Source video time s",
        "Reviewed plate", "Review status",
    ]

    def __init__(self, xlsx_path, csv_path, overwrite_xlsx=False):
        self.xlsx_path = xlsx_path
        self.csv_path = csv_path
        self._openpyxl = None
        self._wb = None
        self._ws = None
        try:
            import openpyxl
            self._openpyxl = openpyxl
            if os.path.exists(xlsx_path) and not overwrite_xlsx:
                self._wb = openpyxl.load_workbook(xlsx_path)
                active = self._wb.active
                header = [cell.value for cell in active[1]] if active.max_row else []
                if not any(header):
                    self._ws = active
                    self._ws.title = "ViPham"
                    self._ws.append(self.COLUMNS)
                    self._wb.save(xlsx_path)
                elif header == self.COLUMNS:
                    self._ws = active
                else:
                    # Preserve prior user data with its old schema.  New OCR
                    # evidence goes to a clearly labelled compatible sheet.
                    sheet_name = "ViPham_OCR"
                    if (sheet_name in self._wb.sheetnames and
                            [cell.value for cell in self._wb[sheet_name][1]] == self.COLUMNS):
                        self._ws = self._wb[sheet_name]
                    else:
                        self._ws = self._wb.create_sheet(sheet_name)
                        self._ws.append(self.COLUMNS)
                        self._wb.save(xlsx_path)
            else:
                self._wb = openpyxl.Workbook()
                self._ws = self._wb.active
                self._ws.title = "ViPham"
                self._ws.append(self.COLUMNS)
                self._wb.save(xlsx_path)
            logger.info("Excel vi phạm: %s (sheet=%s)", xlsx_path, self._ws.title)
        except ImportError:
            logger.warning("Chưa cài openpyxl → chỉ ghi CSV. Cài: pip install openpyxl")

        # CSV song song
        self._csv_file = open(csv_path, "w", newline="", encoding="utf-8-sig")
        self._csv = csv.writer(self._csv_file)
        self._csv.writerow(self.COLUMNS)

    def log(self, timestamp, lane, vehicle_type, plate, image_path, clip_path="",
            plate_conf=0.0, plate_status="", vehicle_crop_path="", plate_crop_path="",
            event_type="", measurement_status="", speed_kmh="", speed_limit_kmh="",
            distance_m="", elapsed_s="", source_time_s="", reviewed_plate="",
            review_status=""):
        row = [timestamp, lane, vehicle_type, plate, image_path, clip_path,
               round(float(plate_conf), 3), plate_status,
               vehicle_crop_path, plate_crop_path,
               event_type, measurement_status, speed_kmh, speed_limit_kmh,
               distance_m, elapsed_s, source_time_s, reviewed_plate, review_status]
        self._csv.writerow(row)
        self._csv_file.flush()
        if self._ws is not None:
            try:
                self._ws.append(row)
                self._wb.save(self.xlsx_path)
            except Exception as e:
                logger.error("Ghi Excel lỗi: %s", e)
        return dict(zip(self.COLUMNS, row))

    def close(self):
        try:
            self._csv_file.close()
        except Exception:
            pass


# ======================================================================
# GHI TRẠNG THÁI LIVE CHO WEB DASHBOARD (logs/live_state.json)
# ======================================================================
_LIVE_STATE_PATH = os.path.join("logs", "live_state.json")

def write_live_state(lanes, jetson, fps, camera_running=True,
                     ai_enabled=True, ai_mode="detect"):
    """Ghi trạng thái đèn + số xe hiện tại ra JSON để web/server.py đọc.
    Ghi atomic (file tạm rồi replace) để web không đọc phải file dở."""
    lane_v = lanes[0]
    lane_h = lanes[1] if len(lanes) > 1 else None
    state = {
        "vertical":   lane_v.light,
        # Dù demo chỉ có camera dọc, dashboard vẫn phải hiện pha NGANG thật
        # do Jetson báo về, không được ngầm gán luôn là đỏ.
        "horizontal": (lane_h.light if lane_h else
                       (jetson.get_light("horizontal") if jetson.is_connected() else "unknown")),
        "t_v":        int(jetson.get_light_time("vertical")) if jetson.is_connected() else lane_v.light_time,
        "t_h":        int(jetson.get_light_time("horizontal")) if jetson.is_connected() else (lane_h.light_time if lane_h else 0),
        "count_v":    lane_v.control_count(),
        "count_h":    lane_h.control_count() if lane_h else 0,
        "violations": sum(l.violations for l in lanes),
        "fps":        round(float(fps), 1),
        "jetson_connected": jetson.is_connected(),
        "demo_red":  jetson.is_demo_red() if jetson.is_connected() else False,
        # Đèn thích ứng: thời gian xanh Jetson Nano tính theo số xe.
        "green_v":    int(jetson.get_green_time("vertical")) if jetson.is_connected() else 0,
        "green_h":    int(jetson.get_green_time("horizontal")) if jetson.is_connected() else 0,
        "camera_running": bool(camera_running),
        "ai_enabled": bool(ai_enabled),
        "ai_mode": str(ai_mode),
        "updated_at": time.time(),
    }
    try:
        tmp = _LIVE_STATE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, _LIVE_STATE_PATH)
    except OSError:
        pass  # không để lỗi ghi file làm chết vòng lặp video


# Ghi frame đã vẽ box nhận diện ra JPEG để web dashboard hiển thị như video
_LIVE_FRAME_PATH = os.path.join("logs", "live_frame.jpg")
_UPLOAD_AI_PAUSE_PATH = os.path.join("logs", "video_upload_job.active")

def write_live_frame(frame):
    try:
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
        if not ok:
            return
        tmp = _LIVE_FRAME_PATH + ".tmp"
        with open(tmp, "wb") as f:
            f.write(buf.tobytes())
        os.replace(tmp, _LIVE_FRAME_PATH)
    except Exception:
        pass  # không để lỗi ghi ảnh làm chết vòng lặp


# ======================================================================
# GHI CLIP VIDEO VI PHẠM (Feature #1)
# ======================================================================
class ClipRecorder:
    MAX_ACTIVE_CLIPS = 4
    """Ghi clip video ngắn quanh thời điểm vi phạm (pre-roll + post-roll).

    Mỗi vòng lặp feed() 1 frame đã vẽ box vào buffer vòng (pre-roll). Khi
    trigger() thì gom pre-roll rồi tiếp tục thu thêm post-roll frame, sau đó
    ghi ra .mp4 (H.264/avc1 để phát được trong trình duyệt) ở thread nền để
    không chặn vòng lặp chính.
    """

    def __init__(self, fps=15, pre_sec=2, post_sec=3, out_dir="violations"):
        self.fps = max(1, int(fps))
        self.pre = deque(maxlen=max(1, int(self.fps * pre_sec)))
        self.post_frames = max(1, int(self.fps * post_sec))
        self.out_dir = out_dir
        self._active = []
        self._writers = []

    @staticmethod
    def _find_ffmpeg_binary():
        """Find an FFmpeg executable even when this Python lacks imageio-ffmpeg."""
        candidates = []
        configured = os.environ.get("IMAGEIO_FFMPEG_EXE")
        if configured:
            candidates.append(configured)
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            candidates.append(system_ffmpeg)

        # On Windows a second installed Python may already contain the portable
        # imageio-ffmpeg executable.  It is a standalone binary and works for
        # any interpreter, including the lightweight Python used for a demo.
        appdata = os.environ.get("APPDATA", "")
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        for base in (appdata, local_appdata):
            if base:
                candidates.extend(glob.glob(os.path.join(
                    base, "Python", "Python*", "site-packages",
                    "imageio_ffmpeg", "binaries", "ffmpeg*")))

        for candidate in candidates:
            if candidate and os.path.isfile(candidate):
                return candidate
        return None

    def _write_with_ffmpeg_binary(self, path, temp_path, frames, w, h):
        """Write a browser-compatible H.264 MP4 through a standalone FFmpeg."""
        ffmpeg = self._find_ffmpeg_binary()
        if not ffmpeg:
            return False
        process = None
        try:
            command = [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                "-f", "rawvideo", "-pix_fmt", "bgr24",
                "-s", f"{w}x{h}", "-r", str(self.fps), "-i", "-",
                "-an", "-c:v", "libx264", "-preset", "veryfast",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", temp_path,
            ]
            process = subprocess.Popen(command, stdin=subprocess.PIPE,
                                       stdout=subprocess.DEVNULL,
                                       stderr=subprocess.PIPE)
            for frame in frames:
                process.stdin.write(frame.tobytes())
            process.stdin.close()
            stderr = process.stderr.read().decode("utf-8", errors="replace").strip()
            if process.wait() != 0:
                raise OSError(stderr or "FFmpeg exited unsuccessfully")
            if not os.path.isfile(temp_path) or os.path.getsize(temp_path) == 0:
                raise OSError("FFmpeg did not create a clip")
            os.replace(temp_path, path)
            logger.info("Lưu clip vi phạm: %s (%d frame, codec=h264/ffmpeg)",
                        path, len(frames))
            return True
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            logger.warning("Standalone FFmpeg failed (%s); thử OpenCV.", exc)
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except OSError:
                pass
            return False
        finally:
            if process is not None and process.poll() is None:
                try:
                    process.kill()
                except OSError:
                    pass

    def feed(self, frame):
        if frame is None:
            return
        self.pre.append(frame)
        ready = []
        for act in self._active:
            act["frames"].append(frame)
            act["left"] -= 1
            if act["left"] <= 0:
                ready.append(act)
        if ready:
            self._active = [act for act in self._active if act not in ready]
            for act in ready:
                self._start_writer(act)

    def trigger(self, clip_path):
        if len(self._active) >= self.MAX_ACTIVE_CLIPS:
            logger.warning("Bỏ clip %s: đã có %d clip đang thu", clip_path, len(self._active))
            return  # đang ghi clip khác → bỏ qua để không chồng
        self._active.append({"frames": list(self.pre),
                             "left": self.post_frames, "path": clip_path})
        return True

    def _flush(self):
        acts, self._active = self._active, []
        for act in acts:
            self._start_writer(act)

    def _start_writer(self, act):
        if not act or not act["frames"]:
            return
        writer = threading.Thread(target=self._write,
                                  args=(act["path"], act["frames"]),
                                  daemon=True)
        self._writers.append(writer)
        writer.start()

    def close(self):
        """Ghi phần clip còn dở và chờ writer xong trước khi thoát."""
        self._flush()
        for writer in self._writers:
            writer.join(timeout=15)

    def _write(self, path, frames):
        temp_path = path + ".part.mp4"
        try:
            h, w = frames[0].shape[:2]
            normalized = []
            for fr in frames:
                if fr.shape[:2] != (h, w):
                    fr = cv2.resize(fr, (w, h))
                normalized.append(np.ascontiguousarray(fr))

            # imageio-ffmpeg mang theo libx264 trên Windows. Ghi thẳng H.264,
            # yuv420p và faststart để Chrome/Edge đọc ngay metadata/thời lượng.
            # Ghi vào file tạm rồi atomic replace: dashboard sẽ không bao giờ
            # nhìn thấy MP4 đang dở (chưa có moov atom nên thường hiện 0:00).
            try:
                import imageio_ffmpeg
                ffwriter = imageio_ffmpeg.write_frames(
                    temp_path, (w, h), pix_fmt_in="bgr24", pix_fmt_out="yuv420p",
                    fps=self.fps, quality=6, codec="libx264", macro_block_size=1,
                    ffmpeg_log_level="error",
                    output_params=["-preset", "veryfast", "-movflags", "+faststart"],
                )
                ffwriter.send(None)
                for fr in normalized:
                    ffwriter.send(fr.tobytes())
                ffwriter.close()
                if not os.path.isfile(temp_path) or os.path.getsize(temp_path) == 0:
                    raise OSError("ffmpeg không tạo được clip")
                os.replace(temp_path, path)
                logger.info("Lưu clip vi phạm: %s (%d frame, codec=h264/libx264)",
                            path, len(normalized))
                return
            except (ImportError, OSError, RuntimeError, ValueError) as exc:
                logger.warning("Không dùng được imageio-ffmpeg (%s); thử FFmpeg/OpenCV.", exc)
                try:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except OSError:
                    pass

            if self._write_with_ffmpeg_binary(path, temp_path, normalized, w, h):
                return

            # Fallback cho máy chưa cài imageio-ffmpeg: ưu tiên avc1/H.264,
            # chỉ dùng mp4v nếu encoder H.264 thật sự không mở được.
            codecs = ("avc1", "mp4v")
            vw = None
            used_codec = None
            for codec in codecs:
                candidate = cv2.VideoWriter(temp_path, cv2.VideoWriter_fourcc(*codec),
                                            self.fps, (w, h))
                if candidate.isOpened():
                    vw = candidate
                    used_codec = codec
                    break
                candidate.release()
            if vw is None:
                logger.error("Không mở được VideoWriter cho clip: %s", path)
                return
            for fr in normalized:
                vw.write(fr)
            vw.release()
            os.replace(temp_path, path)
            logger.info("Lưu clip vi phạm: %s (%d frame, codec=%s)",
                        path, len(normalized), used_codec)
        except Exception as e:
            logger.error("Ghi clip lỗi: %s", e)
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except OSError:
                pass

# ======================================================================
# MAIN
# ======================================================================
def _to_source(s):
    """Chuyển '0' -> 0 (webcam index), giữ URL/đường dẫn video nguyên dạng."""
    try:
        return int(s)
    except (ValueError, TypeError):
        return s


def resolve_vehicle_classes(model, spec):
    """
    Xác định danh sách class-id xe cần giữ, trả None = giữ tất cả.
    spec: 'auto' | 'all' | '2,3,5,7'
    'auto': nếu model có class COCO (car/motorcycle/bus/truck) thì lọc đúng chúng;
            model tự train (cars/motorbike) thì giữ tất cả.
    """
    names = model.names  # {id: name}
    if spec == "all":
        return None
    if spec != "auto":
        try:
            return [int(x) for x in spec.split(",") if x.strip() != ""]
        except ValueError:
            logger.warning("--vehicle-classes không hợp lệ (%s) → giữ tất cả", spec)
            return None
    # auto
    wanted = {"car", "motorcycle", "bus", "truck"}
    ids = [i for i, n in names.items() if str(n).lower() in wanted]
    if ids:
        logger.info("Lọc class xe (COCO): %s", {i: names[i] for i in ids})
        return ids
    logger.info("Model xe tự train (%s) → giữ tất cả class", names)
    return None


def warmup_vehicle_tracker(models, lane, args):
    """Làm nóng YOLO trước khi bắt đầu đồng hồ demo hoặc all-red.

    Lần inference đầu của PyTorch trên Windows có thể chậm bất thường. Nếu để nó
    nằm trong pha all-red thì video chưa kịp tới vạch dừng; warm-up ở đây giúp
    thời lượng demo chỉ tính cho luồng nhận diện thật.
    """
    # peek() không tiêu thụ frame đầu của file video. Nếu dùng read() ở đây,
    # camera nền có thể nhảy sang frame khác trong lúc warm-up và tracker thật
    # sẽ mất một phần quỹ đạo ngay từ đầu.
    deadline = time.monotonic() + 5.0
    frame = lane.cam.peek()
    while frame is None and time.monotonic() < deadline:
        time.sleep(0.05)
        frame = lane.cam.peek()
    if frame is None:
        logger.warning("Không có frame để warm-up YOLO; tiếp tục chạy bình thường.")
        return
    # Chỉ warm-up detector, tuyệt đối không gọi .track(): ByteTrack chỉ được
    # khởi tạo trong luồng thật để ID và lịch sử không bị nhiễu.
    kw = dict(conf=args.conf, imgsz=args.imgsz, device=args.device, verbose=False)
    if vehicle_classes_holder[0] is not None:
        kw["classes"] = vehicle_classes_holder[0]
    try:
        logger.info("Đang warm-up AI trước khi bắt đầu demo...")
        models["vehicle"](frame, **kw)
        logger.info("Warm-up AI hoàn tất.")
    except Exception as exc:
        logger.warning("Warm-up AI lỗi (%s); vẫn tiếp tục xử lý video.", exc)


class Lane:
    """
    Một tuyến giao thông = 1 camera + detector vi phạm + counter đếm xe.
    axis: 'vertical' (dọc) hoặc 'horizontal' (ngang) – dùng để hỏi đèn từ Jetson.
    """
    def __init__(self, name, axis, source, args):
        self.name = name
        self.axis = axis
        self.args = args
        self.cam = CameraManager(source=_to_source(source),
                                 width=args.width, height=args.height,
                                 loop_video=args.video_loop,
                                 video_fps=args.video_fps,
                                 video_stride=args.video_stride)
        self.fh = self.fw = 0
        self.stop_line_y = 0
        self.count_line_y = 0
        self.detector = None
        self.counter  = None
        self.visible_count = 0
        self.visible_peak = 0
        self.violations = 0
        self.light = "unknown"
        self.light_time = 0
        self.clip = None  # ClipRecorder (Feature #1) – tạo trong start_and_probe

    def start_and_probe(self):
        self.cam.start()
        deadline = time.time() + 15
        f = None
        while f is None and time.time() < deadline:
            # Probe không được tiêu thụ frame đầu của file video; read() sẽ làm
            # producer phát frame tiếp theo và phá tính tuần tự của demo.
            f = self.cam.peek()
            if f is not None:
                break
            time.sleep(0.2)
        if f is None:
            return False
        self.fh, self.fw = f.shape[:2]
        a = self.args
        if self.axis == "vertical":
            self.stop_line_y  = a.stop_line_v  or int(self.fh * 0.65)
            self.count_line_y = a.count_line_v or self.stop_line_y
        else:
            self.stop_line_y  = a.stop_line_h  or int(self.fh * 0.65)
            self.count_line_y = a.count_line_h or self.stop_line_y
        # File video có thể chạy chậm theo tốc độ inference. Giữ lịch sử lâu
        # hơn trong riêng chế độ đó; webcam/RTSP vẫn dùng TTL 3 giây an toàn.
        video_idle_sec = (max(180.0, float(a.max_runtime) + 15.0)
                          if self.cam.is_video_file() else None)
        self.detector = ViolationDetector(stop_line_y=self.stop_line_y,
                                          confirm_frames=max(1, a.violation_confirm_frames),
                                          direction=a.direction,
                                          max_idle_sec=video_idle_sec)
        self.counter = VehicleCounter(count_line_y=self.count_line_y,
                                      max_idle_sec=video_idle_sec)
        # Với file video lấy thưa (--video-stride), FPS của clip phải phản ánh
        # đúng thời gian nguồn. Nếu vẫn ghi 30 FPS sau khi lấy mỗi 15 frame thì
        # 2+3 giây pre/post-roll sẽ thành hàng chục giây nguồn và clip quá ngắn.
        if self.cam.is_video_file() and not a.preview_only:
            source_fps = a.video_fps if a.video_fps and a.video_fps > 0 else self.cam.get_fps()
            recorder_fps = max(1, round(float(source_fps or 15) / max(1, a.video_stride)))
        elif not a.preview_only:
            recorder_fps = 15
        else:
            recorder_fps = 0
        self.clip = (None if a.preview_only
                     else ClipRecorder(fps=recorder_fps, pre_sec=2, post_sec=3))
        logger.info("Tuyến %s: %dx%d | stop_line=%d | count_line=%d",
                    self.name, self.fw, self.fh, self.stop_line_y, self.count_line_y)
        return True

    def stop(self):
        if self.clip is not None:
            self.clip.close()
        self.cam.stop()

    def control_count(self):
        """Số xe gửi cho Jetson theo chế độ đã chọn."""
        if self.args.count_mode == "visible":
            if self.args.offline or self.args.preview_only:
                return self.visible_count
            return self.visible_peak
        return self.counter.count()

    def reset_control_count(self):
        if self.args.count_mode == "visible":
            # Giữ số xe đang có trong khung làm mốc của chu kỳ kế tiếp.
            self.visible_peak = self.visible_count
        else:
            self.counter.reset()


def process_lane(lane, frame, models, ocr, plate_cache, args, jetson, vlog,
                 evidence_sync, telegram=None, mobile_app=None):
    """
    Xử lý 1 frame của 1 tuyến: track xe → đếm → OCR biển → kiểm vi phạm → vẽ.
    Trả về frame đã annotate. Cập nhật lane.light, lane.violations, lane.counter.
    """
    fh = lane.fh

    # Lấy đèn của trục này từ Jetson Nano (hoặc ép đỏ khi test)
    if args.force_red:
        lane.light = "red"
    elif jetson.is_connected():
        lane.light = jetson.get_light(lane.axis)
        lane.light_time = jetson.get_light_time(lane.axis)
    else:
        lane.light = "unknown"

    # --- Track phương tiện ---
    # Chế độ preview chỉ cần số xe đang nhìn thấy, không cần ID bền vững giữa các
    # frame. Dùng predict() để tránh chi phí ByteTrack trên CPU; nhánh phát hiện
    # vi phạm thật vẫn luôn dùng track() và giữ nguyên quỹ đạo/ID.
    fast_visible_preview = args.count_only and args.count_mode == "visible"
    infer_kw = dict(conf=args.conf, imgsz=args.imgsz,
                    device=args.device, verbose=False)
    if vehicle_classes_holder[0] is not None:
        infer_kw["classes"] = vehicle_classes_holder[0]
    if fast_visible_preview:
        results = models["vehicle"].predict(frame, **infer_kw)
    else:
        results = models["vehicle"].track(
            frame, persist=True, tracker="bytetrack.yaml", **infer_kw)

    active_ids = set()
    vehicles = []
    next_preview_id = 1
    for result in results:
        for box in result.boxes:
            if float(box.conf) < args.conf:
                continue
            if fast_visible_preview:
                # ID chỉ dùng để gắn nhãn trực quan trong frame hiện tại.
                tid = next_preview_id
                next_preview_id += 1
            else:
                if box.id is None:
                    continue
                tid = int(box.id)
            label = result.names[int(box.cls)]
            active_ids.add(tid)
            vehicles.append((tid, label, list(map(int, box.xyxy[0].tolist()))))

    lane.visible_count = len(vehicles)
    lane.visible_peak = max(lane.visible_peak, lane.visible_count)

    if fast_visible_preview:
        # Không chạy detector vượt đèn, counter theo quỹ đạo hay OCR trong preview.
        # Vẫn vẽ box và UI để dashboard có hình nhận diện chuyển động mượt hơn.
        for tid, label, coords in vehicles:
            draw_vehicle(frame, coords, tid, label, False, "Unknown")
        draw_ui(frame, lane.stop_line_y, lane.count_line_y, lane.light,
                lane.light_time, lane.name, lane.control_count(), lane.violations,
                current_fps_holder[0], jetson.is_connected())
        return frame

    plate_cache.cleanup(active_ids)
    lane.detector.cleanup()
    lane.counter.cleanup(active_ids)

    # --- Đếm xe qua vạch đếm ---
    for tid, label, coords in vehicles:
        lane.counter.update(tid, coords)

    # --- OCR biển số (chỉ xe gần vạch dừng) ---
    # Demo count-only không cần OCR, bỏ qua để tracker theo kịp video.
    if (args.ocr_near_line and not args.count_only and not args.skip_ocr
            and models["plate"] is not None and ocr is not None):
        for tid, label, coords in vehicles:
            x1, y1, x2, y2 = coords
            if abs(y2 - lane.stop_line_y) > 200:
                continue
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            plate_results = models["plate"](crop, conf=0.4, imgsz=args.imgsz,
                                            device=args.device, verbose=False)
            for pr in plate_results:
                for pb in pr.boxes:
                    if float(pb.conf) < 0.4:
                        continue
                    px1, py1, px2, py2 = map(int, pb.xyxy[0].tolist())
                    plate_crop = crop[py1:py2, px1:px2]
                    if plate_crop.size == 0:
                        continue
                    ptext, pconf = ocr.recognize(plate_crop)
                    plate_cache.update(tid, ptext, pconf, args.plate_min_confidence)
                    cv2.rectangle(frame, (x1+px1, y1+py1), (x1+px2, y1+py2), (255, 200, 0), 2)
                    cv2.putText(frame, ptext, (x1+px1, y1+py1-6),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 0), 2)

    # --- Kiểm tra vi phạm + vẽ xe ---
    for tid, label, coords in vehicles:
        plate_text = plate_cache.get(tid)
        # Chế độ test video/phần cứng: vẫn đếm xe để Jetson điều tiết đèn,
        # nhưng tuyệt đối không tạo vi phạm hay kích còi/relay.
        violated = False if args.count_only else lane.detector.has_violated(tid)
        viol_info = None if args.count_only else lane.detector.update(
            tid, coords, label, lane.light)
        if viol_info is not None:
            lane.violations += 1
            ts = viol_info["timestamp"]
            event_tag = f"{lane.name}_E{lane.violations}_ID{tid}"
            cached_plate, cached_conf = plate_cache.get_with_confidence(tid)
            event_plate, event_conf, plate_status, plate_crop_path = \
                recognize_plate_for_evidence(frame, coords, models, ocr, args,
                                             label, ts, event_tag)
            if plate_status in ("READ", "READ_UNVERIFIED"):
                best_plate, plate_conf = event_plate, event_conf
            elif (cached_plate != "Unknown"
                  and cached_conf >= args.plate_min_confidence):
                best_plate, plate_conf = cached_plate, cached_conf
                # This text came from another frame, so never attach the
                # current-frame plate crop as evidence for it.
                plate_status = "READ_CACHED_UNVERIFIED"
                plate_crop_path = ""
            elif args.evidence_only and args.skip_ocr:
                best_plate, plate_conf = "DEMO_UNKNOWN", 0.0
            else:
                best_plate, plate_conf = "UNREADABLE", event_conf
            plate_cache.update(tid, best_plate, plate_conf, args.plate_min_confidence)
            plate_text = best_plate
            event_name = "MÔ PHỎNG VI PHẠM" if args.evidence_only else "VI PHẠM"
            logger.warning("🚨 %s [%s] #%d | %s | Biển: %s | %s",
                           event_name, lane.name, lane.violations, label, best_plate, ts)
            img_path, vehicle_crop_path = save_violation_image(
                frame, coords, best_plate, label, ts,
                stop_line_y=lane.stop_line_y,
                simulation=args.evidence_only,
                event_tag=event_tag)
            # Clip video vi phạm (pre-roll đã có sẵn trong buffer + post-roll)
            clip_path = ""
            if lane.clip is not None:
                safe_plate = re.sub(r'[^A-Z0-9_]', '', best_plate.upper()) or "UNKNOWN"
                candidate_clip = f"violations/clip_{label}_{safe_plate}_{ts}_{event_tag}.mp4"
                if lane.clip.trigger(candidate_clip):
                    clip_path = candidate_clip
            row = vlog.log(ts, lane.name, label, best_plate, img_path, clip_path,
                           plate_conf=plate_conf, plate_status=plate_status,
                           vehicle_crop_path=vehicle_crop_path,
                           plate_crop_path=plate_crop_path)
            # Enqueue only after CSV/XLSX have been flushed.  The final MP4 may
            # appear a few seconds later; EvidenceQueue waits for the atomic
            # ClipRecorder rename and survives network loss/restarts.
            if evidence_sync is not None:
                evidence_sync.enqueue(
                    f"redlight_{ts}_{event_tag}",
                    [img_path, vehicle_crop_path, plate_crop_path, clip_path,
                     vlog.csv_path, vlog.xlsx_path],
                    metadata=row,
                )
            if jetson.is_connected() and not args.evidence_only:
                jetson.send_violation(best_plate, label, ts)
            elif args.evidence_only:
                logger.info("Evidence-only: không kích còi/relay cho vi phạm demo.")
            if mobile_app is not None:
                mobile_app.publish(
                    event_id=f"redlight_{ts}_{event_tag}",
                    timestamp=ts, lane=lane.name, vehicle_type=label,
                    plate=best_plate, plate_confidence=plate_conf,
                    plate_status=plate_status, scene_path=img_path,
                    vehicle_crop_path=vehicle_crop_path,
                    plate_crop_path=plate_crop_path, clip_path=clip_path,
                )
            if telegram is not None and not args.evidence_only:
                telegram.send_violation(
                    best_plate, label, lane.name, ts, img_path,
                    plate_crop_path=plate_crop_path,
                    plate_confidence=plate_conf, plate_status=plate_status,
                )
            violated = True
        draw_vehicle(frame, coords, tid, label, violated, plate_text)

    draw_ui(frame, lane.stop_line_y, lane.count_line_y, lane.light, lane.light_time,
            lane.name, lane.control_count(), lane.violations, current_fps_holder[0],
            jetson.is_connected())
    return frame


# Biến dùng chung giữa vòng lặp và process_lane (đơn giản, 1 luồng)
current_fps_holder = [0.0]
vehicle_classes_holder = [None]   # danh sách class-id xe cần lọc (None = tất cả)


def main():
    args = parse_args()

    if args.device == "cpu":
        # Với máy demo 4 luồng, để PyTorch chiếm hết luồng làm YOLO/ByteTrack
        # chậm rõ rệt. Mặc định 2 luồng; máy khác có thể chủ động ghi đè CLI.
        torch.set_num_threads(args.torch_threads)
        logger.info("PyTorch CPU threads: %d", args.torch_threads)

    if args.preview_only:
        # A dashboard preview must start quickly and keep the source FPS. Detection
        # demos still use the normal path below; preview intentionally loads no AI.
        models = {"vehicle": None, "plate": None, "ocr": None}
        vehicle_classes_holder[0] = None
        logger.info("Preview-only: AI, Jetson control and alerts are disabled.")
    else:
        models = load_models(args)
        vehicle_classes_holder[0] = resolve_vehicle_classes(
            models["vehicle"], args.vehicle_classes)

    if args.skip_ocr or args.count_only:
        ocr = None
    elif args.ocr_engine == "yolo" and models.get("ocr") is not None:
        ocr = PlateOCRYolo(models["ocr"], device=args.device)
        logger.info("OCR engine: YOLO (license_plate_ocr.pt)")
    else:
        ocr = LicensePlateOCR(gpu=(args.device != "cpu"))
        logger.info("OCR engine: EasyOCR (fallback)")

    plate_cache = PlateCache()

    # Jetson Nano là bộ điều khiển đèn chính.
    jetson = JetsonComm(host=args.jetson,
                        port=args.jetson_port,
                        enabled=not args.offline)
    jetson.start()

    # Cảnh báo Telegram khi có vi phạm (task #4). Tự tắt nếu chưa cấu hình.
    # Evidence/preview modes must be externally inert.  Do not even construct
    # the notifier in those modes, so a future call site cannot send by mistake.
    telegram = None if (args.preview_only or args.evidence_only) else TelegramNotifier()

    # --- Tạo các tuyến (camera dọc bắt buộc, camera ngang tùy chọn) ---
    lanes = []
    lane_v = Lane("DOC", "vertical", args.camera_v, args)
    if not lane_v.start_and_probe():
        logger.error("Không nhận được frame từ camera DỌC (--camera-v). Kiểm tra camera.")
        lane_v.stop(); jetson.stop()
        return
    lanes.append(lane_v)

    if args.camera_h is not None:
        lane_h = Lane("NGANG", "horizontal", args.camera_h, args)
        if lane_h.start_and_probe():
            lanes.append(lane_h)
        else:
            logger.warning("Không mở được camera NGANG (--camera-h). Chạy 1 tuyến.")
    else:
        logger.info("Chỉ 1 camera (DỌC). Tuyến ngang coi như 0 xe. Cắm --camera-h để đủ 2 tuyến.")

    # Xong bước này mới bắt đầu đồng hồ --max-runtime và mới yêu cầu all-red.
    if not args.preview_only:
        warmup_vehicle_tracker(models, lanes[0], args)

    # Logger vi phạm (Excel + CSV)
    csv_path = f"logs/violations_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    vlog = (None if args.preview_only else
            ViolationLogger(args.xlsx, csv_path, overwrite_xlsx=args.fresh_xlsx))
    evidence_sync = (None if args.preview_only else create_sync_service(
        config_path=args.sync_config,
        queue_path=args.sync_queue,
        logger=logger,
    ))
    # Only live, non-demo events are shared with the app.  The store itself
    # releases a record to a CCCD only when a verified administrator mapping
    # exists in plate_owner_registry.json.
    mobile_app = None if (args.preview_only or args.evidence_only) else create_mobile_app_store(
        events_path=args.mobile_events_path,
        owner_registry_path=args.plate_owner_registry,
    )

    # Biến chu kỳ đếm
    frame_count = 0
    fps_counter = 0
    fps_start   = time.time()
    current_fps = 0.0
    last_count_sent = time.time()
    last_live_state = 0.0
    lane_idx = 0  # xen kẽ xử lý các tuyến để giảm tải CPU
    demo_red_pending = max(0, int(args.demo_red_seconds))

    logger.info("Hệ thống bắt đầu. Nhấn 'q' thoát, 's' chụp màn hình.")
    logger.info("Jetson Nano controller: %s | %s:%d | Số tuyến: %d",
                "OFFLINE (test)" if args.offline else "BẬT",
                args.jetson, args.jetson_port, len(lanes))
    logger.info("Nguồn COUNT: %s", args.count_mode)
    run_started = time.monotonic()

    try:
        while True:
            if args.max_runtime > 0 and time.monotonic() - run_started >= args.max_runtime:
                logger.info("Đã chạy đủ --max-runtime=%.1fs; dừng demo sạch.", args.max_runtime)
                break
            # The dashboard's upload laboratory runs a second YOLO worker.  On
            # CPU/Nano, temporarily yield inference resources without killing
            # this fixed traffic/Jetson process.  The last counts remain safe;
            # once the atomic flag disappears this loop resumes automatically.
            if os.path.isfile(_UPLOAD_AI_PAUSE_PATH):
                if time.monotonic() - last_live_state >= 0.5:
                    camera_active = any(ln.cam.is_connected() for ln in lanes)
                    write_live_state(lanes, jetson, 0.0,
                                     camera_running=camera_active,
                                     ai_enabled=False,
                                     ai_mode="paused-for-upload")
                    last_live_state = time.monotonic()
                time.sleep(0.12)
                continue
            frame_count += 1
            elapsed = time.time() - fps_start
            if elapsed >= 1.0:
                current_fps = fps_counter / elapsed
                current_fps_holder[0] = current_fps
                fps_counter = 0
                fps_start = time.time()

            # Chỉ gửi một lần sau khi TCP tới Jetson đã sẵn sàng. Jetson giữ
            # all-red rồi tự quay lại chu kỳ thường, nên đây là demo an toàn.
            if demo_red_pending and jetson.is_connected():
                if (jetson.start_demo_red(demo_red_pending)
                        and jetson.wait_for_demo_red(timeout=5.0)):
                    logger.warning("DEMO VIDEO: Jetson giữ all-red %ss", demo_red_pending)
                    demo_red_pending = 0
                else:
                    logger.error("Dừng demo: Jetson chưa xác nhận all-red; không ghi bằng chứng.")
                    break

            # Gửi số xe đếm được cho Jetson Nano mỗi count_interval giây.
            if jetson.is_connected() and time.time() - last_count_sent >= args.count_interval:
                cnt_v = lanes[0].control_count()
                cnt_h = lanes[1].control_count() if len(lanes) > 1 else 0
                jetson.send_count(cnt_v, cnt_h)
                for ln in lanes:
                    ln.reset_control_count()
                last_count_sent = time.time()

            # Xen kẽ: mỗi vòng chỉ xử lý NẶNG 1 tuyến (giảm tải CPU), nhưng vẫn hiển thị tất cả
            do_heavy = (frame_count % args.frame_skip == 0)

            for i, lane in enumerate(lanes):
                # Với file video, chỉ tiêu thụ frame khi chính tuyến đó được xử
                # lý. CameraManager giữ frame chờ consumer, nhờ vậy không mất
                # quỹ đạo vì --frame-skip/lane xen kẽ. Muốn lấy thưa hơn thì dùng
                # --video-stride (rõ ràng và có chủ đích) thay vì bỏ frame ngầm.
                selected_lane = (i == lane_idx or len(lanes) == 1)
                is_video_file = lane.cam.is_video_file()
                should_process = (selected_lane and not args.preview_only
                                  and (do_heavy or is_video_file))
                # File video vẫn phải được tiêu thụ ở preview-only; nếu dựa vào
                # should_process thì frame đầu tiên sẽ bị giữ mãi trong buffer.
                if is_video_file and not selected_lane:
                    continue
                frame = lane.cam.read()
                if frame is None:
                    continue
                fps_counter += 1
                if should_process:
                    frame = process_lane(lane, frame, models, ocr, plate_cache,
                                         args, jetson, vlog, evidence_sync, telegram, mobile_app)
                else:
                    # frame nhẹ: chỉ vẽ UI với trạng thái gần nhất
                    if args.force_red:
                        lane.light = "red"
                    elif jetson.is_connected():
                        lane.light = jetson.get_light(lane.axis)
                        lane.light_time = jetson.get_light_time(lane.axis)
                    draw_ui(frame, lane.stop_line_y, lane.count_line_y, lane.light,
                            lane.light_time, lane.name, lane.control_count(),
                            lane.violations, current_fps, jetson.is_connected())
                    if args.preview_only:
                        cv2.putText(frame, "VIDEO PREVIEW | HARDWARE SAFE",
                                    (12, frame.shape[0] - 14),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                                    (0, 255, 255), 2)
                if lane.clip is not None:
                    lane.clip.feed(frame.copy())
                if i == 0:
                    write_live_frame(frame)
                if not args.no_display:
                    try:
                        cv2.imshow(f"Tuyen {lane.name}", frame)
                    except cv2.error:
                        logger.warning("OpenCV không hỗ trợ cửa sổ GUI (headless); tự động chuyển sang --no-display.")
                        args.no_display = True

            if (do_heavy or args.preview_only) and len(lanes) > 1:
                lane_idx = (lane_idx + 1) % len(lanes)

            if (not args.video_loop and lanes
                    and all(ln.cam.is_video_file() and not ln.cam.is_connected()
                            for ln in lanes)):
                logger.info("All local video sources ended; stopping cleanly.")
                break

            # Ghi trạng thái live theo thời gian thực thay vì số vòng lặp. Khi
            # AI đang inference, vòng lặp file video có thể chạy thưa hoặc rất
            # nhanh; điều này vẫn giữ dashboard ổn định và không ghi đĩa dồn dập.
            if time.monotonic() - last_live_state >= 0.5:
                camera_active = any(ln.cam.is_connected() for ln in lanes)
                write_live_state(lanes, jetson, current_fps,
                                 camera_running=camera_active,
                                 ai_enabled=not args.preview_only,
                                 ai_mode=("preview" if args.preview_only else
                                          "detect-count" if args.count_only else
                                          "detect-ocr"))
                last_live_state = time.monotonic()

            if not args.no_display:
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('s'):
                    ts_s = datetime.now().strftime("%Y%m%d_%H%M%S")
                    for lane in lanes:
                        f = lane.cam.read()
                        if f is not None:
                            cv2.imwrite(f"logs/screenshot_{lane.name}_{ts_s}.jpg", f)
                    logger.info("Đã chụp màn hình các tuyến.")
            else:
                time.sleep(0.01)

    except KeyboardInterrupt:
        logger.info("Người dùng dừng chương trình.")
    finally:
        logger.info("Đang dọn dẹp tài nguyên...")
        total = sum(l.violations for l in lanes)
        for lane in lanes:
            lane.stop()
        jetson.stop()
        # Không để dashboard giữ snapshot "đang kết nối/all-red" sau khi tiến
        # trình đã thoát. Lượt chạy sau sẽ ghi trạng thái live mới ngay khi có
        # frame, còn lúc nhàn rỗi thì phản ánh đúng là không còn controller AI.
        for lane in lanes:
            lane.light = "unknown"
            lane.light_time = 0
        write_live_state(lanes, jetson, 0.0, camera_running=False,
                         ai_enabled=False, ai_mode="stopped")
        if vlog is not None:
            vlog.close()
        if evidence_sync is not None:
            sync_result = evidence_sync.close(args.sync_flush_timeout)
            logger.info("Evidence sync queue: %s | events=%s | states=%s",
                        evidence_sync.queue.path,
                        sync_result.get("events_total", 0),
                        sync_result.get("event_statuses", {}))
        if not args.no_display:
            try:
                cv2.destroyAllWindows()
            except cv2.error:
                pass
        logger.info("Tổng vi phạm ghi nhận: %d", total)
        if vlog is not None:
            if vlog._ws is not None:
                logger.info("Excel: %s | CSV: %s", args.xlsx, csv_path)
            else:
                logger.info("CSV: %s (Excel unavailable in this Python)", csv_path)
        else:
            logger.info("Preview-only: violation Excel/CSV disabled.")


if __name__ == "__main__":
    main()
