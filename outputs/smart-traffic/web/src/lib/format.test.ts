import { describe, expect, it } from 'vitest';
import { formatDateInput, formatPenalty, formatVnd, isoToVi, parseDateVi } from './format';

describe('ô ngày dd/mm/yyyy', () => {
  it('tự chèn "/" và bỏ ký tự không phải chữ số', () => {
    expect(formatDateInput('1')).toBe('1');
    expect(formatDateInput('16')).toBe('16');
    expect(formatDateInput('161')).toBe('16/1');
    expect(formatDateInput('16102026')).toBe('16/10/2026');
    expect(formatDateInput('16/10/2026')).toBe('16/10/2026');
    expect(formatDateInput('16/10/20261')).toBe('16/10/2026');   // tối đa 8 chữ số
    expect(formatDateInput('ab')).toBe('');
  });

  it('đổi dd/mm/yyyy hợp lệ sang yyyy-mm-dd, từ chối ngày không tồn tại và sai mẫu', () => {
    expect(parseDateVi('16/10/2026')).toBe('2026-10-16');
    expect(parseDateVi('29/02/2028')).toBe('2028-02-29');
    expect(parseDateVi('31/02/2026')).toBeNull();
    expect(parseDateVi('29/02/2027')).toBeNull();
    expect(parseDateVi('2026/10/16')).toBeNull();
    expect(parseDateVi('16/10/26')).toBeNull();
    expect(parseDateVi('16/1')).toBeNull();
  });

  it('hiển thị ISO theo dd/mm/yyyy', () => {
    expect(isoToVi('2026-10-16')).toBe('16/10/2026');
    expect(isoToVi('')).toBe('');
    expect(isoToVi('không phải ngày')).toBe('');
  });
});

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
