// Quyền truy cập theo vai trò (lấy từ /auth/me). Backend vẫn là nơi kiểm quyền thật; đây chỉ quyết định tab hiển thị.

export type OfficerTab = 'violations' | 'complaints' | 'stats' | 'audit' | 'staff';

export const OFFICER_TAB_LABELS: Record<OfficerTab, string> = {
  violations: 'Vi phạm',
  complaints: 'Khiếu nại',
  stats: 'Thống kê',
  audit: 'Nhật ký',
  staff: 'Quản trị cán bộ',
};

const TABS_BY_ROLE: Record<string, OfficerTab[]> = {
  officer: ['violations', 'complaints', 'stats'],
  commander: ['violations', 'complaints', 'stats', 'audit'],
  admin: ['violations', 'complaints', 'stats', 'audit', 'staff'],
};

// Vai trò không thuộc cán bộ (công dân, trạm, rỗng) không có tab nào.
export function officerTabs(role: string | null | undefined): OfficerTab[] {
  return (role && TABS_BY_ROLE[role]) || [];
}
