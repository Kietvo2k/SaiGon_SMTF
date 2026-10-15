import { describe, expect, it } from 'vitest';
import { alertSummary, horizonText, levelLabel, probPercent, publicAlertSummary } from './alerts';

describe('chữ hiển thị cảnh báo kẹt', () => {
  it('xác suất đổi sang phần trăm nguyên và kẹp trong 0–100', () => {
    expect(probPercent(0.804)).toBe(80);
    expect(probPercent(1.4)).toBe(100);
    expect(probPercent(-0.2)).toBe(0);
  });

  it('số phút làm tròn và có chữ "sau khoảng"', () => {
    expect(horizonText(14.6)).toBe('sau khoảng 15 phút');
  });

  it('nhãn mức kẹp vào 5 nấc', () => {
    expect(levelLabel(4)).toBe('Kẹt nặng');
    expect(levelLabel(9)).toBe('Kẹt nặng');
    expect(levelLabel(-3)).toBe('Thông thoáng');
  });

  it('dòng cán bộ có tên đường, xác suất, độ tin cậy và số phút', () => {
    const line = alertSummary({ edge: 1, name: 'Điện Biên Phủ', prob: 0.8, reliability: 0.65, horizon_min: 15, level: 0.9, band: 4 });
    expect(line).toBe('Điện Biên Phủ: khả năng kẹt 80%, độ tin cậy 65%, sau khoảng 15 phút');
  });

  it('dòng công dân chỉ dựa trên dữ liệu công khai', () => {
    const line = publicAlertSummary({ name: 'Bạch Đằng', level: 4, level_label: 'Kẹt nặng', prob_pct: 72, horizon_min: 20 });
    expect(line).toBe('Bạch Đằng: mức hiện tại kẹt nặng, khả năng kẹt 72%, sau khoảng 20 phút');
  });
});
