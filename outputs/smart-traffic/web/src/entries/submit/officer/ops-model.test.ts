import { describe, expect, it } from 'vitest';
import type { DemoCamera, DemoCameraFrame, DemoRecord } from '../api';
import type { StationEvent } from '../../../lib/events';
import {
  buildJunctionMarkers, buildLabelMaps, eventCameraId, eventKey, eventMeta, filterCameras, filterRecords,
  formatRelativeTime, normalizeKey, openRecordCount, paginateRecords, shiftFor, sortRecords, sparklinePath,
  sparklinePoints, statusCounts, trendFor,
} from './ops-model';

const record = (plate: string, status: string, occurredAt: string, extra: Partial<DemoRecord> = {}): DemoRecord => ({
  plate, summary: `Vi phạm ${plate}`, status, occurredAt,
  violationLabel: 'Vượt đèn đỏ', junctionId: 'Bac-01', cameraId: 'CAM-BAC-001', ...extra,
});

const records = [
  record('51K-123.45', 'confirmed', '2026-11-20T10:00:00Z'),
  record('50H-222.33', 'disputed', '2026-11-20T12:00:00Z', { junctionId: 'HX-C1', cameraId: 'CAM-HX-001' }),
  record('51G-678.90', 'needs_review', '2026-11-20T11:00:00Z', { junctionId: 'Bac-02', cameraId: 'CAM-BAC-002' }),
  record('59-X1 234.56', 'new', '2026-11-20T13:00:00Z', { junctionId: 'Bac-03', cameraId: 'CAM-BAC-003' }),
];

const cameras: DemoCamera[] = [
  { cameraId: 'CAM-BAC-001', junctionId: 'Bac-01', label: 'Phan Đăng Lưu × Lê Quang Định · góc Bắc' },
  { cameraId: 'CAM-BAC-002', junctionId: 'Bac-02', label: 'Ung Văn Khiêm × Nguyễn Gia Trí · góc Bắc' },
  { cameraId: 'CAM-HX-001', junctionId: 'HX-C1', label: 'Cầu vượt Hàng Xanh × Điện Biên Phủ · hướng Nam' },
  { cameraId: 'CAM-HX-002', junctionId: 'HX-C1', label: 'Cầu vượt Hàng Xanh × Điện Biên Phủ · hướng Bắc' },
];

const nodes = [
  { node_id: 'HX-01', junction_id: 'HX-C1', label: 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ', x: -251, z: -2440 },
  { node_id: 'Bac-01', junction_id: 'Bac-01', label: 'Phan Đăng Lưu ∩ Lê Quang Định', x: -1422, z: -2621 },
  { node_id: 'Bac-02', junction_id: 'Bac-02', label: 'Ung Văn Khiêm ∩ Nguyễn Gia Trí', x: 532, z: -3165 },
];

const frame = (camera: DemoCamera, source: DemoCameraFrame['source']): DemoCameraFrame => ({
  ...camera, source, frameId: `${source}-${camera.cameraId}`, capturedAt: null,
  imageUrl: source === 'missing' ? null : `/api/demo/media?cameraId=${camera.cameraId}`,
});

describe('ops-model · tìm và xếp hồ sơ', () => {
  it('chuẩn hoá tiếng Việt, dấu câu và biển viết liền', () => {
    expect(normalizeKey('Phan Đăng Lưu ∩ Lê Quang Định')).toBe('phandangluulequangdinh');
    expect(normalizeKey('51K-123.45')).toBe('51k12345');
    expect(normalizeKey(null)).toBe('');
  });

  it('tìm theo biển viết liền, mã nút và tên nút lấy từ node_map', () => {
    const maps = buildLabelMaps(cameras, nodes);
    expect(filterRecords(records, '51k12345', 'all')).toHaveLength(1);
    expect(filterRecords(records, 'hx-c1', 'all')).toHaveLength(1);
    expect(filterRecords(records, 'Hàng Xanh', 'all', maps)).toHaveLength(1);
    expect(filterRecords(records, 'Nguyễn Gia Trí', 'all', maps)).toHaveLength(1);
    expect(filterRecords(records, 'không có', 'all', maps)).toHaveLength(0);
    expect(filterRecords(records, '', 'new')).toHaveLength(1);
  });

  it('sắp xếp mới nhất, ưu tiên xử lý và biển A–Z', () => {
    expect(sortRecords(records, 'newest').map(item => item.plate)).toEqual(['59-X1 234.56', '50H-222.33', '51G-678.90', '51K-123.45']);
    expect(sortRecords(records, 'oldest')[0].plate).toBe('51K-123.45');
    expect(sortRecords(records, 'status')[0].status).toBe('disputed');
    expect(sortRecords(records, 'plate').map(item => item.plate)).toEqual(['50H-222.33', '51G-678.90', '51K-123.45', '59-X1 234.56']);
  });

  it('đếm trạng thái, hồ sơ mở và phân trang kẹp biên', () => {
    expect(openRecordCount(records)).toBe(3);
    expect(statusCounts(records).find(item => item.status === 'new')?.count).toBe(1);
    const page = paginateRecords(records, 9, 3);
    expect(page).toMatchObject({ page: 2, pages: 2, total: 4, from: 4, to: 4 });
    expect(page.items).toHaveLength(1);
    expect(paginateRecords(records, 0, 3).page).toBe(1);
  });
});

describe('ops-model · xu hướng và sparkline', () => {
  it('chưa đủ 2 mẫu thì không bịa xu hướng', () => {
    expect(trendFor([12], true, 'giây')).toMatchObject({ delta: null, tone: 'flat', samples: 1 });
  });

  it('tính đúng chiều tốt/xấu theo lowerIsBetter', () => {
    expect(trendFor([20, 16], true, 'giây')).toMatchObject({ delta: -4, tone: 'good', direction: 'down' });
    expect(trendFor([16, 20], true, 'giây')).toMatchObject({ delta: 4, tone: 'bad', direction: 'up' });
    expect(trendFor([20, 26], false, 'xe/phút')).toMatchObject({ delta: 6, tone: 'good', direction: 'up' });
    expect(trendFor([20, 20], false, 'xe/phút')).toMatchObject({ delta: 0, tone: 'flat', direction: 'flat' });
  });

  it('sparkline có đúng số điểm và kẹp giá trị bằng nhau vào giữa', () => {
    const points = sparklinePoints([1, 2, 3], 100, 30, 2);
    expect(points).toHaveLength(3);
    expect(points[0].x).toBe(2);
    expect(points[2].x).toBe(98);
    expect(sparklinePoints([5, 5], 100, 30, 2).every(point => point.y === 15)).toBe(true);
    expect(sparklinePath([4])).toBe('');
    expect(sparklinePath([4, 5])).toMatch(/^M/);
  });
});

describe('ops-model · ca trực, thời gian, camera và sự kiện', () => {
  it('chia ca theo giờ Asia/Ho_Chi_Minh', () => {
    expect(shiftFor(new Date('2026-11-20T23:00:00Z'))).toMatchObject({ code: 'A', range: '06:00–14:00' });
    expect(shiftFor(new Date('2026-11-21T07:00:00Z'))).toMatchObject({ code: 'B', range: '14:00–22:00' });
    expect(shiftFor(new Date('2026-11-21T15:00:00Z'))).toMatchObject({ code: 'C', range: '22:00–06:00' });
  });

  it('nhãn thời gian tương đối có biên rõ ràng', () => {
    const now = Date.parse('2026-11-21T00:00:00Z');
    expect(formatRelativeTime(now - 1_000, now)).toBe('vừa xong');
    expect(formatRelativeTime(now - 42_000, now)).toBe('42 giây trước');
    expect(formatRelativeTime(now - 125_000, now)).toBe('2 phút trước');
    expect(formatRelativeTime(null, now)).toBe('—');
  });

  it('lọc camera theo nút, nguồn và trạng thái đang tải', () => {
    const frames: Record<string, DemoCameraFrame> = {
      'CAM-BAC-001': frame(cameras[0], 'sample'),
      'CAM-BAC-002': frame(cameras[1], 'live'),
      'CAM-HX-001': frame(cameras[2], 'missing'),
    };
    expect(filterCameras(cameras, frames, 'hàng xanh', 'all', 'all').map(item => item.cameraId)).toEqual(['CAM-HX-001', 'CAM-HX-002']);
    expect(filterCameras(cameras, frames, '', 'HX-C1', 'missing').map(item => item.cameraId)).toEqual(['CAM-HX-001']);
    expect(filterCameras(cameras, frames, '', 'all', 'pending').map(item => item.cameraId)).toEqual(['CAM-HX-002']);
    expect(filterCameras(cameras, frames, '', 'Bac-02', 'live').map(item => item.cameraId)).toEqual(['CAM-BAC-002']);
  });

  it('gộp marker theo cụm, không nhân đôi cụm có nhiều node', () => {
    const markers = buildJunctionMarkers(cameras, nodes);
    expect(markers.find(marker => marker.junctionId === 'HX-C1')?.cameraIds).toEqual(['CAM-HX-001', 'CAM-HX-002']);
    expect(markers).toHaveLength(3);
  });

  it('metadata và camera gợi ý chỉ dùng dữ liệu thật', () => {
    const incident: StationEvent = { type: 'incident', node: 'HX-01', lane: 'Điện Biên Phủ · làn phải', plan: 'Mở làn kề', status: 'before', at: 1 };
    const violation: StationEvent = { type: 'violation', code: 'RED-LIGHT', label: 'Vượt đèn đỏ', plate: '51K-123.45', cameraId: 'CAM-BAC-002', confidence: 0.9, at: 2 };
    const unknown: StationEvent = { type: 'spawn', count: 12, at: 3 };
    expect(eventMeta(incident)).toMatchObject({ category: 'incident', severity: 'critical' });
    expect(eventCameraId(incident, cameras, nodes)).toBe('CAM-HX-001');
    expect(eventCameraId(violation, cameras, nodes)).toBe('CAM-BAC-002');
    expect(eventCameraId(unknown, cameras, nodes)).toBeNull();
    expect(new Set([eventKey(incident), eventKey(incident), eventKey(violation)]).size).toBe(2);
  });
});
