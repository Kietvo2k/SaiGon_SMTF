"""
test_camera.py – Kiểm tra camera trước khi chạy hệ thống chính

Cách dùng:
  python test_camera.py              # Webcam mặc định (index 0)
  python test_camera.py --camera 1   # Webcam index 1
  python test_camera.py --camera rtsp://admin:pass@192.168.1.100:554/stream

Phím:
  'q'   – Thoát
  's'   – Chụp ảnh test
  '+'   – Tăng Y vạch dừng
  '-'   – Giảm Y vạch dừng
"""

import cv2
import time
import argparse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", default="0", help="Index webcam hoặc RTSP URL")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    args = ap.parse_args()

    source = args.camera
    try:
        source = int(source)
    except ValueError:
        pass

    print(f"Mở camera: {source}")
    cap = cv2.VideoCapture(source, cv2.CAP_DSHOW if isinstance(source, int) else 0)

    if not cap.isOpened():
        print("❌ Không mở được camera!")
        print("   Kiểm tra:")
        print("   1. Camera đã cắm chưa?")
        print("   2. Thử đổi index: --camera 1 hoặc --camera 2")
        print("   3. Đóng các app khác đang dùng camera (Teams, Zoom, ...)")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"✓ Camera mở thành công: {fw}x{fh} @ {fps:.0f}fps")
    print("Phím: 'q' thoát | 's' chụp ảnh | '+'/'-' điều chỉnh vạch dừng")

    stop_line_y = int(fh * 0.65)
    frame_count = 0
    fps_start = time.time()
    current_fps = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Mất kết nối camera!")
            break

        frame_count += 1
        elapsed = time.time() - fps_start
        if elapsed >= 1.0:
            current_fps = frame_count / elapsed
            frame_count = 0
            fps_start = time.time()

        # Vẽ vạch dừng
        cv2.line(frame, (0, stop_line_y), (fw, stop_line_y), (0, 0, 255), 2)
        cv2.putText(frame, f"STOP LINE Y={stop_line_y} (dung +/- de chinh)",
                    (10, stop_line_y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

        # Thông tin
        cv2.putText(frame, f"Camera: {source} | {fw}x{fh} | FPS: {current_fps:.1f}",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)
        cv2.putText(frame, "Nhan 'q' thoat | 's' chup anh | +/- chinh vach dung",
                    (10, fh - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow("Camera Test – Traffic System", frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            break
        elif key == ord('s'):
            ts = time.strftime("%Y%m%d_%H%M%S")
            cv2.imwrite(f"test_capture_{ts}.jpg", frame)
            print(f"✓ Ảnh lưu: test_capture_{ts}.jpg")
        elif key == ord('+'):
            stop_line_y = min(fh - 10, stop_line_y + 10)
            print(f"Stop line Y = {stop_line_y}")
        elif key == ord('-'):
            stop_line_y = max(10, stop_line_y - 10)
            print(f"Stop line Y = {stop_line_y}")

    cap.release()
    cv2.destroyAllWindows()
    print(f"\n✓ Dùng --stop-line {stop_line_y} khi chạy main.py")

if __name__ == "__main__":
    main()
