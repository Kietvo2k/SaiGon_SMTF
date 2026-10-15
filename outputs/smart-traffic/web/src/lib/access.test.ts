import { describe, expect, it } from 'vitest';
import { canControl, officerTabs } from './access';

describe('officerTabs theo vai trò', () => {
  it('cán bộ thấy Vi phạm, Khiếu nại, Thống kê, Bản đồ nhiệt, Điều khiển (chỉ xem); không thấy Nhật ký và Quản trị', () => {
    expect(officerTabs('officer')).toEqual(['violations', 'complaints', 'stats', 'heat', 'controls']);
    expect(officerTabs('officer')).not.toContain('audit');
    expect(officerTabs('officer')).not.toContain('staff');
  });

  it('chỉ huy trực ban thêm Nhật ký nhưng không có Quản trị cán bộ', () => {
    expect(officerTabs('commander')).toEqual(['violations', 'complaints', 'stats', 'heat', 'controls', 'audit']);
    expect(officerTabs('commander')).not.toContain('staff');
  });

  it('mọi cán bộ đều thấy Bản đồ nhiệt và Điều khiển', () => {
    for (const role of ['officer', 'commander', 'admin']) {
      expect(officerTabs(role)).toContain('heat');
      expect(officerTabs(role)).toContain('controls');
    }
  });

  it('quản trị viên thấy đủ 7 tab', () => {
    expect(officerTabs('admin')).toHaveLength(7);
    expect(officerTabs('admin')).toContain('staff');
    expect(officerTabs('admin')).toContain('audit');
  });

  it('công dân, trạm hoặc không đăng nhập không thấy tab cán bộ nào', () => {
    expect(officerTabs('citizen')).toEqual([]);
    expect(officerTabs('station')).toEqual([]);
    expect(officerTabs(null)).toEqual([]);
    expect(officerTabs(undefined)).toEqual([]);
  });
});

describe('canControl: chỉ chỉ huy và quản trị được điều khiển', () => {
  it('chỉ huy trực ban và quản trị viên được ghi', () => {
    expect(canControl('commander')).toBe(true);
    expect(canControl('admin')).toBe(true);
  });

  it('cán bộ chỉ xem; vai trò khác không được ghi', () => {
    expect(canControl('officer')).toBe(false);
    expect(canControl('citizen')).toBe(false);
    expect(canControl(null)).toBe(false);
  });
});
