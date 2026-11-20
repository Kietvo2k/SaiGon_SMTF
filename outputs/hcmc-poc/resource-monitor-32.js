// Giám sát tài nguyên và TỰ ĐỘNG bật/tắt "Tiết kiệm tài nguyên" (PERF-2) khi vượt ngưỡng.
// Ngưỡng do người dùng chốt: CPU > 80 %, GPU > 70 %, RAM > 85 %.
// JS trình duyệt không đo trực tiếp GPU; dùng 3 đại lượng đo được:
//   - RAM: performance.memory (Chrome) → % heap đã dùng.
//   - CPU: mật độ long-task (> 50 ms) → ước lượng % luồng chính bận.
//   - GPU: tỉ lệ thời gian khung thực so với ngân sách khung ở FPS trần hiện tại.
// Hysteresis để không nhảy nhật: vượt ngưỡng 3 mẫu liên tiếp (3 s) mới bật;
// mọi chỉ số về dưới ngưỡng − 5 điểm trong 5 mẫu liên tiếp (5 s) mới tắt.

export const RESOURCE_LIMITS_32 = Object.freeze({ cpuPct: 80, gpuPct: 70, ramPct: 85 });
export const RESOURCE_MARGIN_32 = 5;                 // ngưỡng tắt = ngưỡng bật − 5 điểm
export const RESOURCE_OVER_N_32 = 3;                // số mẫu liên tiếp vượt ngưỡng mới bật
export const RESOURCE_UNDER_N_32 = 5;               // số mẫu liên tiếp dưới ngưỡng an toàn mới tắt
export const RESOURCE_MONITOR_KEY_32 = 'citylab.32i.autoSave';

// Đổi mẫu đo thành phần trăm tài nguyên. Thành phần thiếu = 0 (không phạt).
export function resourceSample32({ heapUsed = 0, heapLimit = 0, longTasksPerSec = 0, frameMs = 0, capFps = 30 } = {}) {
  const ramPct = heapLimit > 0 ? (heapUsed / heapLimit) * 100 : 0;
  const cpuPct = Math.min(100, longTasksPerSec * 20);          // 5 long-task/giây ≈ luồng chính bận 100 %
  const budgetMs = 1000 / Math.max(1, capFps);
  const gpuPct = Math.min(100, (frameMs / budgetMs) * 100);
  return { cpuPct, gpuPct, ramPct };
}

export function resourceOver32(s, limits = RESOURCE_LIMITS_32) {
  return s.cpuPct > limits.cpuPct || s.gpuPct > limits.gpuPct || s.ramPct > limits.ramPct;
}

export function resourceUnder32(s, limits = RESOURCE_LIMITS_32, margin = RESOURCE_MARGIN_32) {
  return s.cpuPct <= limits.cpuPct - margin && s.gpuPct <= limits.gpuPct - margin && s.ramPct <= limits.ramPct - margin;
}

export function resourceReasons32(sample = {}, limits = RESOURCE_LIMITS_32) {
  const out = [];
  if ((sample.cpuPct || 0) > limits.cpuPct) out.push({ key: 'CPU', pct: Math.round(sample.cpuPct), limit: limits.cpuPct });
  if ((sample.gpuPct || 0) > limits.gpuPct) out.push({ key: 'GPU', pct: Math.round(sample.gpuPct), limit: limits.gpuPct });
  if ((sample.ramPct || 0) > limits.ramPct) out.push({ key: 'RAM', pct: Math.round(sample.ramPct), limit: limits.ramPct });
  return out;
}

export function formatResourceReason32(reasonsOrSample, limits = RESOURCE_LIMITS_32) {
  const list = Array.isArray(reasonsOrSample)
    ? reasonsOrSample
    : resourceReasons32(reasonsOrSample || {}, limits);
  return list.map(item => `${item.key} ${item.pct}%`).join(' · ');
}

// Máy trạng thái: trả về 'save' | 'normal'. Gọi mỗi giây với mẫu đo mới.
// autoPersist: ghi localStorage khi tự bật/tắt (để lần mở sau nhớ trạng thái tự động).
export function createResourceWatch32({
  limits = RESOURCE_LIMITS_32, margin = RESOURCE_MARGIN_32,
  overN = RESOURCE_OVER_N_32, underN = RESOURCE_UNDER_N_32,
  autoPersist = null, onSave = null, onNormal = null, onReasonChange = null, log = (m => console.info(m))
} = {}) {
  let mode = 'normal', overCount = 0, underCount = 0;
  let activeReasons = [], lastHotReasons = [], lastHotSample = null;
  const persist = on => { try { if (autoPersist) autoPersist.setItem(RESOURCE_MONITOR_KEY_32, on ? 'true' : 'false'); } catch { /* bỏ qua */ } };
  const setSave = on => {
    if (mode === 'save' && !on) {
      mode = 'normal'; underCount = 0; overCount = 0; activeReasons = []; lastHotReasons = []; lastHotSample = null;
      persist(false);
      try { onNormal && onNormal(); } catch (e) { log('bỏ tiết kiệm: ' + (e && e.message)); }
    } else if (mode === 'normal' && on) {
      mode = 'save'; overCount = 0; underCount = 0; activeReasons = lastHotReasons.slice();
      persist(true);
      try { onSave && onSave({ reasons: activeReasons, sample: lastHotSample }); } catch (e) { log('bật tiết kiệm: ' + (e && e.message)); }
    }
  };
  return {
    mode: () => mode,
    reasons: () => activeReasons.slice(),
    tick(sample) {
      if (resourceOver32(sample, limits)) {
        lastHotSample = sample;
        lastHotReasons = resourceReasons32(sample, limits);
        overCount++; underCount = 0;
        if (mode === 'save') {
          activeReasons = lastHotReasons.slice();
          try { onReasonChange && onReasonChange({ reasons: activeReasons, sample }); } catch { /* bỏ qua */ }
        } else if (overCount >= overN) {
          setSave(true);
        }
      } else if (resourceUnder32(sample, limits, margin)) {
        underCount++; overCount = 0;
        if (underCount >= underN) setSave(false);
      } else {
        overCount = 0; underCount = 0;
      }
      return mode;
    }
  };
}
