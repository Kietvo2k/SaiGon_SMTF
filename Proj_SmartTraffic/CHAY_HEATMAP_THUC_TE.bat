@echo off
chcp 65001 >nul
echo ============================================================
echo   PROJ_SMARTTRAFFIC - HEATMAP MẬT ĐỘ GIAO THÔNG THỰC TẾ
echo   (Spatio-Temporal Flow & Congestion Heatmap - Footprint Based)
echo ============================================================
echo.
echo [1/3] Kiểm tra môi trường Python...
python -c "import ultralytics, cv2, torch; print('  ✓ Ultralytics:', ultralytics.__version__, '| PyTorch CPU:', torch.__version__)"
if errorlevel 1 (
    echo [LỖI] Thiếu thư viện. Vui lòng chạy: pip install -r requirements.txt
    pause
    exit /b 1
)

echo.
echo [2/3] Chạy Heatmap thực tế trên video demo...
echo       Chế độ: Combined (Lưu lượng xe + Điểm nghẽn dừng đèn đỏ)
echo       Độ phân giải tối ưu CPU i5: imgsz=480, stride=2
echo.

python traffic_density_heatmap.py ^
    --video demo_videos/violation_redlight_15s_ccby4.mp4 ^
    --output demo_videos/violation_redlight_15s_ccby4_density_heatmap.mp4 ^
    --stride 2 ^
    --imgsz 480 ^
    --conf 0.25 ^
    --mode combined

if errorlevel 1 (
    echo [LỖI] Xử lý video thất bại.
    pause
    exit /b 1
)

echo.
echo [3/3] Hoàn tất!
echo   - Video kết quả: demo_videos/violation_redlight_15s_ccby4_density_heatmap.mp4
echo   - Báo cáo MD:    demo_videos/violation_redlight_15s_ccby4_density_heatmap.report.md
echo   - Ảnh Preview:   demo_videos/violation_redlight_15s_ccby4_density_heatmap.preview.jpg
echo   - File CSV:      demo_videos/violation_redlight_15s_ccby4_density_heatmap.metrics.csv
echo   - File JSON:     demo_videos/violation_redlight_15s_ccby4_density_heatmap.metrics.json
echo.
pause
