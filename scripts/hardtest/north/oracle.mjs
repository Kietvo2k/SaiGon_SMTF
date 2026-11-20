import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const region = readJson('work/smtf-agent/north-data-source-inventory.json').region;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function pointInPolygon([x, y], polygon = region) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function between(a, b, t) { return a + (b - a) * t; }

function segmentIntersectionParameter(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denominator = r[0] * s[1] - r[1] * s[0];
  const q = [c[0] - a[0], c[1] - a[1]];
  if (Math.abs(denominator) < 1e-10) return [];
  const t = (q[0] * s[1] - q[1] * s[0]) / denominator;
  const u = (q[0] * r[1] - q[1] * r[0]) / denominator;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [Math.max(0, Math.min(1, t))] : [];
}

export function clippedLength(polyline, polygon = region) {
  let length = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    const a = polyline[index - 1];
    const b = polyline[index];
    const parameters = [0, 1];
    for (let edge = 0; edge < polygon.length; edge += 1) {
      parameters.push(...segmentIntersectionParameter(a, b, polygon[edge], polygon[(edge + 1) % polygon.length]));
    }
    parameters.sort((left, right) => left - right);
    const unique = parameters.filter((value, i, list) => i === 0 || Math.abs(value - list[i - 1]) > 1e-9);
    const fullLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 1; i < unique.length; i += 1) {
      const start = unique[i - 1];
      const end = unique[i];
      const middle = (start + end) / 2;
      const point = [between(a[0], b[0], middle), between(a[1], b[1], middle)];
      if (pointInPolygon(point, polygon)) length += fullLength * (end - start);
    }
  }
  return length;
}

export function pointOutsideEndpoints(polyline, polygon = region) {
  return !pointInPolygon(polyline[0], polygon) && !pointInPolygon(polyline.at(-1), polygon);
}

export function requireMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') throw new Error('Thiếu mapping public-north.');
  if (!Array.isArray(mapping.edgeMap) || !Array.isArray(mapping.nodeMap) || !Array.isArray(mapping.roadMap)) {
    throw new Error('Mapping phải có edgeMap, nodeMap và roadMap.');
  }
  for (const [name, rows] of Object.entries(mapping)) {
    if (!Array.isArray(rows)) continue;
    const seen = new Set();
    for (const row of rows) {
      const key = row.public_edge_id ?? row.public_node_id ?? row.public_road_id ?? row.id;
      if (key != null) {
        if (seen.has(key)) throw new Error(`${name} có ID public trùng: ${key}`);
        seen.add(key);
      }
    }
  }
}

export function assertNorthOnlyRuntime(html, runtime) {
  if (/<script[^>]+src=["']data\/(?:scene|road-graph-31)\.js(?:[?"'])/i.test(html)) {
    throw new Error('Entry public có script trực tiếp nạp scene/graph toàn vùng.');
  }
  if (!html.includes('data/public-north/')) throw new Error('Entry public thiếu đường dẫn data/public-north/.');
  if (/for\s*\(\s*const\s+region\s+of\s+REGIONS_31\s*\)/.test(runtime)) {
    throw new Error('Runtime vẫn prewarm toàn bộ REGIONS_31.');
  }
  if (!/region(?:\s*===|\s*==|\s*:\s*)['"]bac['"]|regionById\(['"]bac['"]\)/.test(runtime)) {
    throw new Error('Runtime không ghim region bac.');
  }
}
