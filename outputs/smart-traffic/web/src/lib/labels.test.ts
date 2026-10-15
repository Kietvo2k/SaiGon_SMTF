import { describe, expect, it } from 'vitest';
import {
  complaintKindLabel,
  complaintStatusLabel,
  evidenceKindLabel,
  roleLabel,
  violationLabel,
  violationStatusLabel,
} from './labels';

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
