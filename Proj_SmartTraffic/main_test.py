import cv2
from ultralytics import YOLO
import numpy as np
import pytesseract
import easyocr
import re
from datetime import datetime
from collections import defaultdict
import os
import torch
import csv

# ------------------ FORCE CPU ------------------
torch.cuda.is_available = lambda : False

# ------------------ FOLDER SETUP ------------------
DEBUG_DIR = 'debug_plates'
VIOLATION_DIR = 'violations'
PLATE_SAVE = 'plates_cropped'
OUTPUT_VIDEO = 'output.mp4'

os.makedirs(DEBUG_DIR, exist_ok=True)
os.makedirs(VIOLATION_DIR, exist_ok=True)
os.makedirs(PLATE_SAVE, exist_ok=True)

# ------------------ TESSERACT ------------------
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ------------------ OCR BACKUP ------------------
reader = easyocr.Reader(['en', 'vi'], gpu=False)

# ------------------ LOAD MODELS ------------------
vehicle_model = YOLO('yolo26m.pt').to('cpu')
plate_model = YOLO('models/license_plate/license_plate_detection.pt').to('cpu')
traffic_light_model = YOLO('models/traffic_light/traffic_light.pt').to('cpu')

# ------------------ VIDEO SETUP ------------------
cap = cv2.VideoCapture('3.mp4')
frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = int(cap.get(cv2.CAP_PROP_FPS)) or 20
out = cv2.VideoWriter(OUTPUT_VIDEO, cv2.VideoWriter_fourcc(*'mp4v'), fps, (frame_width, frame_height))

STOP_LINE_Y = 450
FRAME_SKIP = 5
frame_count = 0
vehicle_tracks = defaultdict(list)

# ------------------ CSV ------------------
import os
# ------------------ CSV ------------------
os.makedirs("logs", exist_ok=True)

csv_path = "logs/all_vehicles.csv"

# Mở file và gán vào csv_file
csv_file = open(csv_path, mode='w', newline='', encoding='utf-8')

# Tạo writer
csv_writer = csv.writer(csv_file)

# Ghi header
csv_writer.writerow(["Timestamp", "Vehicle", "License Plate", "Violation", "Plate Image"])


# MỞ FILE ĐÚNG CÁCH
csv_file = open(csv_path, mode='w', newline='', encoding='utf-8')

csv_writer = csv.writer(csv_file)
csv_writer.writerow(["Timestamp", "Vehicle", "License Plate", "Violation", "Plate Image"])


csv_writer = csv.writer(csv_file)
csv_writer.writerow(["Timestamp", "Vehicle", "License Plate", "Violation", "Plate Image"])

# ------------------ UTILS ------------------
def get_center(box):
    x1, y1, x2, y2 = box
    return (x1+x2)//2, (y1+y2)//2

def is_red_light_violation(box, light, track):
    if light != "red":
        return False
    if len(track) < 2:
        return False
    cx, cy = get_center(box)
    prev_cy = track[-1][1]
    was_below = any(p[1] > STOP_LINE_Y for p in track[:-1])
    now_above = cy < STOP_LINE_Y
    moving_up = prev_cy > cy
    return was_below and now_above and moving_up

plate_patterns = [
    r'^\d{2}[A-Z]\d{4,5}$',
    r'^\d{2}[A-Z]-\d{4,5}$',
    r'^\d{2}[A-Z]\s\d{4,5}$',
    r'^\d{2}\s[A-Z]\s\d{4,5}$',
    r'^\d{2}-[A-Z]-\d{4,5}$'
]

def is_valid_plate(text):
    cleaned = re.sub(r'[^A-Z0-9]', '', text.upper())
    for p in plate_patterns:
        if re.match(p, cleaned):
            return True
    if re.match(r'.*\d+.*[A-Z]+.*\d+.*', cleaned) and 5 <= len(cleaned) <= 10:
        return True
    return False

def format_plate(text):
    return re.sub(r'[^A-Z0-9]', '', text)

def ocr_license_plate(img, fcount):
    if img is None or img.size == 0:
        return "Unknown"

    img = cv2.resize(img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.convertScaleAbs(gray, alpha=2.0, beta=-20)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    results = []

    # pytesseract
    text = pytesseract.image_to_string(thresh,
            config="--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    text = re.sub(r'[^A-Z0-9]', '', text.upper())
    if len(text) >= 5:
        results.append((text, 0.9))

    # easyocr
    ocrs = reader.readtext(thresh)
    for (_, t, conf) in ocrs:
        t = re.sub(r'[^A-Z0-9]', '', t.upper())
        if len(t) >= 5:
            results.append((t, conf))

    if not results:
        return "Unknown"

    results.sort(key=lambda a: a[1], reverse=True)
    best = format_plate(results[0][0])

    return best if is_valid_plate(best) else best


# ------------------ MAIN LOOP ------------------
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1
    if frame_count % FRAME_SKIP != 0:
        continue

    cv2.line(frame, (0, STOP_LINE_Y), (frame_width, STOP_LINE_Y), (0,0,255), 2)

    # Detect vehicles
    veh_results = vehicle_model(frame, device="cpu")[0]
    vehicles = []
    for b in veh_results.boxes:
        cls = veh_results.names[int(b.cls)]
        if cls in ["car", "motorcycle", "bus", "truck"] and b.conf > 0.5:
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            vehicles.append({"label": cls, "box": [x1, y1, x2, y2]})
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)

    # Detect plates
    detected_plates = []
    for v in vehicles:
        x1,y1,x2,y2 = v["box"]
        crop = frame[y1:y2, x1:x2]

        plates = plate_model(crop)[0]
        for pb in plates.boxes:
            if pb.conf > 0.5:
                px1,py1,px2,py2 = map(int, pb.xyxy[0])
                abs_x1 = x1 + px1
                abs_y1 = y1 + py1
                abs_x2 = x1 + px2
                abs_y2 = y1 + py2

                plate_img = crop[py1:py2, px1:px2]
                plate_text = ocr_license_plate(plate_img, frame_count)

                # ---------------- SAVE PLATE IMAGE ----------------
                timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{PLATE_SAVE}/plate_{timestamp_str}_{plate_text}.jpg"
                cv2.imwrite(filename, plate_img)

                detected_plates.append({
                    "coords":[abs_x1, abs_y1, abs_x2, abs_y2],
                    "text": plate_text,
                    "file": filename,
                    "vehicle_box": v["box"]
                })

                cv2.rectangle(frame, (abs_x1, abs_y1), (abs_x2, abs_y2), (255, 0, 0), 2)
                cv2.putText(frame, plate_text, (abs_x1, abs_y1-5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,0,0), 2)

    # Detect traffic light
    light_state = None
    light_result = traffic_light_model(frame)[0]
    for b in light_result.boxes:
        if b.conf > 0.5:
            label = light_result.names[int(b.cls)]
            light_state = label

    # Check violation
    for v in vehicles:
        box = v["box"]
        cx, cy = get_center(box)
        track = vehicle_tracks[tuple(box)]

        violation = is_red_light_violation(box, light_state, track)

        matched_plate = "Unknown"
        plate_file = ""

        for p in detected_plates:
            px1, py1, px2, py2 = p["coords"]
            x1, y1, x2, y2 = box
            if px1>=x1 and py1>=y1 and px2<=x2 and py2<=y2:
                matched_plate = p["text"]
                plate_file = p["file"]

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        csv_writer.writerow([timestamp, v["label"], matched_plate,
                             "RED LIGHT" if violation else "OK", plate_file])

        vehicle_tracks[tuple(box)].append((cx, cy))

    out.write(frame)
    cv2.imshow("Traffic Detection", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
out.release()
csv_file.close()
cv2.destroyAllWindows()
