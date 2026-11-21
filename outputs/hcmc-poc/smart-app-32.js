// Vỏ app=smart — chỉ tải khi có ?app=smart. Không sửa file 31A; mọi ghi đè nhãn làm tại đây.
// CHỮ KÝ CHUẨN: initSmartApp32({ scene, camera, renderer, traffic, status, root, mode }).
// Các task sau (T9/T10/T11/T14) KHÔNG đổi chữ ký — chỉ mở rộng qua app.registerSmartModule32(name, mod).
import { buildSignalPlan32 } from './signal-plan-32.js?v=32c';
import { createSignalController32 } from './traffic-controller-32.js?v=32c';
import { regionById } from './city-region-31.js?v=31a';
// T9 — đèn 3D Hàng Xanh: tái xuất để webgpu-materials-24.js gọi qua `smartMod.installSignals32`.
export { createTrafficSignals32, installSignals32 } from './traffic-signals-32.js?v=32c';
// T10 — camera render-to-texture: tái xuất để webgpu-materials-24.js gọi `smartMod.installCameraCapture32`
// (đặt `window.__smartCapture`). Giữ chữ ký initSmartApp32 không đổi.
export { createCameraCapture32, installCameraCapture32, projectToCamera32, projectToPixel32 } from './camera-capture-32.js?v=32c';
// T11 — client trạm: hàng đợi IndexedDB, REST/WS tới backend, HUD A/B/KPI (xem installStation32 cuối file).
import { createPerception32 } from './violation-perception-32.js?v=32a';
import { ZONE_SPEC_32 } from './violation-zones-32.js?v=32a';
import { ALL_CODES_32, restrictedNodeIndices32 } from './violation-rules-32.js?v=32a';
import { createQueue32, createIndexedDbStore32, createMemoryStore32 } from './station-queue-32.js?v=32a';
import { createTransport32, startStationLoop32, resolveApiBase32, readStoredToken32, loginStation32, buildSignalStates32 } from './station-client-32.js?v=32a';
import { createTrafficTransport } from '../shared/public-demo/traffic-transport.js';
import { createStationBridge } from '../shared/public-demo/station-bridge.js';
import { installHud32 } from './kpi-panel-32.js?v=32a';
export { installHud32 } from './kpi-panel-32.js?v=32a';
export { mountTestLab32 } from './test-lab-32.js?v=32c';
export { mountSignalInspector32 } from './signal-inspector-panel-32.js?v=32c';
export { junctionRows32, previewSignals32 } from './signal-preview-32.js?v=32c';
// M4b1 — bản đồ nhiệt, dự báo kẹt, lệch tuyến và bảng VMS (heat-live-32.js, heat-scene-32.js).
import { createHeatLive32, createRouteBias32, chooseVmsBoards32, expandHeatHistory32, createVmsBus32 } from './heat-live-32.js?v=32a';
import { createHeatScene32, mountHeatPanel32 } from './heat-scene-32.js?v=32a';
// M5a — kịch bản (scenarios-32.js) và lệnh trạm (station-client-32.js: cmd.scenario, cmd.vms).
import { createScenarios32, mountScenarioPanel32, createBlockProps32 } from './scenarios-32.js?v=32a';
import { createEmergency32, createEmergencyVisual32 } from './emergency-32.js?v=32a';
import { createCommandRouter32 } from './station-client-32.js?v=32a';
// demo-v2 (P2-8): bàn cưỡng chế — ghim đèn / bơm xe / triệu hồi xe công vụ / tạo tai nạn, có hoàn tác.
export { createEnforcement32, mountEnforcementPanel32, ENFORCEMENT_32_VERSION, ENFORCEMENT_PIN_S_32 } from './enforcement-32.js?v=32c';
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
// Giữ DOM cổ điển để các listener dùng chung còn hoạt động; chỉ ẩn khỏi app smart.
export const HIDDEN_PANELS_32 = ['#story', '#controls', '#floodLab'];
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
// demo-v2 (P1-10): yellowDecision — xe đang chạy quyết định đi tiếp trong pha vàng theo tốc độ + khoảng cách vạch;
// motoCreep — xe máy len lối về mép làn khi đứng chờ đèn. Mặc định tắt ở luồng cổ điển (hash hồi quy không đổi).
export function smartBehavior32({ graph, nodeMap, cameras = null }) {
  // M5b-1b: vùng cấm đỗ/điểm đo tốc độ/tuyến ngược chiều dựng từ camera registry (violation-zones-32.js), không từ nút.
  return { restrictedNodes: restrictedNodeIndices32(graph, nodeMap), cameras, zoneSpec: ZONE_SPEC_32,
    yellowDecision: true, motoCreep: true };
}

export async function prepareSmart32({ graph, config = null }) {
  const load = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Không tải được cấu hình smart: ${url}`);
    return response.json();
  };
  const publicConfig = config || (graph.region === 'bac' ? await load('data/public-north/runtime-sidecars.json') : null);
  if (graph.region === 'bac' && (publicConfig?.region !== 'bac' || !Array.isArray(publicConfig.signalRows))) throw new Error('Cấu hình public Bắc không hợp lệ');
  const [nodeMap, cameras] = await Promise.all([
    load(publicConfig?.nodeMapUrl || '../smart-traffic/backend/app/seed/node_map.json'),
    load(publicConfig?.camerasUrl || '../smart-traffic/backend/app/seed/cameras.json')
  ]);
  const signalPlan = buildSignalPlan32({ graph, nodeMap, ...(publicConfig ? { rows: publicConfig.signalRows } : {}) });
  const heatHistory = publicConfig ? expandHeatHistory32(await load(publicConfig.heatHistoryUrl), graph.edges.length) : null;
  if (publicConfig && !heatHistory) throw new Error('Chỉ mục lịch sử nhiệt public không khớp graph');
  return { signalPlan, nodeMap, cameras, config: publicConfig, heatHistory };
}

// T9b — Panel "Tham quan" của app smart: các góc nhìn khu Bắc. Toạ độ suy từ node_map / signature registry / road graph,
// không đoán tay. Trả về toạ độ mảng [x,y,z] để webgpu-materials-24.js tự bọc THREE.Vector3 (file này chạy được Node).
// Bỏ Cầu Sài Gòn/Cầu Thị Nghè khỏi tour: khung cầu dài bị cắt và các hộp nhà ven cầu che mặt cầu,
// nhìn như kẹt cứng — không đáng đưa vào luồng tham quan. Hai view vẫn giữ để mở trực tiếp bằng URL.
export const NORTH_TOUR_32 = [
  { key: 'hx', label: 'Ngã tư Hàng Xanh' },
  { key: 'l81', label: 'Landmark 81' },
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

// Vùng quan sát là công cụ kiểm tra: chỉ bật khi người dùng chọn checkbox.
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
    if (onSelect) onSelect(key);
  };
  setCone(false);
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
  storage = (typeof sessionStorage !== 'undefined' ? sessionStorage : null),
  mode = new URLSearchParams(search).get('transport') || globalThis.SMtfTransportMode ||
    (['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname) ? 'local' : 'public'),
  buildId = globalThis.SMtfBuildId || 'public-demo-v1', streamAll = null } = {}) {
  const capture = app.modules && app.modules.capture;
  if (!capture) throw new Error('installStation32 cần camera capture (gọi installCameraCapture32 trước)');
  const { baseUrl, wsUrl } = resolveApiBase32(search);
  const source = createTrafficTransport(mode === 'public' ? { mode: 'public', buildId } : { mode, apiBase: baseUrl, wsUrl });
  let stationToken = readStoredToken32(storage);
  // JWT chỉ dùng để claim local; mọi request sau đó mang capability của bridge.
  const runtime = {
    ...source,
    async request(input) {
      if (mode === 'local' && input.method === 'POST' && input.path === '/api/v1/station/lease' && !input.token) {
        stationToken ||= await loginStation32({ baseUrl, storage });
        try { return await source.request({ ...input, token: stationToken }); }
        catch (error) {
          if (error.status !== 401) throw error;
          stationToken = await loginStation32({ baseUrl, storage });
          return source.request({ ...input, token: stationToken });
        }
      }
      return source.request(input);
    }
  };
  const store = typeof indexedDB !== 'undefined' ? createIndexedDbStore32() : createMemoryStore32();
  const queue = createQueue32({ store });
  // M5b-1: mọi mã vi phạm; mã hành vi chỉ ghi khi sim bật behavior (sim.behaviorOn).
  const perception = createPerception32({ net: app.traffic.net, sim: app.traffic.sim, controller: app.controller, nodeMap, cameras,
    zones: app.traffic.zones || null, ghosts: app.traffic.ghosts || null,
    codes: ALL_CODES_32, restrictedNodes: restrictedNodeIndices32(app.traffic.net.G, nodeMap) });
  let hud = null;
  const transport = createTransport32({
    baseUrl, wsUrl, token: readStoredToken32(storage),
    login: () => loginStation32({ baseUrl, storage }),
    queue, runtimeTransport: runtime,
    wsImpl: typeof WebSocket !== 'undefined' ? WebSocket : null,
    uptimeS: () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0),
    fpsOf: () => (hud && hud.fps ? hud.fps() : 0)
  });
  const bridge = createStationBridge({ transport: runtime, stationId: 'STATION-3D-01',
    applyCommand: command => applyStationCommand32(app, command),
    readSnapshot: () => readStationSnapshot32(app, cameras, transport, buildId) });
  hud = installHud32(app, { transport });
  bridge.start().catch(error => console.warn('[station] không nối được trạm:', error.message));
  transport.start();
  // demo-v2: phát vi phạm lên kênh 'smtf-submit-events' cho web cán bộ banner "khung nhận diện tự động".
  let violationChannel = null;
  const emitViolation = rec => {
    if (typeof BroadcastChannel === 'undefined') return;
    if (!violationChannel) violationChannel = new BroadcastChannel('smtf-submit-events');
    violationChannel.postMessage({
      type: 'violation', code: rec.violation_code, label: rec.violation_label || rec.summary || '',
      plate: rec.plate, cameraId: rec.camera_id, confidence: Number.isFinite(rec.confidence) ? rec.confidence : null,
      at: Date.now()
    });
  };
  // streamAll: luân phiên khung MỌI camera (~15 khung/phút/camera) cho web công an xem được 10 camera
  // (chế độ Docker/local). Bản public chỉ đẩy camera đang xem (submit-frame-32 lo /api/demo/frame 1 khung/3 s).
  const streamAllOn = streamAll == null ? mode !== 'public' : !!streamAll;
  const loop = startStationLoop32(app, { perception, capture, transport, cameras, streamAll: streamAllOn, onViolation: emitViolation });
  transport.dispose = () => { loop.stop(); transport.stop(); return bridge.stop(); };
  app.registerSmartModule32('perception', perception);
  app.registerSmartModule32('transport', transport);
  app.registerSmartModule32('station-loop', loop);
  return { transport, perception, loop, hud };
}

export async function applyStationCommand32(app, command) {
  const data = command.data || {};
  if (command.event === 'cmd.signal-mode') {
    // Nhận thiết lập vào controller; vàng/đỏ an toàn vẫn do controller thực hiện.
    await app.controller.setMode(data.mode);
  } else if (command.event === 'cmd.signal-override') {
    app.controller.overridePhase(data.node_id, data.group, data.duration_s || 60, data.by || 'command', data.reason || '');
  } else {
    const scenarios = app.modules?.scenarios?.scenarios || null;
    const result = await createCommandRouter32({ scenarios, vms: app.vms })(command);
    if (!result?.ok) return { status: 'rejected', reason_code: 'COMMAND_REJECTED' };
  }
  return { status: 'applied', applied_t_sim: app.traffic.sim.counters.t };
}

export function readStationSnapshot32(app, cameras, transport, buildId) {
  const { sim, net } = app.traffic;
  const t = sim.counters.t;
  const metrics = app.controller.metrics(t);
  const states = buildSignalStates32(app.controller, net, t);
  const clusters = net.signalPlan?.clusters || [];
  const junctionByNode = new Map(states.map(({ node_id, cluster_id }) => [node_id, cluster_id]));
  return {
    snapshot_version: 'public-demo-v1', revision: 0, build_id: buildId,
    station: { status: 'active', id: 'STATION-3D-01', last_seen_at: new Date().toISOString() },
    simulation: { seed: sim.seed ?? null, scenario: app.modules?.scenarios?.scenarios.status().key || 'none',
      mode: app.controller.getMode(), t_sim: t, paused: app.modules?.clock?.speed?.() === 0 || Boolean(sim.paused) },
    junctions: clusters.map(cluster => {
      const rows = states.filter(state => state.cluster_id === cluster.cluster_id);
      const active = rows.find(row => row.phase === 'green') || rows.find(row => row.phase === 'yellow') || rows[0];
      return { junction_id: cluster.cluster_id, node_ids: rows.map(row => row.node_id), label: cluster.label || cluster.cluster_id,
        phase: active?.phase || 'red', group: active?.group ?? null, decision: null };
    }),
    kpi: { wait_avg_s: metrics.wait_avg_s, queue_max: metrics.queue_max, flow_per_min: metrics.flow_per_min,
      trips_completed: sim.counters.trips_completed || 0,
      admission_wait: sim.pending ? Array.from(sim.pending).filter(Boolean).length : 0,
      recoveries: sim.counters.recoveries ?? sim.counters.breakerRespawns ?? 0 },
    routes: [],
    cameras: cameras.map(camera => ({ camera_id: camera.camera_id, junction_id: junctionByNode.get(camera.node_id) ?? null,
      label: camera.label || camera.camera_id, frame_id: null, source: 'live', status: 'missing', captured_at: null,
      width: null, height: null, ...transport.frameMetadata(camera.camera_id) }))
  };
}

// M4b1 — nối lớp nhiệt/dự báo/VMS vào app smart. Cần installStation32 trước (để gửi /station/heat qua transport).
// routing = createRouteBias32() đã truyền cho createTraffic31 (routeBias), để cảnh báo đổi hướng xe thật.
export function installHeat32(app, { THREE, routing = null, nodeMap = [], root = (typeof document !== 'undefined' ? document : null),
  historyUrl = 'data/heat-history-32.json?v=32a', history = null } = {}) {
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
  if (history) live.loadHistory(history);
  else if (typeof fetch === 'function' && historyUrl) {
    fetch(historyUrl).then(r => (r.ok ? r.json() : null)).then(j => {
      const hist = j ? expandHeatHistory32(j, net.NE) : null;
      if (hist) live.loadHistory(hist);
      else console.warn('heat-history-32: không nạp được lịch sử (sai số cạnh hoặc định dạng)');
    }).catch(e => console.warn('heat-history-32:', e && e.message));
  }
  const boards = chooseVmsBoards32({ net, nodeMap, max: 4 });
  const scene = createHeatScene32({ THREE, scene: app.scene, traffic, net, sim, boards, vmsBus: app.vms || null });
  const host = root && (root.querySelector ? root.querySelector('#smartHud32') : null);
  // demo-v2 (P1-11): công tắc riêng cho lớp mũi tên dòng xe theo chiều.
  const panel = host ? mountHeatPanel32(host, {
    onToggle: on => { scene.setHeatVisible(on); },
    onToggleFlow: on => { scene.setFlowVisible(on); }
  }) : null;
  // demo-v2: nhiệt và dòng xe là hai lớp kể chuyện chính của trạm — bật sẵn để giám khảo thấy ngay.
  scene.setHeatVisible(true);
  scene.setFlowVisible(true);
  panel?.setOn?.(true);
  panel?.setFlowOn?.(true);
  let shown = '';
  // PERF-2: khi tab ẩn, chậm nhịp heat (250 ms → 1 s) để bớt CPU; khi hiện lại quay về nhịp cũ.
  // Dùng chuỗi setTimeout tự lập lại (thay vì setInterval cố định) để nhịp đổi theo trạng thái tab.
  const heatInterval = () => (tabHidden32.hidden ? SMART_SLOW_TICK_MS_32 : HEAT_TICK_MS_32);
  let timer = 0;
  const heatTick = () => {
    live.tick();
    scene.update(sim.counters.t, live);
    if (panel) {
      const alerts = live.alerts();
      const key = alerts.map(a => `${a.edge}:${a.horizonMin}`).join(',');
      if (key !== shown) { shown = key; panel.setAlerts(alerts); }
    }
    timer = typeof setTimeout === 'function' ? setTimeout(heatTick, heatInterval()) : 0;
  };
  if (typeof setTimeout === 'function') timer = setTimeout(heatTick, heatInterval());
  const mod = {
    live, scene, boards, panel,
    dispose() { if (timer) clearTimeout(timer); scene.dispose(); if (panel) panel.dispose(); }
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
  const emergency = createEmergency32({ sim: traffic.sim, net, controller: app.controller, nodeMap,
    visual: THREE && app.scene ? createEmergencyVisual32({ THREE, scene: app.scene, traffic }) : null,
    vms, boards: heat && heat.boards ? heat.boards : boards });
  app.registerSmartModule32('emergency', emergency);
  const scn = createScenarios32({ traffic, clock, routing, vms, nodeMap, boards, props, emergency, log });
  const host = root && root.querySelector ? root.querySelector('#smartHud32') : null;
  const panel = host ? mountScenarioPanel32(host, {
    onFocus: () => app.focusTraffic32?.(emergency.currentSlot()),
    onPick: (k, p) => { try { scn.start(k, p); } catch (e) { panel.setActive('none', `Không chạy được: ${e.message}`); } },
    onStop: () => { scn.stop(); }
  }) : null;
  const describe32 = st => {
    if (!st.active) return st.lastError || undefined;
    if (st.key === 'priority-run') {
      const e = emergency.status();
      return `${e.label} · ${e.vehicle_id || ''} · ${e.distance_m || 0} m · qua ${e.passed || 0} nút · ${e.yielded || 0} xe nhường${e.blocked ? ' · chờ ghi đè của cán bộ' : e.node_id ? ` · ưu tiên ${e.node_id}` : ''}`;
    }
    if (st.key === 'lane-block' && st.remainingS !== null) return `Đang chạy: ${st.label} · còn ${Math.ceil(st.remainingS / 60)} phút sim`;
    return `Đang chạy: ${st.label} · ${Math.floor(st.simElapsedS / 60)} phút sim`;
  };
  // PERF-2: khi tab ẩn chậm nhịp kịch bản (1 s → 5 s) để bớt CPU; khi hiện lại quay về nhịp cũ.
  const scnInterval = () => (tabHidden32.hidden ? SMART_SLOW_TICK_MS_32 * 5 : 1000);
  let timer = 0;
  const scnTick = () => {
    scn.tick();
    if (panel) { const st = scn.status(); panel.setActive(st.key, describe32(st)); }
    timer = typeof setTimeout === 'function' ? setTimeout(scnTick, scnInterval()) : 0;
  };
  if (typeof setTimeout === 'function') timer = setTimeout(scnTick, 1000);
  app.metricsExtra32 = () => ({
    vms: vms.snapshot(boards, heat && heat.live ? heat.live.alerts() : []),
    scenario: scn.metricsStatus(),
    flow_per_min_per_node: app.controller ? app.controller.metrics(traffic.sim.counters.t).flow_per_node_min : 0
  });
  const mod = {
    scenarios: scn, panel, props, boards,
    dispose() { if (timer) clearTimeout(timer); scn.dispose(); if (props) props.remove(); if (panel) panel.dispose(); }
  };
  return app.registerSmartModule32('scenarios', mod);
}

// ---- PERF-2: trần FPS, chạy sim khi tab ẩn, công tắc tiết kiệm tài nguyên ----
// Các hàm thuần ở đây để test Node gọi trực tiếp; vòng vẽ (webgpu-materials-24.js) gọi qua smartMod.
// CHỈ chạy khi có app=smart (vòng vẽ bọc trong isSmart32); không đổi hành vi 31A cổ điển.

export const SMART_FPS_DEFAULT_32 = 30;   // trần FPS mặc định khi app=smart
export const SMART_FPS_IDLE_32 = 15;      // trần FPS khi không thao tác 60 s hoặc bật tiết kiệm
export const SMART_IDLE_MS_32 = 60000;    // không thao tác chuột/phím 60 s → hạ FPS
export const SMART_DT_CLAMP_32 = 0.25;    // giữ kẹp dt của city-traffic-31.js
export const SMART_HIDDEN_STEP_MS_32 = 1000; // nhịp chạy sim khi tab ẩn
export const SMART_SLOW_TICK_MS_32 = 1000;  // nhịp chậm (đồng hồ/heat) khi tab ẩn
export const SMART_SAVE_KEY_32 = 'citylab.32i.resourceSaver';
export const SMART_SAVE_LABEL_32 = 'Tiết kiệm tài nguyên';

// Trần FPS: mặc định 30; bật tiết kiệm hoặc không thao tác ≥ 60 s → 15. Trả về {fps, waitMs}.
export function smartFpsCap32({ savePower = false, idleMs = 0 } = {}) {
  const cap = (savePower || idleMs >= SMART_IDLE_MS_32) ? SMART_FPS_IDLE_32 : SMART_FPS_DEFAULT_32;
  return { fps: cap, waitMs: 1000 / cap };
}

// dt khung: tính dt THỰC từ lần vẽ trước, kẹp 0,25 s (giữ kẹp của city-traffic-31.js) để sim không chậm
// khi FPS thấp. lastTime = null (khung đầu) → dt = 0. now < lastTime → dt = 0.
export function smartFrameDt32(now, lastTime, clamp = SMART_DT_CLAMP_32) {
  const raw = lastTime == null ? 0 : (now - lastTime) / 1000;
  const dt = Math.min(clamp, Math.max(0, raw));
  return { dt, lastTime: now };
}

// Số bước sim (STEP = 0,1 s) tương ứng một khoảng thời gian thực khi tab ẩn, theo tốc độ chạy.
export function smartHiddenSteps32(realSeconds, timeScale = 1, step = 0.1) {
  return Math.max(0, Math.round((Math.max(0, realSeconds) * timeScale) / step));
}

// Số lát thời gian thực cần chia khi chạy sim không vẽ. city-traffic-31.js kẹp dt 0,25 s và tối đa
// MAX_STEPS_PER_FRAME = 5 bước (0,5 s sim) mỗi lần update → mỗi lát phải ≤ 0,25 s thực và ≤ 0,5 s sim.
const SIM_STEP_S = 0.1, SIM_MAX_STEPS = 5;
export function smartHiddenSlices32(realSeconds, timeScale = 1, maxRealSlice = SMART_DT_CLAMP_32) {
  const span = Math.max(0, Number(realSeconds) || 0);
  if (span <= 0) return 0;
  const perSliceSim = SIM_STEP_S * SIM_MAX_STEPS;               // 0,5 s sim tối đa mỗi lần update
  const budgetReal = perSliceSim / Math.max(1, timeScale);     // s thực tối đa để không vượt 0,5 s sim
  const slice = Math.min(maxRealSlice, Math.max(0.01, budgetReal));
  return Math.max(1, Math.ceil(span / slice));
}

// Tab ẩn: rAF đã dừng nên phải chạy sim bằng setInterval 1 s, mỗi lần chạy số bước theo đồng hồ.
// KHÔNG vẽ (traffic.update(..., drawFrame = false)). Khi hiện lại quay về vòng vẽ.
export function installHiddenTab32(app, { traffic = null, doc = (typeof document !== 'undefined' ? document : null),
  intervalMs = SMART_HIDDEN_STEP_MS_32 } = {}) {
  const target = traffic || (app && app.traffic) || null;
  if (!target || typeof target.update !== 'function') return { dispose() {}, isHidden() { return tabHidden32.hidden; } };
  let timer = 0, lastTick = 0;
  const advance = () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const elapsed = lastTick ? (now - lastTick) / 1000 : intervalMs / 1000;
    lastTick = now;
    const timeScale = typeof target.getTimeScale === 'function' ? target.getTimeScale() : 1;
    const slices = smartHiddenSlices32(elapsed, timeScale);
    const dtReal = elapsed / slices;
    let t = now - elapsed * 1000;
    for (let i = 0; i < slices; i++) { t += dtReal * 1000; target.update(t, 2000, false); }
  };
  const onVisibility = () => {
    const hidden = !!(doc && doc.hidden);
    tabHidden32.hidden = hidden;
    if (hidden) { lastTick = 0; if (!timer && typeof setInterval === 'function') timer = setInterval(advance, intervalMs); }
    else { if (timer) { clearInterval(timer); timer = 0; } lastTick = 0; }
  };
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
  if (doc && doc.hidden) onVisibility();
  return {
    isHidden() { return tabHidden32.hidden; },
    dispose() { if (timer) { clearInterval(timer); timer = 0; } if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility); tabHidden32.hidden = false; }
  };
}

// Trạng thái tab ẩn dùng chung: clock-32.js khai báo (file lá), smart-app-32.js tái xuất để vòng vẽ truy cập qua smartMod.
export { tabHidden32 } from './clock-32.js?v=32a';
import { tabHidden32 } from './clock-32.js?v=32a';

// Công tắc "Tiết kiệm tài nguyên" trong #smartHud32: bật thì trần FPS 15, mode lite, pixelRatio ≤ 1.
// Lưu localStorage, bọc try/catch. Trả về {dispose}. Gọi SAU khi #smartHud32 đã tạo (installStation32).
export function installResourceSaver32(app, { root = (typeof document !== 'undefined' ? document : null),
  storage = (typeof localStorage !== 'undefined' ? localStorage : null),
  onApply = null, log = (m => console.info(m)) } = {}) {
  const host = root && root.querySelector ? root.querySelector('#smartPerformanceBody32') || root.querySelector('#smartHud32') : null;
  if (!host) return { dispose() {}, enabled() { return false; } };
  const saved = () => { try { return storage && storage.getItem(SMART_SAVE_KEY_32) === 'true'; } catch { return false; } };
  const persist = on => { try { if (storage) storage.setItem(SMART_SAVE_KEY_32, on ? 'true' : 'false'); } catch { /* bỏ qua */ } };
  let on = saved();
  const section = root.createElement ? root.createElement('section') : null;
  if (!section) return { dispose() {}, enabled() { return false; } };
  section.className = 'save-sec32';
  section.setAttribute('aria-label', 'Tiết kiệm tài nguyên');
  const label = root.createElement('label');
  label.className = 'hud-switch';
  const input = root.createElement('input');
  input.type = 'checkbox';
  input.id = 'saveToggle32';
  input.setAttribute('aria-label', SMART_SAVE_LABEL_32);
  input.checked = on;
  label.append(input, root.createTextNode(' ' + SMART_SAVE_LABEL_32));
  section.append(label);
  host.append(section);
  const apply = next => {
    on = !!next;
    input.checked = on;
    persist(on);
    if (typeof onApply === 'function') { try { onApply(on); } catch (e) { log('tiết kiệm: ' + (e && e.message)); } }
    log(on ? 'Đã bật tiết kiệm tài nguyên (FPS 15, chế độ Lite, độ phân giải thấp)' : 'Đã tắt tiết kiệm tài nguyên');
  };
  const onChange = () => apply(input.checked);
  input.addEventListener('change', onChange);
  apply(on);
  return { enabled: () => on, set: apply, dispose() { input.removeEventListener('change', onChange); if (section && section.remove) section.remove(); } };
}

import { createResourceWatch32, formatResourceReason32, resourceSample32, RESOURCE_LIMITS_32 } from './resource-monitor-32.js?v=32a';
export { createResourceWatch32, formatResourceReason32, resourceReasons32, resourceSample32, resourceOver32, resourceUnder32, RESOURCE_LIMITS_32 } from './resource-monitor-32.js?v=32a';

const RESOURCE_CHIP_CSS_32 = `
#resourceSaveChip32[hidden]{display:none!important}
#resourceSaveChip32{position:fixed;z-index:15;top:16px;right:16px;display:inline-flex;align-items:center;gap:8px;max-width:min(360px,calc(100vw - 32px));padding:8px 13px;border-radius:999px;background:rgba(45,31,7,.88);border:1px solid rgba(245,190,82,.62);color:#fde6aa;font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
#resourceSaveChip32 .save-chip-dot32{width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.25);flex:none}
#resourceSaveChip32 .save-chip-text32{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:760px){#resourceSaveChip32{top:8px;right:8px;max-width:calc(100vw - 180px);padding:6px 10px;font-size:11px}}
`;

export function formatResourceChipText32(reasons = []) {
  const detail = formatResourceReason32(reasons);
  return detail ? `Tiết kiệm tài nguyên · ${detail}` : 'Tiết kiệm tài nguyên';
}

export function formatResourceChipTitle32(reasons = []) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return 'Hệ thống tự giảm xuống 15 FPS · Lite để giữ mượt';
  }
  const detail = reasons.map(r => `${r.key} ${r.pct}% (ngưỡng ${r.limit}%)`).join(', ');
  return `Tự bật tiết kiệm tài nguyên (15 FPS · Lite) do ${detail}`;
}

// Giám sát tài nguyên: mỗi 1 s đo CPU (mật độ long-task), GPU proxy (thời gian khung so ngân sách
// của FPS trần), RAM (performance.memory). Vượt ngưỡng 3 s liên tiếp → TỰ bật "Tiết kiệm tài nguyên";
// về dưới ngưỡng − 5 điểm trong 5 s → tự tắt (chỉ tắt nếu chính monitor bật, không cưỡng công tắc thủ công).
// CHỈ chạy khi app=smart (webgpu-materials-24.js gọi trong nhánh isSmart32).
export function installResourceMonitor32(app, { root = (typeof document !== 'undefined' ? document : null),
  saver = null, capFpsOf = () => 30, storage = (typeof localStorage !== 'undefined' ? localStorage : null),
  intervalMs = 1000, log = (m => console.info(m)) } = {}) {
  let autoSet = false;
  let longTasks = 0, frames = 0, frameMs = 0, lastFrame = null;
  const container = root && (root.body || (root.querySelector ? root.querySelector('body') : null) || root);
  const chip = container && root.createElement ? root.createElement('div') : null;
  let chipText = null;
  if (chip) {
    if (root.head && root.getElementById && !root.getElementById('resourceChipCss32')) {
      const style = root.createElement('style');
      style.id = 'resourceChipCss32';
      style.textContent = RESOURCE_CHIP_CSS_32;
      root.head.append(style);
    }
    chip.id = 'resourceSaveChip32';
    chip.className = 'save-chip32';
    chip.setAttribute('role', 'status');
    chip.setAttribute('aria-live', 'polite');
    chip.hidden = true;
    const dot = root.createElement('span');
    dot.className = 'save-chip-dot32';
    dot.setAttribute('aria-hidden', 'true');
    chipText = root.createElement('span');
    chipText.className = 'save-chip-text32';
    chipText.textContent = formatResourceChipText32([]);
    chip.append(dot, chipText);
    if (typeof container.append === 'function') container.append(chip);
  }
  const syncChip = (active, reasons = []) => {
    if (!chip) return;
    chip.hidden = !active;
    const text = formatResourceChipText32(reasons);
    if (chipText) chipText.textContent = text;
    else chip.textContent = text;
    chip.title = formatResourceChipTitle32(reasons);
  };
  const watch = createResourceWatch32({
    autoPersist: storage,
    onSave: info => {
      autoSet = true;
      syncChip(true, info?.reasons || []);
      if (saver && typeof saver.set === 'function' && !saver.enabled()) saver.set(true);
    },
    onReasonChange: info => {
      syncChip(true, info?.reasons || []);
    },
    onNormal: () => {
      syncChip(false, []);
      if (autoSet) { autoSet = false; if (saver && typeof saver.set === 'function' && saver.enabled()) saver.set(false); }
    }
  });
  // Long-task: > 50 ms liên tục — đại lượng JS đo được gần nhất của tải luồng chính.
  let observer = null;
  if (typeof PerformanceObserver === 'function') {
    try { observer = new PerformanceObserver(list => { longTasks += list.getEntries().length; }); observer.observe({ entryTypes: ['longtask'] }); } catch { observer = null; }
  }
  // Thời gian khung trung bình (đại lượng thay cho GPU vì JS không đọc được mức dùng GPU).
  const onFrame = now => {
    if (lastFrame !== null) { frames++; frameMs += now - lastFrame; }
    lastFrame = now;
    rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(onFrame) : 0;
  };
  let rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(onFrame) : 0;
  const timer = typeof setInterval === 'function' ? setInterval(() => {
    const sample = resourceSample32({
      heapUsed: typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize : 0,
      heapLimit: typeof performance !== 'undefined' && performance.memory ? performance.memory.jsHeapSizeLimit : 0,
      longTasksPerSec: longTasks,
      frameMs: frames > 0 ? frameMs / frames : 0,
      capFps: capFpsOf()
    });
    longTasks = 0; frames = 0; frameMs = 0;
    const mode = watch.tick(sample);
    syncChip(mode === 'save', watch.reasons());
    return mode;
  }, intervalMs) : 0;
  return {
    watch, chip, mode: () => watch.mode(), limits: RESOURCE_LIMITS_32,
    dispose() {
      if (timer) clearInterval(timer);
      if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      if (chip && chip.remove) chip.remove();
    }
  };
}
// Trả về {dispose}. onApply được bọc try/catch ở installResourceSaver32 nên không cần bắt thêm.
export function applyResourceSaver32({ renderer = null, modeController = null, setSave = null, innerWidth: iw = 0, innerHeight: ih = 0 } = {}) {
  const out = { on: true, mode: null };
  try { if (typeof setSave === 'function') setSave(true); } catch { /* bỏ qua */ }
  try { if (renderer && typeof renderer.setPixelRatio === 'function') { renderer.setPixelRatio(1); if (iw && ih && typeof renderer.setSize === 'function') renderer.setSize(iw, ih, false); } } catch { /* bỏ qua */ }
  if (modeController && typeof modeController.choose === 'function') {
    try { if (modeController.choose('lite')) out.mode = 'lite'; } catch { /* bỏ qua */ }
  }
  return out;
}

export function clearResourceSaver32({ renderer = null, modeController = null, setSave = null, pixelRatio = 1, innerWidth: iw = 0, innerHeight: ih = 0 } = {}) {
  try { if (typeof setSave === 'function') setSave(false); } catch { /* bỏ qua */ }
  try { if (renderer && typeof renderer.setPixelRatio === 'function') { renderer.setPixelRatio(pixelRatio); if (iw && ih && typeof renderer.setSize === 'function') renderer.setSize(iw, ih, false); } } catch { /* bỏ qua */ }
  return { on: false };
}

