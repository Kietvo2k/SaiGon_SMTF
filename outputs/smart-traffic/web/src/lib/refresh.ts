// Gộp tải lại theo lô và làm mới ảnh stream (PERF-5).
// Hàm thuần, không phụ thuộc React: nhận callback và điều khiển đồng hồ từ bên ngoài nên test được bằng đồng hồ ảo.

export const RELOAD_WAIT_MS = 2000;       // nhiều sự kiện trong 2 s chỉ tải lại một lần
export const RELOAD_MAX_WAIT_MS = 15000;  // hạn chót: sự kiện dồn liên tục vẫn tải lại, không bao giờ đứng yên
export const STREAM_MIN_GAP_MS = 2000;    // ảnh stream tối đa 1 lần mỗi 2 s

/** Nội dung sự kiện stream.updated (PERF-3): {camera_id, seq}, không kèm ảnh. */
export interface StreamUpdated {
  camera_id?: string;
  seq?: number | string | null;
}

export interface ReloadScheduler {
  /** Báo "có thay đổi, cần tải lại". Nhiều lần trong 2 s chỉ ra một lần tải lại. */
  schedule(): void;
  /** Gọi khi tab trình duyệt chuyển từ ẩn sang hiện: tải lại ngay một lần nếu còn tồn đọng. */
  onVisible(): void;
  /** Đang có thay đổi chờ tải lại hay không. */
  readonly pending: boolean;
  dispose(): void;
}

/**
 * Bộ gộp tải lại có hạn chót.
 * - Mỗi sự kiện hẹn lại `waitMs` (debounce thật); nhóm sự kiện dồn trong 2 s chỉ tải lại một lần.
 * - Vòng gộp đầu tiên hẹn thêm `maxWaitMs` không hủy, nên việc sự kiện dồn liên tục không bao giờ trì hoãn tải lại quá hạn.
 * - Tab ẩn thì không tự tải lại; chờ `onVisible()` rồi tải lại đúng một lần.
 */
export function createReloadScheduler(
  reload: () => void,
  opts: { waitMs?: number; maxWaitMs?: number; isVisible?: () => boolean } = {},
): ReloadScheduler {
  const waitMs = opts.waitMs ?? RELOAD_WAIT_MS;
  const maxWaitMs = opts.maxWaitMs ?? RELOAD_MAX_WAIT_MS;
  const isVisible = opts.isVisible ?? (() => true);

  let waiting = false;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    if (waitTimer !== undefined) clearTimeout(waitTimer);
    if (capTimer !== undefined) clearTimeout(capTimer);
    waitTimer = undefined;
    capTimer = undefined;
  };

  const fire = () => {
    if (!waiting) return;
    if (!isVisible()) { clearTimers(); return; }   // tab ẩn: giữ nguyên việc chờ để onVisible xử lý
    waiting = false;
    clearTimers();
    reload();
  };

  const schedule = () => {
    if (!waiting) {
      waiting = true;
      capTimer = setTimeout(fire, Math.max(waitMs, maxWaitMs));   // hạn chót của vòng gộp
    }
    if (waitTimer !== undefined) clearTimeout(waitTimer);          // hủy hẹn cũ rồi hẹn lại
    waitTimer = setTimeout(fire, waitMs);                          // hẹn lại mỗi sự kiện
  };

  const onVisible = () => {
    if (!waiting) return;
    waiting = false;
    clearTimers();
    reload();
  };

  return {
    schedule,
    onVisible,
    get pending() { return waiting; },
    dispose: clearTimers,
  };
}

/** Bộ làm mới ảnh stream: chỉ đổi src tối đa 1 lần mỗi `minGapMs`. */
export interface StreamThrottle {
  /** Nhận stream.updated; trả về số lần tải lại nếu vừa đổi src, ngược lại null. */
  onStreamUpdated(data: StreamUpdated | null | undefined): number | null;
  dispose(): void;
}

export function createStreamThrottle(
  reload: () => void,
  opts: { cameraId: string; minGapMs?: number; isVisible?: () => boolean },
): StreamThrottle {
  const minGapMs = opts.minGapMs ?? STREAM_MIN_GAP_MS;
  const isVisible = opts.isVisible ?? (() => true);
  let last = -Infinity;
  let count = 0;

  return {
    onStreamUpdated(data) {
      if (!data || data.camera_id !== opts.cameraId) return null;   // camera khác: bỏ qua
      const now = Date.now();
      if (now - last < minGapMs) return null;                        // trong 2 s: bỏ qua
      if (!isVisible()) return null;                                 // tab ẩn: không đổi ảnh
      last = now;
      count += 1;
      reload();
      return count;
    },
    dispose() { /* không có hẹn giờ dài hạn */ },
  };
}
