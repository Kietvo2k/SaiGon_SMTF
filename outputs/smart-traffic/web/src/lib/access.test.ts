import { describe, expect, it } from 'vitest';
import { officerTabs } from './access';

describe('officerTabs theo vai trò', () => {
  it('cán bộ thấy Vi phạm, Khiếu nại, Thống kê; không thấy Nhật ký và Quản trị', () => {
    expect(officerTabs('officer')).toEqual(['violations', 'complaints', 'stats']);
    expect(officerTabs('officer')).not.toContain('audit');
    expect(officerTabs('officer')).not.toContain('staff');
  });

  it('chỉ huy trực ban thêm Nhật ký nhưng không có Quản trị cán bộ', () => {
    expect(officerTabs('commander')).toEqual(['violations', 'complaints', 'stats', 'audit']);
    expect(officerTabs('commander')).not.toContain('staff');
  });

  it('quản trị viên thấy đủ 5 tab', () => {
    expect(officerTabs('admin')).toHaveLength(5);
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
