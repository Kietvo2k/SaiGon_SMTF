import { describe, expect, it } from 'vitest';
import { normalizeLookupPlate } from './lookup';

describe('chuẩn hóa biển số tra cứu', () => {
  it('nhận biển ô tô viết liền hoặc có dấu phân cách', () => {
    expect(normalizeLookupPlate(' 51k88888 ')).toEqual({plate:'51K-888.88', vehicleClass:'car'});
    expect(normalizeLookupPlate('51K-888.88')).toEqual({plate:'51K-888.88', vehicleClass:'car'});
  });
  it('nhận biển xe máy mà không cần hỏi loại xe', () => {
    expect(normalizeLookupPlate('59-x1 234.56')).toEqual({plate:'59-X1 234.56', vehicleClass:'motorbike'});
  });
  it('từ chối đầu vào không thể là biển số trước khi gửi API', () => {
    for (const value of ['', 'ABC', '51K-123', '<script>', '51K-1234567']) expect(normalizeLookupPlate(value)).toBeNull();
  });
});
