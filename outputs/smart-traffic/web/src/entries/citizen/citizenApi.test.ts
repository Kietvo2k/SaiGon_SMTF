import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPublicTimeline,
  citizenCanComplain,
  complaintNoteError,
  lookupCitizen,
  mapPublicItem,
  mapPublicRecord,
  sortEvidence,
} from './citizenApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ánh xạ hồ sơ công khai sang kiểu chung', () => {
  it('giữ biển, trạng thái, địa điểm và mức phạt đã xác minh', () => {
    const record = mapPublicRecord({
      plate: '51K-123.45',
      status: 'confirmed',
      code: 'RED-LIGHT',
      occurredAt: '2026-11-20T15:09:27Z',
      junctionId: 'Bac-02',
      cameraId: 'CAM-BAC-002',
      direction: 'Ung Văn Khiêm → Nguyễn Gia Trí',
      penaltyAmountMin: 18000000,
      penaltyAmountMax: 20000000,
      penaltyPoints: 4,
      penaltySource: 'NĐ 168/2024/NĐ-CP',
    });
    expect(record.plate).toBe('51K-123.45');
    expect(record.label).toContain('đèn tín hiệu');
    expect(record.place).toContain('Ung Văn Khiêm');
    expect(record.node).toBe('Bac-02');
    expect(record.penalty.verified).toBe(true);
    expect(record.penalty.license_deduction_points).toBe(4);
  });

  it('không đánh dấu đã xác minh khi thiếu một đầu mức phạt', () => {
    const record = mapPublicRecord({ plate: '51G-678.90', status: 'needs_review', penaltyAmountMin: 18000000 });
    expect(record.penalty.verified).toBe(false);
    expect(record.penalty.vnd_min).toBe(18000000);
    expect(record.penalty.vnd_max).toBeNull();
  });
});

describe('ánh xạ kết quả công khai của backend local', () => {
  it('dùng nhãn backend và đường dẫn ảnh tuyệt đối', () => {
    const record = mapPublicItem({
      id: 'VP-1',
      violation_code: 'RED-LIGHT',
      violation_label: 'Vượt đèn đỏ',
      status: 'confirmed',
      plate: '51K-123.45',
      occurred_at: '2026-11-20T15:09:27Z',
      node_label: 'Ung Văn Khiêm ∩ Nguyễn Gia Trí',
      camera_id: 'CAM-BAC-002',
      penalty: { vnd_min: 18000000, vnd_max: 20000000, verified: true },
      evidence: [{ kind: 'before', url: '/api/v1/media/m1' }],
    });
    expect(record.label).toBe('Vượt đèn đỏ');
    expect(record.place).toContain('×');
    expect(record.evidence[0].url).toContain('/api/v1/media/m1');
  });
});

describe('thứ tự ảnh bằng chứng', () => {
  it('luôn xếp trước, sau rồi ảnh biển số', () => {
    const sorted = sortEvidence([
      { kind: 'plate', url: '/p' },
      { kind: 'after', url: '/a' },
      { kind: 'before', url: '/b' },
    ]);
    expect(sorted.map(item => item.kind)).toEqual(['before', 'after', 'plate']);
  });
});

describe('dòng thời gian hồ sơ công khai', () => {
  const record = mapPublicRecord({ plate: '51K-123.45', status: 'confirmed', code: 'RED-LIGHT', occurredAt: '2026-11-20T15:09:27Z' });

  it('sắp xếp theo thời gian và gộp nhãn khiếu nại', () => {
    const timeline = buildPublicTimeline({
      plate: '51K-123.45',
      status: 'disputed',
      occurredAt: '2026-11-20T15:09:27Z',
      audit: [
        { action: 'confirm', note: null, at: '2026-11-20T15:10:00Z' },
        { action: 'complaint', note: null, at: '2026-11-21T08:00:00Z' },
      ],
      complaints: [{ id: 7, kind: 'wrong_plate', note: 'Xe này không phải của tôi', status: 'open', created_at: '2026-11-21T08:00:00Z' }],
    }, record);
    expect(timeline.map(item => item.title)).toEqual([
      'Hệ thống ghi nhận vi phạm',
      'Cán bộ xác nhận hồ sơ',
      'Khiếu nại: Sai biển số, không phải xe của tôi',
    ]);
    expect(timeline[2].detail).toContain('Đang chờ cán bộ xử lý');
    expect(timeline[2].tone).toBe('risk');
  });

  it('vẫn trả mốc ghi nhận khi chưa có nhật ký xử lý', () => {
    const timeline = buildPublicTimeline({ plate: record.plate, status: 'confirmed', occurredAt: '2026-11-20T15:09:27Z' }, record);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].title).toBe('Hệ thống ghi nhận vi phạm');
  });
});

describe('điều kiện gửi khiếu nại', () => {
  it('chỉ mở cho hồ sơ còn xử lý ở bản công khai', () => {
    for (const status of ['new', 'pending', 'needs_review', 'confirmed', 'notified']) {
      expect(citizenCanComplain(status, 'public'), status).toBe(true);
    }
    for (const status of ['disputed', 'paid', 'dismissed', 'unknown']) {
      expect(citizenCanComplain(status, 'public'), status).toBe(false);
    }
    expect(citizenCanComplain('confirmed', 'local')).toBe(false);
  });

  it('chặn ghi chú rỗng hoặc chỉ khoảng trắng', () => {
    expect(complaintNoteError('')).not.toBe('');
    expect(complaintNoteError('   \n\t ')).not.toBe('');
    expect(complaintNoteError('Xe này không phải của tôi')).toBe('');
  });
});

describe('tra cứu biển compact 9 ký tự', () => {
  function mockLookup(recordsByPlate: Record<string, unknown[]>) {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const plate = new URL(String(input), 'http://local').searchParams.get('plate') || '';
      calls.push(plate);
      return new Response(JSON.stringify({ plate, records: recordsByPlate[plate] ?? [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }

  it('fallback sang dạng ô tô khi dạng xe máy rỗng, tối đa 2 request', async () => {
    const calls = mockLookup({
      '59X1-234.56': [{ plate: '59X1-234.56', status: 'confirmed', code: 'NO-HELMET' }],
    });
    const result = await lookupCitizen('public', '59x123456');
    expect(calls).toEqual(['59-X1 234.56', '59X1-234.56']);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].plate).toBe('59X1-234.56');
  });

  it('không fallback khi dạng xe máy đã có hồ sơ', async () => {
    const calls = mockLookup({
      '59-X1 234.56': [{ plate: '59-X1 234.56', status: 'needs_review', code: 'NO-HELMET' }],
      '59X1-234.56': [{ plate: '59X1-234.56', status: 'confirmed', code: 'NO-HELMET' }],
    });
    const result = await lookupCitizen('public', '59X123456');
    expect(calls).toEqual(['59-X1 234.56']);
    expect(result.records[0].plate).toBe('59-X1 234.56');
  });

  it('cả hai dạng đều rỗng vẫn trả biển xe máy sau 2 request', async () => {
    const calls = mockLookup({});
    const result = await lookupCitizen('public', '59X123456');
    expect(calls).toEqual(['59-X1 234.56', '59X1-234.56']);
    expect(result.plate).toBe('59-X1 234.56');
    expect(result.records).toHaveLength(0);
  });

  it('biển ô tô 8 ký tự chỉ phát một request', async () => {
    const calls = mockLookup({
      '51K-123.45': [{ plate: '51K-123.45', status: 'confirmed', code: 'RED-LIGHT' }],
    });
    const result = await lookupCitizen('public', '51k12345');
    expect(calls).toEqual(['51K-123.45']);
    expect(result.records[0].plate).toBe('51K-123.45');
  });
});
