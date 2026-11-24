"""Small deterministic tests for the optional calibrated speed-demo module."""

import unittest

from speed_violation_detector import SpeedViolationDetector


class SpeedViolationDetectorTests(unittest.TestCase):
    def test_emits_only_when_track_crosses_both_lines_over_limit(self):
        # Upward traffic: A=600, then B=400.  Interpolated travel is 0.875s.
        detector = SpeedViolationDetector(600, 400, distance_m=10, limit_kmh=30)
        self.assertIsNone(detector.update(7, [0, 600, 20, 650], "car", 0.0))
        self.assertIsNone(detector.update(7, [0, 520, 20, 550], "car", 1.0))
        event = detector.update(7, [0, 320, 20, 350], "car", 1.5)
        self.assertIsNotNone(event)
        self.assertEqual(event["event_type"], "SPEED_DEMO")
        self.assertEqual(event["measurement_status"],
                         "SIMULATED_CALIBRATED_NEEDS_REVIEW")
        self.assertEqual(event["track_id"], 7)
        self.assertGreater(event["speed_kmh"], 30)
        self.assertAlmostEqual(event["elapsed_s"], 0.875, places=3)

    def test_does_not_emit_for_below_limit_or_wrong_direction(self):
        slow = SpeedViolationDetector(600, 400, distance_m=10, limit_kmh=50)
        slow.update(1, [0, 600, 20, 650], "car", 0.0)
        slow.update(1, [0, 520, 20, 550], "car", 2.0)
        self.assertIsNone(slow.update(1, [0, 320, 20, 350], "car", 4.0))

        wrong_way = SpeedViolationDetector(600, 400, distance_m=10, limit_kmh=1)
        wrong_way.update(2, [0, 300, 20, 350], "car", 0.0)
        wrong_way.update(2, [0, 500, 20, 550], "car", 1.0)
        self.assertIsNone(wrong_way.update(2, [0, 620, 20, 650], "car", 2.0))

    def test_video_time_reset_never_connects_two_loops(self):
        detector = SpeedViolationDetector(600, 400, distance_m=10, limit_kmh=1)
        detector.update(1, [0, 600, 20, 650], "car", 10.0)
        detector.update(1, [0, 520, 20, 550], "car", 11.0)  # crosses A
        # New local-video loop: source time goes back to zero and state resets.
        self.assertIsNone(detector.update(1, [0, 320, 20, 350], "car", 0.1))

    def test_reused_track_id_after_a_gap_starts_fresh(self):
        detector = SpeedViolationDetector(600, 400, distance_m=10, limit_kmh=1,
                                          max_idle_s=2)
        detector.update(5, [0, 600, 20, 650], "car", 0.0)
        detector.update(5, [0, 520, 20, 550], "car", 1.0)  # crosses A
        # ID 5 comes back much later: do not join it to the old first crossing.
        self.assertIsNone(detector.update(5, [0, 320, 20, 350], "car", 5.0))

    def test_sparse_segment_can_cross_both_ordered_lines(self):
        detector = SpeedViolationDetector(600, 400, distance_m=10, limit_kmh=30)
        detector.update(8, [0, 600, 20, 650], "car", 0.0)
        event = detector.update(8, [0, 250, 20, 300], "car", 1.0)
        self.assertIsNotNone(event)
        self.assertGreater(event["speed_kmh"], 30)

    def test_rejects_ambiguous_configuration(self):
        with self.assertRaises(ValueError):
            SpeedViolationDetector(500, 500, distance_m=10, limit_kmh=30)
        with self.assertRaises(ValueError):
            SpeedViolationDetector(400, 600, distance_m=10, limit_kmh=30,
                                   direction="up")


if __name__ == "__main__":
    unittest.main()
