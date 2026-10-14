// Vỏ app=smart — chỉ tải khi có ?app=smart. Không sửa file 31A; mọi ghi đè nhãn làm tại đây.
// CHỮ KÝ CHUẨN: initSmartApp32({ scene, camera, renderer, traffic, status, root, mode }).
// Các task sau (T9/T10/T11/T14) KHÔNG đổi chữ ký — chỉ mở rộng qua app.registerSmartModule32(name, mod).
import { buildSignalPlan32 } from './signal-plan-32.js?v=32a';
import { createSignalController32 } from './traffic-controller-32.js?v=32a';
// T9 — đèn 3D Hàng Xanh: tái xuất để webgpu-materials-24.js gọi qua `smartMod.installSignals32`.
export { createTrafficSignals32, installSignals32 } from './traffic-signals-32.js?v=32a';

export const SMART_APP_32_VERSION = 'smart-app-32a';
export const SMART_BREAKER_S = Infinity;
export const BANNED_STRINGS = ['giả lập', 'mô phỏng', 'minh họa', 'illustrative', 'simulated', 'demo', 'fake'];
// Selector panel cổ điển THẬT trong webgpu-materials-24.html (giữ #controls để còn nút Flood Lab, #floodLab).
export const HIDDEN_PANELS_32 = ['#story'];
export const SMART_LABELS_32 = [
  { selector: '#regionTitle', from: 'Khu mô phỏng', to: 'Khu vực' },
  { selector: '#runFloodScenario span', from: 'Chạy mô phỏng 1D/2D', to: 'Chạy tính toán 1D/2D' },
  { selector: '#floodState span', from: 'Không nạp được registry · mô phỏng đã khóa', to: 'Không nạp được registry · chế độ đã khóa' }
];

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function sanitizeStatusText32(text) {
  let out = String(text ?? '');
  for (const bad of BANNED_STRINGS) out = out.replace(new RegExp(escapeRe(bad), 'gi'), '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.:;])/g, '$1').trim();
}

export function applySmartLabels32(root) {
  let n = 0;
  for (const item of SMART_LABELS_32) {
    const el = root.querySelector(item.selector);
    if (el && el.textContent === item.from) { el.textContent = item.to; n++; }
    else if (el && BANNED_STRINGS.some(b => el.textContent.toLowerCase().includes(b.toLowerCase()))) {
      el.textContent = sanitizeStatusText32(el.textContent); n++;
    }
  }
  return n;
}

// flood-ui-25.js ghi đè `#floodState` bằng innerHTML mỗi lần đổi kịch bản → áp lại nhãn sau khi nó ghi.
export function observeSmartLabels32(root) {
  const target = root.querySelector ? root.querySelector('#floodState') : null;
  if (!target || typeof MutationObserver === 'undefined') return null;
  const obs = new MutationObserver(() => applySmartLabels32(root));
  obs.observe(target, { childList: true, subtree: true, characterData: true });
  return obs;
}

export function lockRegions32(root) {
  for (const btn of root.querySelectorAll('[data-region]')) {
    const id = btn.dataset.region;
    if (id === 'bac') { btn.disabled = false; btn.setAttribute('aria-checked', 'true'); continue; }
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.title = 'Khu vực này tạm khóa';
  }
  for (const sel of HIDDEN_PANELS_32) {
    const el = root.querySelector(sel);
    if (el) el.hidden = true;
  }
}

// Quét DOM app=smart: chỉ sửa node/attribute THẬT SỰ chứa chuỗi cấm (các chú thích do module 31A sinh,
// ví dụ ghi chú cầu của city-bridges-31.js) — không đụng chuỗi nào khác. Không sửa file 31A.
const hasBanned32 = s => BANNED_STRINGS.some(b => String(s).toLowerCase().includes(b.toLowerCase()));
export function sanitizeSmartDom32(root) {
  const walk = node => {
    if (node.nodeType === 3) {
      if (hasBanned32(node.nodeValue)) node.nodeValue = sanitizeStatusText32(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = node.getAttribute && node.getAttribute(a);
      if (v && hasBanned32(v)) node.setAttribute(a, sanitizeStatusText32(v));
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  const start = root.documentElement || root.body || root;
  if (start) walk(start);
  return true;
}

export async function prepareSmart32({ graph }) {
  const res = await fetch('../smart-traffic/backend/app/seed/node_map.json');
  const nodeMap = await res.json();
  return { signalPlan: buildSignalPlan32({ graph, nodeMap }), nodeMap };
}

export function initSmartApp32({ scene, camera, renderer, traffic, status, root = document, mode = 'smart' }) {
  applySmartLabels32(root);
  lockRegions32(root);
  observeSmartLabels32(root);
  sanitizeSmartDom32(root);
  const controller = createSignalController32({ net: traffic.net, sim: traffic.sim, mode });
  traffic.sim.attachController(controller);
  const modules = {};
  const app = {
    controller, traffic, scene, camera, renderer, status, root, modules,
    registerSmartModule32(name, mod) { modules[name] = mod; return mod; },
    dispose() { for (const m of Object.values(modules)) if (m && typeof m.dispose === 'function') m.dispose(); }
  };
  return app;
}
