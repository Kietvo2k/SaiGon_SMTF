// Vỏ app=smart — chỉ tải khi có ?app=smart. Không sửa file 31A; mọi ghi đè nhãn làm tại đây.
// CHỮ KÝ CHUẨN: initSmartApp32({ scene, camera, renderer, traffic, status, root, mode }).
// Các task sau (T9/T10/T11/T14) KHÔNG đổi chữ ký — chỉ mở rộng qua app.registerSmartModule32(name, mod).
import { buildSignalPlan32 } from './signal-plan-32.js?v=32a';
import { createSignalController32 } from './traffic-controller-32.js?v=32a';
import { regionById } from './city-region-31.js?v=31a';
// T9 — đèn 3D Hàng Xanh: tái xuất để webgpu-materials-24.js gọi qua `smartMod.installSignals32`.
export { createTrafficSignals32, installSignals32 } from './traffic-signals-32.js?v=32a';
// T10 — camera render-to-texture: tái xuất để webgpu-materials-24.js gọi `smartMod.installCameraCapture32`
// (đặt `window.__smartCapture`). Giữ chữ ký initSmartApp32 không đổi.
export { createCameraCapture32, installCameraCapture32, projectToCamera32, projectToPixel32 } from './camera-capture-32.js?v=32a';
// T11 — client trạm: hàng đợi IndexedDB, REST/WS tới backend, HUD A/B/KPI (xem installStation32 cuối file).
import { createPerception32 } from './violation-perception-32.js?v=32a';
import { ALL_CODES_32, restrictedNodeIndices32 } from './violation-rules-32.js?v=32a';
import { createQueue32, createIndexedDbStore32, createMemoryStore32 } from './station-queue-32.js?v=32a';
import { createTransport32, startStationLoop32, resolveApiBase32, readStoredToken32, loginStation32 } from './station-client-32.js?v=32a';
import { installHud32 } from './kpi-panel-32.js?v=32a';
export { installHud32 } from './kpi-panel-32.js?v=32a';
// M4b1 — bản đồ nhiệt, dự báo kẹt, lệch tuyến và bảng VMS (heat-live-32.js, heat-scene-32.js).
import { createHeatLive32, createRouteBias32, chooseVmsBoards32, expandHeatHistory32, createVmsBus32 } from './heat-live-32.js?v=32a';
import { createHeatScene32, mountHeatPanel32 } from './heat-scene-32.js?v=32a';
// M5a — kịch bản (scenarios-32.js) và lệnh trạm (station-client-32.js: cmd.scenario, cmd.vms).
import { createScenarios32, mountScenarioPanel32, createBlockProps32 } from './scenarios-32.js?v=32a';
import { createCommandRouter32 } from './station-client-32.js?v=32a';
export { createRouteBias32, createVmsBus32, vmsDisplay32 } from './heat-live-32.js?v=32a';
export { createScenarios32, findLaneBlock32, findFloodEdges32, SCENARIO_KEYS_32, SCENARIO_LABELS_32 } from './scenarios-32.js?v=32a';
export { createCommandRouter32 } from './station-client-32.js?v=32a';
// M4b2 — đồng hồ trong ngày + tua (clock-32.js) và tua trước trong Worker (forecast-client-32.js).
export { installClock32, clockAt32, lightOf32, demandOfHour32 } from './clock-32.js?v=32a';
export { installForecast32 } from './forecast-client-32.js?v=32a';
// M5a — nhu cầu khu Bắc: cùng tâm/bán kính/thiên hướng/trọng số làn như PEAK_HANG_XANH_DEMAND của kịch bản A1
// (scripts/a1-metric-32.mjs; test so khớp) NHƯNG poolScale 5 thay vì 10: đo ở 17:30 (300 s, cùng seed) lưu lượng TB 6 nút
// Hàng Xanh = 5,7 xe/phút (đèn cố định; A1 poolScale 10 cho 4,8), xe quanh HX ~440, xe trên cầu Sài Gòn ~370, pool nhẹ hơn.
// Pool dựng một lần; mật độ theo giờ (DEMAND_BY_HOUR_32) và kịch bản cao điểm chỉ đổi tỉ lệ xe hiện.
export const NORTH_DEMAND_32 = Object.freeze({ center: Object.freeze([-130, -2540]), radius_m: 1500, turnBias: 15, spawnBias: 200, poolScale: 5 });
// M5a — cầu Sài Gòn (~1 km) vắt ranh: cho phép xe trên nhịp cầu (biên nới 1200 m, chỉ cạnh tên "Cầu Sài Gòn").
// Mọi đường khác giữ biên 0 (M2a: 0 xe ngoài khu Bắc).
export const NORTH_BRIDGE_OPTS_32 = Object.freeze({ bridgeMargin: 1200, bridgeNames: Object.freeze(['Cầu Sài Gòn']) });
export const NORTH_BRIDGE_NAME_32 = 'Cầu Sài Gòn';
// M5a — khóa khu Bắc cho xe: mọi lần đặt khu của sim đều đưa về đúng khu Bắc (biên 0 + ngoại lệ cầu Sài Gòn).
// Lý do: mô-đun mật độ đặt khu cho xe lúc nạp (previewRegion cho từng khu, rồi khôi phục) bằng regionTrafficPayload
// (biên 250, không ngoại lệ cầu) — sau đó cầu Sài Gòn mất hết xe và khu có thể đổi sang khu bị khóa. Trả về hàm gỡ khóa.
export function lockNorthRegion32(traffic, polygon) {
  if (!traffic || typeof traffic.setRegion !== 'function' || !Array.isArray(polygon)) return null;
  const orig = traffic.setRegion;
  const payload = () => ({ id: 'bac', polygon: polygon.map(p => [p[0], p[1]]), margin: 0, ...NORTH_BRIDGE_OPTS_32 });
  traffic.setRegion = () => orig(payload());
  const out = traffic.setRegion();
  return { out, restore() { traffic.setRegion = orig; } };
}
export function isNorthBridgeException32(net, e) {
  if (!net || !net.bridgeEdge || !net.bridgeEdge[e]) return false;
  const road = net.E && net.E[e] ? net.G.roads[net.E[e].road] : null;
  return !!road && road.name === NORTH_BRIDGE_NAME_32;
}
export const HEAT_TICK_MS_32 = 250;   // ms thực: nhịp gọi engine (việc nặng chỉ chạy theo giây sim)

export const SMART_APP_32_VERSION = 'smart-app-32a';
export const SMART_BREAKER_S = 180;   // M2a: ngắt chu kỳ đèn/thải xe 180 s trong app smart
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

// M5b-1 — hành vi xe phạm lỗi của app smart (truyền vào createTraffic31 → sim): nút cấm rẽ trái theo dữ liệu, và các nút
// đỗ sai = nút có camera (lỗi nằm trong khung ghi hình). Chỉ số nút theo graph.nodes; không có nút thì mảng rỗng.
export function smartBehavior32({ graph, nodeMap }) {
  const camNodes = nodeMap.filter(m => m.camera_id).map(m => graph.nodes.findIndex(n => n.id === m.osm_id)).filter(i => i >= 0);
  return { restrictedNodes: restrictedNodeIndices32(graph, nodeMap), parkNodes: camNodes };
}

export async function prepareSmart32({ graph }) {
  const res = await fetch('../smart-traffic/backend/app/seed/node_map.json');
  const nodeMap = await res.json();
  return { signalPlan: buildSignalPlan32({ graph, nodeMap }), nodeMap };
}

// T9b — Panel "Tham quan" của app smart: 5 góc nhìn khu Bắc. Toạ độ suy từ node_map / signature registry / road graph,
// không đoán tay. Trả về toạ độ mảng [x,y,z] để webgpu-materials-24.js tự bọc THREE.Vector3 (file này chạy được Node).
export const NORTH_TOUR_32 = [
  { key: 'hx', label: 'Ngã tư Hàng Xanh' },
  { key: 'l81', label: 'Landmark 81' },
  { key: 'csg', label: 'Cầu Sài Gòn' },
  { key: 'ctn', label: 'Cầu Thị Nghè' },
  { key: 'bac', label: 'Toàn khu Bắc' }
];
export const NORTH_CONE_KEY_32 = 'hx';   // góc cận cảnh: bật "Vùng quan sát camera" mặc định

const centerOf32 = values => {
  const list = (values || []).filter(Number.isFinite);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
};
const placeAnchor32 = (registry, key) => {
  const entries = registry && Array.isArray(registry.entries) ? registry.entries : [];
  const entry = entries.find(e => e && e.key === key);
  return entry && Array.isArray(entry.anchor) ? [entry.anchor[0], 0, entry.anchor[1]] : null;
};
function roadCenter32(graph, pred) {
  if (!graph || !Array.isArray(graph.roads) || !Array.isArray(graph.nodes)) return null;
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  let x = 0, z = 0, n = 0;
  for (const road of graph.roads) {
    if (!pred(road)) continue;
    for (const id of road.nodes || []) { const nd = byId.get(id); if (nd) { x += nd.x; z += nd.z; n++; } }
  }
  return n ? [x / n, 0, z / n] : null;
}

export function buildNorthViews32({ graph = null, nodeMap = [], registry = null } = {}) {
  const hx = [centerOf32((nodeMap || []).map(m => m.x)) ?? -130, 0, centerOf32((nodeMap || []).map(m => m.z)) ?? -2450];
  const l81 = placeAnchor32(registry, 'place-landmark-81') || [1137.3, 0, -1758.13];
  const sgIds = new Set(((registry && registry.entries) || [])
    .filter(e => e && e.kind === 'bridge' && /^Cầu Sài Gòn/.test(e.label || ''))
    .flatMap(e => e.ids || []).map(Number));
  const csg = (sgIds.size ? roadCenter32(graph, r => sgIds.has(Number(r.id))) : null)
    || roadCenter32(graph, r => /Cầu Sài Gòn/.test(r.name || '')) || [1713, 0, -2201];
  const ctn = roadCenter32(graph, r => /Cầu Thị Nghè/.test(r.name || '')) || [-800, 0, -350];
  const region = regionById('bac');
  const bacView = (region && region.view) || { target: [-800, 0, -1950], distance: 5000, az: .45, polar: .63 };
  const views = {
    hx: { target: hx, distance: 120, az: 0.6, polar: 1.1, label: 'Ngã tư Hàng Xanh · cận cảnh' },
    l81: { target: l81, distance: 420, az: 0.6, polar: 1.02, label: 'LANDMARK 81' },
    csg: { target: csg, distance: 340, az: 0.95, polar: 1.05, label: 'CẦU SÀI GÒN' },
    ctn: { target: ctn, distance: 300, az: 0.7, polar: 1.05, label: 'CẦU THỊ NGHÈ' },
    bac: { target: [...bacView.target], distance: bacView.distance, az: bacView.az, polar: bacView.polar, label: 'KHU · PHÍA BẮC · THỊ NGHÈ · BÌNH THẠNH' }
  };
  return { views, tour: NORTH_TOUR_32 };
}

// Thay panel "Tham quan" (#cityNav) sang các góc khu Bắc + công tắc "Vùng quan sát camera" (mặc định bật ở góc cận cảnh).
export function installNorthTour32(app, { views = {}, onSelect = null } = {}) {
  const root = app.root || document;
  const doc = root.documentElement ? root : document;
  const nav = root.querySelector('#cityNav');
  if (nav) { const h = nav.querySelector('.nav-head h2'); if (h) h.textContent = 'Khu Bắc'; }
  const box = nav && nav.querySelector('.nav-views');
  const buttons = [];
  if (box) {
    box.setAttribute('aria-label', 'Chọn góc nhìn khu Bắc');
    box.textContent = '';
    for (const item of NORTH_TOUR_32) {
      if (!views[item.key]) continue;
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.view = item.key;
      button.textContent = item.label;
      buttons.push(button);
      box.append(button);
    }
  }
  const signals = app.modules && app.modules.signals;
  let toggle = null;
  const setCone = on => { if (signals && typeof signals.setConeVisible === 'function') signals.setConeVisible(!!on); };
  const pick = key => {
    const on = key === NORTH_CONE_KEY_32;
    setCone(on);
    if (toggle) toggle.checked = on;
    if (onSelect) onSelect(key);
  };
  for (const button of buttons) button.onclick = () => pick(button.dataset.view);
  const body = nav && nav.querySelector('.nav-body');
  if (body) {
    const label = doc.createElement('label');
    label.className = 'nav-cone';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.id = 'coneToggle';
    label.append(input, doc.createTextNode(' Vùng quan sát camera'));
    body.append(label);
    toggle = input;
    input.addEventListener('change', () => setCone(input.checked));
  }
  return { buttons, setCone, pick, get toggle() { return toggle; }, toggleEl: toggle };
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
    vms: createVmsBus32(),   // M5a: nội dung bảng VMS (cán bộ từ trạm / kịch bản ngập / cảnh báo kẹt)
    registerSmartModule32(name, mod) { modules[name] = mod; return mod; },
    dispose() { for (const m of Object.values(modules)) if (m && typeof m.dispose === 'function') m.dispose(); }
  };
  return app;
}

// T11 — nối trạm: perception → (vi phạm + bằng chứng) → transport → backend; HUD A/B/KPI; nhận lệnh đèn.
// Gọi SAU installCameraCapture32 (cần app.modules.capture). Không đổi chữ ký initSmartApp32.
export function installStation32(app, { cameras = [], nodeMap = [], search = (typeof location !== 'undefined' ? location.search : ''),
  storage = (typeof sessionStorage !== 'undefined' ? sessionStorage : null) } = {}) {
  const capture = app.modules && app.modules.capture;
  if (!capture) throw new Error('installStation32 cần camera capture (gọi installCameraCapture32 trước)');
  const { baseUrl, wsUrl } = resolveApiBase32(search);
  const store = typeof indexedDB !== 'undefined' ? createIndexedDbStore32() : createMemoryStore32();
  const queue = createQueue32({ store });
  // M5b-1: mọi mã vi phạm; mã hành vi chỉ ghi khi sim bật behavior (sim.behaviorOn).
  const perception = createPerception32({ net: app.traffic.net, sim: app.traffic.sim, controller: app.controller, nodeMap, cameras,
    codes: ALL_CODES_32, restrictedNodes: restrictedNodeIndices32(app.traffic.net.G, nodeMap) });
  let hud = null;
  const transport = createTransport32({
    baseUrl, wsUrl, token: readStoredToken32(storage),
    login: () => loginStation32({ baseUrl, storage }),
    queue,
    wsImpl: typeof WebSocket !== 'undefined' ? WebSocket : null,
    uptimeS: () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0),
    fpsOf: () => (hud && hud.fps ? hud.fps() : 0)
  });
  hud = installHud32(app, { transport });
  transport.start();
  const loop = startStationLoop32(app, { perception, capture, transport, cameras });
  transport.dispose = () => { loop.stop(); transport.stop(); };
  app.registerSmartModule32('perception', perception);
  app.registerSmartModule32('transport', transport);
  app.registerSmartModule32('station-loop', loop);
  return { transport, perception, loop, hud };
}

// M4b1 — nối lớp nhiệt/dự báo/VMS vào app smart. Cần installStation32 trước (để gửi /station/heat qua transport).
// routing = createRouteBias32() đã truyền cho createTraffic31 (routeBias), để cảnh báo đổi hướng xe thật.
export function installHeat32(app, { THREE, routing = null, nodeMap = [], root = (typeof document !== 'undefined' ? document : null),
  historyUrl = 'data/heat-history-32.json?v=32a' } = {}) {
  if (!THREE) throw new TypeError('installHeat32 cần THREE');
  const traffic = app.traffic, net = traffic.net, sim = traffic.sim;
  const transport = app.modules && app.modules.transport;
  // M4b2: giờ của lịch sử theo đồng hồ trong ngày (nếu đã cài đồng hồ), không thì theo giây sim.
  const live = createHeatLive32({
    net, sim, routing,
    clockOf: () => (app.modules && app.modules.clock ? app.modules.clock.heatTime() : sim.counters.t),
    onPayload: payload => { if (transport && typeof transport.sendHeat === 'function') transport.sendHeat(payload); }
  });
  // Lịch sử offline (scripts/build-heat-history-32.mjs) làm nền cho dự báo thống kê ngay từ đầu. Lỗi tải → chỉ cảnh báo.
  if (typeof fetch === 'function' && historyUrl) {
    fetch(historyUrl).then(r => (r.ok ? r.json() : null)).then(j => {
      const hist = j ? expandHeatHistory32(j, net.NE) : null;
      if (hist) live.loadHistory(hist);
      else console.warn('heat-history-32: không nạp được lịch sử (sai số cạnh hoặc định dạng)');
    }).catch(e => console.warn('heat-history-32:', e && e.message));
  }
  const boards = chooseVmsBoards32({ net, nodeMap, max: 4 });
  const scene = createHeatScene32({ THREE, scene: app.scene, traffic, net, sim, boards, vmsBus: app.vms || null });
  const host = root && (root.querySelector ? root.querySelector('#smartHud32') : null);
  const panel = host ? mountHeatPanel32(host, { onToggle: on => { scene.setHeatVisible(on); } }) : null;
  let shown = '';
  const timer = setInterval(() => {
    live.tick();
    scene.update(sim.counters.t, live);
    if (panel) {
      const alerts = live.alerts();
      const key = alerts.map(a => `${a.edge}:${a.horizonMin}`).join(',');
      if (key !== shown) { shown = key; panel.setAlerts(alerts); }
    }
  }, HEAT_TICK_MS_32);
  const mod = {
    live, scene, boards, panel,
    dispose() { clearInterval(timer); scene.dispose(); if (panel) panel.dispose(); }
  };
  return app.registerSmartModule32('heat', mod);
}

// M5a — kịch bản (scenarios-32.js): panel "Kịch bản" trong #smartHud32, lệnh trạm (cmd.scenario, cmd.vms) và trường
// vms/scenario/flow_per_min_per_node của /station/metrics (qua app.metricsExtra32). Gọi SAU installHeat32 và installClock32.
export function installScenarios32(app, { THREE = null, nodeMap = [], routing = null, root = (typeof document !== 'undefined' ? document : null), log = (m => console.info(m)) } = {}) {
  const traffic = app.traffic, net = traffic.net;
  const heat = app.modules && app.modules.heat ? app.modules.heat : null;
  const clock = app.modules && app.modules.clock ? app.modules.clock : null;
  const transport = app.modules && app.modules.transport ? app.modules.transport : null;
  const vms = app.vms;
  const boards = heat && heat.boards ? heat.boards : chooseVmsBoards32({ net, nodeMap, max: 4 });
  const props = THREE && app.scene ? createBlockProps32({ THREE, scene: app.scene, traffic, net }) : null;
  const scn = createScenarios32({ traffic, clock, routing, vms, nodeMap, boards, props, log });
  const host = root && root.querySelector ? root.querySelector('#smartHud32') : null;
  const panel = host ? mountScenarioPanel32(host, {
    onPick: (k, p) => { try { scn.start(k, p); } catch (e) { panel.setActive('none', `Không chạy được: ${e.message}`); } },
    onStop: () => { scn.stop(); }
  }) : null;
  const describe32 = st => {
    if (!st.active) return undefined;
    if (st.key === 'lane-block' && st.remainingS !== null) return `Đang chạy: ${st.label} · còn ${Math.ceil(st.remainingS / 60)} phút sim`;
    return `Đang chạy: ${st.label} · ${Math.floor(st.simElapsedS / 60)} phút sim`;
  };
  const timer = setInterval(() => {
    scn.tick();
    if (panel) { const st = scn.status(); panel.setActive(st.key, describe32(st)); }
  }, 1000);
  const off = transport && typeof transport.onCommand === 'function' ? transport.onCommand(createCommandRouter32({ scenarios: scn, vms, log })) : null;
  app.metricsExtra32 = () => ({
    vms: vms.snapshot(boards, heat && heat.live ? heat.live.alerts() : []),
    scenario: scn.metricsStatus(),
    flow_per_min_per_node: app.controller ? app.controller.metrics(traffic.sim.counters.t).flow_per_node_min : 0
  });
  const mod = {
    scenarios: scn, panel, props, boards,
    dispose() { clearInterval(timer); if (off) off(); scn.dispose(); if (props) props.remove(); if (panel) panel.dispose(); }
  };
  return app.registerSmartModule32('scenarios', mod);
}
