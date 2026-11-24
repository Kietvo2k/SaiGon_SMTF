"""Opt-in delivery for local red-light video demonstrations."""
from __future__ import annotations

import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any

from mobile_app_bridge import create_mobile_app_store
from telegram_notifier import TelegramNotifier

ROOT = Path(__file__).resolve().parent
RECIPIENT_FILE = ROOT / "config" / "demo_app_recipient.json"


def recipient_status() -> dict[str, Any]:
    try:
        payload = json.loads(RECIPIENT_FILE.read_text(encoding="utf-8"))
        cccd = str(payload.get("cccd", "")).strip()
    except (OSError, json.JSONDecodeError, AttributeError):
        cccd = ""
    return {
        "configured": bool(re.fullmatch(r"\d{12}", cccd)),
        "tail": cccd[-4:] if re.fullmatch(r"\d{12}", cccd) else "",
    }


def save_recipient(cccd: object) -> dict[str, Any]:
    normalized = str(cccd or "").strip()
    if not re.fullmatch(r"\d{12}", normalized):
        raise ValueError("CCCD must contain exactly 12 digits")
    RECIPIENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = RECIPIENT_FILE.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps({"cccd": normalized, "updated_at": time.time()}, indent=2),
        encoding="utf-8",
    )
    os.replace(temporary, RECIPIENT_FILE)
    return recipient_status()


def _safe_event_token(value: object) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", str(value or ""))[:90]


def _copy_evidence(job_dir: Path, relative_path: object, destination_dir: Path,
                   job_id: str, event_index: int, kind: str) -> str:
    raw = str(relative_path or "").replace("/", os.sep)
    if not raw:
        return ""
    root = job_dir.resolve()
    source = (root / raw).resolve()
    try:
        if os.path.commonpath((str(root), str(source))) != str(root):
            return ""
    except ValueError:
        return ""
    if not source.is_file() or source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".mp4"}:
        return ""
    destination_dir.mkdir(parents=True, exist_ok=True)
    filename = "demo_%s_%02d_%s%s" % (
        _safe_event_token(job_id), event_index, kind, source.suffix.lower()
    )
    destination = destination_dir / filename
    shutil.copy2(source, destination)
    return str(destination)


def dispatch_uploaded_redlight_demo(*, job_id: str, job_dir: os.PathLike[str] | str,
                                    violations_dir: os.PathLike[str] | str) -> dict[str, Any]:
    """Queue explicit local-demo alerts after a red-light upload completes."""
    directory = Path(job_dir)
    result_path = directory / "result.json"
    try:
        result = json.loads(result_path.read_text(encoding="utf-8"))
        events = result.get("events", []) if isinstance(result, dict) else []
    except (OSError, json.JSONDecodeError, AttributeError):
        events = []
    if not isinstance(events, list) or not events:
        return {"status": "skipped", "message": "No red-light demo event was produced.", "events": 0}

    recipient = recipient_status()
    mobile_store = create_mobile_app_store() if recipient["configured"] else None
    telegram = TelegramNotifier()
    telegram_enabled = bool(telegram.enabled)
    copied_to = Path(violations_dir)
    delivered_to_app = 0
    queued_to_telegram = 0

    for index, event in enumerate(events[:3], start=1):
        if not isinstance(event, dict):
            continue
        scene_path = _copy_evidence(directory, event.get("scene_path"), copied_to, job_id, index, "scene")
        vehicle_path = _copy_evidence(directory, event.get("vehicle_crop_path"), copied_to, job_id, index, "vehicle")
        plate_path = _copy_evidence(directory, event.get("plate_crop_path"), copied_to, job_id, index, "plate")
        plate = str(event.get("plate_text") or "NO_PLATE_DETECTED")
        vehicle_type = str(event.get("vehicle_type") or "vehicle")
        timestamp = str(event.get("timestamp_utc") or "local-demo")
        confidence = float(event.get("plate_confidence") or 0.0)
        plate_status = str(event.get("plate_status") or "UNREADABLE")
        event_token = _safe_event_token(event.get("event_id")) or str(index)
        if mobile_store is not None:
            mobile_store.publish_demo(
                recipient_cccd=recipient["cccd"] if "cccd" in recipient else _read_recipient_cccd(),
                event_id="demo_%s_%s" % (_safe_event_token(job_id), event_token),
                timestamp=timestamp,
                lane="VIDEO_DEMO",
                vehicle_type=vehicle_type,
                plate=plate,
                plate_confidence=confidence,
                plate_status=plate_status,
                scene_path=scene_path,
                vehicle_crop_path=vehicle_path,
                plate_crop_path=plate_path,
            )
            delivered_to_app += 1
        if telegram_enabled:
            telegram.send_violation(
                plate,
                vehicle_type,
                "VIDEO_DEMO",
                timestamp,
                scene_path,
                plate_crop_path=plate_path,
                plate_confidence=confidence,
                plate_status=plate_status,
                simulation=True,
            )
            queued_to_telegram += 1

    parts = []
    if queued_to_telegram:
        parts.append("Telegram queued: %d" % queued_to_telegram)
    if delivered_to_app:
        parts.append("app events: %d" % delivered_to_app)
    if not recipient["configured"]:
        parts.append("app recipient not configured")
    if not parts:
        parts.append("no enabled delivery channel")
    return {"status": "queued", "message": "; ".join(parts), "events": len(events[:3])}


def _read_recipient_cccd() -> str:
    try:
        payload = json.loads(RECIPIENT_FILE.read_text(encoding="utf-8"))
        return str(payload.get("cccd", "")).strip()
    except (OSError, json.JSONDecodeError, AttributeError):
        return ""