// Kiểu dữ liệu theo hợp đồng API M6 (đặc tả §4.5, mục "API M6"). Chỉ khai báo trường web thực dùng.

export interface Penalty {
  vnd_min: number | null;
  vnd_max: number | null;
  verified: boolean;
}

export interface Me {
  id: number;
  username: string;
  role: string;
  display_name: string | null;
  plates: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page?: number;
}

// Vi phạm nhìn từ cán bộ (GET /officer/violations).
export interface OfficerViolation {
  id: string;
  violation_code: string;
  status: string;
  plate: string;
  vehicle_class: string;
  occurred_at: string;
  node_id: string;
  camera_id: string;
  confidence: number;
  penalty: Penalty | null;
  priority_flag: boolean;
  priority_reason: string | null;
}

export interface OfficerComplaint {
  id: string;
  violation_id: string;
  kind: string;
  reason: string;
  message: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
  plate: string;
  violation_code: string;
  violation_status: string;
  priority_flag: boolean;
  priority_reason: string | null;
}

// Vi phạm của công dân (GET /citizen/violations).
export interface CitizenViolationItem {
  id: string;
  violation_code: string;
  violation_label: string;
  status: string;
  plate: string;
  occurred_at: string;
  node_label: string | null;
  penalty: Penalty;
}

export interface CitizenComplaintRef {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export interface CitizenViolationDetail extends CitizenViolationItem {
  camera_id: string | null;
  evidence: { kind: string; url: string }[];
  complaints: CitizenComplaintRef[];
  can_pay: boolean;
  can_complain: boolean;
}

export interface CitizenComplaintDetail {
  id: string;
  violation_id: string;
  kind: string;
  reason: string;
  message: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CitizenAccount {
  id: number;
  username: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  plates: { plate: string; vehicle_class: string; bound_at: string }[];
  max_plates: number;
}

export interface AppNotification {
  id: string;
  violation_id: string | null;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  unread: number;
  page: number;
}

// Thống kê (GET /officer/stats).
export interface Stats {
  from: string | null;
  to: string | null;
  total: number;
  by_node: { node_id: string; node_label: string | null; count: number }[];
  by_code: { violation_code: string; count: number }[];
  by_status: { status: string; count: number }[];
  by_hour: { hour: number; count: number }[];
}

export interface AuditRow {
  id: number;
  actor: string;
  role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  payload: unknown;
  created_at: string;
}

export interface StaffUser {
  id: number;
  username: string;
  role: string;
  display_name: string | null;
  active: boolean;
  created_at: string | null;
}

export interface Kpi {
  wait_avg_s?: number;
  queue_max?: number;
  flow_per_min?: number;
  mode?: string;
}
