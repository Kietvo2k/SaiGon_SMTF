// Nhãn tiếng Việt cho trạng thái, loại khiếu nại, vai trò và bằng chứng.

export const VIOLATION_CODE_LABELS: Record<string, string> = {
  'RED-LIGHT': 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
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

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  before: 'Trước khi vượt vạch',
  after: 'Sau khi vượt vạch',
  plate_crop: 'Ảnh biển số',
};

export function evidenceKindLabel(kind: string): string {
  return EVIDENCE_KIND_LABELS[kind] ?? 'Bằng chứng';
}
