"""Persistent, privacy-aware handoff of AI evidence to the citizen mobile app.

This module never issues a fine or identifies a person from a plate.  It stores
an AI-generated event as ``PENDING_REVIEW`` and exposes it only after a local
operator maintains an explicit plate-to-CCCD registry.  The HTTP API reads the
same atomic JSON file via ``web/server.py``.
"""
from __future__ import annotations

import copy
import json
import logging
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
DEFAULT_EVENTS_PATH = ROOT / "logs" / "mobile_app_events.json"
DEFAULT_OWNER_REGISTRY_PATH = ROOT / "config" / "plate_owner_registry.json"


def _normalise_plate(value: object) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _safe_file_name(value: object) -> str:
    return Path(str(value or "")).name


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class MobileAppEventStore:
    """Small atomic JSON store; keeps detector operation independent of the app."""

    def __init__(self, events_path: os.PathLike[str] | str = DEFAULT_EVENTS_PATH,
                 owner_registry_path: os.PathLike[str] | str = DEFAULT_OWNER_REGISTRY_PATH):
        self.events_path = Path(events_path)
        self.owner_registry_path = Path(owner_registry_path)
        self._lock = threading.RLock()
        self.events_path.parent.mkdir(parents=True, exist_ok=True)

    def _load_events_locked(self) -> list[dict[str, Any]]:
        try:
            data = json.loads(self.events_path.read_text(encoding="utf-8"))
            return data.get("events", []) if isinstance(data, dict) else []
        except (OSError, json.JSONDecodeError, AttributeError):
            return []

    def _write_events_locked(self, events: list[dict[str, Any]]) -> None:
        payload = {"schema_version": 1, "updated_at": _utc_now(), "events": events}
        temp = self.events_path.with_suffix(self.events_path.suffix + ".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temp, self.events_path)

    def _find_owner_locked(self, plate: str) -> dict[str, str] | None:
        normalized = _normalise_plate(plate)
        if not normalized:
            return None
        try:
            raw = json.loads(self.owner_registry_path.read_text(encoding="utf-8"))
            owners = raw.get("plates", {}) if isinstance(raw, dict) else {}
            record = owners.get(normalized)
            if not isinstance(record, dict):
                return None
            cccd = str(record.get("cccd", "")).strip()
            if not re.fullmatch(r"\d{12}", cccd):
                return None
            return {"cccd": cccd, "display_name": str(record.get("display_name", "")).strip()}
        except (OSError, json.JSONDecodeError, AttributeError):
            return None

    def publish(self, *, timestamp: str, lane: str, vehicle_type: str,
                plate: str, plate_confidence: float, plate_status: str,
                scene_path: str = "", vehicle_crop_path: str = "",
                plate_crop_path: str = "", clip_path: str = "",
                event_id: str = "") -> dict[str, Any]:
        """Append an AI record. The caller must only call this for live, non-demo events."""
        owner = None
        with self._lock:
            owner = self._find_owner_locked(plate)
            event = {
                "id": event_id or "ai_" + uuid.uuid4().hex,
                "created_at": _utc_now(),
                "occurred_at": str(timestamp),
                "review_status": "PENDING_REVIEW",
                "review_note": "Phát hiện tự động bởi AI; cần cán bộ/người quản trị xác minh trước khi thông báo xử lý.",
                "event_type": "RED_LIGHT_SUSPECT",
                "lane": str(lane),
                "vehicle_type": str(vehicle_type),
                "plate": str(plate),
                "plate_confidence": round(float(plate_confidence or 0.0), 3),
                "plate_status": str(plate_status),
                "owner_cccd": owner["cccd"] if owner else "",
                "owner_display_name": owner["display_name"] if owner else "",
                "evidence": {
                    "scene": _safe_file_name(scene_path),
                    "vehicle_crop": _safe_file_name(vehicle_crop_path),
                    "plate_crop": _safe_file_name(plate_crop_path),
                    "clip": _safe_file_name(clip_path),
                },
            }
            events = self._load_events_locked()
            # A detector retry must not duplicate a notification record.
            events = [item for item in events if item.get("id") != event["id"]]
            events.insert(0, event)
            self._write_events_locked(events[:1000])
        if owner:
            logger.info("Mobile app event queued for CCCD ending %s (event=%s)",
                        owner["cccd"][-4:], event["id"])
        else:
            logger.info("Mobile app event kept admin-only: no verified owner mapping for plate %s", _normalise_plate(plate) or "UNREADABLE")
        return copy.deepcopy(event)


    def publish_demo(self, *, recipient_cccd: str, timestamp: str, lane: str,
                     vehicle_type: str, plate: str, plate_confidence: float,
                     plate_status: str, scene_path: str = "",
                     vehicle_crop_path: str = "", plate_crop_path: str = "",
                     clip_path: str = "", event_id: str = "") -> dict[str, Any]:
        """Store an explicitly opted-in local demo for one configured app user."""
        cccd = str(recipient_cccd or "").strip()
        if not re.fullmatch(r"\d{12}", cccd):
            raise ValueError("recipient_cccd must contain exactly 12 digits")
        with self._lock:
            event = {
                "id": event_id or "demo_" + uuid.uuid4().hex,
                "created_at": _utc_now(),
                "occurred_at": str(timestamp),
                "review_status": "PENDING_REVIEW",
                "review_note": (
                    "DEMO from a locally uploaded video. It requires human review "
                    "and is not an enforcement notice."
                ),
                "event_type": "RED_LIGHT_DEMO",
                "is_demo": True,
                "lane": str(lane),
                "vehicle_type": str(vehicle_type),
                "plate": str(plate),
                "plate_confidence": round(float(plate_confidence or 0.0), 3),
                "plate_status": str(plate_status),
                "owner_cccd": cccd,
                "owner_display_name": "Demo recipient",
                "evidence": {
                    "scene": _safe_file_name(scene_path),
                    "vehicle_crop": _safe_file_name(vehicle_crop_path),
                    "plate_crop": _safe_file_name(plate_crop_path),
                    "clip": _safe_file_name(clip_path),
                },
            }
            events = self._load_events_locked()
            events = [item for item in events if item.get("id") != event["id"]]
            events.insert(0, event)
            self._write_events_locked(events[:1000])
        logger.info("Demo app event queued for the configured recipient (event=%s)", event["id"])
        return copy.deepcopy(event)


def create_mobile_app_store(events_path: os.PathLike[str] | str = DEFAULT_EVENTS_PATH,
                            owner_registry_path: os.PathLike[str] | str = DEFAULT_OWNER_REGISTRY_PATH) -> MobileAppEventStore:
    return MobileAppEventStore(events_path, owner_registry_path)


def read_events_for_cccd(cccd: str,
                         events_path: os.PathLike[str] | str = DEFAULT_EVENTS_PATH) -> list[dict[str, Any]]:
    """Return only records explicitly associated with this CCCD, newest first."""
    if not re.fullmatch(r"\d{12}", str(cccd or "")):
        return []
    try:
        data = json.loads(Path(events_path).read_text(encoding="utf-8"))
        events = data.get("events", []) if isinstance(data, dict) else []
    except (OSError, json.JSONDecodeError, AttributeError):
        return []
    return [copy.deepcopy(item) for item in events if item.get("owner_cccd") == cccd]


def find_event_for_cccd(event_id: str, cccd: str,
                        events_path: os.PathLike[str] | str = DEFAULT_EVENTS_PATH) -> dict[str, Any] | None:
    for event in read_events_for_cccd(cccd, events_path):
        if event.get("id") == event_id:
            return event
    return None
