import { describe, expect, it } from 'vitest';

// Ràng buộc chữ hiển thị (M1 §9.3, brief M4c): không dùng các cụm giả lập/mô phỏng/demo, không nêu tên CSGT hay Bộ Công an.
const BANNED = ['giả lập', 'mô phỏng', 'minh họa', 'illustrative', 'simulated', 'demo', 'fake', 'csgt', 'bộ công an'];
const SOURCES = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PAGES = import.meta.glob('../../*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('chữ hiển thị của web', () => {
  it('mã nguồn và trang HTML không chứa cụm bị cấm (trừ file test)', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries({ ...SOURCES, ...PAGES })) {
      if (/\.test\.tsx?$/.test(path)) continue;
      const lower = text.toLowerCase();
      for (const word of BANNED) {
        if (lower.includes(word)) offenders.push(`${path}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);   // bảo đảm glob không rỗng
  });
});
