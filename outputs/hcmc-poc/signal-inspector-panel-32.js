/* Signal Inspector 32 — xem đèn hiện tại, dự báo phân bổ 60 giây và bật khung bao xe.
   Vanilla DOM, không thư viện. Mỗi giao lộ logic 3/4/5/6 hướng có một thẻ riêng. */

const PHASE_LABEL = { red: 'Đỏ', yellow: 'Vàng', green: 'Xanh' };
const PHASE_FILL = { red: '#e5484d', yellow: '#f2a93b', green: '#3fb950' };
const GROUPS = [0, 1];
const GROUP_NAME = ['A', 'B'];

const CSS = `
.si32{--line:rgba(137,216,223,.22);--mut:rgba(234,246,247,.68);display:flex;flex-direction:column;gap:8px;min-width:0;font:12px/1.45 "Segoe UI",system-ui,sans-serif;}
.si32 *,.si32 *::before,.si32 *::after{box-sizing:border-box;}
.si32__head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap}
.si32__title{margin:0;font-size:13px;font-weight:700}
.si32__mode{margin:2px 0 0;color:var(--mut);font-size:10px}
.si32__box{display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--line);border-radius:9px;background:rgba(3,17,21,.28);font-size:11px;cursor:pointer;white-space:nowrap}
.si32__box input{accent-color:#40bea0;margin:0}
.si32__status{margin:0;color:var(--mut);font-size:10px;min-height:1.3em}
.si32__status[data-error="1"]{color:#ff9a92}
.si32__overview{display:flex;flex-direction:column;gap:5px}
.si32__card{display:flex;flex-direction:column;gap:5px;width:100%;padding:8px 9px;border:1px solid var(--line);border-radius:11px;background:rgba(3,17,21,.24);color:inherit;font:inherit;text-align:left;cursor:pointer}
.si32__card:hover{background:rgba(64,190,160,.13)}
.si32__card[aria-pressed="true"]{border-color:rgba(64,190,160,.8);background:rgba(64,190,160,.2)}
.si32__card:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
.si32__cardTop{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.si32__name{font-size:11.5px;font-weight:700;line-height:1.25;min-width:0}
.si32__badge{flex:none;padding:1px 6px;border-radius:99px;background:rgba(137,216,223,.15);color:var(--mut);font-size:9px;white-space:nowrap}
.si32__lamps{display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px}
.si32__lamp{display:flex;align-items:center;gap:5px;min-width:0}
.si32__dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.08)}
.si32__g{color:var(--mut);font-weight:700}
.si32__cardBottom{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:var(--mut)}
.si32__mini{display:flex;flex:0 0 92px;height:4px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.12)}
.si32__mini i{display:block;height:100%}
.si32__detail{display:flex;flex-direction:column;gap:7px;padding-top:7px;border-top:1px solid var(--line)}
.si32__detailHead{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.si32__detailName{margin:0;font-size:11.5px;font-weight:700;flex:1 1 auto;min-width:0}
.si32__detailType{color:var(--mut);font-size:10px;flex:0 0 auto}
.si32__focus{flex:0 0 auto;padding:4px 8px;border-radius:8px;border:1px solid var(--line);background:rgba(3,17,21,.28);color:inherit;font:inherit;font-size:10px;cursor:pointer}
.si32__focus:hover{background:rgba(64,190,160,.24)}
.si32__focus:disabled{opacity:.4;cursor:default}
.si32__focus:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
.si32__sub{margin:0;font-size:10px;color:var(--mut);display:flex;justify-content:space-between;gap:8px}
.si32__alloc{display:flex;flex-direction:column;gap:4px}
.si32__bar{display:flex;height:18px;border-radius:7px;overflow:hidden;background:rgba(255,255,255,.1)}
.si32__seg{display:flex;align-items:center;justify-content:center;min-width:0;font-size:9px;font-weight:700;color:#071012;overflow:hidden;white-space:nowrap}
.si32__legend{display:flex;gap:12px;flex-wrap:wrap;font-size:9.5px;color:var(--mut)}
.si32__legend span{display:flex;align-items:center;gap:4px}
.si32__legend i{width:8px;height:8px;border-radius:2px;display:inline-block}
.si32__tl{display:flex;flex-direction:column;gap:4px}
.si32__row{display:flex;align-items:center;gap:5px}
.si32__rowName{flex:0 0 42px;color:var(--mut);font-size:9.5px}
.si32__track{position:relative;flex:1 1 auto;height:16px;background:rgba(3,17,21,.45);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.si32__phase{position:absolute;top:0;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;font-size:8.5px;font-weight:700;color:#071012}
.si32__axis{display:flex;justify-content:space-between;color:var(--mut);font-size:8.5px;margin-left:47px}
.si32__arms{display:flex;flex-direction:column;gap:5px}
.si32__armGroup{display:flex;gap:6px;align-items:flex-start;font-size:10px}
.si32__armTag{flex:0 0 auto;width:16px;text-align:center;font-weight:700;color:var(--mut)}
.si32__armList{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px;min-width:0}
.si32__armList li{line-height:1.35}
.si32__note{margin:0;color:var(--mut);font-size:9.5px;font-style:italic}
@media (max-width:520px){.si32__lamps{gap:6px}.si32__mini{flex-basis:70px}.si32__rowName{flex-basis:38px}.si32__axis{margin-left:43px}}
`;

const errText = e => (e && e.message) ? e.message : String(e);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const pct = v => `${Math.max(0, Math.min(100, Number(v) || 0))}%`;
const phaseOf = (row, g) => row?.now?.[g]?.phase || row?.phases?.find(p => p.group === g)?.phase || 'red';
const phaseText = (row, g) => {
  const n = row?.now?.[g];
  const phase = phaseOf(row, g);
  if (phase === 'red') {
    const at = Number(n?.greenAt_s);
    return at != null && Number.isFinite(at) ? `Đỏ · xanh sau ${Math.max(1, Math.ceil(at))}s` : 'Đỏ';
  }
  const remain = Math.max(0, Math.ceil(Number(n?.remain_s) || 0));
  return `${PHASE_LABEL[phase] || '—'} · còn ${remain}s`;
};

export function mountSignalInspector32(host, { readSnapshot, onFocus, onBoxes }) {
  const root = el('div', 'si32');
  root.innerHTML = `<style>${CSS}</style>
    <div class="si32__head">
      <div><h3 class="si32__title">Đèn &amp; dự báo</h3><p class="si32__mode" data-si="mode"></p></div>
      <label class="si32__box"><input type="checkbox" data-si="boxes" aria-label="Khung bao xe"> Khung bao xe</label>
    </div>
    <p class="si32__status" data-si="status" role="status"></p>
    <div class="si32__overview" data-si="overview" role="group" aria-label="Đèn hiện tại từng giao lộ"></div>
    <div class="si32__detail">
      <div class="si32__detailHead"><h4 class="si32__detailName" data-si="detailName">—</h4>
        <span class="si32__detailType" data-si="detailType"></span>
        <button class="si32__focus" type="button" data-si="focus" disabled>Đến giao lộ</button></div>
      <div class="si32__alloc">
        <p class="si32__sub"><span>Phân bổ xanh 60 giây</span><span data-si="allocTotal"></span></p>
        <div class="si32__bar" data-si="allocBar"></div>
        <div class="si32__legend"><span><i style="background:${PHASE_FILL.green}"></i>Nhóm A</span><span><i style="background:#58a6ff"></i>Nhóm B</span></div>
      </div>
      <div class="si32__tl" data-si="timeline"></div>
      <div class="si32__arms" data-si="arms"></div>
    </div>
    <p class="si32__note">Dự báo 60 giây với lượng xe hiện tại giữ nguyên; tự cập nhật, không phải lịch đèn cam kết. Khung bao xe tối đa 400 xe trong góc nhìn.</p>`;
  host.appendChild(root);

  const q = name => root.querySelector(`[data-si="${name}"]`);
  const modeEl = q('mode'), statusEl = q('status'), overviewEl = q('overview');
  const detailName = q('detailName'), detailType = q('detailType'), focusBtn = q('focus');
  const allocTotal = q('allocTotal'), allocBar = q('allocBar');
  const timelineEl = q('timeline'), armsEl = q('arms'), boxesEl = q('boxes');

  let rows = [], cards = new Map(), selected = null, lastIds = '';
  const setStatus = (text, isError) => { statusEl.textContent = text; statusEl.dataset.error = isError ? '1' : '0'; };
  const invoke = (fn, label) => {
    try { const r = fn(); if (r && typeof r.then === 'function') r.then(undefined, e => setStatus(`${label}: ${errText(e)}`, true)); }
    catch (e) { setStatus(`${label}: ${errText(e)}`, true); }
  };

  function cardFor(row) {
    const card = el('button', 'si32__card');
    card.type = 'button';
    card.dataset.junction = row.id;
    card.setAttribute('aria-pressed', 'false');
    const top = el('div', 'si32__cardTop');
    const name = el('span', 'si32__name', row.name || row.id);
    const badge = el('span', 'si32__badge', `${row.typeLabel || 'Giao lộ'} · ${row.armCount || 0} hướng`);
    top.append(name, badge);
    const lamps = el('div', 'si32__lamps');
    const lampEls = [];
    for (const g of GROUPS) {
      const lamp = el('span', 'si32__lamp');
      const dot = el('i', 'si32__dot');
      const text = el('span');
      lamp.append(dot, el('b', 'si32__g', GROUP_NAME[g]), text);
      lamps.append(lamp);
      lampEls.push({ dot, text });
    }
    const bottom = el('div', 'si32__cardBottom');
    const queue = el('span');
    const mini = el('span', 'si32__mini');
    mini.setAttribute('role', 'img');
    const bars = GROUPS.map(g => { const i = el('i'); i.style.background = g === 0 ? PHASE_FILL.green : '#58a6ff'; i.style.width = '50%'; mini.append(i); return i; });
    bottom.append(queue, mini);
    card.append(top, lamps, bottom);
    card.addEventListener('click', () => { selected = row.id; syncSelection(); renderDetail(); });
    cards.set(row.id, { card, lampEls, queue, mini, bars });
    overviewEl.append(card);
    return card;
  }

  function syncCards() {
    const ids = rows.map(r => r.id).join(' ');
    if (ids === lastIds) return;
    lastIds = ids;
    cards.clear();
    overviewEl.textContent = '';
    for (const row of rows) cardFor(row);
    if (!rows.some(r => r.id === selected)) selected = rows[0]?.id || null;
    syncSelection();
  }

  function syncSelection() {
    for (const [id, item] of cards) item.card.setAttribute('aria-pressed', String(id === selected));
  }

  function updateCards() {
    for (const row of rows) {
      const item = cards.get(row.id);
      if (!item) continue;
      for (const g of GROUPS) {
        const phase = phaseOf(row, g);
        item.lampEls[g].dot.style.background = PHASE_FILL[phase] || '#6e7681';
        item.lampEls[g].text.textContent = phaseText(row, g);
      }
      item.queue.textContent = `Chờ A: ${row.queue?.[0] ?? 0} · B: ${row.queue?.[1] ?? 0}`;
      const a = Number(row.allocationPct?.[0]) || 0;
      item.bars[0].style.width = pct(a);
      item.bars[1].style.width = pct(100 - a);
      const label = `Phân bổ xanh 60 giây: A ${Math.round(a)}% · B ${Math.round(100 - a)}%`;
      item.mini.title = label;
      item.mini.setAttribute('aria-label', label);
    }
  }

  function renderAllocation(row) {
    allocBar.textContent = '';
    const a = Number(row.allocationPct?.[0]) || 0;
    const b = Number(row.allocationPct?.[1]) || 0;
    const segA = el('span', 'si32__seg', `${Math.round(a)}%`);
    segA.style.width = pct(a);
    segA.style.background = PHASE_FILL.green;
    const segB = el('span', 'si32__seg', `${Math.round(b)}%`);
    segB.style.width = pct(b);
    segB.style.background = '#58a6ff';
    allocBar.append(segA, segB);
    allocTotal.textContent = `A ${row.allocation?.[0] ?? 0}s · B ${row.allocation?.[1] ?? 0}s`;
  }

  function renderTimeline(row) {
    timelineEl.textContent = '';
    for (const g of GROUPS) {
      const track = el('div', 'si32__track');
      const segs = (row.segments || []).filter(s => s.group === g && s.end > s.start);
      for (const s of segs) {
        const label = `${PHASE_LABEL[s.phase] || '—'} ${Math.round(s.start)}–${Math.round(s.end)}s`;
        const share = (s.end - s.start) / 60 * 100;
        // Đoạn ngắn (vàng 3 s) không đủ chỗ: ẩn chữ, giữ title/aria để rê chuột vẫn đọc được.
        const bar = el('div', 'si32__phase', share >= 11 ? label : '');
        bar.style.left = pct(s.start / 60 * 100);
        bar.style.width = pct(share);
        bar.style.background = PHASE_FILL[s.phase] || '#6e7681';
        bar.title = label;
        bar.setAttribute('aria-label', label);
        track.append(bar);
      }
      const line = el('div', 'si32__row');
      line.append(el('span', 'si32__rowName', `Nhóm ${GROUP_NAME[g]}`), track);
      timelineEl.append(line);
    }
    const axis = el('div', 'si32__axis');
    axis.append(el('span', null, '0s'), el('span', null, '60s'));
    timelineEl.append(axis);
  }

  function renderArms(row) {
    armsEl.textContent = '';
    for (const g of GROUPS) {
      // Hai chiều của cùng một đường (vào/ra) có thể cùng tên: chỉ hiện một lần trong danh sách hướng.
      const names = [...new Set((row.arms || []).filter(a => a.group === g).map(a => (a.names || []).join(' / ')))];
      const line = el('div', 'si32__armGroup');
      line.append(el('span', 'si32__armTag', GROUP_NAME[g]));
      const list = el('ul', 'si32__armList');
      for (const n of (names.length ? names : ['—'])) list.append(el('li', null, n));
      line.append(list);
      armsEl.append(line);
    }
  }

  function renderDetail() {
    const row = rows.find(r => r.id === selected) || rows[0];
    if (!row) {
      detailName.textContent = '—'; detailType.textContent = ''; focusBtn.disabled = true;
      allocBar.textContent = ''; timelineEl.textContent = ''; armsEl.textContent = '';
      return;
    }
    selected = row.id;
    detailName.textContent = row.name || row.id;
    detailType.textContent = `${row.typeLabel || 'Giao lộ'} · ${row.armCount || 0} hướng · ${row.headCount ?? 0} đầu đèn`;
    focusBtn.disabled = false;
    renderAllocation(row); renderTimeline(row); renderArms(row);
  }

  function tick() {
    if (root.closest('[hidden]')) return;
    let snap;
    try { snap = readSnapshot(); }
    catch (e) { setStatus(`Lỗi đọc dữ liệu: ${errText(e)}`, true); return; }
    try {
      rows = snap.rows || [];
      syncCards(); updateCards(); renderDetail();
      modeEl.textContent = `${snap.mode === 'fixed' ? 'Đèn cố định' : 'Đèn thông minh'} · cập nhật ${Math.round(snap.time)}s`;
      setStatus(`Dự báo 60 giây · ${rows.length} giao lộ`, false);
    } catch (e) { setStatus(`Lỗi hiển thị: ${errText(e)}`, true); }
  }

  focusBtn.addEventListener('click', () => {
    const row = rows.find(r => r.id === selected);
    if (!row) { setStatus('Lỗi điều hướng: chưa có giao lộ', true); return; }
    invoke(() => onFocus(row.id), 'Lỗi điều hướng');
  });
  boxesEl.addEventListener('change', () => invoke(() => onBoxes(boxesEl.checked), 'Lỗi khung bao xe'));

  tick();
  const timer = setInterval(tick, 2000);
  return {
    refresh: tick,
    select(id) { selected = id; syncSelection(); renderDetail(); },
    get selected() { return selected; },
    dispose() { clearInterval(timer); root.remove(); }
  };
}
