"""Calibrated two-line *demo* speed measurement.

This module deliberately does not claim to produce a legal speed measurement.
It turns an already-stable vehicle track into a reproducible demonstration:

* the operator draws/surveys two virtual lines in the same lane;
* the distance between their road positions is supplied in metres;
* the source-video timestamp at each crossing is used (never inference wall time);
* every emitted event is labelled ``SIMULATED_CALIBRATED_NEEDS_REVIEW``.

For a real enforcement system, camera calibration/homography, certified timing,
camera placement validation and human review are still mandatory.  Keeping this
logic in a small independent module lets ``main.py`` keep its current red-light
behaviour unchanged until the optional speed-demo mode is explicitly enabled.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Optional


@dataclass
class _TrackState:
    """The last projected ground-contact point and first-line crossing."""

    previous_y: float
    previous_time_s: float
    line_a_time_s: Optional[float] = None
    measured: bool = False
    last_seen_time_s: float = 0.0


class SpeedViolationDetector:
    """Measure one vehicle between two ordered horizontal virtual lines.

    ``line_a_y`` and ``line_b_y`` are pixel Y coordinates of the *first* and
    *second* line along the travel direction.  ``direction='auto'`` derives the
    expected movement from them.  A car moving upward must therefore have
    ``line_a_y > line_b_y``; downward movement must have the reverse.

    ``source_time_s`` passed to :meth:`update` must be a timestamp from the
    source video (or a monotonic capture timestamp for a live camera).  The
    method interpolates the two line-crossing moments between frames, making the
    result independent of inference latency and frame skipping.
    """

    STATUS = "SIMULATED_CALIBRATED_NEEDS_REVIEW"
    EVENT_TYPE = "SPEED_DEMO"

    def __init__(
        self,
        line_a_y: float,
        line_b_y: float,
        distance_m: float,
        limit_kmh: float,
        direction: str = "auto",
        min_elapsed_s: float = 0.10,
        max_elapsed_s: float = 120.0,
        max_idle_s: float = 8.0,
    ) -> None:
        self.line_a_y = float(line_a_y)
        self.line_b_y = float(line_b_y)
        self.distance_m = float(distance_m)
        self.limit_kmh = float(limit_kmh)
        self.min_elapsed_s = float(min_elapsed_s)
        self.max_elapsed_s = float(max_elapsed_s)
        self.max_idle_s = float(max_idle_s)

        if self.line_a_y == self.line_b_y:
            raise ValueError("Speed lines must be two different Y coordinates")
        if self.distance_m <= 0:
            raise ValueError("Speed-line distance must be greater than zero")
        if self.limit_kmh <= 0:
            raise ValueError("Speed limit must be greater than zero")
        if self.min_elapsed_s <= 0 or self.max_elapsed_s <= self.min_elapsed_s:
            raise ValueError("Invalid minimum/maximum speed-measurement interval")
        if self.max_idle_s <= 0:
            raise ValueError("max_idle_s must be greater than zero")

        direction = str(direction).lower()
        if direction not in {"auto", "up", "down"}:
            raise ValueError("direction must be 'auto', 'up', or 'down'")
        derived = "up" if self.line_b_y < self.line_a_y else "down"
        if direction != "auto" and direction != derived:
            raise ValueError(
                "Ordered speed lines disagree with direction: line A must be "
                "first along the vehicle's travel direction"
            )
        self.direction = derived if direction == "auto" else direction
        self._sign = -1 if self.direction == "up" else 1
        self._tracks: Dict[int, _TrackState] = {}
        self._last_source_time_s: Optional[float] = None

    @staticmethod
    def _bottom_y(box: Iterable[float]) -> float:
        values = list(box)
        if len(values) != 4:
            raise ValueError("box must contain [x1, y1, x2, y2]")
        return float(values[3])

    def _crossed(self, previous_y: float, current_y: float, line_y: float) -> bool:
        """Return true only for a crossing in the configured travel direction."""
        if self._sign < 0:  # road direction is upward (smaller Y)
            return previous_y > line_y >= current_y
        return previous_y < line_y <= current_y

    @staticmethod
    def _interpolate_crossing_time(
        previous_y: float,
        previous_time_s: float,
        current_y: float,
        current_time_s: float,
        line_y: float,
    ) -> float:
        """Linearly interpolate the source timestamp at which the line was crossed."""
        delta_y = current_y - previous_y
        if abs(delta_y) < 1e-9 or current_time_s <= previous_time_s:
            return float(current_time_s)
        ratio = (line_y - previous_y) / delta_y
        ratio = max(0.0, min(1.0, ratio))
        return previous_time_s + ratio * (current_time_s - previous_time_s)

    def reset(self) -> None:
        """Forget unfinished tracks, e.g. when a local video starts a new loop."""
        self._tracks.clear()
        self._last_source_time_s = None

    def cleanup(self, active_ids: Iterable[int], source_time_s: float) -> None:
        """Discard stale ByteTrack IDs without affecting active measurements."""
        active = {int(track_id) for track_id in active_ids}
        now = float(source_time_s)
        stale = [
            track_id
            for track_id, state in self._tracks.items()
            if track_id not in active and now - state.last_seen_time_s > self.max_idle_s
        ]
        for track_id in stale:
            self._tracks.pop(track_id, None)

    def _finish_measurement(
        self,
        state: _TrackState,
        track_id: int,
        label: str,
        line_b_time_s: float,
    ) -> Optional[dict]:
        """Finish a two-line measurement and emit only an over-limit demo event."""
        if state.line_a_time_s is None:
            return None
        elapsed_s = line_b_time_s - state.line_a_time_s
        state.measured = True
        # A broken/reused tracker or a vehicle that lingered between lines
        # cannot generate a speed event.  It simply finishes without output.
        if not self.min_elapsed_s <= elapsed_s <= self.max_elapsed_s:
            return None
        speed_kmh = self.distance_m / elapsed_s * 3.6
        if speed_kmh <= self.limit_kmh:
            return None
        return {
            "event_type": self.EVENT_TYPE,
            "measurement_status": self.STATUS,
            "track_id": track_id,
            "label": str(label),
            "speed_kmh": round(speed_kmh, 1),
            "speed_limit_kmh": round(self.limit_kmh, 1),
            "distance_m": round(self.distance_m, 3),
            "elapsed_s": round(elapsed_s, 3),
            "line_a_y": round(self.line_a_y, 1),
            "line_b_y": round(self.line_b_y, 1),
            "source_time_s": round(line_b_time_s, 3),
        }

    def update(
        self,
        track_id: int,
        box: Iterable[float],
        label: str,
        source_time_s: float,
    ) -> Optional[dict]:
        """Update one track; return a speed-demo event only above the limit.

        Returned records deliberately contain ``measurement_status`` rather than
        a legal ``violation`` flag.  The caller is expected to save OCR/vehicle
        crops and a clip using its normal evidence pipeline, while presenting the
        result as a demonstration that needs human review.
        """
        source_time_s = float(source_time_s)
        if source_time_s < 0:
            raise ValueError("source_time_s must not be negative")

        # A local file may be looped.  Never connect the end of one loop to the
        # beginning of the next, otherwise it could fabricate a very fast car.
        if (
            self._last_source_time_s is not None
            and source_time_s + 1e-6 < self._last_source_time_s
        ):
            self.reset()
        self._last_source_time_s = source_time_s

        track_id = int(track_id)
        current_y = self._bottom_y(box)
        state = self._tracks.get(track_id)
        if state is None:
            self._tracks[track_id] = _TrackState(
                previous_y=current_y,
                previous_time_s=source_time_s,
                last_seen_time_s=source_time_s,
            )
            return None

        # ByteTrack can eventually reuse an ID.  If it reappears after a long
        # gap, it is safer to begin a fresh measurement than join two vehicles.
        if source_time_s - state.last_seen_time_s > self.max_idle_s:
            self._tracks[track_id] = _TrackState(
                previous_y=current_y,
                previous_time_s=source_time_s,
                last_seen_time_s=source_time_s,
            )
            return None

        state.last_seen_time_s = source_time_s
        if source_time_s <= state.previous_time_s:
            # Duplicate/out-of-order frame: retain the newer observation and
            # avoid calculating a zero/negative travel interval.
            if source_time_s == state.previous_time_s:
                state.previous_y = current_y
            return None

        previous_y, previous_time_s = state.previous_y, state.previous_time_s
        event = None

        if state.line_a_time_s is None:
            if self._crossed(previous_y, current_y, self.line_a_y):
                state.line_a_time_s = self._interpolate_crossing_time(
                    previous_y, previous_time_s, current_y, source_time_s, self.line_a_y
                )
                # A sparse source may travel across both lines in one sampled
                # segment (e.g. deliberate --video-stride).  Their ordered
                # geometry still gives two interpolated crossing timestamps.
                if self._crossed(previous_y, current_y, self.line_b_y):
                    line_b_time_s = self._interpolate_crossing_time(
                        previous_y, previous_time_s, current_y, source_time_s,
                        self.line_b_y,
                    )
                    event = self._finish_measurement(
                        state, track_id, label, line_b_time_s
                    )
        elif not state.measured and self._crossed(previous_y, current_y, self.line_b_y):
            line_b_time_s = self._interpolate_crossing_time(
                previous_y, previous_time_s, current_y, source_time_s, self.line_b_y
            )
            event = self._finish_measurement(state, track_id, label, line_b_time_s)

        state.previous_y = current_y
        state.previous_time_s = source_time_s
        return event
