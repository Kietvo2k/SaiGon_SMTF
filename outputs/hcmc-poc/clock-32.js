// clock-32.js - đồng hồ trong ngày + tua thời gian của app smart (M4b2).
// Phần thuần (clockAt32, lightOf32, demandOfHour32, expandHeat…) chạy được trong Node; installClock32 cần document.
// Quy ước: giây đồng hồ = CLOCK_START_S_32 + giây sim + lệch do nhảy (offset). Đồng hồ khởi động 16:00 (ngày).
// Ánh sáng theo giờ: 06–17 ngày, 17–19 giờ vàng, còn lại đêm (khớp đặc tả). Nhu cầu theo giờ đặt tỉ lệ xe (setFraction);
// hệ số ánh sáng sim (LIGHT_FACTOR) vẫn do traffic đồng bộ theo nhóm ánh sáng.
export const CLOCK_32_VERSION = 'clock-32a';
export const CLOCK_START_S_32 = 16 * 3600;        // 16:00 lúc mở app (giây trong ngày)
export const HEAT_DAY_START_S_32 = 6 * 3600;      // heat đếm giờ từ 06:00
export const BASE_DATE_32 = Object.freeze({ y: 2026, m: 10, d: 16 });   // Thứ Sáu 16/10/2026 = ngày 0
export const JUMP_FAST_S_32 = Object.freeze({ min1: 60, min10: 600 });   // tua chạy nhanh (sim thật)
export const JUMP_HOP_S_32 = Object.freeze({ hour1: 3600, day1: 86400 }); // nhảy mốc (đặt giờ mới, dựng lại phân bố)
export const SPEEDS_32 = Object.freeze([1, 5, 10]);

// Nhu cầu theo giờ: tỉ lệ xe tối đa mỗi giờ (0–1). Đỉnh sáng 8 h và chiều 17–18 h; đêm thưa.
export const DEMAND_BY_HOUR_32 = Object.freeze([
  0.30, 0.25, 0.22, 0.20, 0.22, 0.30, 0.45, 0.75, 0.95, 0.80, 0.70, 0.70,
  0.75, 0.70, 0.70, 0.75, 0.85, 1.00, 1.00, 0.80, 0.60, 0.50, 0.40, 0.35
]);

const WEEKDAYS_32 = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const pad2 = n => String(n).padStart(2, '0');

// PERF-2: trạng thái tab ẩn dùng chung cho các module app smart (clock/heat chậm nhịp khi ẩn).
// Vòng vẽ (webgpu-materials-24.js) gán tabHidden32.hidden trong visibilitychange — chỉ khi app=smart.
export const tabHidden32 = { hidden: false };

// Đồng hồ tại giây sim `simT` (và lệch nhảy `offsetS`). Trả về giờ, phút, nhãn và giây "heat" (06:00 = 0).
export function clockAt32(simT, offsetS = 0) {
  const total = CLOCK_START_S_32 + Number(simT || 0) + Number(offsetS || 0);
  const dayIndex = Math.floor(total / 86400);
  const sod = total - dayIndex * 86400;
  const hour = Math.floor(sod / 3600), minute = Math.floor((sod % 3600) / 60), second = Math.floor(sod % 60);
  const date = new Date(Date.UTC(BASE_DATE_32.y, BASE_DATE_32.m - 1, BASE_DATE_32.d + dayIndex));
  const weekday = WEEKDAYS_32[date.getUTCDay()];
  return {
    total, dayIndex, hour, minute, second,
    label: `${pad2(hour)}:${pad2(minute)}`,
    weekday,
    dateLabel: `${weekday}, ${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}`,
    heatTime: total - HEAT_DAY_START_S_32
  };
}

// Nhóm ánh sáng theo giờ: ngày 06–17, giờ vàng 17–19, đêm còn lại.
export function lightOf32(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'golden';
  return 'night';
}

export function demandOfHour32(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return DEMAND_BY_HOUR_32[h];
}

// Đồng hồ + tua cho app smart. opts: {traffic, setLight(key), getLight() → key, heatLive?() → engine heat (tùy chọn),
// forecast?() → {reset()} (tùy chọn), doc, notify(text)}. Trả về {clock(), heatTime(), offsetS(), jump(), speed(), dispose()}.
export function installClock32(app, { traffic, setLight, getLight, forecast = null, heatLive = null, doc = (typeof document !== 'undefined' ? document : null), tickMs = 250 } = {}) {
  if (!traffic) throw new TypeError('installClock32 cần traffic');
  let offsetS = 0, lastHour = null, speed = 1, ffActive = false, alive = true;
  const sim = traffic.sim;
  const simT = () => Number(sim.counters.t) || 0;
  const clock = () => clockAt32(simT(), offsetS);

  // ---- DOM (chỉ khi có document)
  let el = null;
  if (doc) {
    if (!doc.getElementById('clockCss32')) {
      const style = doc.createElement('style');
      style.id = 'clockCss32';
      style.textContent = `
#clockHud32{position:fixed;z-index:8;left:24px;bottom:24px;width:260px;border-radius:18px;padding:14px 16px;color:var(--ink,#eaf6f7);font-size:12px}
#clockHud32 .clk-time{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}
#clockHud32 .clk-time strong{font-size:26px;font-variant-numeric:tabular-nums;font-weight:700}
#clockHud32 .clk-time small{font-size:11px;opacity:.85}
#clockHud32 .clk-row{display:flex;gap:6px;margin:6px 0 0;flex-wrap:wrap}
#clockHud32 button{flex:1 1 auto;min-width:0;padding:6px 6px;border-radius:10px;border:1px solid rgba(137,216,223,.35);background:rgba(3,17,21,.28);color:inherit;font:inherit;font-size:11px;cursor:pointer}
#clockHud32 button[aria-pressed="true"]{background:rgba(64,190,160,.45);border-color:rgba(64,190,160,.8)}
#clockHud32 button:disabled{opacity:.45;cursor:default}
#clockHud32 button:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
#clockHud32 .clk-status{margin:8px 0 0;font-size:11px;opacity:.9;min-height:1.4em}`;
      doc.head.append(style);
    }
    el = doc.createElement('aside');
    el.id = 'clockHud32';
    el.className = 'glass';
    el.setAttribute('aria-label', 'Đồng hồ khu Bắc và tua thời gian');
    el.innerHTML = '<div class="clk-time"><strong id="clkHM32">--:--</strong><small id="clkDate32"></small></div>'
      + '<div class="clk-row" role="group" aria-label="Tốc độ chạy">'
      + SPEEDS_32.map(k => `<button type="button" data-speed="${k}" aria-pressed="${k === 1}">×${k}</button>`).join('')
      + '</div>'
      + '<div class="clk-row" role="group" aria-label="Nhảy thời gian">'
      + '<button type="button" data-jump="fast:60">+1 phút</button>'
      + '<button type="button" data-jump="fast:600">+10 phút</button>'
      + '<button type="button" data-jump="hop:3600">+1 giờ</button>'
      + '<button type="button" data-jump="hop:86400">+1 ngày</button>'
      + '</div>'
      + '<p class="clk-status" id="clkStatus32" aria-live="polite"></p>';
    (app.root && app.root.body ? app.root.body : doc.body).append(el);
    el.addEventListener('click', ev => {
      const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      if (b.dataset.speed) setSpeed(Number(b.dataset.speed));
      else if (b.dataset.jump) { const [kind, sec] = b.dataset.jump.split(':'); jump(kind, Number(sec)); }
    });
  }
  const status = text => { if (el) el.querySelector('#clkStatus32').textContent = text; };

  function setSpeed(k) {
    speed = SPEEDS_32.includes(k) ? k : 1;
    traffic.setTimeScale(speed);
    if (el) el.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)));
    return speed;
  }

  // Áp dụng nhóm ánh sáng và nhu cầu của giờ hiện tại. notify: báo "đã dựng lại phân bố".
  function applyHour(hour, notify) {
    const key = lightOf32(hour);
    if (typeof getLight === 'function' && typeof setLight === 'function' && getLight() !== key) setLight(key);
    traffic.setVisibleFraction(demandOfHour32(hour));
    if (notify) status(`Đã dựng lại phân bố xe theo nhu cầu ${pad2(hour)}:00 · tỉ lệ ${Math.round(demandOfHour32(hour) * 100)} %`);
  }

  function invalidate() {
    if (heatLive) { const live = heatLive(); if (live && live.clearLookahead) live.clearLookahead(); }
    if (forecast) { const f = forecast(); if (f && f.reset) f.reset(); }
  }

  // kind: 'fast' (chạy nhanh bằng sim thật, theo giây sim) | 'hop' (nhảy mốc: đặt giờ mới, không chạy sim)
  function jump(kind, seconds) {
    if (!alive) return false;
    const s = Math.max(0, Number(seconds) || 0);
    if (kind === 'fast') {
      if (ffActive || traffic.ffRemaining() > 0) return false;
      traffic.fastForward(s);
      ffActive = true;
      setButtonsDisabled(true);
      status(`Đang tua ${s >= 600 ? '+10 phút' : '+1 phút'} bằng sim thật…`);
      return true;
    }
    if (ffActive) return false;
    offsetS += s;
    invalidate();
    const c = clock();
    lastHour = c.hour;
    applyHour(c.hour, true);
    status(`Đã nhảy tới ${c.label} · ${c.dateLabel} · lịch sử và dự báo làm mới`);
    return true;
  }

  // M5a: đặt đồng hồ tới giờ:phút gần nhất (≤ 12 giờ về trước hoặc tới trước, không chạy sim); dựng lại ánh sáng/nhu cầu.
  function goTo(hour, minute = 0) {
    if (!alive || ffActive) return false;
    const target = Math.floor(Number(hour) || 0) * 3600 + Math.floor(Number(minute) || 0) * 60;
    const cur = clock();
    let delta = target - (((cur.total % 86400) + 86400) % 86400);
    if (delta > 43200) delta -= 86400;
    if (delta <= -43200) delta += 86400;
    offsetS += delta;
    invalidate();
    const c = clock();
    lastHour = c.hour;
    applyHour(c.hour, true);
    status(`Đã đặt đồng hồ ${c.label} · ${c.dateLabel} · lịch sử và dự báo làm mới`);
    return true;
  }

  function setButtonsDisabled(on) {
    if (el) el.querySelectorAll('[data-jump]').forEach(b => { b.disabled = !!on; });
  }

  function tick() {
    if (!alive) return;
    const c = clock();
    if (el) {
      el.querySelector('#clkHM32').textContent = c.label;
      el.querySelector('#clkDate32').textContent = c.dateLabel;
    }
    if (ffActive && traffic.ffRemaining() <= 0) {
      ffActive = false;
      setButtonsDisabled(false);
      const cur = clock();
      lastHour = cur.hour;
      applyHour(cur.hour, true);
      invalidate();
      status(`Đã tua tới ${cur.label} · ${cur.dateLabel}`);
    }
    if (!ffActive && c.hour !== lastHour) {
      lastHour = c.hour;
      applyHour(c.hour, true);
    }
  }

  // Khởi tạo: đặt giờ đầu, tốc độ ×1 và nhóm ánh sáng/nhu cầu của 16:00 (không báo).
  const c0 = clock();
  lastHour = c0.hour;
  applyHour(c0.hour, false);
  traffic.setTimeScale(1);
  // PERF-2: khi tab ẩn chậm nhịp đồng hồ (tickMs → 1 s). Chuỗi setTimeout tự lập lại để nhịp đổi được.
  const tickInterval = () => (tabHidden32.hidden ? 1000 : tickMs);
  let timer = 0;
  if (typeof setTimeout === 'function') {
    const clockLoop = () => { tick(); timer = setTimeout(clockLoop, tickInterval()); };
    timer = setTimeout(clockLoop, tickMs);
  }
  tick();

  const api = {
    clock, heatTime: () => clock().heatTime, offsetS: () => offsetS,
    jump, goTo, speed: () => speed, setSpeed, tick,
    dispose() { alive = false; if (timer) clearTimeout(timer); if (el) el.remove(); }
  };
  if (app && typeof app.registerSmartModule32 === 'function') app.registerSmartModule32('clock', api);   // bản đồ nhiệt đọc giờ qua app.modules.clock
  return api;
}
