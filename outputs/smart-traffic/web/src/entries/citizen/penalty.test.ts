import { describe, expect, it } from 'vitest';
import { citizenPenaltyContext } from './penalty';

describe('căn cứ mức phạt ở trang công dân', () => {
  it('bỏ phần trừ điểm khi bằng 0 hoặc không có', () => {
    expect(citizenPenaltyContext({ verified: true, source: 'NĐ 168/2024/NĐ-CP', license_deduction_points: 0 }))
      .toBe('NĐ 168/2024/NĐ-CP');
    expect(citizenPenaltyContext({ verified: true, source: 'NĐ 168/2024/NĐ-CP', license_deduction_points: null }))
      .toBe('NĐ 168/2024/NĐ-CP');
  });

  it('giữ phần trừ điểm khi lớn hơn 0', () => {
    expect(citizenPenaltyContext({ verified: true, source: 'NĐ 168/2024/NĐ-CP', license_deduction_points: 4 }))
      .toBe('NĐ 168/2024/NĐ-CP · Trừ 4 điểm GPLX');
  });

  it('không hiện căn cứ khi chưa xác minh', () => {
    expect(citizenPenaltyContext({ verified: false, source: 'NĐ 168/2024/NĐ-CP', license_deduction_points: 4 })).toBe('');
  });
});
