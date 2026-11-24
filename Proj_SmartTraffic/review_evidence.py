"""Attach a transparent human-review correction to an OCR evidence record.

The tool never overwrites the raw AI OCR text or an evidence image.  It records
the reviewer-confirmed text in separate CSV/XLSX fields, allowing the dashboard
to show both values (for example ``AI: AF454O2M → reviewed: BG65USJ``).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime


REVIEW_COLUMNS = ("Reviewed plate", "Review status")

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def clean_plate(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def update_csv(path, timestamp, reviewed_plate):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        raise ValueError("CSV is empty")
    header = rows[0]
    for column in REVIEW_COLUMNS:
        if column not in header:
            header.append(column)
    reviewed_idx = header.index("Reviewed plate")
    status_idx = header.index("Review status")
    target = None
    for row in rows[1:]:
        if row and row[0] == timestamp:
            while len(row) < len(header):
                row.append("")
            raw = row[3] if len(row) > 3 else ""
            row[reviewed_idx] = reviewed_plate
            row[status_idx] = "HUMAN_REVIEWED"
            target = raw
            break
    if target is None:
        raise ValueError(f"No evidence row with Time={timestamp}")
    tmp = path + ".review.tmp"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    os.replace(tmp, path)
    return target


def update_xlsx(path, timestamp, reviewed_plate):
    if not path or not os.path.isfile(path):
        return False
    import openpyxl
    wb = openpyxl.load_workbook(path)
    changed = False
    for ws in wb.worksheets:
        header = [cell.value for cell in ws[1]]
        if "Time" not in header:
            continue
        for column in REVIEW_COLUMNS:
            if column not in header:
                ws.cell(1, len(header) + 1, column)
                header.append(column)
        time_col = header.index("Time") + 1
        reviewed_col = header.index("Reviewed plate") + 1
        status_col = header.index("Review status") + 1
        for row in range(2, ws.max_row + 1):
            if str(ws.cell(row, time_col).value or "") == timestamp:
                ws.cell(row, reviewed_col, reviewed_plate)
                ws.cell(row, status_col, "HUMAN_REVIEWED")
                changed = True
    if changed:
        wb.save(path)
    return changed


def main():
    parser = argparse.ArgumentParser(description="Duyệt tay một bản OCR mà không che kết quả AI gốc")
    parser.add_argument("--csv", required=True)
    parser.add_argument("--time", required=True, help="Cột Time của bản ghi bằng chứng")
    parser.add_argument("--plate", required=True, help="Biển số đối chiếu từ ảnh crop")
    parser.add_argument("--xlsx", default="")
    parser.add_argument("--manifest", default="")
    args = parser.parse_args()
    plate = clean_plate(args.plate)
    if not (5 <= len(plate) <= 12 and any(ch.isdigit() for ch in plate)):
        parser.error("--plate phải là 5-12 ký tự chữ/số và có ít nhất một số")
    raw_plate = update_csv(args.csv, args.time, plate)
    xlsx_updated = update_xlsx(args.xlsx, args.time, plate)
    review = {
        "time": args.time,
        "raw_ai_ocr": raw_plate,
        "reviewed_plate": plate,
        "review_status": "HUMAN_REVIEWED",
        "reviewed_at": datetime.now().isoformat(timespec="seconds"),
        "note": "Raw OCR is preserved; the reviewed value was visually matched to the saved plate crop.",
    }
    if args.manifest and os.path.isfile(args.manifest):
        with open(args.manifest, "r", encoding="utf-8") as f:
            payload = json.load(f)
        payload["human_review"] = review
        with open(args.manifest, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    print(json.dumps({"csv": args.csv, "xlsx_updated": xlsx_updated, **review}, ensure_ascii=False))


if __name__ == "__main__":
    main()
