"""Đề xuất vạch đếm ngang cho một video giao thông trước khi chạy demo.

Ví dụ:
    python calibrate_video.py --video 3.mp4 --stride 4

Script chỉ phân tích video, không kết nối Jetson và không ghi vi phạm.
"""

import argparse
import os

import cv2
from ultralytics import YOLO


VEHICLE_CLASSES = [2, 3, 5, 7]  # car, motorcycle, bus, truck trong COCO


def parse_args():
    ap = argparse.ArgumentParser(description="Gợi ý vị trí vạch đếm từ video")
    ap.add_argument("--video", required=True, help="Đường dẫn video .mp4/.avi")
    ap.add_argument("--model", default="yolo26n.pt")
    ap.add_argument("--imgsz", type=int, default=416)
    ap.add_argument("--conf", type=float, default=0.35)
    ap.add_argument("--stride", type=int, default=4,
                    help="Phân tích mỗi N frame để nhanh hơn. Mặc định: 4")
    ap.add_argument("--max-frames", type=int, default=0,
                    help="Giới hạn số frame gốc, 0 = toàn bộ video")
    return ap.parse_args()


def main():
    args = parse_args()
    if not os.path.isfile(args.video):
        raise SystemExit("Không tìm thấy video: %s" % args.video)

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit("Không mở được video: %s" % args.video)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    candidates = list(range(max(20, int(height * 0.15)), int(height * 0.85), 10))
    crossings = {line: set() for line in candidates}
    previous_y = {}

    print("Video: %s | %dx%d | %.2f FPS" % (args.video, width, height, fps))
    print("Đang theo dõi xe để tìm vạch đếm có nhiều quỹ đạo cắt qua...")
    model = YOLO(args.model)

    source_index = 0
    analyzed = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        source_index += 1
        if args.max_frames and source_index > args.max_frames:
            break
        if source_index % max(1, args.stride):
            continue

        analyzed += 1
        results = model.track(frame, persist=True, tracker="bytetrack.yaml",
                              classes=VEHICLE_CLASSES, conf=args.conf,
                              imgsz=args.imgsz, verbose=False)
        for result in results:
            for box in result.boxes:
                if box.id is None:
                    continue
                track_id = int(box.id)
                x1, y1, x2, y2 = map(float, box.xyxy[0].tolist())
                cy = (y1 + y2) / 2.0
                prev = previous_y.get(track_id)
                if prev is not None:
                    low, high = sorted((prev, cy))
                    for line in candidates:
                        if low <= line <= high:
                            crossings[line].add(track_id)
                previous_y[track_id] = cy

    cap.release()
    ranked = sorted(crossings.items(), key=lambda item: (-len(item[1]), item[0]))
    print("Đã phân tích %d frame mẫu." % analyzed)
    useful = [(line, ids) for line, ids in ranked if ids]
    if not useful:
        print("Không thấy đủ quỹ đạo cắt vạch. Hãy giảm --stride hoặc dùng video khác.")
        return

    print("Các vạch ứng viên (số track xe cắt qua):")
    for line, ids in useful[:5]:
        print("  Y=%d : %d xe" % (line, len(ids)))
    best_line, best_ids = useful[0]
    print("\nKhuyến nghị: --count-line-v %d  (phát hiện %d quỹ đạo xe cắt vạch)" %
          (best_line, len(best_ids)))
    print("Dùng --stop-line-v riêng theo vị trí vạch dừng thật nếu cần bắt vi phạm.")


if __name__ == "__main__":
    main()
