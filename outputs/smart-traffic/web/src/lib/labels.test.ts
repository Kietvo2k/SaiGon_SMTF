import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  complaintKindLabel,
  complaintStatusLabel,
  displayNodeLabel,
  evidenceKindLabel,
  roleLabel,
  violationLabel,
  violationStatusLabel,
} from './labels';

// Bảng nhãn chuẩn nằm ở backend (schemas.py). Test đọc thẳng file để nhãn web không lệch chữ với backend.
function backendViolationLabels(): Record<string, string> {
  const src = readFileSync(new URL('../../../backend/app/schemas.py', import.meta.url), 'utf8');
  const block = src.match(/VIOLATION_LABELS\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('Không đọc được VIOLATION_LABELS trong schemas.py');
  const map: Record<string, string> = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*'([^']+)':\s*'([^']*)',?\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

describe('violationLabel theo bảng nhãn backend', () => {
  const backend = backendViolationLabels();
  const codes = Object.keys(backend);

  it('đọc được đủ 12 mã của đặc tả từ backend', () => {
    expect(codes.length).toBe(12);
    expect(codes).toContain('STOP-LINE');
    expect(codes).toContain('NO-PRIORITY');
  });

  it('mọi mã backend đều có nhãn tiếng Việt, không hiện mã thô', () => {
    for (const code of codes) {
      const label = violationLabel(code);
      expect(label, code).toBe(backend[code]);
      expect(label, code).not.toBe(code);
      expect(label.length, code).toBeGreaterThan(0);
    }
  });

  it('hai mã khác nhau không dùng cùng nhãn', () => {
    const labels = codes.map((c) => violationLabel(c));
    expect(new Set(labels).size).toBe(codes.length);
  });
});

describe('displayNodeLabel', () => {
  it('đổi ký hiệu giao "∩" thành "×" và giữ nguyên phần còn lại', () => {
    expect(displayNodeLabel('Cầu vượt Hàng Xanh ∩ Điện Biên Phủ')).toBe('Cầu vượt Hàng Xanh × Điện Biên Phủ');
    expect(displayNodeLabel('Bạch Đằng∩Đinh Bộ Lĩnh')).toBe('Bạch Đằng × Đinh Bộ Lĩnh');
  });

  it('không đụng tên không có "∩" và xử lý giá trị rỗng', () => {
    expect(displayNodeLabel('HX-01')).toBe('HX-01');
    expect(displayNodeLabel(null)).toBe('');
    expect(displayNodeLabel(undefined)).toBe('');
  });
});

describe('violationStatusLabel', () => {
  it('có nhãn tiếng Việt cho đủ 7 trạng thái vòng đời', () => {
    const statuses = ['new', 'needs_review', 'confirmed', 'notified', 'paid', 'disputed', 'dismissed'];
    for (const s of statuses) {
      const label = violationStatusLabel(s);
      expect(label).not.toBe(s);
      expect(label.length).toBeGreaterThan(0);
    }
    expect(violationStatusLabel('notified')).toBe('Đã thông báo');
    expect(violationStatusLabel('paid')).toBe('Đã nộp phạt');
  });

  it('trả lại mã gốc khi gặp trạng thái lạ', () => {
    expect(violationStatusLabel('archived')).toBe('archived');
  });
});

describe('complaintStatusLabel', () => {
  it('công dân và cán bộ thấy cùng trạng thái khác cách diễn đạt', () => {
    expect(complaintStatusLabel('rejected', 'officer')).toBe('Đã giữ vi phạm');
    expect(complaintStatusLabel('rejected', 'citizen')).not.toBe(complaintStatusLabel('rejected', 'officer'));
    expect(complaintStatusLabel('resolved', 'officer')).toBe('Đã gỡ vi phạm');
    expect(complaintStatusLabel('open', 'citizen')).toContain('chờ');
  });
});

describe('nhãn khác', () => {
  it('loại khiếu nại có đủ nhãn', () => {
    expect(complaintKindLabel('priority_vehicle')).toContain('ưu tiên');
    expect(complaintKindLabel('wrong_plate')).toContain('biển số');
    expect(complaintKindLabel('other')).toBe('Lý do khác');
  });

  it('mã vi phạm RED-LIGHT đổi thành nhãn đầy đủ', () => {
    expect(violationLabel('RED-LIGHT')).toBe('Không chấp hành hiệu lệnh của đèn tín hiệu giao thông');
    expect(violationLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it('vai trò và loại bằng chứng', () => {
    expect(roleLabel('commander')).toBe('Chỉ huy trực ban');
    expect(roleLabel(undefined)).toBe('Không rõ vai trò');
    expect(evidenceKindLabel('plate_crop')).toBe('Ảnh biển số');
    expect(evidenceKindLabel('other')).toBe('Bằng chứng');
  });
});
