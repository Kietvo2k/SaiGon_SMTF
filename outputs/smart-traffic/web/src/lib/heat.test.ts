import { describe, expect, it } from 'vitest';
import north from '../../public/north-roads-32.json';
// @ts-expect-error -- heat-32.js là module JS thuần ngoài web/, không có khai báo kiểu
import { HEAT_COLORS_32 as SOURCE_COLORS, colorOf as sourceColorOf } from '../../../../hcmc-poc/heat-32.js';
import { HEAT_COLORS_32, LEVEL_LABELS, bandOf, colorOf, roadWidth } from './heat';

const GRID = [-1, 0, 0.05, 0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 0.99, 1, 2, Number.NaN];
const ALLOWED = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];

describe('bảng màu nhiệt khớp heat-32.js', () => {
  it('có đúng 5 nấc và trùng với HEAT_COLORS_32 của heat-32.js', () => {
    expect(HEAT_COLORS_32).toHaveLength(5);
    expect(HEAT_COLORS_32).toEqual(SOURCE_COLORS);
    expect(LEVEL_LABELS).toHaveLength(5);
  });

  it('colorOf cho cùng màu với colorOf của heat-32.js ở mọi mức thử', () => {
    for (const level of GRID) {
      expect(colorOf(level)).toBe(sourceColorOf(level));
    }
  });

  it('bandOf chia 5 nấc đều theo mức 0–1 và kẹp đầu cuối', () => {
    expect(bandOf(0)).toBe(0);
    expect(bandOf(0.2)).toBe(1);
    expect(bandOf(0.45)).toBe(2);
    expect(bandOf(0.7)).toBe(3);
    expect(bandOf(0.999)).toBe(4);
    expect(bandOf(1)).toBe(4);
    expect(bandOf(Number.NaN)).toBe(0);
    for (const level of GRID) {
      expect(HEAT_COLORS_32[bandOf(level)]).toBe(colorOf(level));
    }
  });
});

describe('độ dày nét theo cấp đường', () => {
  it('đường chính dày hơn đường nhỏ, đường nối mảnh hơn đường chính', () => {
    expect(roadWidth('primary')).toBeGreaterThan(roadWidth('secondary'));
    expect(roadWidth('secondary')).toBeGreaterThan(roadWidth('tertiary'));
    expect(roadWidth('primary_link')).toBeLessThan(roadWidth('primary'));
    expect(roadWidth('unknown_kind')).toBe(2);
  });
});

describe('north-roads-32.json (xuất từ scripts/export_north_roads_32.py)', () => {
  it('các cạnh có chỉ số duy nhất, cấp ≥ tertiary và đủ đỉnh', () => {
    expect(north.edges.length).toBeGreaterThan(500);
    const ids = north.edges.map(e => e.edge);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const e of north.edges) {
      expect(ALLOWED).toContain(e.highway);
      expect(e.coords.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('bbox bao trọn mọi đỉnh và có đúng 6 nút HX', () => {
    const [x0, z0, x1, z1] = north.bbox;
    for (const e of north.edges) {
      for (const [x, z] of e.coords) {
        expect(x).toBeGreaterThanOrEqual(x0);
        expect(x).toBeLessThanOrEqual(x1);
        expect(z).toBeGreaterThanOrEqual(z0);
        expect(z).toBeLessThanOrEqual(z1);
      }
    }
    expect(north.nodes.map(n => n.id)).toEqual(['HX-01', 'HX-02', 'HX-03', 'HX-04', 'HX-05', 'HX-06']);
  });

  it('dung lượng dưới 1,5 MB', () => {
    expect(JSON.stringify(north).length).toBeLessThan(1.5 * 1024 * 1024);
  });
});
