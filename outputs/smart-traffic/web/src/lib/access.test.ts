import { describe, expect, it } from 'vitest';
import { officerTabs } from './access';

describe('officerTabs theo vai trò', () => {
  it('cán bộ thấy Vi phạm, Khiếu nại, Thống kê; không thấy Nhật ký và Quản trị', () => {
    expect(officerTabs('officer')).toEqual(['violations', 'complaints', 'stats', 'heat']);
    expect(officerTabs('officer')).not.toContain('audit');
    expect(officerTabs('officer')).not.toContain('staff');
  });

  it('chỉ huy trực ban thêm Nhật ký nhưng không có Quản trị cán bộ', () => {
    expect(officerTabs('commander')).toEqual(['violations', 'complaints', 'stats', 'heat', 'audit']);
    expect(officerTabs('commander')).not.toContain('staff');
  });

  it('mọi cán bộ đều thấy Bản đồ nhiệt', () => {
    for (const role of ['officer', 'commander', 'admin']) {
      expect(officerTabs(role)).toContain('heat');
    }
  });

  it('quản trị viên thấy đủ 6 tab', () => {
    expect(officerTabs('admin')).toHaveLength(6);
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
