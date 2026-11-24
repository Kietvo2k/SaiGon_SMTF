"""Asynchronous Telegram delivery of AI evidence for an authorized operator."""

import html
import json
import logging
import os
import sys
import threading

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

logger = logging.getLogger(__name__)
_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telegram_config.json")
_API = "https://api.telegram.org"


class TelegramNotifier:
    """Send an AI detection to the configured private operator chat.

    The text deliberately identifies the event as requiring human review; it is
    not a legal notice or an automatic fine.
    """

    def __init__(self, config_path=_CONFIG_PATH):
        self.enabled = False
        self.token = ""
        self.chat_id = ""
        self._requests = None
        self._load(config_path)

    def _load(self, config_path):
        try:
            import requests
            self._requests = requests
        except ImportError:
            logger.warning("Telegram unavailable: install requests to enable notifications.")
            return
        try:
            with open(config_path, "r", encoding="utf-8") as file:
                config = json.load(file)
        except (json.JSONDecodeError, OSError) as error:
            logger.info("Telegram disabled: unable to read configuration (%s).", error)
            return
        self.token = str(config.get("bot_token", "")).strip()
        self.chat_id = str(config.get("chat_id", "")).strip()
        if bool(config.get("enabled", True)) and self.token and self.chat_id and "DAN_VAO" not in self.token:
            self.enabled = True
            logger.info("Telegram operator notification enabled (chat configured).")
        else:
            logger.info("Telegram notification disabled: bot token or chat ID is missing.")

    def send_violation(self, plate, vehicle_type, lane, timestamp, image_path=None,
                       plate_crop_path=None, plate_confidence=0.0, plate_status="",
                       simulation=False):
        """Queue the scene and optional plate crop without blocking video AI."""
        if not self.enabled:
            return
        thread = threading.Thread(
            target=self._send_worker,
            args=(plate, vehicle_type, lane, timestamp, image_path, plate_crop_path,
                  plate_confidence, plate_status, simulation),
            daemon=True,
            name="TelegramEvidenceSend",
        )
        thread.start()

    def _caption(self, plate, vehicle_type, lane, timestamp, confidence, plate_status,
                 simulation=False):
        plate_text = _esc(plate) or "UNREADABLE"
        confidence_text = f"{max(0.0, float(confidence or 0.0)) * 100:.1f}%"
        status_text = _esc(plate_status) or "UNREADABLE"
        headline = (
            "DEMO: <b>AI RED-LIGHT EVENT</b>\n"
            if simulation else "<b>AI RED-LIGHT EVENT</b>\n"
        )
        notice = (
            "<i>Local video demo only. This is not an enforcement notice.</i>"
            if simulation else
            "<i>AI evidence requires authorized human review before any action.</i>"
        )
        return (
            headline
            + "Status: <b>PENDING REVIEW</b>\n"
            + f"Vehicle: <b>{_esc(vehicle_type)}</b>\n"
            + f"AI plate: <b>{plate_text}</b>\n"
            + f"OCR: <b>{confidence_text}</b> ({status_text})\n"
            + f"Lane: <b>{_esc(lane)}</b>\n"
            + f"Time: <b>{_esc(timestamp)}</b>\n"
            + "Location: Da Nang traffic monitoring\n\n"
            + notice
        )

    def _send_photo(self, path, caption):
        with open(path, "rb") as image:
            return self._requests.post(
                f"{_API}/bot{self.token}/sendPhoto",
                data={"chat_id": self.chat_id, "caption": caption, "parse_mode": "HTML"},
                files={"photo": image},
                timeout=15,
            )

    def _send_worker(self, plate, vehicle_type, lane, timestamp, image_path,
                     plate_crop_path, plate_confidence, plate_status, simulation):
        caption = self._caption(plate, vehicle_type, lane, timestamp,
                                plate_confidence, plate_status, simulation)
        try:
            if image_path and os.path.isfile(image_path):
                response = self._send_photo(image_path, caption)
            else:
                response = self._requests.post(
                    f"{_API}/bot{self.token}/sendMessage",
                    data={"chat_id": self.chat_id, "text": caption, "parse_mode": "HTML"},
                    timeout=15,
                )
            if response.status_code != 200:
                logger.warning("Telegram scene notification failed: HTTP %s", response.status_code)
                return
            if plate_crop_path and os.path.isfile(plate_crop_path):
                crop_caption = (
                    "🔎 <b>CROP BIỂN SỐ ĐỂ ĐỐI CHIẾU</b>\n"
                    f"Sự kiện: <b>{_esc(timestamp)}</b> · Tuyến: <b>{_esc(lane)}</b>\n"
                    "<i>Chỉ phục vụ xác minh nội bộ; không phải kết luận xử phạt.</i>"
                )
                crop_response = self._send_photo(plate_crop_path, crop_caption)
                if crop_response.status_code != 200:
                    logger.warning("Telegram plate crop failed: HTTP %s", crop_response.status_code)
            logger.info("Telegram evidence notification queued successfully.")
        except Exception as error:  # Network errors must never interrupt detection.
            logger.warning("Telegram notification failed: %s", error)

    def test(self):
        if not self.enabled:
            print("Telegram is disabled; configure bot_token and chat_id first.")
            return False
        try:
            response = self._requests.post(
                f"{_API}/bot{self.token}/sendMessage",
                data={"chat_id": self.chat_id,
                      "text": "✅ Kết nối Telegram thành công. Kênh chỉ gửi hồ sơ AI chờ xác minh.",
                      "parse_mode": "HTML"},
                timeout=15,
            )
            return response.status_code == 200
        except Exception as error:
            logger.warning("Telegram test failed: %s", error)
            return False


def _esc(value):
    return html.escape(str(value), quote=False) if value is not None else ""


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    print("Telegram test:", "OK" if TelegramNotifier().test() else "FAILED")
