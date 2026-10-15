import { describe, expect, it } from 'vitest';
import {
  normalizeVmsText,
  overrideDurationError,
  phaseLabel,
  remainingSeconds,
  scenarioLabel,
  SCENARIO_OPTIONS,
  vmsTextError,
} from './controls';

describe('kịch bản', () => {
  it('có đủ 4 kịch bản và mục dừng "Không", theo đúng khóa của backend', () => {
    expect(SCENARIO_OPTIONS.map(o => o.key)).toEqual(['peak-hang-xanh', 'lane-block', 'flood-nhc', 'priority-run', 'none']);
    expect(scenarioLabel('flood-nhc')).toBe('Ngập Nguyễn Hữu Cảnh');
    expect(scenarioLabel(null)).toBe('Không có kịch bản');
    expect(scenarioLabel('unknown-key')).toBe('unknown-key');
  });
});

describe('nhãn pha đèn', () => {
  it('xanh và vàng kèm nhóm; đỏ không kèm nhóm; chưa có dữ liệu', () => {
    expect(phaseLabel('green', 0)).toBe('Xanh (nhóm 0)');
    expect(phaseLabel('yellow', 1)).toBe('Vàng (nhóm 1)');
    expect(phaseLabel('red', null)).toBe('Đỏ');
    expect(phaseLabel(null, null)).toBe('Chưa có dữ liệu');
  });
});

describe('nội dung VMS', () => {
  it('chế độ thủ công cần nội dung; chế độ tự động bỏ qua ô nhập', () => {
    expect(vmsTextError('   ', 'manual')).toContain('cần nhập');
    expect(vmsTextError('', 'auto')).toBe('');
    expect(vmsTextError('a'.repeat(80), 'auto')).toBe('');   // đã chọn Tự động thì nội dung cũ không chặn lưu
  });

  it('tối đa 60 ký tự sau khi gọn khoảng trắng', () => {
    expect(vmsTextError('a'.repeat(60), 'manual')).toBe('');
    expect(vmsTextError('a'.repeat(61), 'manual')).toContain('60');
    const spaced = 'a  '.repeat(20) + 'b';   // dài thô 61 ký tự nhưng sau khi gọn chỉ còn 41
    expect(spaced.length).toBeGreaterThan(60);
    expect(vmsTextError(spaced, 'manual')).toBe('');
  });

  it('gọn khoảng trắng để đếm đúng với phía máy chủ', () => {
    expect(normalizeVmsText('  Ùn   tắc\n phía trước ')).toBe('Ùn tắc phía trước');
  });
});

describe('thời gian ghi đè', () => {
  it('chấp nhận 5 đến 600 giây nguyên; từ chối phần còn lại', () => {
    expect(overrideDurationError(5)).toBe('');
    expect(overrideDurationError(600)).toBe('');
    expect(overrideDurationError(4)).not.toBe('');
    expect(overrideDurationError(601)).not.toBe('');
    expect(overrideDurationError(12.5)).not.toBe('');
    expect(overrideDurationError(Number.NaN)).not.toBe('');
  });
});

describe('thời gian còn lại của ghi đè', () => {
  it('làm tròn lên, không âm, thời điểm lỗi → 0', () => {
    const now = Date.parse('2026-10-16T02:00:00Z');
    expect(remainingSeconds('2026-10-16T02:00:30Z', now)).toBe(30);
    expect(remainingSeconds('2026-10-16T02:00:00.200Z', now)).toBe(1);
    expect(remainingSeconds('2026-10-16T01:59:00Z', now)).toBe(0);
    expect(remainingSeconds('không phải ngày', now)).toBe(0);
    expect(remainingSeconds(null, now)).toBe(0);
  });
});
