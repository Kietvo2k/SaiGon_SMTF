// HUD A/B/KPI trong cảnh app smart (M1 T11): công tắc "Đèn cố định ↔ Thông minh", KPI sống mỗi giây,
// gửi metrics (kèm signal_states) mỗi 5 s, nhận cmd.signal-mode / cmd.signal-override qua transport.
// Nhãn tiếng Việt; không chữ cấm. Chỉ chạy trong trình duyệt (cần document).
import { STATION_ID_32, METRICS_S, buildSignalStates32 } from './station-client-32.js?v=32a';

export const KPI_PANEL_32_VERSION = 'kpi-panel-32a';
const HUD_CSS_32 = `
#smartHud32{position:fixed;z-index:8;right:24px;top:96px;width:300px;border-radius:22px;padding:18px 20px;color:var(--ink,#eaf6f7);font-size:12px}
#smartHud32 h2{margin:0 0 10px;font-size:15px;font-weight:700}
#smartHud32 .hud-switch{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:12px;cursor:pointer;user-select:none}
#smartHud32 .hud-switch input{appearance:none;width:44px;height:24px;border-radius:12px;background:rgba(137,216,223,.25);position:relative;margin:0;cursor:pointer;flex:none}
#smartHud32 .hud-switch input::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#e8f6f7;transition:transform .2s}
#smartHud32 .hud-switch input:checked{background:rgba(64,190,160,.55)}
#smartHud32 .hud-switch input:checked::after{transform:translateX(20px)}
#smartHud32 .hud-switch input:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
#smartHud32 dl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:0 0 10px}
#smartHud32 dl div{padding:8px 6px;border-radius:12px;background:rgba(3,17,21,.28);text-align:center}
#smartHud32 dt{font-size:10px;opacity:.8;margin-bottom:4px}
#smartHud32 dd{margin:0;font-size:18px;font-weight:700}
#smartHud32 dd small{display:block;font-size:9px;font-weight:400;opacity:.7}
#smartHud32 .hud-status{margin:0;font-size:11px;opacity:.85}
`;

const fmt1 = v => (Number.isFinite(v) ? v.toFixed(1) : '–');
const fmt0 = v => (Number.isFinite(v) ? String(Math.round(v)) : '–');

export function installHud32(app, { transport = null } = {}) {
  const controller = app.controller;
  const sim = app.traffic && app.traffic.sim;
  const net = app.traffic && app.traffic.net;
  const simT = () => (sim ? sim.counters.t : 0);
  let alive = true, fps = 0, frames = 0, rafId = 0, tickTimer = 0, metricsTimer = 0;

  if (!document.getElementById('smartHudCss32')) {
    const style = document.createElement('style');
    style.id = 'smartHudCss32';
    style.textContent = HUD_CSS_32;
    document.head.append(style);
  }
  const panel = document.createElement('aside');
  panel.id = 'smartHud32';
  panel.className = 'glass';
  panel.setAttribute('aria-label', 'Điều khiển đèn và chỉ số khu Bắc');
  panel.innerHTML = '<h2>Điều khiển đèn · Khu Bắc</h2>'
    + '<label class="hud-switch"><span>Đèn cố định</span>'
    + '<input type="checkbox" role="switch" id="modeSwitch32" aria-label="Chế độ đèn: Đèn cố định hoặc Thông minh">'
    + '<span>Thông minh</span></label>'
    + '<dl>'
    + '<div><dt>Thời gian chờ TB</dt><dd id="kpiWait32">–<small>giây</small></dd></div>'
    + '<div><dt>Hàng chờ max</dt><dd id="kpiQueue32">–<small>xe</small></dd></div>'
    + '<div><dt>Lưu lượng TB/nút</dt><dd id="kpiFlow32">–<small>xe/phút/nút</small></dd></div>'
    + '</dl>'
    + '<p class="hud-status" id="stationStatus32" aria-live="polite">Trạm: đang kết nối</p>';
  (app.root && app.root.body ? app.root.body : document.body).append(panel);
  const sw = panel.querySelector('#modeSwitch32');
  const el = id => panel.querySelector(id);

  sw.addEventListener('change', () => { controller.setMode(sw.checked ? 'smart' : 'fixed'); });

  const tick = () => {
    if (!alive) return;
    const m = controller.metrics(simT());
    el('#kpiWait32').firstChild.textContent = fmt1(m.wait_avg_s);
    el('#kpiQueue32').firstChild.textContent = fmt0(m.queue_max);
    el('#kpiFlow32').firstChild.textContent = fmt1(m.flow_per_node_min);
    sw.checked = controller.getMode() === 'smart';
    fps = frames; frames = 0;
    if (transport) {
      const link = transport.connectionState() === 'online' ? 'đã kết nối máy chủ' : 'mất kết nối, đang xếp hàng';
      transport.pendingCount().then(n => {
        if (alive) el('#stationStatus32').textContent = `Trạm: ${link} · chờ gửi ${n}`;
      }, () => {});
    }
    tickTimer = setTimeout(tick, 1000);
  };

  const sendMetrics = () => {
    if (!alive) return;
    if (transport) {
      const tSim = simT();
      const m = controller.metrics(tSim);
      // M5a: trường thêm (vms, scenario) lấy lúc gửi qua app.metricsExtra32 do smart-app-32 gắn sau.
      const extra = typeof app.metricsExtra32 === 'function' ? (app.metricsExtra32() || {}) : {};
      transport.sendMetrics({
        ...extra,
        flow_per_min_per_node: m.flow_per_node_min,
        station_id: STATION_ID_32, t: new Date().toISOString(), t_sim: +Number(tSim).toFixed(1),
        fps, draw_calls: (app.renderer && app.renderer.info && app.renderer.info.render && app.renderer.info.render.calls) || 0,
        kpi: { wait_avg_s: m.wait_avg_s, queue_max: m.queue_max, flow_per_node_min: m.flow_per_node_min, flow_per_min: m.flow_per_min },
        signal_mode: controller.getMode(),
        overrides: m.overrides.map(o => ({
          node_id: o.node_id, group: o.group, by: o.by, reason: o.reason, until_t_sim: o.until_t_sim, until_at: o.until_at
        })),
        signal_states: buildSignalStates32(controller, net, tSim)
      });
    }
    metricsTimer = setTimeout(sendMetrics, METRICS_S * 1000);
  };

  // Lệnh từ backend (commander/admin qua REST → WS tới trạm). Lỗi giá trị bị bỏ qua, không làm dừng vòng chạy.
  if (transport && typeof transport.onCommand === 'function') {
    transport.onCommand(msg => {
      const d = (msg && msg.data) || {};
      try {
        if (msg.event === 'cmd.signal-mode' && (d.mode === 'fixed' || d.mode === 'smart')) controller.setMode(d.mode);
        else if (msg.event === 'cmd.signal-override') {
          controller.overridePhase(d.node_id, d.group, d.duration_s || 60, d.by || 'command', d.reason || '');
        }
      } catch (e) { console.warn(`[hud] lệnh bị từ chối: ${e && e.message}`); }
    });
  }

  const rafLoop = () => {
    frames++;
    if (alive && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(rafLoop);
  };
  if (typeof requestAnimationFrame === 'function') rafLoop();

  panel.fps = () => fps;
  panel.dispose = () => {
    alive = false;
    clearTimeout(tickTimer); clearTimeout(metricsTimer);
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    panel.remove();
  };
  tick();
  sendMetrics();
  return app.registerSmartModule32('hud', panel);
}
