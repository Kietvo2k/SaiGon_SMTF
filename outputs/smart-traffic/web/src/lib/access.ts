// Quyền truy cập theo vai trò (lấy từ /auth/me). Backend vẫn là nơi kiểm quyền thật; đây chỉ quyết định tab và nút hiển thị.

export type OfficerTab = 'violations' | 'complaints' | 'stats' | 'heat' | 'controls' | 'audit' | 'staff';

export const OFFICER_TAB_LABELS: Record<OfficerTab, string> = {
  violations: 'Vi phạm',
  complaints: 'Khiếu nại',
  stats: 'Thống kê',
  heat: 'Bản đồ nhiệt',
  controls: 'Điều khiển',
  audit: 'Nhật ký',
  staff: 'Quản trị cán bộ',
};

const TABS_BY_ROLE: Record<string, OfficerTab[]> = {
  officer: ['violations', 'complaints', 'stats', 'heat', 'controls'],
  commander: ['violations', 'complaints', 'stats', 'heat', 'controls', 'audit'],
  admin: ['violations', 'complaints', 'stats', 'heat', 'controls', 'audit', 'staff'],
};

// Vai trò không thuộc cán bộ (công dân, trạm, rỗng) không có tab nào.
export function officerTabs(role: string | null | undefined): OfficerTab[] {
  return (role && TABS_BY_ROLE[role]) || [];
}

// Chỉ chỉ huy trực ban và quản trị viên được ghi đè đèn, chạy kịch bản, soạn VMS; cán bộ chỉ xem.
export function canControl(role: string | null | undefined): boolean {
  return role === 'commander' || role === 'admin';
}
