// Nhãn tiếng Việt cho trạng thái, loại khiếu nại, vai trò và bằng chứng.

// Chép đúng chữ từ bảng nhãn của backend (schemas.py VIOLATION_LABELS) và CODE_LABEL_32 của 3D.
// Có test đọc thẳng schemas.py để hai bộ nhãn không lệch chữ.
export const VIOLATION_CODE_LABELS: Record<string, string> = {
  'RED-LIGHT': 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
  'STOP-LINE': 'Không chấp hành vạch kẻ đường (dừng quá vạch)',
  LANE: 'Đi không đúng phần đường, làn đường',
  'WRONG-WAY': 'Đi ngược chiều đường một chiều',
  SPEED: 'Chạy quá tốc độ quy định',
  PARK: 'Dừng, đỗ xe trái quy định',
  'NO-HELMET': 'Không đội mũ bảo hiểm khi điều khiển xe máy',
  'NO-PRIORITY': 'Không nhường đường cho xe ưu tiên',
  OVERLOAD: 'Chở quá số người quy định',
  'WRONG-TURN': 'Rẽ, quay đầu nơi có biển cấm',
  PHONE: 'Sử dụng điện thoại khi đang lái xe',
  'NO-SEATBELT': 'Không thắt dây đai an toàn khi lái xe',
};

export function violationLabel(code: string): string {
  return VIOLATION_CODE_LABELS[code] ?? code;
}

const VIOLATION_STATUS_LABELS: Record<string, string> = {
  new: 'Mới ghi nhận',
  needs_review: 'Cần xác minh',
  confirmed: 'Đã xác nhận',
  notified: 'Đã thông báo',
  paid: 'Đã nộp phạt',
  disputed: 'Đang khiếu nại',
  dismissed: 'Đã gỡ',
};

export function violationStatusLabel(status: string): string {
  return VIOLATION_STATUS_LABELS[status] ?? status;
}

export const COMPLAINT_KIND_LABELS: Record<string, string> = {
  priority_vehicle: 'Xe được ưu tiên đi trước',
  wrong_plate: 'Sai biển số, không phải xe của tôi',
  other: 'Lý do khác',
};

export function complaintKindLabel(kind: string): string {
  return COMPLAINT_KIND_LABELS[kind] ?? kind;
}

// Cán bộ nhìn theo hành động xử lý; công dân nhìn theo kết quả đối với mình.
export function complaintStatusLabel(status: string, view: 'officer' | 'citizen'): string {
  if (view === 'citizen') {
    const citizen: Record<string, string> = {
      open: 'Đang chờ cán bộ xử lý',
      resolved: 'Được chấp nhận, vi phạm đã được gỡ',
      rejected: 'Chưa được chấp nhận, vi phạm vẫn có hiệu lực',
    };
    return citizen[status] ?? status;
  }
  const officer: Record<string, string> = {
    open: 'Chờ xử lý',
    resolved: 'Đã gỡ vi phạm',
    rejected: 'Đã giữ vi phạm',
  };
  return officer[status] ?? status;
}

export const ROLE_LABELS: Record<string, string> = {
  citizen: 'Công dân',
  officer: 'Cán bộ xử lý',
  commander: 'Chỉ huy trực ban',
  admin: 'Quản trị hệ thống',
  station: 'Trạm giám sát',
  system: 'Hệ thống',
};

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role]) || 'Không rõ vai trò';
}

// Tên nút giao trong dữ liệu dùng ký hiệu "∩" (giao nhau); giao diện cán bộ hiển thị "×" cho dễ đọc.
export function displayNodeLabel(label: string | null | undefined): string {
  return (label ?? '').replace(/\s*∩\s*/g, ' × ');
}

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  before: 'Trước khi vượt vạch',
  after: 'Sau khi vượt vạch',
  plate_crop: 'Ảnh biển số',
};

export function evidenceKindLabel(kind: string): string {
  return EVIDENCE_KIND_LABELS[kind] ?? 'Bằng chứng';
}
