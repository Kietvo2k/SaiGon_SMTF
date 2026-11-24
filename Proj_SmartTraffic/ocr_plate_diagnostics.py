"""Compare safe image-preprocessing variants for a cropped license plate.

This is a diagnostic helper only: it never changes the saved evidence and
prints all model hypotheses so a reviewer can decide whether a result is usable.
"""

import argparse

import cv2
import numpy as np
from ultralytics import YOLO

from main import PlateOCRYolo


def variants(image):
    up = cv2.resize(image, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
    _, otsu = cv2.threshold(clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    sharp = cv2.filter2D(clahe, -1,
                         np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]]))
    return {
        "original": image,
        "upscale": up,
        "clahe": cv2.cvtColor(clahe, cv2.COLOR_GRAY2BGR),
        "otsu": cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR),
        "sharpen": cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("--model", default="models/license_plate/license_plate_ocr.pt")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    image = cv2.imread(args.image)
    if image is None:
        raise SystemExit(f"Cannot read {args.image}")
    ocr = PlateOCRYolo(YOLO(args.model), device=args.device, conf=0.15)
    for name, variant in variants(image).items():
        text, confidence = ocr.recognize(variant)
        print(f"{name}\t{text}\t{confidence:.3f}")


if __name__ == "__main__":
    main()
