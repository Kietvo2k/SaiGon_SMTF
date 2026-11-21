// auto-scenarios-32.js — kịch bản tự động cho trạm 3D SaiGon SMTF (bản public, thuần client).
// Nhịp: 30 s một xe công vụ (cứu thương → cứu hỏa → công an), 5 phút một tai nạn.
// Xe công vụ lấy từ pool xe thật của sim, chọn xe gần trạm cố định (bệnh viện / PCCC / công an),
// không teleport, không đổi tuyến. Tai nạn dùng enforcement.createIncident; xe công an tới gần
// (≤40 m, cùng mặt đường) hoặc đã qua nút sự cố thì enforcement.undo + hideIncident.
// Toàn bộ chạy bằng setInterval 1 s ở mount; core thuần JS để test bằng đồng hồ giả.

import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32c';

export const AUTO_SCENARIOS_32_VERSION = 'auto-scenarios-32a';
export const AUTO_CHANNEL_32 = 'smtf-submit-events';
export const AUTO_SESSION_KEY_32 = 'smtf.auto32.enabled';
export const AUTO_PRIORITY_MS_32 = 30000;
export const AUTO_INCIDENT_MS_32 = 300000;
export const AUTO_FAST_PRIORITY_MS_32 = 3000;
export const AUTO_FAST_INCIDENT_MS_32 = 10000;
export const AUTO_KIND_ORDER_32 = Object.freeze(['ambulance', 'fire', 'police']);
export const AUTO_KIND_LABELS_32 = Object.freeze({ ambulance: 'Cứu thương', fire: 'Cứu hỏa', police: 'Công an' });
export const AUTO_POLICE_MAX_ROUTE_M_32 = 35;   // tuyến xe công an phải đi qua trong 35 m quanh điểm sự cố
export const AUTO_POLICE_RADIUS_M_32 = 450;     // chỉ điều xe trong 450 m quanh trạm
export const AUTO_RESOLVE_M_32 = 40;
export const AUTO_RESOLVE_DY_M_32 = 5;
export const AUTO_POLICE_GIVE_UP_MS_32 = 45000;
export const AUTO_RETRY_POLICE_MS_32 = 5000;
export const AUTO_RETRY_INCIDENT_MS_32 = 15000;
export const AUTO_PRIORITY_HOLD_MS_32 = 25000;
export const AUTO_FAST_PRIORITY_HOLD_MS_32 = 6000;
export const AUTO_POLICE_HOLD_MS_32 = 45000;
export const AUTO_FAST_POLICE_HOLD_MS_32 = 15000;

// Trạm thật trong khu Bắc (Bình Thạnh cũ). x/z là toạ độ cảnh theo hệ ROAD_GRAPH_31,
// quy đổi từ lat/lon OSM bằng mốc HX-01 (10.80109, 106.70920 → -251.17, -2439.95),
// 1° vĩ ≈ 110 574 m, 1° kinh ≈ 109 346 m ở vĩ độ 10,8°. Toạ độ gốc giữ trong siteX/siteZ.
export const AUTO_STATIONS_32 = Object.freeze([
  Object.freeze({
    id: 'hospital', kind: 'ambulance', short: 'Bệnh viện',
    label: 'Bệnh viện đa khoa Bình Thạnh',
    address: '132 Lê Văn Duyệt, phường Gia Định',
    latitude: 10.7980298, longitude: 106.6966605, x: -1622.3, z: -2101.6
  }),
  Object.freeze({
    id: 'fire', kind: 'fire', short: 'PCCC',
    label: 'Đội PCCC&CNCH Công an quận Bình Thạnh',
    address: '18A Phan Đăng Lưu, phường Gia Định',
    latitude: 10.8035492, longitude: 106.6909750, x: -2244.2, z: -2711.9
  }),
  Object.freeze({
    id: 'police', kind: 'police', short: 'Công an',
    label: 'Công an phường 15 (Thạnh Mỹ Tây)',
    address: '1C Đinh Bộ Lĩnh, phường Gia Định',
    latitude: 10.8016765, longitude: 106.7091631, x: -255.2, z: -2504.8
  })
]);

const round1 = value => Math.round(value * 10) / 10;
const nowMs32 = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function nodeRowOf32(net, nodeMap, nodeIndex) {
  const node = net?.G?.nodes?.[nodeIndex];
  if (!node) return null;
  const row = (nodeMap || []).find(item => Number(item?.osm_id) === Number(node.id));
  return row?.node_id ?? null;
}

// Tìm làn gần một điểm (x, z). Lọc theo hai đầu nút để không quét toàn mạng;
// mỗi làn lấy mẫu 8 m, đủ chính xác để chọn trạm và không tốn CPU lúc nạp.
export function nearestLane32(net, x, z, { sampleM = 8, nodeFilterM = 700, nodeMap = [] } = {}) {
  if (!net || !net.lanes || !net.E || !net.geo) return null;
  const geometry = createTrafficGeometry31(net, { jit: [], len: [] });
  const point = {};
  let best = null;
  for (let lane = 0; lane < net.NL; lane++) {
    const length = Number(net.lanes.length[lane]) || 0;
    if (!(length > 0)) continue;
    const from = net.G?.nodes?.[net.lanes.from[lane]];
    const to = net.G?.nodes?.[net.lanes.to[lane]];
    if (from && to) {
      const endpoint = Math.min(Math.hypot(from.x - x, from.z - z), Math.hypot(to.x - x, to.z - z));
      if (endpoint > nodeFilterM && endpoint > length) continue;
    }
    const step = Math.max(2, Math.min(sampleM, length / 4));
    for (let s = 0; s <= length + 0.001; s += step) {
      geometry.lanePoint(lane, Math.min(length, s), net.lanes.offset[lane], point);
      const distance = Math.hypot(point.x - x, point.z - z);
      if (!best || distance < best.distanceM) {
        best = {
          lane, s: Math.min(length, s), x: point.x, z: point.z, tx: point.tx, tz: point.tz,
          distanceM: distance, lengthM: length
        };
      }
    }
  }
  if (!best) return null;
  // Tinh chỉnh quanh điểm gần nhất để trạm bám đúng tim làn (mẫu thô 8 m có thể lệch vài mét).
  const fineFrom = Math.max(0, best.s - 4), fineTo = Math.min(best.lengthM, best.s + 4);
  for (let s = fineFrom; s <= fineTo + 0.001; s += 0.5) {
    geometry.lanePoint(best.lane, Math.min(best.lengthM, s), net.lanes.offset[best.lane], point);
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < best.distanceM) {
      best = {
        lane: best.lane, s: Math.min(best.lengthM, s), x: point.x, z: point.z, tx: point.tx, tz: point.tz,
        distanceM: distance, lengthM: best.lengthM
      };
    }
  }
  const edge = net.lanes.edge[best.lane];
  return {
    ...best,
    x: round1(best.x), z: round1(best.z), s: round1(best.s), distanceM: round1(best.distanceM),
    road: net.G?.roads?.[net.E?.[edge]?.road]?.name || '',
    nodeId: nodeRowOf32(net, nodeMap, net.lanes.to[best.lane])
  };
}

// Gắn mỗi trạm vào làn gần nhất. Trả cấu hình rút gọn {id,label,x,z,lane,s,road,nodeId,...}.
export function resolveAutoStations32({ net = null, nodeMap = [], stations = AUTO_STATIONS_32, sampleM = 8 } = {}) {
  return stations.map(station => {
    const siteX = Number(station.x), siteZ = Number(station.z);
    const nearest = net ? nearestLane32(net, siteX, siteZ, { sampleM, nodeMap }) : null;
    let nearestNode = null;
    for (const row of nodeMap || []) {
      if (!Number.isFinite(Number(row?.x)) || !Number.isFinite(Number(row?.z))) continue;
      const distance = Math.hypot(Number(row.x) - siteX, Number(row.z) - siteZ);
      if (!nearestNode || distance < nearestNode.distanceM) nearestNode = { id: row.node_id, label: row.label || '', distanceM: round1(distance) };
    }
    return {
      ...station,
      siteX, siteZ,
      x: nearest ? nearest.x : siteX,
      z: nearest ? nearest.z : siteZ,
      lane: nearest ? nearest.lane : null,
      s: nearest ? nearest.s : 0,
      road: nearest ? nearest.road : '',
      nodeId: nearest?.nodeId || nearestNode?.id || null,
      nodeLabel: nearestNode?.label || '',
      nodeDistanceM: nearestNode?.distanceM ?? null,
      siteDistanceM: nearest ? nearest.distanceM : null,
      site: { x: siteX, z: siteZ }
    };
  });
}

function incidentNodeOf32(net, nodeMap, lane) {
  if (!net || !Number.isInteger(lane) || lane < 0 || lane >= net.NL) return null;
  // Đi tiếp trên chuỗi làn cùng trục đến nút có đèn đầu tiên (tai nạn nằm trước vạch dừng của nút đó).
  const byFrom = new Map();
  for (let l = 0; l < net.NL; l++) {
    const from = net.lanes.from[l];
    let list = byFrom.get(from);
    if (!list) byFrom.set(from, list = []);
    list.push(l);
  }
  let current = lane;
  for (let hop = 0; hop < 8; hop++) {
    const to = net.lanes.to[current];
    if (net.signal && net.signal[to]) return nodeRowOf32(net, nodeMap, to);
    const next = (byFrom.get(to) || []).find(l => net.lanes.edge[l] === net.lanes.edge[current])
      ?? (byFrom.get(to) || [])[0];
    if (next == null || next === current) break;
    current = next;
  }
  return nodeRowOf32(net, nodeMap, net.lanes.to[lane]);
}

// Lõi lập lịch. Không DOM, không setInterval: mount truyền now/emit và gọi tick mỗi giây.
export function createAutoScenarios32({
  emergency = null,
  enforcement = null,
  stations = AUTO_STATIONS_32,
  net = null,
  nodeMap = [],
  poseOf = null,
  fast = false,
  enabled = true,
  autostart = true,
  priorityMs = null,
  incidentMs = null,
  now = nowMs32,
  emit = null,
  channel,
  hideIncident = null,
  log = () => {},
  resolveM = AUTO_RESOLVE_M_32,
  resolveDyM = AUTO_RESOLVE_DY_M_32,
  policeRadiusM = AUTO_POLICE_RADIUS_M_32,
  policeMaxRouteM = AUTO_POLICE_MAX_ROUTE_M_32,
  policeGiveUpMs = AUTO_POLICE_GIVE_UP_MS_32,
  retryPoliceMs = AUTO_RETRY_POLICE_MS_32,
  retryIncidentMs = AUTO_RETRY_INCIDENT_MS_32,
  priorityHoldMs = null,
  policeHoldMs = null
} = {}) {
  if (!emergency || typeof emergency.start !== 'function' || typeof emergency.status !== 'function') {
    throw new TypeError('createAutoScenarios32 cần emergency.start/status');
  }
  if (!enforcement || typeof enforcement.createIncident !== 'function' || typeof enforcement.undo !== 'function') {
    throw new TypeError('createAutoScenarios32 cần enforcement.createIncident/undo');
  }
  const priorityEveryMs = Number.isFinite(priorityMs) ? priorityMs : (fast ? AUTO_FAST_PRIORITY_MS_32 : AUTO_PRIORITY_MS_32);
  const incidentEveryMs = Number.isFinite(incidentMs) ? incidentMs : (fast ? AUTO_FAST_INCIDENT_MS_32 : AUTO_INCIDENT_MS_32);
  const priorityHold = Number.isFinite(priorityHoldMs) ? priorityHoldMs : (fast ? AUTO_FAST_PRIORITY_HOLD_MS_32 : AUTO_PRIORITY_HOLD_MS_32);
  const policeHold = Number.isFinite(policeHoldMs) ? policeHoldMs : (fast ? AUTO_FAST_POLICE_HOLD_MS_32 : AUTO_POLICE_HOLD_MS_32);
  const groundY = Number(net?.G?.frame?.groundY);
  let stateEnabled = enabled !== false;
  let paused = false;
  let lastTick = 0;
  let nextPriorityAt = 0;
  let nextIncidentAt = 0;
  let kindIndex = 0;
  let incident = null;
  let police = null;
  let lastDispatch = null;
  let lastAction = 'Chờ lượt kế tiếp';
  let lastError = null;
  let priorityRuns = 0;
  let incidentsCreated = 0;
  let incidentsResolved = 0;
  let skipped = 0;
  let broadcast = channel;

  const send = event => {
    if (typeof emit === 'function') { try { emit(event); } catch { /* kênh sự kiện không chặn kịch bản */ } return; }
    try {
      if (broadcast === undefined && typeof BroadcastChannel !== 'undefined') broadcast = new BroadcastChannel(AUTO_CHANNEL_32);
      if (broadcast && typeof broadcast.postMessage === 'function') broadcast.postMessage({ ...event, source: AUTO_SCENARIOS_32_VERSION });
    } catch { /* BroadcastChannel không khả dụng: kịch bản vẫn chạy */ }
  };
  const emergencyStatus = () => {
    try {
      const status = emergency.status();
      return status && typeof status === 'object' ? status : { active: false };
    } catch (error) {
      lastError = error?.message || String(error);
      return { active: false };
    }
  };
  const stationOf = kind => (stations || []).find(station => station?.kind === kind) || null;
  const originOf = station => station ? {
    id: station.id, label: station.label, x: station.x, z: station.z,
    lane: Number.isInteger(station.lane) ? station.lane : null, radius: policeRadiusM
  } : null;
  const targetOf = value => value ? { x: value.x, z: value.z, lane: value.lane, s: value.s, ground: true, maxM: policeMaxRouteM } : null;

  // Chỉ dừng xe do chính kịch bản điều; không đụng xe cán bộ triệu hồi tay.
  function stopOurs(reason) {
    const status = emergencyStatus();
    if (!status.active || !lastDispatch || status.slot !== lastDispatch.slot) return false;
    try { emergency.stop(reason); } catch { /* dừng xe không chặn lịch */ }
    lastDispatch = null;
    police = null;
    return true;
  }

  const scheduleFrom = (at, hasIncident = !!incident) => {
    lastTick = at;
    nextPriorityAt = at + (hasIncident ? retryPoliceMs : priorityEveryMs);
    nextIncidentAt = at + incidentEveryMs;
  };

  function describeAction(kind) {
    return AUTO_KIND_LABELS_32[kind] || 'Xe ưu tiên';
  }

  function dispatch(kind, at) {
    const station = stationOf(kind);
    const origin = originOf(station);
    const target = kind === 'police' && incident ? targetOf(incident) : null;
    try {
      const status = emergency.start({ kind, ...(origin ? { origin } : {}), ...(target ? { target } : {}) });
      if (status && status.active === false) throw new Error('Xe ưu tiên không khởi động được');
      lastDispatch = { slot: Number.isInteger(status?.slot) ? status.slot : null, kind, at, stationId: station?.id || null,
        incidentId: kind === 'police' && incident ? incident.id : null };
      priorityRuns++;
      lastError = null;
      lastAction = `${station?.short || 'Trạm'} · ${describeAction(kind)} đang chạy`;
      log(`[tự động] ${lastAction}`);
      send({ type: 'priority-dispatch', kind, stationId: station?.id || null, slot: lastDispatch.slot, at });
      if (kind === 'police' && incident) {
        police = { slot: lastDispatch.slot, startedAt: at, sawNode: false, bestM: Infinity, progressAt: at };
        send({ type: 'incident-response', id: incident.id, stationId: station?.id || null, at });
      }
      return true;
    } catch (error) {
      lastError = error?.message || String(error);
      lastAction = `Bỏ qua ${describeAction(kind)}: ${lastError}`;
      log(`[tự động] ${lastAction}`);
      return false;
    }
  }

  function createIncidentAt(at) {
    try {
      const info = enforcement.createIncident();
      if (!info || !Number.isFinite(info.x) || !Number.isFinite(info.z)) throw new Error('Sự cố trả về thiếu toạ độ');
      incident = {
        id: info.id, x: info.x, z: info.z, lane: Number.isInteger(info.lane) ? info.lane : null,
        s: Number.isFinite(info.s) ? info.s : null, road: info.road || '',
        nodeId: info.nodeId || incidentNodeOf32(net, nodeMap, info.lane),
        y: Number.isFinite(info.y) ? info.y : (Number.isFinite(groundY) ? groundY : 1),
        at, police: false
      };
      incidentsCreated++;
      lastError = null;
      lastAction = `Tai nạn · ${incident.road || 'hiện trường'}`;
      log(`[tự động] ${lastAction}`);
      send({ type: 'incident-created', id: incident.id, x: incident.x, z: incident.z, road: incident.road, nodeId: incident.nodeId, at });
      return true;
    } catch (error) {
      lastError = error?.message || String(error);
      lastAction = `Không tạo được tai nạn: ${lastError}`;
      log(`[tự động] ${lastAction}`);
      return false;
    }
  }

  function resolveIncident(at, reason = 'Xe công an đã tới hiện trường') {
    if (!incident) return false;
    const done = incident;
    try { enforcement.undo(done.id); }
    catch (error) { lastError = error?.message || String(error); }
    try { if (typeof hideIncident === 'function') hideIncident(); }
    catch { /* ẩn hiện trường không chặn kết thúc sự cố */ }
    incident = null;
    police = null;
    incidentsResolved++;
    lastAction = `Đã xử lý · ${done.road || 'hiện trường'}`;
    log(`[tự động] ${lastAction}`);
    send({ type: 'incident-resolved', id: done.id, x: done.x, z: done.z, road: done.road, nodeId: done.nodeId, reason, at });
    return true;
  }

  function trackPolice(at, status) {
    if (!incident) { police = null; return; }
    if (!status.active || status.kind !== 'police') {
      if (!status.active && police) {
        police = null;
        nextPriorityAt = Math.min(nextPriorityAt, at + retryPoliceMs);
      }
      return;
    }
    if (!police || police.slot !== status.slot) {
      police = { slot: status.slot, startedAt: at, sawNode: false, bestM: Infinity, progressAt: at };
    }
    if (status.node_id && incident.nodeId && status.node_id === incident.nodeId) police.sawNode = true;
    if (police.sawNode && (Number(status.passed) || 0) >= 1) {
      resolveIncident(at, 'Xe công an đã qua nút sự cố');
      return;
    }
    if (typeof poseOf !== 'function') return;
    let pose = null;
    try { pose = poseOf(status.slot); } catch { pose = null; }
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return;
    const distance = Math.hypot(pose.x - incident.x, pose.z - incident.z);
    const levelOk = Math.abs((Number.isFinite(pose.y) ? pose.y : incident.y) - incident.y) <= resolveDyM;
    if (distance < police.bestM - 2) {
      police.bestM = distance;
      police.progressAt = at;
    }
    if (distance <= resolveM && levelOk) {
      resolveIncident(at, `Xe công an cách hiện trường ${Math.round(distance)} m`);
      return;
    }
    if (at - police.startedAt >= policeGiveUpMs && at - police.progressAt >= policeGiveUpMs / 2 && distance > resolveM) {
      try { emergency.stop('Xe công an chưa tiến gần hiện trường; thử lại'); } catch { /* dừng xe không chặn lịch */ }
      police = null;
      lastAction = 'Xe công an chưa tới; chờ lượt thử lại';
      nextPriorityAt = at + retryPoliceMs;
    }
  }

  function tick(at = now()) {
    const stamp = Number.isFinite(Number(at)) ? Number(at) : now();
    if (stamp < lastTick) lastTick = stamp;
    lastTick = Math.max(lastTick, stamp);
    if (!stateEnabled || paused) return status(lastTick);

    let emergencyNow = emergencyStatus();
    trackPolice(lastTick, emergencyNow);

    // Xe do kịch bản điều chỉ chạy một lượt ngắn để nhường nhịp 30 s kế tiếp.
    emergencyNow = emergencyStatus();
    if (emergencyNow.active && lastDispatch && emergencyNow.slot === lastDispatch.slot) {
      const hold = (incident || lastDispatch.incidentId) ? policeHold : priorityHold;
      if (lastTick - lastDispatch.at >= hold) {
        lastAction = 'Hết lượt hiển thị; nhường lượt kế tiếp';
        stopOurs(lastAction);
      }
    }

    // Tai nạn trước để không trùng nhịp 30 s; dừng xe đang chạy của kịch bản để không chồng chéo.
    if (lastTick >= nextIncidentAt) {
      if (incident) nextIncidentAt = lastTick + incidentEveryMs;
      else {
        emergencyNow = emergencyStatus();
        if (emergencyNow.active && !stopOurs('Nhường hiện trường')) {
          skipped++;
          lastAction = 'Bỏ qua tai nạn: xe ưu tiên đang chạy';
          nextIncidentAt = lastTick + retryIncidentMs;
        } else {
          createIncidentAt(lastTick);
          nextIncidentAt = lastTick + incidentEveryMs;
        }
      }
    }

    if (lastTick >= nextPriorityAt) {
      emergencyNow = emergencyStatus();
      if (emergencyNow.active) {
        skipped++;
        if (incident) {
          lastAction = 'Công an đang tới hiện trường';
          nextPriorityAt = lastTick + retryPoliceMs;
        } else {
          lastAction = 'Bỏ qua lượt: xe ưu tiên đang chạy';
          nextPriorityAt = lastTick + priorityEveryMs;
        }
      } else if (incident) {
        if (dispatch('police', lastTick)) nextPriorityAt = lastTick + priorityEveryMs;
        else nextPriorityAt = lastTick + retryPoliceMs;
      } else {
        const kind = AUTO_KIND_ORDER_32[kindIndex % AUTO_KIND_ORDER_32.length];
        if (dispatch(kind, lastTick)) kindIndex = (kindIndex + 1) % AUTO_KIND_ORDER_32.length;
        nextPriorityAt = lastTick + priorityEveryMs;
      }
    }
    return status(lastTick);
  }

  function status(at = now()) {
    const stamp = Number.isFinite(Number(at)) ? Number(at) : lastTick;
    const emergencyNow = emergencyStatus();
    return {
      enabled: stateEnabled,
      paused,
      fast: !!fast,
      priorityInS: Math.max(0, Math.ceil((nextPriorityAt - stamp) / 1000)),
      incidentInS: Math.max(0, Math.ceil((nextIncidentAt - stamp) / 1000)),
      emergency: emergencyNow,
      incident: incident ? {
        id: incident.id, x: incident.x, z: incident.z, road: incident.road, lane: incident.lane,
        nodeId: incident.nodeId, ageS: Math.max(0, Math.round((stamp - incident.at) / 1000))
      } : null,
      priorityRuns,
      incidentsCreated,
      incidentsResolved,
      skipped,
      lastAction,
      lastError
    };
  }

  function pause(at = now()) {
    paused = true;
    lastAction = 'Tạm dừng khi tab ẩn';
    return status(at);
  }

  function resume(at = now()) {
    paused = false;
    scheduleFrom(Number.isFinite(Number(at)) ? Number(at) : now(), !!incident);
    lastAction = 'Tiếp tục kịch bản tự động';
    return status(lastTick);
  }

  function setEnabled(on, at = now()) {
    stateEnabled = !!on;
    const stamp = Number.isFinite(Number(at)) ? Number(at) : now();
    if (stateEnabled) {
      scheduleFrom(stamp, !!incident);
      lastAction = 'Bật kịch bản tự động';
    } else {
      lastAction = 'Tắt kịch bản tự động';
    }
    return status(stamp);
  }

  function dispose() {
    const hadIncident = incident;
    if (incident) resolveIncident(now(), 'Dừng kịch bản tự động');
    const status = emergencyStatus();
    if (status.active && lastDispatch && status.slot === lastDispatch.slot) {
      try { emergency.stop('Tự động dừng'); } catch { /* dừng xe không chặn dispose */ }
    }
    if (hadIncident) { incident = null; }
    police = null;
    stateEnabled = false;
    paused = true;
    if (broadcast && typeof broadcast.close === 'function') { try { broadcast.close(); } catch { /* đã đóng */ } }
    broadcast = null;
    return { disposed: true, incidentsResolved };
  }

  const api = {
    tick, status, pause, resume, setEnabled, dispose,
    resolveIncident: at => resolveIncident(Number.isFinite(Number(at)) ? Number(at) : now()),
    stations: () => stations.slice(),
    currentIncident: () => incident ? { ...incident } : null,
    currentPolice: () => police ? { ...police } : null,
    priorityMs: priorityEveryMs,
    incidentMs: incidentEveryMs
  };
  if (autostart) scheduleFrom(Number.isFinite(Number(now())) ? Number(now()) : nowMs32());
  return api;
}

// ---- Giao diện nhỏ góc trái dưới: công tắc "Tự động" + đếm ngược + trạng thái ----
const AUTO_CSS_32 = `
.auto32{position:fixed;left:12px;bottom:calc(var(--submit-hud-reserve, 122px) + 10px);z-index:19;box-sizing:border-box;
  width:min(300px,calc(100vw - 24px));padding:9px 11px;border:1px solid rgba(137,216,223,.34);border-radius:12px;
  background:rgba(9,25,31,.93);color:#eaf6f7;box-shadow:0 12px 30px rgba(0,0,0,.35);backdrop-filter:blur(8px);
  font:11.5px/1.35 "Segoe UI",system-ui,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none}
.auto32 *{box-sizing:border-box}
.auto32__head{display:flex;align-items:center;gap:7px;min-width:0}
.auto32__dot{flex:none;width:7px;height:7px;border-radius:50%;background:#58c9a5;box-shadow:0 0 0 3px rgba(88,201,165,.15)}
.auto32[data-state="priority"] .auto32__dot{background:#ffd23f;box-shadow:0 0 0 3px rgba(255,210,63,.18);animation:auto32pulse 1.6s ease-in-out infinite}
.auto32[data-state="incident"] .auto32__dot{background:#ff6b5e;box-shadow:0 0 0 3px rgba(255,107,94,.18);animation:auto32pulse 1.2s ease-in-out infinite}
.auto32[data-state="off"] .auto32__dot{background:#7b9398;box-shadow:none;animation:none}
.auto32__title{flex:1 1 auto;min-width:0;font-weight:700;font-size:12px;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.auto32__switch{pointer-events:auto;position:relative;display:inline-flex;align-items:center;gap:5px;flex:none;cursor:pointer;color:#cfe7ea;font-size:10.5px;font-weight:600}
.auto32__switch input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.auto32__track{position:relative;display:block;width:32px;height:18px;border-radius:999px;background:rgba(137,216,223,.25);transition:background .18s ease}
.auto32__thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#eaf6f7;transition:transform .18s ease}
.auto32__switch input:checked + .auto32__track{background:#58c9a5}
.auto32__switch input:checked + .auto32__track .auto32__thumb{transform:translateX(14px);background:#082026}
.auto32__switch input:focus-visible + .auto32__track{outline:2px solid #89d8df;outline-offset:2px}
.auto32__count{margin:6px 0 1px;color:#f4fbf2;font-weight:600;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.auto32__state{margin:0;color:#a9c4c9;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.auto32__state[data-error="1"]{color:#ffb4a8}
@keyframes auto32pulse{0%,100%{opacity:1}50%{opacity:.45}}
@media (max-width:620px){.auto32{left:8px;width:min(286px,calc(100vw - 16px));padding:8px 10px}.auto32__count{font-size:11px}}
@media (prefers-reduced-motion:reduce){.auto32__dot{animation:none!important}.auto32__track,.auto32__thumb{transition:none}}
`;

const clock32 = totalS => `${Math.floor(Math.max(0, totalS) / 60)}:${String(Math.max(0, totalS) % 60).padStart(2, '0')}`;
const seconds32 = totalS => (totalS >= 60 ? clock32(totalS) : `${Math.max(0, totalS)}s`);

export function mountAutoScenarios32({
  app = null, documentRef = null, session = null, search = null,
  net = null, nodeMap = null, traffic = null, emergency = null, enforcement = null,
  poseOf = null, hideIncident = null, stations = null, fast = null, enabled = null,
  priorityMs = null, incidentMs = null, ui = true, log = () => {}
} = {}) {
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new TypeError('mountAutoScenarios32 cần document');
  const appTraffic = traffic || app?.traffic || null;
  const resolvedNet = net || appTraffic?.net || null;
  const resolvedNodeMap = nodeMap || app?.smartPrep?.nodeMap || [];
  const resolvedEmergency = emergency || app?.modules?.emergency || null;
  const resolvedEnforcement = enforcement || app?.modules?.enforcement || null;
  const resolvedPose = poseOf || (slot => appTraffic?.poseOf?.(slot));
  const resolvedHide = hideIncident || (() => app?.modules?.scenarios?.props?.hideBlock?.());
  if (!resolvedEmergency || !resolvedEnforcement) {
    log('[tự động] thiếu emergency/enforcement — không mount');
    return { disposed: true, reason: 'missing-modules', tick: () => null, status: () => null, dispose: () => ({ disposed: true }), root: null };
  }
  const query = search ?? (typeof location !== 'undefined' ? location.search : '');
  const fastMode = fast ?? new URLSearchParams(query).get('autoFast') === '1';
  const store = session || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  let stored = null;
  try { stored = store ? store.getItem(AUTO_SESSION_KEY_32) : null; } catch { stored = null; }
  const enabledNow = enabled != null ? !!enabled : stored !== '0';

  const stationSeeds = stations || AUTO_STATIONS_32;
  const resolvedStations = resolveAutoStations32({ net: resolvedNet, nodeMap: resolvedNodeMap, stations: stationSeeds });
  const scheduler = createAutoScenarios32({
    emergency: resolvedEmergency, enforcement: resolvedEnforcement,
    stations: resolvedStations, net: resolvedNet, nodeMap: resolvedNodeMap,
    poseOf: resolvedPose, hideIncident: resolvedHide,
    fast: fastMode, enabled: enabledNow, priorityMs, incidentMs, log
  });

  let root = null, input = null, countEl = null, stateEl = null, style = null, timer = 0;
  if (ui) {
    style = doc.getElementById('autoScenariosCss32');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'autoScenariosCss32';
      style.textContent = AUTO_CSS_32;
      (doc.head || doc.documentElement).append(style);
    }
    root = doc.createElement('section');
    root.className = 'auto32';
    root.id = 'autoScenarios32';
    root.setAttribute('aria-label', 'Kịch bản tự động');
    const head = doc.createElement('div'); head.className = 'auto32__head';
    const dot = doc.createElement('span'); dot.className = 'auto32__dot'; dot.setAttribute('aria-hidden', 'true');
    const title = doc.createElement('strong'); title.className = 'auto32__title'; title.id = 'autoScenariosTitle32'; title.textContent = 'Tự động';
    const label = doc.createElement('label'); label.className = 'auto32__switch';
    input = doc.createElement('input');
    input.type = 'checkbox';
    input.id = 'autoScenariosToggle32';
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-labelledby', title.id);
    input.checked = enabledNow;
    const track = doc.createElement('span'); track.className = 'auto32__track'; track.setAttribute('aria-hidden', 'true');
    const thumb = doc.createElement('span'); thumb.className = 'auto32__thumb'; track.append(thumb);
    const switchText = doc.createElement('span'); switchText.textContent = 'Bật';
    label.append(input, track, switchText);
    head.append(dot, title, label);
    countEl = doc.createElement('p'); countEl.className = 'auto32__count'; countEl.textContent = 'Xe ưu tiên: 30s · Tai nạn: 5:00';
    stateEl = doc.createElement('p'); stateEl.className = 'auto32__state'; stateEl.setAttribute('aria-live', 'polite'); stateEl.textContent = 'Sẵn sàng';
    root.append(head, countEl, stateEl);
    (doc.body || doc.documentElement).append(root);
  }

  const describe = status => {
    if (!status) return 'Chưa sẵn sàng';
    if (!status.enabled) return 'Đang tắt · bật để chạy kịch bản';
    if (status.paused) return 'Tạm dừng khi tab ẩn';
    if (status.incident) {
      const policeOn = status.emergency?.active && status.emergency.kind === 'police';
      return `Tai nạn · ${status.incident.road || 'hiện trường'}${policeOn ? ' · công an đang tới' : ' · chờ công an'}`;
    }
    if (status.emergency?.active) {
      const node = status.emergency.node_id ? ` · ưu tiên ${status.emergency.node_id}` : '';
      return `${status.emergency.label || 'Xe ưu tiên'}${node}`;
    }
    return status.lastAction || 'Chờ lượt kế tiếp';
  };
  const render = status => {
    if (!root) return;
    const current = status || scheduler.status();
    root.dataset.state = !current.enabled ? 'off' : current.incident ? 'incident' : current.emergency?.active ? 'priority' : 'idle';
    if (countEl) countEl.textContent = `Xe ưu tiên: ${seconds32(current.priorityInS)} · Tai nạn: ${clock32(current.incidentInS)}`;
    if (stateEl) {
      stateEl.textContent = describe(current);
      stateEl.dataset.error = current.lastError ? '1' : '0';
      stateEl.title = current.lastError || current.lastAction || '';
    }
    if (input && input.checked !== !!current.enabled) input.checked = !!current.enabled;
  };
  const tick = () => {
    const status = scheduler.tick();
    render(status);
    return status;
  };
  const startTimer = () => { if (!timer && typeof setInterval === 'function') timer = setInterval(tick, 1000); };
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = 0; } };
  const onVisibility = () => {
    if (!doc) return;
    if (doc.hidden) { stopTimer(); scheduler.pause(); render(scheduler.status()); }
    else { scheduler.resume(); render(scheduler.status()); startTimer(); }
  };
  const onToggle = () => {
    const next = !!input?.checked;
    scheduler.setEnabled(next);
    try { store?.setItem(AUTO_SESSION_KEY_32, next ? '1' : '0'); } catch { /* chế độ riêng tư: không lưu được */ }
    render(scheduler.status());
  };
  input?.addEventListener('change', onToggle);
  if (typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
  if (!doc.hidden) startTimer();
  render(scheduler.status());

  return {
    root, scheduler, stations: resolvedStations, fast: fastMode,
    tick, render,
    status: () => scheduler.status(),
    setEnabled: on => { scheduler.setEnabled(on); render(scheduler.status()); },
    dispose() {
      stopTimer();
      if (typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
      input?.removeEventListener('change', onToggle);
      const result = scheduler.dispose();
      root?.remove();
      if (style?.id === 'autoScenariosCss32') style.remove();
      return result;
    }
  };
}
