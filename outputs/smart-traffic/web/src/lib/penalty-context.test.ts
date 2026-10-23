import { expect, it } from 'vitest';
import { penaltyContext } from './format';

it('hiện căn cứ và điểm trừ đã xác minh, không gọi dữ liệu chưa xác minh là căn cứ', () => {
  expect(penaltyContext({verified:true,source:'Căn cứ kiểm thử',license_deduction_points:4})).toBe('Căn cứ kiểm thử · Trừ 4 điểm GPLX');
  expect(penaltyContext({verified:false,source:'Nguồn chưa xác minh',license_deduction_points:4})).toBe('');
});
