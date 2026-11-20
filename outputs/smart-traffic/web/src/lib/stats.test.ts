import { describe, expect, it } from 'vitest';
import { barPercent, summarizeStats } from './stats';

describe('summarizeStats và barPercent (A4)', () => {
  it('trích xuất đúng tổng, giờ cao điểm, nút và lỗi nhiều nhất từ số liệu gốc', () => {
    const out = summarizeStats({
      from: null,
      to: null,
      total: 128,
      by_status: [{ status: 'new', count: 22 }],
      by_code: [
        { violation_code: 'STOP-LINE', count: 32 },
        { violation_code: 'RED-LIGHT', count: 46 },
      ],
      by_node: [
        { node_id: 'HX-06', node_label: 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh', count: 35 },
        { node_id: 'HX-01', node_label: 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ', count: 41 },
      ],
      by_hour: [
        { hour: 7, count: 18 },
        { hour: 8, count: 24 },
        { hour: 9, count: 14 },
      ],
    });
    expect(out.total).toBe(128);
    expect(out.peakHour).toEqual({ hour: 8, count: 24 });
    expect(out.topNode?.node_id).toBe('HX-01');
    expect(out.topCode?.violation_code).toBe('RED-LIGHT');
  });

  it('trả null an toàn khi chưa có dữ liệu hoặc mọi giá trị bằng 0', () => {
    expect(summarizeStats(null)).toEqual({ total: 0, peakHour: null, topNode: null, topCode: null });
    expect(summarizeStats({
      from: null,
      to: null,
      total: 0,
      by_status: [],
      by_code: [],
      by_node: [{ node_id: 'HX-01', node_label: null, count: 0 }],
      by_hour: [{ hour: 0, count: 0 }],
    })).toEqual({ total: 0, peakHour: null, topNode: null, topCode: null });
  });

  it('barPercent tính phần trăm an toàn trong [0, 100]', () => {
    expect(barPercent(0, 50)).toBe(0);
    expect(barPercent(1, 100)).toBe(4);
    expect(barPercent(25, 50)).toBe(50);
    expect(barPercent(80, 50)).toBe(100);
    expect(barPercent(10, 0)).toBe(0);
  });
});
