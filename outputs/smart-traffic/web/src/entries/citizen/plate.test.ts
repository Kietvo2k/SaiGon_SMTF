import { describe, expect, it } from 'vitest';
import { normalizeLookupPlate } from '../../lib/lookup';
import { formatPlateTyping, formatPlateValue, plateCompact } from './plate';

describe('định dạng biển số khi nhập', () => {
  it('nhận biển ô tô viết liền, không dấu chấm', () => {
    expect(formatPlateValue('51k12345')).toBe('51K-123.45');
    expect(formatPlateValue(' 51K-12345 ')).toBe('51K-123.45');
    expect(formatPlateValue('51K-123.45')).toBe('51K-123.45');
  });

  it('nhận biển xe máy khi gõ dấu gạch sau mã tỉnh', () => {
    expect(formatPlateValue('59-x123456')).toBe('59-X1 234.56');
    expect(formatPlateValue('59-X1 234.56')).toBe('59-X1 234.56');
  });

  it('giữ dấu gạch đầu qua 10 biến thể gõ và dán', () => {
    const variants = [
      '59-x123456',
      '59-X123456',
      '59 - X 123 456',
      '59-X1 234.56',
      '59-X1.234.56',
      '59-x1234.56',
      '59-X 123456',
      '59-B177777',
      '59-B1 777.77',
      ' 59 - b1 777 77 ',
    ];
    for (const raw of variants) {
      const value = formatPlateValue(raw);
      expect(value, raw).toMatch(/^59-[A-Z]\d? \d{3}\.\d{2}$/);
      expect(normalizeLookupPlate(value)?.vehicleClass, raw).toBe('motorbike');
    }
  });

  it('gõ xe máy từng ký tự không mất dấu gạch', () => {
    let value = '';
    for (const char of '59-x123456') {
      const typed = value + char;
      const next = formatPlateTyping(typed, typed.length);
      expect(next.caret, typed).toBeGreaterThan(0);
      value = next.value;
    }
    expect(value).toBe('59-X1 234.56');
    expect(normalizeLookupPlate(value)).toEqual({ plate: '59-X1 234.56', vehicleClass: 'motorbike' });
  });

  it('giữ dấu gạch khi vừa gõ xong mã tỉnh', () => {
    expect(formatPlateTyping('59-', 3)).toEqual({ value: '59-', caret: 3 });
    expect(formatPlateValue('59-x')).toBe('59-X');
    expect(formatPlateValue('59-x1')).toBe('59-X1');
    expect(formatPlateValue('59-x12')).toBe('59-X1 2');
  });

  it('giữ series hai ký tự của ô tô khi đủ 9 ký tự', () => {
    expect(formatPlateValue('51K112345')).toBe('51K1-123.45');
  });

  it('định dạng dần khi người dùng đang gõ', () => {
    expect(formatPlateValue('5')).toBe('5');
    expect(formatPlateValue('51')).toBe('51');
    expect(formatPlateValue('51k')).toBe('51K');
    expect(formatPlateValue('51k123')).toBe('51K-123');
    expect(formatPlateValue('51k1234')).toBe('51K-123.4');
  });

  it('bỏ ký tự lạ và giới hạn đúng 9 ký tự chữ số', () => {
    expect(plateCompact('51K-123.45!@#')).toBe('51K12345');
    expect(plateCompact('1234567890')).toBe('123456789');
    expect(formatPlateValue('51K 123 45')).toBe('51K-123.45');
  });

  it('đặt con trỏ theo số ký tự đã nhập, không nhảy về cuối', () => {
    // "51K1|2345" → chèn dấu gạch nhưng con trỏ vẫn sau số 1 của series.
    expect(formatPlateTyping('51K12345', 4)).toEqual({ value: '51K-123.45', caret: 5 });
    // Sửa một số ở giữa: "51K-1|23.45"
    expect(formatPlateTyping('51K-123.45', 5)).toEqual({ value: '51K-123.45', caret: 5 });
    // Đầu chuỗi
    expect(formatPlateTyping('51K-123.45', 0).caret).toBe(0);
  });

  it('giữ chuỗi rỗng là rỗng', () => {
    expect(formatPlateTyping('', 0)).toEqual({ value: '', caret: 0 });
    expect(formatPlateTyping('...', 3)).toEqual({ value: '', caret: 0 });
  });
});
