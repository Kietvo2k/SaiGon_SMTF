import { describe, expect, it } from 'vitest';
import { formatPenalty, formatVnd } from './format';

describe('formatPenalty', () => {
  it('không lộ số tiền khi mức phạt chưa xác minh', () => {
    expect(formatPenalty({ vnd_min: null, vnd_max: null, verified: false }))
      .toBe('Mức phạt đang cập nhật theo NĐ 168/2024/NĐ-CP');
  });

  it('không lộ số tiền khi thiếu dữ liệu penalty', () => {
    expect(formatPenalty(null)).toBe('Mức phạt đang cập nhật theo NĐ 168/2024/NĐ-CP');
    expect(formatPenalty(undefined)).toBe('Mức phạt đang cập nhật theo NĐ 168/2024/NĐ-CP');
  });

  it('hiện khoảng tiền khi đã xác minh', () => {
    const text = formatPenalty({ vnd_min: 18000000, vnd_max: 20000000, verified: true });
    expect(text).toBe(`${formatVnd(18000000)} – ${formatVnd(20000000)}`);
    expect(text).toContain('đ');
  });

  it('thay giá trị thiếu bằng 0 khi đã xác minh nhưng chưa có số', () => {
    expect(formatPenalty({ vnd_min: undefined, vnd_max: null, verified: true }))
      .toBe(`${formatVnd(0)} – ${formatVnd(0)}`);
  });
});

describe('formatVnd', () => {
  it('ghi số theo kiểu Việt Nam kèm ký hiệu đ', () => {
    expect(formatVnd(1500000)).toBe(`${(1500000).toLocaleString('vi-VN')} đ`);
    expect(formatVnd(0)).toBe('0 đ');
  });
});
