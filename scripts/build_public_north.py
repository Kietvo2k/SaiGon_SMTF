#!/usr/bin/env python
"""Clip hình học theo station nguồn; không suy topology từ tọa độ."""
import argparse
import json
import math
from pathlib import Path

import shapely
from shapely import make_valid
from shapely.geometry import LineString, Polygon
from shapely.geometry.polygon import orient


def components(geometry, kind):
    if geometry.geom_type == kind:
        return [geometry] if not geometry.is_empty else []
    return [part for item in getattr(geometry, "geoms", []) for part in components(item, kind)]


def interpolate(profile, station):
    for i in range(2, len(profile), 2):
        if station <= profile[i]:
            t = max(0, min(1, (station - profile[i - 2]) / max(1e-12, profile[i] - profile[i - 2])))
            return profile[i - 1] + t * (profile[i + 1] - profile[i - 1])
    return profile[-1]


def clip_edge(edge, polygon):
    raw = edge["c"]
    points = list(zip(raw[::2], raw[1::2]))
    intervals = []
    station = 0.0
    # Segment projection preserves repeated visits at a self crossing.
    for a, b in zip(points, points[1:]):
        length = math.dist(a, b)
        if length <= 1e-12:
            continue
        segment = LineString([a, b])
        spans = []
        for part in components(segment.intersection(polygon), "LineString"):
            if part.length <= 1e-9:
                continue
            lo, hi = sorted([segment.project(part.boundary.geoms[0]), segment.project(part.boundary.geoms[-1])]) if not part.is_ring else (0, length)
            spans.append((lo, hi))
        for lo, hi in sorted(spans):
            first = tuple(segment.interpolate(lo).coords[0])
            last = tuple(segment.interpolate(hi).coords[0])
            start, end = station + lo, station + hi
            if intervals and abs(intervals[-1]["end_m"] - start) < 1e-8:
                intervals[-1]["points"].append(last)
                intervals[-1]["vertex_stations_m"].append(end)
                intervals[-1]["end_m"] = end
            else:
                intervals.append({"start_m": start, "end_m": end, "points": [first, last], "vertex_stations_m": [start, end]})
        station += length
    result = []
    for index, span in enumerate(intervals):
        coords = span.pop("points")
        length = sum(math.dist(a, b) for a, b in zip(coords, coords[1:]))
        out = {"source_edge_id": edge["id"], "fragment": index, "c": [round(v, 8) for p in coords for v in p], **span,
               "source_planar_length_m": station, "source_length_m": edge.get("length", station), "length": length}
        scale = edge.get("length", station) / station if station else 1
        if edge.get("profile"):
            profile = edge["profile"]
            start, end = span["start_m"] * scale, span["end_m"] * scale
            samples = [(start, interpolate(profile, start))]
            samples.extend((profile[i], profile[i + 1]) for i in range(0, len(profile), 2) if start + 1e-8 < profile[i] < end - 1e-8)
            samples.append((end, interpolate(profile, end)))
            out["profile"] = [v for s, y in samples for v in ((s - start) / scale, y)]
            out["profile"][-2] = length
            out["y"] = [interpolate(profile, s * scale) for s in span["vertex_stations_m"]]
        elif edge.get("y"):
            original_stations = [0.0]
            for a, b in zip(points, points[1:]):
                original_stations.append(original_stations[-1] + math.dist(a, b))
            p = [v for s, y in zip(original_stations, edge["y"]) for v in (s, y)]
            out["y"] = [interpolate(p, s) for s in span["vertex_stations_m"]]
        result.append(out)
    return result


def polygon_parts(rings, polygon, identity, repairs):
    shape = Polygon(rings[0], rings[1:])
    if not shape.is_valid:
        shape = make_valid(shape)
        repairs.append({**identity, "operation": "make_valid"})
    parts = components(shape.intersection(polygon), "Polygon")
    parts.sort(key=lambda p: (*p.bounds, p.area, p.wkt))
    result = []
    for index, part in enumerate(parts):
        if part.area <= 1e-9:
            continue
        part = orient(part, sign=1)
        r = [[list(p) for p in ring.coords[:-1]] for ring in [part.exterior, *part.interiors]]
        center = part.representative_point()
        result.append({**identity, "fragment": index, "r": r, "center": [center.x, center.y]})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if shapely.__version__ != "2.1.2":
        raise RuntimeError("Cần Shapely 2.1.2; không thay geometry engine ngầm")
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1:
        raise ValueError("schemaVersion phải là 1")
    polygon = Polygon(data["polygon"])
    if not polygon.is_valid:
        raise ValueError("Polygon vùng không hợp lệ")
    repairs = []
    layers = {}
    for name, items in data.get("layers", {}).items():
        layers[name] = []
        for index, item in enumerate(items):
            rings = item["r"] if isinstance(item, dict) else item
            identity = {"source_id": item["id"], "source_index": index} if isinstance(item, dict) else {"source_index": index}
            layers[name].extend(polygon_parts(rings, polygon, identity, repairs))
    output = {"schemaVersion": 1, "fragments": [f for edge in data["edges"] for f in clip_edge(edge, polygon)], "layers": layers, "repairs": repairs}
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
