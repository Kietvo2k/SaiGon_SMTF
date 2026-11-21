// enforcement-32.js — demo-v2 (P2-8): điều khiển tình huống — ghim đèn ngẫu nhiên, bơm nhu cầu nhiều xe,
// triệu hồi xe công vụ, tạo tai nạn; MỌI thao tác có nhãn tiếng Việt, nút định vị và nút hoàn tác.
// (P2-7) tai nạn: hai xe chặn điểm trên làn chính + phương án điều tiết tự động (tránh đoạn qua
// routeBias, VMS chỉ dẫn, giữ xe thoát nút) và phát tín hiệu BroadcastChannel 'smtf-submit-events'
// cho web cán bộ hiển thị "trước/sau điều tiết". Thuần JS; THREE/DOM chỉ ở mountEnforcementPanel32.
// Vòng 7: mỗi thao tác mang thêm `target` {kind:'junction'|'area'|'vehicle'|'point'} để panel định vị camera.

import { findLaneBlock32, BLOCK_CAR_HALF_M_32 } from './scenarios-32.js?v=32a';
import { roadNameOf32 } from './heat-live-32.js?v=32a';
import { EMERGENCY_KINDS_32 } from './emergency-32.js?v=32a';

export const ENFORCEMENT_32_VERSION = 'enforcement-32a';
export const ENFORCEMENT_CHANNEL_32 = 'smtf-submit-events';
export const ENFORCEMENT_PIN_S_32 = 60;

const GROUP_NAME_32 = ['A', 'B'];

export function createEnforcement32({
  traffic, controller, nodeMap = [], emergency = null, routing = null, vms = null, boards = [],
  showIncident = null, hideIncident = null,
  random = Math.random, now = () => Date.now(), channel = null, log = () => {}
} = {}) {
  if (!traffic || !traffic.sim) throw new TypeError('createEnforcement32 cần traffic.sim');
  if (!controller) throw new TypeError('createEnforcement32 cần controller');
  const net = traffic.net || traffic.sim.net || null;
  const sim = traffic.sim;
  // Cụm đèn điều khiển được: nút theo cluster_id → chỉ số graph đầu tiên của cụm.
  const clusters = (net && net.signalPlan && Array.isArray(net.signalPlan.clusters)) ? net.signalPlan.clusters : [];
  const clusterInfo = clusters.map(c => ({ id: c.cluster_id, node: c.nodeIds[0] }));
  // Phát tín hiệu sự kiện cho web cán bộ (BroadcastChannel same-origin, chỉ truyền tín hiệu).
  let bc = channel;
  const emit = event => {
    try {
      if (!bc && typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(ENFORCEMENT_CHANNEL_32);
      bc && bc.postMessage(event);
    } catch { /* kênh không khả dụng: thao tác vẫn chạy trên trạm. */ }
  };

  const undoStack = [];
  const pushUndo = (id, label, undo, target = null) => {
    undoStack.push({ id, label, undo, at: now(), target });
    log(`[điều khiển tình huống] ${label}`);
    return id;
  };

  // ---- Ghim đèn: cụm ngẫu nhiên + nhóm ngẫu nhiên, giữ ENFORCEMENT_PIN_S_32 giây; undo nhả ghi đè.
  function pinSignal(pick = null) {
    if (!clusterInfo.length) throw new Error('Trạm chưa có cụm đèn điều khiển');
    const choice = Number.isInteger(pick) ? clusterInfo[pick % clusterInfo.length] : clusterInfo[Math.floor(random() * clusterInfo.length)];
    const group = random() < 0.5 ? 0 : 1;
    controller.overridePhase(choice.node, group, ENFORCEMENT_PIN_S_32, 'ENFORCEMENT-32', 'Ghim thủ công từ bảng điều khiển tình huống');
    const label = `Ghim đèn ${choice.id} · nhóm ${GROUP_NAME_32[group]} · ${ENFORCEMENT_PIN_S_32} s`;
    const undoId = pushUndo(`pin:${choice.id}:${group}`, label, () => {
      controller.overridePhase(choice.node, null, 0, 'ENFORCEMENT-32', 'Hoàn tác ghim');
    }, { kind: 'junction', clusterId: choice.id, nodeId: choice.node, group });
    emit({ type: 'pin', node: choice.id, group: GROUP_NAME_32[group], seconds: ENFORCEMENT_PIN_S_32, at: now() });
    return { id: undoId, node: choice.id, group };
  }

  // ---- Bơm nhu cầu: spawnTestNpc thêm xe an toàn; undo dọn đúng xe NPC.
  function spawnCars(count = 12) {
    const n = Math.max(1, Math.min(200, Number(count) || 12));
    // spawnTestNpc trả {added,total} ở bản hiện tại; giữ nhận number cho stub/test cũ.
    const result = sim.spawnTestNpc(n);
    const added = Number((result && result.added) ?? result) || 0;
    const label = `Bơm ${added} xe vào khu`;
    const undoId = pushUndo(`cars:${now()}`, label, () => sim.clearTestNpcs(), { kind: 'area' });
    if (added > 0) emit({ type: 'spawn', count: added, at: now() });
    return { id: undoId, added };
  }

  // ---- Triệu hồi xe công vụ (dùng PRIORITY-7): undo gọi stop.
  function spawnService(kind = 'ambulance') {
    if (!emergency) throw new Error('Trạm chưa cài xe công vụ');
    const status = emergency.start({ kind });
    const label = `Triệu hồi ${EMERGENCY_KINDS_32[kind]}`;
    const target = Number.isInteger(status && status.slot)
      ? { kind: 'vehicle', slot: status.slot, vehicleKind: kind }
      : { kind: 'area' };
    const undoId = pushUndo(`service:${kind}`, label, () => emergency.stop('Hoàn tác triệu hồi'), target);
    emit({ type: 'ambulance', kind, at: now() });
    return { id: undoId, status };
  }

  // ---- Tạo tai nạn (P2-7): hai xe chặn điểm trên làn phải Điện Biên Phủ vào HX-01 (findLaneBlock32);
  // phương án điều tiết: routeBias tránh cạnh, VMS chỉ đường khác; phát sự kiện before/after cho web.
  function createIncident() {
    if (!net) throw new Error('Bảng điều khiển tình huống cần mạng đường');
    const spot = findLaneBlock32(net, nodeMap);
    if (!spot) throw new Error('Không tìm thấy điểm hợp lệ để tạo tai nạn');
    const edge = net.lanes.edge[spot.lane];
    const road = roadNameOf32(net, edge);
    // Chặn làn: mép sau của "xe tai nạn" như kịch bản xe hỏng (giữ khối xe thật của sim).
    const rear = Math.max(0, spot.s - BLOCK_CAR_HALF_M_32 * 2);
    traffic.setRestrictions({ blocks: [{ lane: spot.lane, s: rear }] });
    if (showIncident) { try { showIncident(spot); } catch { /* cảnh báo hiển thị không chặn logic tai nạn */ } }
    if (routing && routing.setExtraAvoid) routing.setExtraAvoid([edge]);
    let vmsId = null;
    if (vms && boards.length) {
      const near = boards.map(b => ({ b, d: Math.hypot((b.x ?? 0) - spot.x, (b.z ?? 0) - spot.z) })).sort((p, q) => p.d - q.d)[0];
      if (near) { vmsId = near.b.id; vms.setFlood(vmsId, ['SỰ CỐ CHẠN LÀN', 'ĐI ĐƯỜNG KHÁC']); }
    }
    emit({ type: 'incident', node: nodeMap.find(m => m.node_id === 'HX-01') ? 'HX-01' : null, lane: `${road} · làn phải`, plan: 'Mở làn kề · chuyển dòng qua đường khác · đèn ưu tiên giải tỏa', status: 'before', at: now() });
    const label = `Tai nạn chặn làn · ${road}`;
    const undoId = pushUndo(`incident:${now()}`, label, () => {
      traffic.setRestrictions({});
      if (hideIncident) { try { hideIncident(); } catch { /* cảnh báo hiển thị không chặn logic */ } }
      if (routing && routing.setExtraAvoid) routing.setExtraAvoid([]);
      if (vmsId && vms) vms.clearFlood(vmsId);
      emit({ type: 'incident', node: nodeMap.find(m => m.node_id === 'HX-01') ? 'HX-01' : null, lane: `${road} · làn phải`, plan: 'Mở làn kề · chuyển dòng qua đường khác · đèn ưu tiên giải tỏa', status: 'after', at: now() });
    }, { kind: 'point', x: spot.x, z: spot.z, tx: spot.tx, tz: spot.tz, road });
    return { id: undoId, road, lane: spot.lane, s: spot.s, x: spot.x, z: spot.z, tx: spot.tx, tz: spot.tz, vmsId };
  }

  function undo(id) {
    const index = id == null ? undoStack.length - 1 : undoStack.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [item] = undoStack.splice(index, 1);
    item.undo();
    return item.label;
  }
  function undoAll() {
    const labels = [];
    while (undoStack.length) labels.push(undo());
    return labels;
  }
  return {
    pinSignal, spawnCars, spawnService, createIncident, undo, undoAll,
    actions: () => undoStack.map(({ id, label, at, target }) => ({ id, label, at, target })),
    count: () => undoStack.length,
    dispose() { undoAll(); if (bc && bc.close) { bc.close(); bc = null; } }
  };
}

// ---- Panel DOM: 4 thao tác + danh sách có hoàn tác. Vanilla DOM, không thư viện.
const ENFORCE_CSS_32 = `
.enf32{display:flex;flex-direction:column;gap:8px;min-width:0;font:12px/1.45 "Segoe UI",system-ui,sans-serif}
.enf32__btns{display:flex;flex-wrap:wrap;gap:6px}
.enf32__btn{padding:6px 10px;border:1px solid rgba(137,216,223,.35);border-radius:8px;background:rgba(3,17,21,.28);color:inherit;font:inherit;font-size:11px;cursor:pointer}
.enf32__btn:hover{background:rgba(64,190,160,.24)}
.enf32__btn:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
.enf32__list{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.enf32__item{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 8px;border:1px solid rgba(137,216,223,.2);border-radius:8px;background:rgba(3,17,21,.24);font-size:11px}
.enf32__item span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.enf32__item span:first-child{flex:1 1 auto}
.enf32__item button{flex:none;padding:3px 8px;border:1px solid rgba(245,166,82,.55);border-radius:6px;background:transparent;color:#fde6aa;font:inherit;font-size:10px;cursor:pointer}
.enf32__item .enf32__locate{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border-color:rgba(137,216,223,.45);border-radius:6px;background:rgba(3,17,21,.38);color:#bfeef2;line-height:0}
.enf32__item .enf32__locate:hover{background:rgba(64,190,160,.3);color:#eaf6f7}
.enf32__item .enf32__locate:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
@media (max-width:520px){.enf32__item .enf32__locate{width:32px;height:32px}}
.enf32__empty{margin:0;color:rgba(234,246,247,.6);font-size:10.5px;font-style:italic}
`;

const LOCATE_ICON_32 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';

export function mountEnforcementPanel32(host, { onPin, onSpawnCars, onService, onIncident, onLocate, onUndo, onUndoAll } = {}) {
  if (!host || !host.appendChild) return null;
  const root = document.createElement('section');
  root.className = 'enf32';
  root.setAttribute('aria-label', 'Điều khiển tình huống');
  const style = document.createElement('style');
  style.textContent = ENFORCE_CSS_32;
  root.append(style);
  const head = document.createElement('p');
  head.style.cssText = 'margin:0;font-weight:700;font-size:12.5px';
  head.textContent = 'Điều khiển tình huống';
  root.append(head);
  const buttons = document.createElement('div');
  buttons.className = 'enf32__btns';
  const makeButton = (label, title, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'enf32__btn';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', () => {
      try { button.disabled = true; onClick(); }
      catch (error) { note.textContent = String(error && error.message || error); }
      finally { button.disabled = false; }
    });
    buttons.append(button);
    return button;
  };
  makeButton('Ghim đèn ngẫu nhiên', 'Ghim một cụm đèn ngẫu nhiên trong 60 s, xem các nút khác phản ứng', () => onPin());
  makeButton('Bơm 12 xe', 'Thêm 12 xe nhu cầu vào khu (tối đa 200)', () => onSpawnCars(12));
  makeButton('Triệu cứu thương', 'Điều xe cứu thương chạy tuyến ưu tiên', () => onService('ambulance'));
  makeButton('Triệu cứu hỏa', 'Điều xe chỉ huy cứu hỏa chạy tuyến ưu tiên', () => onService('fire'));
  makeButton('Triệu công an', 'Điều xe cảnh sát chạy tuyến ưu tiên', () => onService('police'));
  makeButton('Tạo tai nạn', 'Hai xe va chạm chặn làn Điện Biên Phủ vào Hàng Xanh, tự điều tiết', () => onIncident());
  root.append(buttons);
  const note = document.createElement('p');
  note.className = 'enf32__empty';
  note.textContent = 'Chưa thao tác nào trong phiên này.';
  root.append(note);
  const list = document.createElement('ul');
  list.className = 'enf32__list';
  root.append(list);
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'enf32__btn';
  clearAll.textContent = 'Hoàn tác tất cả';
  clearAll.title = 'Trả lại toàn bộ trạng thái trước khi thao tác';
  clearAll.addEventListener('click', () => { try { onUndoAll(); } catch (e) { note.textContent = String(e && e.message || e); } });
  clearAll.hidden = true;
  root.append(clearAll);

  host.append(root);
  const render = actions => {
    list.textContent = '';
    note.textContent = actions.length ? `Đang áp dụng ${actions.length} thao tác.` : 'Chưa thao tác nào trong phiên này.';
    clearAll.hidden = !actions.length;
    for (const item of actions) {
      const row = document.createElement('li');
      row.className = 'enf32__item';
      const label = document.createElement('span');
      label.textContent = item.label;
      const locate = document.createElement('button');
      locate.type = 'button';
      locate.className = 'enf32__locate';
      locate.title = 'Định vị trên bản đồ 3D';
      locate.setAttribute('aria-label', `Định vị: ${item.label}`);
      locate.innerHTML = LOCATE_ICON_32;
      locate.addEventListener('click', () => {
        try {
          if (typeof onLocate !== 'function') throw new Error('Trạm chưa hỗ trợ định vị');
          onLocate(item);
        } catch (e) { note.textContent = String(e && e.message || e); }
      });
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.textContent = 'Hoàn tác';
      undo.addEventListener('click', () => { try { onUndo(item.id); } catch (e) { note.textContent = String(e && e.message || e); } });
      row.append(label, locate, undo);
      list.append(row);
    }
  };
  return { render, dispose() { root.remove(); } };
}
