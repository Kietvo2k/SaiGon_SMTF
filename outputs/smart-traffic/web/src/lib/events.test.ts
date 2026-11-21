import { describe, expect, it } from 'vitest';
import { parseStationEvent, type IncidentEvent, type ViolationEvent } from './events';

describe('parseStationEvent', () => {
  it('chấp nhận tin incident đủ trường, kèm mốc giờ mặc định', () => {
    const event = parseStationEvent({ type: 'incident', node: 'Bac-02', lane: 'Điện Biên Phủ · làn phải', plan: 'Mở làn phụ + xanh kéo dài nhóm A', status: 'before' }, 12345);
    expect(event).toEqual({ type: 'incident', node: 'Bac-02', lane: 'Điện Biên Phủ · làn phải', plan: 'Mở làn phụ + xanh kéo dài nhóm A', status: 'before', at: 12345 });
  });

  it('chấp nhận tin violation kèm độ tin cậy, kẹp vào [0,1]', () => {
    const event = parseStationEvent({ type: 'violation', code: 'RED-LIGHT', label: 'Vượt đèn đỏ', plate: '51K-123.45', cameraId: 'CAM-BAC-002', confidence: 1.7 }, 99);
    expect((event as ViolationEvent).confidence).toBe(1);
    const low = parseStationEvent({ type: 'violation', code: 'SPEED', label: 'Quá tốc độ', plate: '60C-999.88', cameraId: 'CAM-BAC-005', confidence: -0.2 }, 99);
    expect((low as ViolationEvent).confidence).toBe(0);
    const none = parseStationEvent({ type: 'violation', code: 'NO-HELMET', label: 'Không đội mũ bảo hiểm', plate: '59-X1 234.56', cameraId: 'CAM-BAC-003' }, 99);
    expect((none as ViolationEvent).confidence).toBeNull();
  });

  it('chấp nhận tin điều khiển từ bàn cưỡng chế: ghim đèn, bơm xe, xe ưu tiên', () => {
    expect(parseStationEvent({ type: 'pin', node: 'HX-C1', group: 'A', seconds: 60 }, 7))
      .toEqual({ type: 'pin', node: 'HX-C1', group: 'A', seconds: 60, at: 7 });
    expect(parseStationEvent({ type: 'spawn', count: 12 }, 8))
      .toEqual({ type: 'spawn', count: 12, at: 8 });
    expect(parseStationEvent({ type: 'ambulance', kind: 'fire', at: 9 }))
      .toEqual({ type: 'ambulance', kind: 'fire', at: 9 });
  });

  it('từ chối tin thiếu trường hoặc kiểu lạ', () => {
    expect(parseStationEvent(null)).toBeNull();
    expect(parseStationEvent('x')).toBeNull();
    expect(parseStationEvent({ type: 'incident', node: '', lane: 'l', plan: 'p', status: 'before' })).toBeNull();
    expect(parseStationEvent({ type: 'incident', node: 'n', lane: 'l', plan: 'p', status: 'during' })).toBeNull();
    expect(parseStationEvent({ type: 'violation', code: 'RED-LIGHT', label: 'Vượt đèn đỏ', plate: '', cameraId: 'CAM-BAC-002' })).toBeNull();
    expect(parseStationEvent({ type: 'pin', node: '', group: 'A', seconds: 60 })).toBeNull();
    expect(parseStationEvent({ type: 'pin', node: 'HX-C1', group: 'A', seconds: 0 })).toBeNull();
    expect(parseStationEvent({ type: 'spawn', count: 0 })).toBeNull();
    expect(parseStationEvent({ type: 'ambulance', kind: 'plane' })).toBeNull();
    expect(parseStationEvent({ type: 'other' })).toBeNull();
  });

  it('giữ nguyên trạng thái before/after của incident cho banner trước/sau', () => {
    const before = parseStationEvent({ type: 'incident', node: 'HX-01', lane: 'Hàng Xanh · làn 1', plan: 'Điều tiết qua đường khác', status: 'before' }, 1) as IncidentEvent;
    const after = parseStationEvent({ type: 'incident', node: 'HX-01', lane: 'Hàng Xanh · làn 1', plan: 'Điều tiết qua đường khác', status: 'after' }, 2) as IncidentEvent;
    expect(before.status).toBe('before');
    expect(after.status).toBe('after');
  });
});
