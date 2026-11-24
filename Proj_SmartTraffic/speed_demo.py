"""Offline, calibrated *demonstration* of speed evidence + license-plate OCR.

This runner intentionally never opens a Jetson connection, activates GPIO, sends
Telegram messages, or calls an event a legal speeding offence.  It is for the
project presentation only: a vehicle track is measured between two operator
specified virtual lines using the source-video timestamp, then the normal OCR,
vehicle crop, plate crop, CSV/XLSX and short H.264 evidence clip are saved.

Example (the bundled 4K Pexels clip):
    python speed_demo.py --video 2.mp4 --start-sec 10 --end-sec 25 \
        --line-a 1100 --line-b 1500 --distance-m 8 --limit-kmh 12

For real enforcement, survey/calibrate the road, validate camera geometry and
timing, and require a human reviewer.  Every result is marked
SIMULATED_CALIBRATED_NEEDS_REVIEW in the evidence files.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from datetime import datetime
from types import SimpleNamespace

import cv2
from ultralytics import YOLO

from main import (
    ClipRecorder,
    LicensePlateOCR,
    PlateOCRYolo,
    ViolationLogger,
    recognize_plate_for_evidence,
    resolve_vehicle_classes,
    save_violation_image,
)
from speed_violation_detector import SpeedViolationDetector
from evidence_auto_sync import create_sync_service


LOGGER = logging.getLogger("speed_demo")
OUTPUT_DIRS = ("logs", "violations", "plates_cropped")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Mô phỏng đo tốc độ 2 vạch + OCR; không điều khiển Jetson/GPIO."
    )
    parser.add_argument("--video", default="2.mp4", help="Video cục bộ có sự đồng ý/quyền dùng")
    parser.add_argument("--start-sec", type=float, default=10.0,
                        help="Bắt đầu tại giây nguồn (mặc định 10)")
    parser.add_argument("--end-sec", type=float, default=25.0,
                        help="Dừng tại giây nguồn (mặc định 25)")
    parser.add_argument("--event-after-sec", type=float, default=None,
                        help="Warm-up tracker trước mốc này; chỉ lưu event từ mốc này")
    parser.add_argument("--line-a", type=int, default=1100,
                        help="Y gốc của vạch A (xe đi qua trước), pixel video gốc")
    parser.add_argument("--line-b", type=int, default=1500,
                        help="Y gốc của vạch B (xe đi qua sau), pixel video gốc")
    parser.add_argument("--distance-m", type=float, default=8.0,
                        help="Khoảng cách thực địa đã khảo sát giữa A và B, mét")
    parser.add_argument("--limit-kmh", type=float, default=12.0,
                        help="Ngưỡng mô phỏng, km/h; không phải ngưỡng xử phạt thật")
    parser.add_argument("--direction", choices=("up", "down", "auto"), default="down",
                        help="Hướng xe giữa A/B; clip 2.mp4: down")
    parser.add_argument("--stride", type=int, default=3,
                        help="Xử lý mỗi N frame nguồn (mặc định 3)")
    parser.add_argument("--inference-width", type=int, default=1280,
                        help="Chiều rộng inference; ảnh/crop bằng chứng vẫn dùng 4K gốc")
    parser.add_argument("--imgsz", type=int, default=960,
                        help="YOLO image size")
    parser.add_argument("--conf", type=float, default=0.30, help="Ngưỡng phát hiện xe")
    parser.add_argument("--vehicle-model", default="yolo26n.pt")
    parser.add_argument("--plate-model", default="models/license_plate/license_plate_detection.pt")
    parser.add_argument("--ocr-model", default="models/license_plate/license_plate_ocr.pt")
    parser.add_argument("--ocr-engine", choices=("yolo", "easyocr"), default="yolo")
    parser.add_argument("--plate-min-confidence", type=float, default=0.35)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--max-events", type=int, default=1,
                        help="Giới hạn số bằng chứng demo, tránh tạo nhiều bản ghi lặp")
    parser.add_argument("--debug", action="store_true",
                        help="In track ID/toạ độ đáy để hiệu chỉnh vạch demo")
    parser.add_argument("--xlsx", default="speed_demo_violations.xlsx")
    parser.add_argument("--sync-config", default="config/evidence_sync.json",
                        help="Cấu hình tự động đẩy gói bằng chứng (không chứa OAuth/token)")
    parser.add_argument("--sync-queue", default=None,
                        help="Ghi đè đường dẫn hàng đợi bằng chứng cục bộ")
    parser.add_argument("--sync-flush-timeout", type=float, default=15.0,
                        help="Số giây thử gửi trước khi thoát; lỗi mạng vẫn giữ queue")
    parser.add_argument("--job-dir", default=None,
                        help="Thư mục job dashboard: preview/progress/result/output riêng")
    args = parser.parse_args()
    if not os.path.isfile(args.video):
        parser.error(f"Không tìm thấy video: {args.video}")
    if args.start_sec < 0 or args.end_sec <= args.start_sec:
        parser.error("Cần 0 <= --start-sec < --end-sec")
    if args.event_after_sec is not None and not (args.start_sec <= args.event_after_sec < args.end_sec):
        parser.error("--event-after-sec phải nằm trong cửa sổ video")
    if args.stride < 1 or args.inference_width < 320 or args.max_events < 1:
        parser.error("--stride, --inference-width và --max-events phải hợp lệ")
    if not (0 <= args.plate_min_confidence <= 1):
        parser.error("--plate-min-confidence phải trong 0..1")
    return args


def _atomic_job_json(job_dir, name, payload):
    if not job_dir:
        return
    os.makedirs(job_dir, exist_ok=True)
    path = os.path.join(job_dir, name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _atomic_job_preview(job_dir, frame):
    if not job_dir:
        return
    os.makedirs(job_dir, exist_ok=True)
    ok, data = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 86])
    if not ok:
        return
    path = os.path.join(job_dir, "preview.jpg")
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data.tobytes())
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _open_job_writer(job_dir, fps, frame_size):
    if not job_dir:
        return None, ""
    path = os.path.join(job_dir, "output.mp4")
    for codec in ("avc1", "mp4v"):
        writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*codec),
                                 max(1.0, float(fps)), frame_size)
        if writer.isOpened():
            return writer, codec
        writer.release()
    return None, ""


def _timestamp_from_cap(cap, source_fps, fallback_frame):
    """Return a source timestamp, never inference/wall-clock time."""
    value = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000.0
    if value > 0:
        return value
    return float(fallback_frame) / max(1.0, float(source_fps))


def _resized(frame, target_width):
    h, w = frame.shape[:2]
    if w <= target_width:
        return frame, 1.0
    scale = float(target_width) / float(w)
    return cv2.resize(frame, (target_width, max(1, round(h * scale)))), scale


def _scale_box(box, inverse_scale, frame_shape):
    h, w = frame_shape[:2]
    x1, y1, x2, y2 = [int(round(float(v) * inverse_scale)) for v in box]
    return [max(0, min(w - 1, x1)), max(0, min(h - 1, y1)),
            max(0, min(w - 1, x2)), max(0, min(h - 1, y2))]


def _draw_speed_overlay(frame, args, event=None):
    """Draw transparent, explicit demo-only measurement context on a frame."""
    out = frame.copy()
    h, w = out.shape[:2]
    for y, label, color in ((args.line_a, "SPEED LINE A", (255, 180, 0)),
                            (args.line_b, "SPEED LINE B", (0, 255, 255))):
        y = max(0, min(h - 1, int(y)))
        cv2.line(out, (0, y), (w, y), color, 3)
        cv2.putText(out, label, (18, max(30, y - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    overlay = out.copy()
    cv2.rectangle(overlay, (0, 0), (min(w, 690), 145), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, out, 0.45, 0, out)
    cv2.putText(out, "MO PHONG TOC DO | KHONG PHAT NGUOI THAT", (16, 31),
                cv2.FONT_HERSHEY_SIMPLEX, 0.72, (0, 255, 255), 2)
    cv2.putText(out, f"A-B: {args.distance_m:g} m | nguong demo: {args.limit_kmh:g} km/h",
                (16, 63), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (255, 255, 255), 2)
    cv2.putText(out, "KET QUA AI CAN NGUOI DUYET", (16, 94),
                cv2.FONT_HERSHEY_SIMPLEX, 0.68, (0, 120, 255), 2)
    if event:
        text = (f"SPEED DEMO: {event['speed_kmh']:.1f} > "
                f"{event['speed_limit_kmh']:.1f} km/h")
        cv2.putText(out, text, (16, 128), cv2.FONT_HERSHEY_SIMPLEX,
                    0.72, (0, 0, 255), 2)
    return out


def _open_ocr(args):
    if args.ocr_engine == "yolo":
        if not os.path.isfile(args.ocr_model):
            raise FileNotFoundError(args.ocr_model)
        return PlateOCRYolo(YOLO(args.ocr_model), device=args.device)
    return LicensePlateOCR(gpu=(args.device != "cpu"))


def run(args):
    for folder in OUTPUT_DIRS:
        os.makedirs(folder, exist_ok=True)

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise RuntimeError(f"Không mở được video: {args.video}")
    source_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if not (0 < source_fps <= 240):
        source_fps = 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / source_fps if total_frames else 0.0
    if args.end_sec > duration + 0.5:
        LOGGER.warning("--end-sec %.1f vượt video %.1fs; sẽ dùng tới hết video.",
                       args.end_sec, duration)
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(args.start_sec * source_fps)))
    job_width = min(960, max(320, int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 960)))
    source_width = max(1, int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or job_width))
    source_height = max(1, int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 540))
    job_height = max(1, round(source_height * job_width / source_width))
    job_writer, job_codec = _open_job_writer(
        args.job_dir, source_fps / max(1, args.stride), (job_width, job_height)
    )
    expected_frames = max(1, int(
        max(0.0, min(args.end_sec, duration or args.end_sec) - args.start_sec)
        * source_fps / args.stride
    ))
    processed_frames = 0
    job_started = time.perf_counter()
    _atomic_job_json(args.job_dir, "progress.json", {
        "status": "running", "mode": "speed", "progress_pct": 0.0,
        "simulation_label": "SIMULATED_CALIBRATED_NEEDS_REVIEW",
        "message": "Đang khởi tạo YOLO/ByteTrack/OCR cho phép đo hai vạch.",
    })

    vehicle_model = YOLO(args.vehicle_model)
    plate_model = YOLO(args.plate_model)
    ocr = _open_ocr(args)
    classes = resolve_vehicle_classes(vehicle_model, "auto")
    detector = None
    recorder = ClipRecorder(fps=max(1, round(source_fps / args.stride)),
                            pre_sec=1.5, post_sec=2.5)

    run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Do not let an empty/no-event run replace the dashboard's latest real
    # evidence.  Promote this staging CSV to violations_* only after an event.
    csv_pending_path = f"logs/speed_demo_pending_{run_stamp}.csv"
    csv_path = f"logs/violations_{run_stamp}_speed_demo.csv"
    vlog = ViolationLogger(args.xlsx, csv_pending_path, overwrite_xlsx=True)
    ocr_args = SimpleNamespace(skip_ocr=False, imgsz=args.imgsz, device=args.device,
                               plate_min_confidence=args.plate_min_confidence)
    models = {"vehicle": vehicle_model, "plate": plate_model, "ocr": None}
    evidence = []
    frame_no = int(cap.get(cv2.CAP_PROP_POS_FRAMES) or 0)
    active_until_source_s = None
    LOGGER.info("Speed demo OFFLINE: %s | %.1f FPS | source %.1f-%.1fs",
                args.video, source_fps, args.start_sec, args.end_sec)
    LOGGER.info("Hai vach: A=%d B=%d, distance=%.2fm, threshold demo=%.1fkm/h",
                args.line_a, args.line_b, args.distance_m, args.limit_kmh)

    try:
        while True:
            ok, full_frame = cap.read()
            if not ok or full_frame is None:
                break
            frame_no += 1
            source_time = _timestamp_from_cap(cap, source_fps, frame_no)
            if source_time > args.end_sec:
                break

            # Process every Nth source frame; all timing still comes from the
            # source timestamps and the detector interpolates crossings.
            if (frame_no - int(args.start_sec * source_fps)) % args.stride:
                continue

            infer_frame, scale = _resized(full_frame, args.inference_width)
            if detector is None:
                detector = SpeedViolationDetector(
                    line_a_y=args.line_a * scale,
                    line_b_y=args.line_b * scale,
                    distance_m=args.distance_m,
                    limit_kmh=args.limit_kmh,
                    direction=args.direction,
                )
            infer_kw = dict(conf=args.conf, imgsz=args.imgsz, device=args.device,
                            verbose=False, persist=True, tracker="bytetrack.yaml")
            if classes is not None:
                infer_kw["classes"] = classes
            results = vehicle_model.track(infer_frame, **infer_kw)
            processed_frames += 1

            vehicles = []
            for result in results:
                for box in result.boxes:
                    if box.id is None or float(box.conf) < args.conf:
                        continue
                    label = str(result.names[int(box.cls)]).lower()
                    original_box = _scale_box(box.xyxy[0].tolist(), 1.0 / scale,
                                              full_frame.shape)
                    vehicles.append((int(box.id), label, original_box,
                                     box.xyxy[0].tolist()))
            if args.debug:
                debug_tracks = [
                    (tid, label, int(infer_box[3]))
                    for tid, label, _original_box, infer_box in vehicles
                ]
                LOGGER.info("source=%.2fs tracks=%s", source_time, debug_tracks)
            detector.cleanup([v[0] for v in vehicles], source_time)

            annotated = _draw_speed_overlay(full_frame, args)
            event_this_frame = None
            for track_id, label, original_box, infer_box in vehicles:
                event = detector.update(track_id, infer_box, label, source_time)
                x1, y1, x2, y2 = original_box
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 220, 0), 2)
                cv2.putText(annotated, f"{label}#{track_id}",
                            (x1, max(25, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX,
                            0.55, (0, 220, 0), 2)
                if (event is None or len(evidence) >= args.max_events or
                        (args.event_after_sec is not None and
                         source_time < args.event_after_sec)):
                    continue

                event_this_frame = event
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                event_tag = f"SPEED_DEMO_E{len(evidence)+1}_ID{track_id}"
                # OCR is intentionally done only for a measured event.  It
                # returns READ_UNVERIFIED or an honest unreadable status.
                plate, plate_conf, plate_status, plate_crop = recognize_plate_for_evidence(
                    full_frame, original_box, models, ocr, ocr_args, label, timestamp, event_tag
                )
                event_frame = _draw_speed_overlay(full_frame, args, event)
                cv2.rectangle(event_frame, (x1, y1), (x2, y2), (0, 0, 255), 4)
                cv2.putText(event_frame, f"{label}#{track_id} | OCR: {plate}",
                            (x1, max(28, y1 - 12)), cv2.FONT_HERSHEY_SIMPLEX,
                            0.7, (0, 0, 255), 2)
                annotated = event_frame
                image_path, vehicle_crop = save_violation_image(
                    event_frame, original_box, plate, label, timestamp,
                    simulation=True, event_tag=event_tag,
                )
                clip_path = f"violations/clip_{label}_{timestamp}_{event_tag}.mp4"
                if not recorder.trigger(clip_path):
                    clip_path = ""
                event_record = {
                    **event,
                    "time": timestamp,
                    "plate": plate,
                    "plate_confidence": round(float(plate_conf), 3),
                    "plate_status": plate_status,
                    "image": image_path,
                    "vehicle_crop": vehicle_crop,
                    "plate_crop": plate_crop,
                    "clip": clip_path,
                }
                evidence.append(event_record)
                vlog.log(
                    timestamp, "SPEED_DEMO", label, plate, image_path, clip_path,
                    plate_conf=plate_conf, plate_status=plate_status,
                    vehicle_crop_path=vehicle_crop, plate_crop_path=plate_crop,
                    event_type=event["event_type"],
                    measurement_status=event["measurement_status"],
                    speed_kmh=event["speed_kmh"],
                    speed_limit_kmh=event["speed_limit_kmh"],
                    distance_m=event["distance_m"], elapsed_s=event["elapsed_s"],
                    source_time_s=event["source_time_s"],
                )
                LOGGER.warning(
                    "SPEED_DEMO event %d: %s %.1f > %.1f km/h | OCR=%s (%s)",
                    len(evidence), label, event["speed_kmh"], event["speed_limit_kmh"],
                    plate, plate_status,
                )

            # Feed the overlay every processed frame so the saved clip itself
            # clearly says DEMO/needs-review.  After an event, collect its
            # post-roll before stopping the short batch.
            recorder.feed(_draw_speed_overlay(full_frame, args, event_this_frame))
            job_frame, _ = _resized(annotated, job_width)
            if job_frame.shape[1::-1] != (job_width, job_height):
                job_frame = cv2.resize(job_frame, (job_width, job_height),
                                       interpolation=cv2.INTER_AREA)
            if job_writer is not None:
                job_writer.write(job_frame)
            if processed_frames == 1 or processed_frames % 2 == 0 or event_this_frame:
                _atomic_job_preview(args.job_dir, job_frame)
            elapsed = max(0.001, time.perf_counter() - job_started)
            _atomic_job_json(args.job_dir, "progress.json", {
                "status": "running",
                "mode": "speed",
                "progress_pct": round(min(99.5, processed_frames / expected_frames * 100), 1),
                "frames_processed": processed_frames,
                "total_frames_expected": expected_frames,
                "source_time_s": round(source_time, 3),
                "processing_fps": round(processed_frames / elapsed, 2),
                "events": len(evidence),
                "simulation_label": "SIMULATED_CALIBRATED_NEEDS_REVIEW",
            })
            if evidence and len(evidence) >= args.max_events:
                if active_until_source_s is None:
                    active_until_source_s = source_time + 2.8
                elif source_time >= active_until_source_s:
                    break
    finally:
        cap.release()
        if job_writer is not None:
            job_writer.release()
        recorder.close()
        vlog.close()

    if evidence:
        os.replace(csv_pending_path, csv_path)
    else:
        csv_path = csv_pending_path

    manifest_path = f"logs/speed_demo_{run_stamp}.json"
    manifest = {
        "mode": "SPEED_DEMO",
        "measurement_status": "SIMULATED_CALIBRATED_NEEDS_REVIEW",
        "source_video": os.path.abspath(args.video),
        "source_fps": source_fps,
        "source_window_s": [args.start_sec, args.end_sec],
        "calibration": {
            "line_a_y": args.line_a, "line_b_y": args.line_b,
            "distance_m": args.distance_m, "limit_kmh": args.limit_kmh,
            "direction": args.direction,
        },
        "csv": csv_path,
        "xlsx": args.xlsx,
        "events": evidence,
        "job_output_video": (os.path.join(args.job_dir, "output.mp4")
                             if args.job_dir and job_writer is not None else ""),
        "job_video_codec": job_codec,
        "warning": "Presentation-only result. It is not a legal speed enforcement record.",
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    job_result = {
        "status": "completed" if evidence else "completed_no_event",
        "mode": "speed",
        "progress_pct": 100.0,
        "events": evidence,
        "event_count": len(evidence),
        "csv": csv_path,
        "manifest": manifest_path,
        "output_video": manifest["job_output_video"],
        "simulation_label": "SIMULATED_CALIBRATED_NEEDS_REVIEW",
        "warning": manifest["warning"],
    }
    _atomic_job_json(args.job_dir, "result.json", job_result)
    _atomic_job_json(args.job_dir, "progress.json", {
        "status": job_result["status"], "mode": "speed", "progress_pct": 100.0,
        "frames_processed": processed_frames, "event_count": len(evidence),
        "simulation_label": "SIMULATED_CALIBRATED_NEEDS_REVIEW",
    })

    # The clip, final CSV name and manifest are all complete at this point.
    # Queue one immutable presentation bundle; the source 4K video is
    # intentionally excluded.  Drive failures never invalidate local evidence.
    if evidence:
        artifact_paths = [manifest_path, csv_path, args.xlsx]
        for event in evidence:
            artifact_paths.extend([
                event.get("image", ""),
                event.get("vehicle_crop", ""),
                event.get("plate_crop", ""),
                event.get("clip", ""),
            ])
        artifact_paths = list(dict.fromkeys(path for path in artifact_paths if path))
        sync = create_sync_service(
            config_path=args.sync_config,
            queue_path=args.sync_queue,
            logger=LOGGER,
        )
        sync.enqueue(f"speed_demo_{run_stamp}", artifact_paths, metadata={
            "mode": manifest["mode"],
            "measurement_status": manifest["measurement_status"],
            "events": len(evidence),
            "created_at": run_stamp,
        })
        sync_result = sync.close(args.sync_flush_timeout)
        LOGGER.info("Evidence sync queue: %s | states=%s",
                    sync.queue.path, sync_result.get("event_statuses", {}))
    print(json.dumps({"events": len(evidence), "csv": csv_path,
                      "manifest": manifest_path}, ensure_ascii=False))
    return 0 if evidence else 2


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s | %(levelname)s | %(message)s")
    parsed = parse_args()
    try:
        code = run(parsed)
    except Exception as exc:
        _atomic_job_json(parsed.job_dir, "progress.json", {
            "status": "error", "mode": "speed", "progress_pct": 0.0,
            "error": str(exc),
            "simulation_label": "SIMULATED_CALIBRATED_NEEDS_REVIEW",
        })
        _atomic_job_json(parsed.job_dir, "result.json", {
            "status": "error", "mode": "speed", "error": str(exc),
        })
        raise
    raise SystemExit(code)
