"""Deterministic unit and integration tests for the realistic traffic density heatmap."""

import csv
import json
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from traffic_density_heatmap import (
    DensityHeatmapConfig,
    TrafficDensityAnalyzer,
    build_arg_parser,
    main,
    process_traffic_video,
    resolve_model_path,
)


class TrafficDensityHeatmapTests(unittest.TestCase):
    def test_config_validation(self):
        cfg = DensityHeatmapConfig(imgsz=480, conf=0.3, mode="combined")
        cfg.validate()

        with self.assertRaises(ValueError):
            DensityHeatmapConfig(imgsz=100).validate()

        with self.assertRaises(ValueError):
            DensityHeatmapConfig(conf=0.0).validate()

        with self.assertRaises(ValueError):
            DensityHeatmapConfig(mode="invalid_mode").validate()

        with self.assertRaises(ValueError):
            DensityHeatmapConfig(max_dwell_scale_sec=-5.0).validate()

    def test_arg_parser(self):
        parser = build_arg_parser()
        args = parser.parse_args(["--video", "clip.mp4", "--mode", "dwell", "--imgsz", "384"])
        self.assertEqual(args.input, "clip.mp4")
        self.assertEqual(args.mode, "dwell")
        self.assertEqual(args.imgsz, 384)

    def test_resolve_model_path(self):
        # Should resolve to existing yolo26n.pt (or fallback yolov8n.pt / vehicle.pt)
        path = resolve_model_path()
        self.assertTrue(path.is_file())
        self.assertEqual(path.name, "yolo26n.pt")

    def test_process_traffic_video_on_demo_clip(self):
        demo_clip = Path("demo_videos/violation_redlight_15s_ccby4.mp4")
        if not demo_clip.is_file():
            self.skipTest("Demo video not present for full integration test")

        with tempfile.TemporaryDirectory() as temp_dir:
            out_dir = Path(temp_dir)
            out_video = out_dir / "density_test.mp4"
            job_dir = out_dir / "job"

            cfg = DensityHeatmapConfig(
                imgsz=320,  # Fast test on CPU
                conf=0.25,
                mode="combined",
                max_dwell_scale_sec=15.0,
                max_flow_scale_count=10.0,
            )

            # Process only 8 frames with stride 2 for fast verification
            summary = process_traffic_video(
                demo_clip,
                out_video,
                config=cfg,
                job_dir=job_dir,
                stride=2,
                max_frames=8,
            )

            self.assertTrue(out_video.is_file())
            self.assertGreater(out_video.stat().st_size, 0)
            self.assertEqual(summary["frames_processed"], 8)
            self.assertTrue(Path(summary["metrics_json"]).is_file())
            self.assertTrue(Path(summary["metrics_csv"]).is_file())

            # Check job files
            self.assertTrue((job_dir / "preview.jpg").is_file())
            self.assertTrue((job_dir / "progress.json").is_file())
            self.assertTrue((job_dir / "result.json").is_file())

            result_data = json.loads((job_dir / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(result_data["status"], "completed")
            self.assertEqual(result_data["frames_processed"], 8)

            # Check CSV rows
            with open(summary["metrics_csv"], "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                self.assertEqual(len(rows), 8)
                self.assertIn("peak_dwell_sec", rows[0])
                self.assertIn("peak_flow_count", rows[0])

    def test_cli_error_handling(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "job_err"
            exit_code = main(
                [
                    "--video",
                    str(Path(temp_dir) / "non_existent.mp4"),
                    "--job-dir",
                    str(job_dir),
                ]
            )
            self.assertEqual(exit_code, 2)
            res_file = job_dir / "result.json"
            self.assertTrue(res_file.is_file())
            data = json.loads(res_file.read_text(encoding="utf-8"))
            self.assertEqual(data["status"], "error")


if __name__ == "__main__":
    unittest.main()
