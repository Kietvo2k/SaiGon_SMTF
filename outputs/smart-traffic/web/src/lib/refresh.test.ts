import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReloadScheduler, createStreamThrottle } from './refresh';

afterEach(() => { vi.useRealTimers(); });

describe('gộp tải lại theo lô (debounce có hạn chót)', () => {
  it('20 sự kiện trong 1 s chỉ ra 1 lần tải lại sau khi đủ 2 s', () => {
    vi.useFakeTimers();
    let n = 0;
    const r = createReloadScheduler(() => { n++; }, { waitMs: 2000 });
    for (let i = 0; i < 20; i++) r.schedule();
    expect(n).toBe(0);                 // chưa đủ 2 s
    vi.advanceTimersByTime(1999);
    expect(n).toBe(0);
    vi.advanceTimersByTime(1);
    expect(n).toBe(1);                 // đúng 1 lần sau hạn chót
    r.dispose();
  });

  it('sự kiện mới quá 2 s sau lần tải lại gần nhất thì tải lại tiếp', () => {
    vi.useFakeTimers();
    let n = 0;
    const r = createReloadScheduler(() => { n++; }, { waitMs: 2000 });
    r.schedule();
    vi.advanceTimersByTime(2000);
    expect(n).toBe(1);
    r.schedule();
    vi.advanceTimersByTime(1999);
    expect(n).toBe(1);
    vi.advanceTimersByTime(1);
    expect(n).toBe(2);
    r.dispose();
  });

  it('tab ẩn thì không tải lại; hiện lại thì tải lại 1 lần', () => {
    vi.useFakeTimers();
    let n = 0;
    let visible = false;
    const r = createReloadScheduler(() => { n++; }, { waitMs: 2000, isVisible: () => visible });
    r.schedule();
    vi.advanceTimersByTime(2000);
    expect(n).toBe(0);                 // ẩn: hạn chót không tự tải lại
    expect(r.pending).toBe(true);
    visible = true;
    r.onVisible();
    expect(n).toBe(1);                 // hiện lại: đúng 1 lần
    expect(r.pending).toBe(false);
    r.dispose();
  });

  it('sự kiện dồn liên tục khi tab hiện thì trần chờ vẫn tải lại sau maxWait', () => {
    vi.useFakeTimers();
    let n = 0;
    const r = createReloadScheduler(() => { n++; }, { waitMs: 2000, maxWaitMs: 5000 });
    // mỗi 1 s một sự kiện trong 4 s: debounce thuần sẽ mãi hẹn lại, không bao giờ tải
    r.schedule();
    for (let i = 0; i < 4; i++) { vi.advanceTimersByTime(1000); r.schedule(); }
    expect(n).toBe(0);                 // chưa tới trần 5 s
    vi.advanceTimersByTime(1000);     // t = 5 s: hạn chót của vòng gộp đầu tiên cháy
    expect(n).toBe(1);
    r.dispose();
  });
});

describe('ảnh stream theo sự kiện stream.updated', () => {
  it('đổi nhãn khi stream.updated đúng camera và qua hạn 2 s', () => {
    vi.useFakeTimers();
    let v = 0;
    const t = createStreamThrottle(() => ++v, { cameraId: 'CAM-HX-001', minGapMs: 2000 });
    expect(t.onStreamUpdated({ camera_id: 'CAM-HX-001', seq: 1 })).toBe(1);
    vi.advanceTimersByTime(1999);
    expect(t.onStreamUpdated({ camera_id: 'CAM-HX-001', seq: 2 })).toBe(null);  // chưa qua 2 s
    vi.advanceTimersByTime(1);
    expect(t.onStreamUpdated({ camera_id: 'CAM-HX-001', seq: 3 })).toBe(2);
  });

  it('camera khác không đổi nhãn', () => {
    vi.useFakeTimers();
    let v = 0;
    const t = createStreamThrottle(() => ++v, { cameraId: 'CAM-HX-001', minGapMs: 2000 });
    expect(t.onStreamUpdated({ camera_id: 'CAM-HX-002', seq: 1 })).toBe(null);
    expect(v).toBe(0);
    expect(t.onStreamUpdated({ camera_id: 'CAM-HX-001', seq: 2 })).toBe(1);
  });

  it('lỗi/đóng không vỡ', () => {
    const t = createStreamThrottle(() => 0, { cameraId: 'CAM-HX-001' });
    expect(t.onStreamUpdated({})).toBe(null);
    t.dispose();
  });
});
