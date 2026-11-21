/* Signal Inspector 32 — xem đèn hiện tại, dự báo phân bổ 60 giây và bật khung bao xe.
   Vanilla DOM, không thư viện. Mỗi giao lộ logic 3/4/5/6 hướng có một thẻ riêng. */
import { earlyCutModel32, EXPLAIN_PARAMS_32 } from './signal-explainer-32.js?v=32c';

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
/* Bản đơn giản cho người xem phổ thông: một thẻ lớn "đang xanh/đỏ", danh sách một dòng,
   toàn bộ số liệu kỹ thuật nằm trong mục "Chi tiết kỹ thuật" đóng sẵn. */
.si32__hero{padding:10px;border:1px solid var(--line);border-radius:14px;background:rgba(3,17,21,.32)}
.si32__hero .si32__detailName{font-size:15px;font-weight:800;line-height:1.25;margin:0}
.si32__heroHint{margin:3px 0 8px;color:var(--mut);font-size:10px}
.si32__heroRows{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.si32__heroRow{display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}
.si32__heroDir{font-size:10px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.si32__heroLight{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#f5fbfa;min-width:0}
.si32__heroDot{width:18px;height:18px;border-radius:50%;flex:none;box-shadow:0 0 0 3px rgba(255,255,255,.08)}
.si32__heroSec{font-size:11px;color:var(--mut);white-space:nowrap}
/* Visual "vì sao": thanh hàng chờ, mũi tên nhường xanh, 3 phần xác suất và chip tham số. */
.si32__queues{display:flex;flex-direction:column;gap:4px;margin:0 0 4px}
.si32__qRow{display:grid;grid-template-columns:52px minmax(0,1fr) 40px;align-items:center;gap:6px;font-size:10px;color:var(--mut)}
.si32__qName{font-weight:700;white-space:nowrap}
.si32__qTrack{display:block;height:8px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
.si32__qTrack i{display:block;height:100%;border-radius:99px;transition:width .3s ease}
.si32__qNum{text-align:right;font-size:10px;white-space:nowrap;font-variant-numeric:tabular-nums}
.si32__cutRow{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 5px;margin-top:2px;font-size:10px;color:var(--mut)}
.si32__cutRow[hidden]{display:none}
.si32__cutChip{padding:1px 6px;border-radius:99px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);font-weight:700;white-space:nowrap}
.si32__cutChip--a{border-color:rgba(63,185,80,.55);background:rgba(63,185,80,.16);color:#b8f0c6}
.si32__cutChip--b{border-color:rgba(88,166,255,.55);background:rgba(88,166,255,.16);color:#c3ddff}
.si32__cutWait,.si32__cutGreen{white-space:nowrap}
.si32__cutArrow{white-space:nowrap;font-weight:700;color:rgba(234,246,247,.68)}
.si32__laneLegend{display:flex;align-items:center;flex-wrap:wrap;gap:2px 9px;margin:0 0 6px;color:var(--mut);font-size:10px;line-height:1.45}
.si32__laneLegend[hidden]{display:none}
.si32__laneLegend span{display:flex;align-items:center;gap:3px;white-space:nowrap}
.si32__laneLegend i{width:8px;height:8px;border-radius:2px;display:inline-block}
.si32__whyLine{margin:0 0 6px;color:var(--mut);font-size:10.5px;line-height:1.5}
.si32__estimate{margin:0 0 5px;color:var(--mut);font-size:10px;font-style:italic;line-height:1.4}
.si32__estimate[hidden]{display:none}
.si32__risk{display:flex;flex-direction:column;gap:4px;margin:0 0 7px}
.si32__riskBar{display:flex;height:7px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.1)}
.si32__riskBar i{display:block;height:100%;width:0;transition:width .3s ease}
.si32__outcomes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 8px;margin:0;font-size:10px;line-height:1.4;color:var(--mut)}
.si32__outcomes[data-strong="0"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.si32__outcomes span{display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap}
.si32__outcomes span[hidden]{display:none}
.si32__outcomes i{width:7px;height:7px;border-radius:2px;flex:none}
.si32__outcomes b{margin-left:auto;color:#eaf6f7;font-weight:700;font-variant-numeric:tabular-nums}
.si32__chips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px}
.si32__chips[hidden]{display:none}
.si32__chips span{padding:2px 6px;border-radius:99px;border:1px solid rgba(137,216,223,.22);background:rgba(3,17,21,.3);color:var(--mut);font-size:10px;white-space:nowrap}
.si32__fixedLine{margin:0 0 8px;padding:4px 8px;border-radius:8px;border:1px solid rgba(137,216,223,.28);background:rgba(3,17,21,.32);color:#eaf6f7;font-size:10px;line-height:1.45}
.si32__fixedLine[hidden]{display:none}
.si32__explain{margin:0 0 8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08)}
.si32__explain[hidden]{display:none}
.si32__explain summary{cursor:pointer;color:var(--mut);font-size:10px;font-weight:750;list-style:none}
.si32__explain summary::-webkit-details-marker{display:none}
.si32__explain summary::before{content:'▸ ';color:var(--mut)}
.si32__explain[open] summary::before{content:'▾ '}
.si32__diagram{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;margin:7px 0 0;font-size:10px;color:var(--mut)}
.si32__diagram i{font-style:normal;font-weight:700;color:rgba(234,246,247,.45)}
.si32__step{padding:2px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);white-space:nowrap}
.si32__step--green{border-color:rgba(63,185,80,.45);background:rgba(63,185,80,.14);color:#b8f0c6}
.si32__step--yellow{border-color:rgba(242,169,59,.45);background:rgba(242,169,59,.14);color:#f5d29a}
.si32__step--red{border-color:rgba(229,72,77,.45);background:rgba(229,72,77,.14);color:#ffb3b0}
.si32__riskList{display:flex;flex-direction:column;gap:4px;margin:8px 0 0}
.si32__riskRow{display:grid;grid-template-columns:64px minmax(0,1fr) 34px;align-items:center;gap:6px;font-size:10px;color:var(--mut)}
.si32__riskRow[hidden]{display:none}
.si32__riskTrack{display:block;height:6px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
.si32__riskTrack i{display:block;height:100%;width:0;transition:width .3s ease}
.si32__riskRow b{text-align:right;color:#eaf6f7;font-weight:700;font-variant-numeric:tabular-nums}
.si32__listTitle{margin:8px 0 2px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.si32__card{flex-direction:row;align-items:center;gap:8px;padding:9px 10px}
.si32__cardTop{width:100%;align-items:center;gap:8px}
.si32__listLeft{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 auto}
.si32__listDot{width:14px;height:14px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.08)}
.si32__listState{font-size:11px;font-weight:800;color:var(--mut);white-space:nowrap;flex:0 0 auto}
.si32__more{margin-top:8px;border-top:1px solid var(--line);padding-top:6px}
.si32__more summary{cursor:pointer;color:var(--mut);font-size:10px;font-weight:750;list-style:none}
.si32__more summary::-webkit-details-marker{display:none}
.si32__more summary::before{content:'▸ ';color:var(--mut)}
.si32__more[open] summary::before{content:'▾ '}
.si32__more .si32__detail{margin-top:8px;border-top:0;padding-top:0}
.si32__status:empty{display:none}
@media (max-width:520px){.si32__lamps{gap:6px}.si32__mini{flex-basis:70px}.si32__rowName{flex-basis:38px}.si32__axis{margin-left:43px}.si32__heroRow{grid-template-columns:46px minmax(0,1fr) auto;gap:6px}.si32__heroDir{font-size:9px;letter-spacing:.02em;white-space:nowrap}.si32__heroLight{font-size:13px}.si32__heroSec{font-size:10px}.si32__whyLine{font-size:10px}.si32__qRow{grid-template-columns:46px minmax(0,1fr) 34px}.si32__outcomes{gap:2px 6px}.si32__riskRow{grid-template-columns:56px minmax(0,1fr) 32px}}
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
      <div><h3 class="si32__title">Đèn giao thông</h3><p class="si32__mode" data-si="mode"></p></div>
    </div>
    <p class="si32__status" data-si="status" role="status"></p>
    <div class="si32__hero">
      <h4 class="si32__detailName" data-si="detailName">—</h4>
      <p class="si32__heroHint">Xanh: đi · Vàng: chậm lại · Đỏ: dừng. A/B là hai chiều đường.</p>
      <div class="si32__heroRows" data-si="heroRows"></div>
      <div class="si32__queues" data-si="queues" aria-label="Hàng chờ hai chiều">
        <div class="si32__qRow">
          <span class="si32__qName">Chiều A</span>
          <span class="si32__qTrack"><i data-si="qBarA" style="background:${PHASE_FILL.green}"></i></span>
          <span class="si32__qNum" data-si="qNumA">0 xe</span>
        </div>
        <div class="si32__qRow">
          <span class="si32__qName">Chiều B</span>
          <span class="si32__qTrack"><i data-si="qBarB" style="background:#58a6ff"></i></span>
          <span class="si32__qNum" data-si="qNumB">0 xe</span>
        </div>
        <div class="si32__cutRow" data-si="cutRow" hidden>
          <span class="si32__cutChip si32__cutChip--a" data-si="cutFrom">Chiều A</span>
          <span class="si32__cutWait" data-si="cutWait">đang chờ 0 xe</span>
          <span class="si32__cutArrow">→ nhường cho</span>
          <span class="si32__cutChip si32__cutChip--b" data-si="cutTo">Chiều B</span>
          <span class="si32__cutGreen" data-si="cutGreenText">đang xanh</span>
        </div>
      </div>
      <p class="si32__laneLegend" data-si="laneLegend" aria-label="A màu xanh lá, B màu xanh dương; mũi tên: chiều đang chờ nhường cho chiều đang xanh">
        <span><i style="background:${PHASE_FILL.green}"></i>A</span><span><i style="background:#58a6ff"></i>B</span><span>mũi tên: chiều đang chờ → chiều đang xanh</span>
      </p>
      <div class="si32__chips" data-si="chips" aria-label="Tham số đèn">
        <span>Xanh tối thiểu ${EXPLAIN_PARAMS_32.minGreenS}s</span><span>Kiểm tra mỗi ${EXPLAIN_PARAMS_32.decisionIntervalS}s</span><span>Vàng ${EXPLAIN_PARAMS_32.yellowS}s</span><span>Tối đa ${EXPLAIN_PARAMS_32.maxGreenS}s</span>
      </div>
      <p class="si32__fixedLine" data-si="fixedLine" hidden>Đèn cố định · chu kỳ A ${EXPLAIN_PARAMS_32.fixedGreenS[0]}s / B ${EXPLAIN_PARAMS_32.fixedGreenS[1]}s</p>
      <p class="si32__whyLine" data-si="whyLine"></p>
      <p class="si32__estimate" data-si="estimate" hidden>Ước lượng theo hàng chờ</p>
      <div class="si32__risk">
        <div class="si32__riskBar" data-si="riskBar" role="img" aria-label="Khả năng giữ đủ dự báo, rút ngắn và rút mạnh">
          <i data-si="riskKeep" style="background:${PHASE_FILL.green}"></i><i data-si="riskShort" style="background:${PHASE_FILL.yellow}"></i><i data-si="riskStrong" style="background:${PHASE_FILL.red}"></i>
        </div>
        <div class="si32__outcomes" data-si="outcomes">
          <span><i style="background:${PHASE_FILL.green}"></i>Giữ đủ <b data-si="keepPct">—</b></span>
          <span><i style="background:${PHASE_FILL.yellow}"></i>Rút ngắn <b data-si="shortPct">—</b></span>
          <span data-si="outStrong"><i style="background:${PHASE_FILL.red}"></i>Rút mạnh <b data-si="strongPct">—</b></span>
        </div>
      </div>
      <details class="si32__explain" data-si="explain">
        <summary>Vì sao đèn đổi?</summary>
        <div class="si32__diagram">
          <span class="si32__step si32__step--green">Xanh dự báo</span>
          <i aria-hidden="true">→</i>
          <span class="si32__step">Kiểm tra sau ${EXPLAIN_PARAMS_32.minGreenS}s</span>
          <i aria-hidden="true">→</i>
          <span class="si32__step si32__step--yellow">Vàng ${EXPLAIN_PARAMS_32.yellowS}s</span>
          <i aria-hidden="true">→</i>
          <span class="si32__step si32__step--red">Đỏ</span>
        </div>
        <div class="si32__riskList">
          <div class="si32__riskRow"><span>Giữ đủ</span><span class="si32__riskTrack"><i data-si="listKeep" style="background:${PHASE_FILL.green}"></i></span><b data-si="oddsKeep">—</b></div>
          <div class="si32__riskRow"><span>Rút ngắn</span><span class="si32__riskTrack"><i data-si="listShort" style="background:${PHASE_FILL.yellow}"></i></span><b data-si="oddsShort">—</b></div>
          <div class="si32__riskRow" data-si="riskStrongRow"><span>Rút mạnh</span><span class="si32__riskTrack"><i data-si="listStrong" style="background:${PHASE_FILL.red}"></i></span><b data-si="oddsStrong">—</b></div>
        </div>
      </details>
      <button class="si32__focus" type="button" data-si="focus" disabled>Xem trên bản đồ</button>
    </div>
    <p class="si32__listTitle">Chọn giao lộ</p>
    <div class="si32__overview" data-si="overview" role="group" aria-label="Đèn hiện tại từng giao lộ"></div>
    <details class="si32__more">
      <summary>Chi tiết kỹ thuật</summary>
      <div class="si32__detail">
        <p class="si32__detailType" data-si="detailType"></p>
        <label class="si32__box"><input type="checkbox" data-si="boxes" aria-label="Hiện khung nhận diện xe"> Hiện khung nhận diện xe</label>
        <div class="si32__alloc">
          <p class="si32__sub"><span>Phân bổ xanh 60 giây</span><span data-si="allocTotal"></span></p>
          <div class="si32__bar" data-si="allocBar"></div>
          <div class="si32__legend"><span><i style="background:${PHASE_FILL.green}"></i>Nhóm A</span><span><i style="background:#58a6ff"></i>Nhóm B</span></div>
        </div>
        <div class="si32__tl" data-si="timeline"></div>
        <div class="si32__arms" data-si="arms"></div>
        <p class="si32__note">Số liệu kỹ thuật để kiểm tra, không cần đọc khi chỉ xem đèn.</p>
      </div>
    </details>`;
  host.appendChild(root);

  const q = name => root.querySelector(`[data-si="${name}"]`);
  const modeEl = q('mode'), statusEl = q('status'), overviewEl = q('overview');
  const detailName = q('detailName'), detailType = q('detailType'), focusBtn = q('focus'), heroRows = q('heroRows');
  const whyLine = q('whyLine'), riskBar = q('riskBar'), outcomesEl = q('outcomes');
  const riskKeep = q('riskKeep'), riskShort = q('riskShort'), riskStrong = q('riskStrong');
  const oddsKeep = q('oddsKeep'), oddsShort = q('oddsShort'), oddsStrong = q('oddsStrong');
  const qBarA = q('qBarA'), qBarB = q('qBarB'), qNumA = q('qNumA'), qNumB = q('qNumB');
  const cutRow = q('cutRow'), cutFrom = q('cutFrom'), cutTo = q('cutTo'), cutWait = q('cutWait'), cutGreenText = q('cutGreenText');
  const keepPct = q('keepPct'), shortPct = q('shortPct'), strongPct = q('strongPct');
  const listKeep = q('listKeep'), listShort = q('listShort'), listStrong = q('listStrong');
  const chipsEl = q('chips'), fixedLine = q('fixedLine'), explainEl = q('explain'), laneLegendEl = q('laneLegend');
  const estimateEl = q('estimate');
  const outStrong = q('outStrong'), riskStrongRow = q('riskStrongRow');
  const allocTotal = q('allocTotal'), allocBar = q('allocBar');
  const plannedEl = el('p', 'si32__sub', 'Xanh kế hoạch: —');
  const jamEl = el('p', 'si32__sub', 'Dự báo kẹt: —');
  const timelineEl = q('timeline'), armsEl = q('arms'), boxesEl = q('boxes');
  // demo-v2 (P1-8): dòng xanh kế hoạch + dự báo kẹt nằm ngay trên dòng thời gian pha.
  timelineEl.after(plannedEl, jamEl);

  let rows = [], cards = new Map(), selected = null, lastIds = '';
  const setStatus = (text, isError) => { statusEl.textContent = text; statusEl.dataset.error = isError ? '1' : '0'; };
  const invoke = (fn, label) => {
    try { const r = fn(); if (r && typeof r.then === 'function') r.then(undefined, e => setStatus(`${label}: ${errText(e)}`, true)); }
    catch (e) { setStatus(`${label}: ${errText(e)}`, true); }
  };

  // Trạng thái đọc nhanh cho cả nút: chỉ cần biết "có hướng xanh" hay "đang đỏ".
  const overallState = row => {
    const phases = GROUPS.map(g => phaseOf(row, g));
    if (phases.includes('green')) return { phase: 'green', text: 'Có hướng xanh' };
    if (phases.includes('yellow')) return { phase: 'yellow', text: 'Sắp chuyển' };
    return { phase: 'red', text: 'Đang đỏ' };
  };

  function cardFor(row) {
    const card = el('button', 'si32__card');
    card.type = 'button';
    card.dataset.junction = row.id;
    card.setAttribute('aria-pressed', 'false');
    const top = el('div', 'si32__cardTop');
    const left = el('div', 'si32__listLeft');
    const dot = el('i', 'si32__listDot');
    const name = el('span', 'si32__name', row.name || row.id);
    left.append(dot, name);
    const state = el('span', 'si32__listState');
    top.append(left, state);
    card.append(top);
    card.addEventListener('click', () => { selected = row.id; syncSelection(); renderDetail(); });
    cards.set(row.id, { card, dot, state });
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
      const state = overallState(row);
      item.dot.style.background = PHASE_FILL[state.phase] || '#6e7681';
      item.state.textContent = state.text;
      item.card.setAttribute('aria-label', `${row.name || row.id} · ${state.text}`);
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

  function renderHero(row) {
    heroRows.textContent = '';
    if (!row) return;
    for (const g of GROUPS) {
      const n = row.now?.[g];
      const phase = phaseOf(row, g);
      const remain = Math.max(0, Math.ceil(Number(n?.remain_s) || 0));
      const greenAt = Number(n?.greenAt_s);
      const rowEl = el('div', 'si32__heroRow');
      rowEl.append(el('span', 'si32__heroDir', `Chiều ${GROUP_NAME[g]}`));
      const light = el('span', 'si32__heroLight');
      const dot = el('i', 'si32__heroDot');
      dot.style.background = PHASE_FILL[phase] || '#6e7681';
      const label = phase === 'green' ? 'ĐANG XANH' : phase === 'yellow' ? 'SẮP ĐỎ' : 'ĐANG ĐỎ';
      light.append(dot, el('b', null, label));
      const sec = el('span', 'si32__heroSec', phase === 'red'
        ? (Number.isFinite(greenAt) ? `chờ ${Math.max(1, Math.ceil(greenAt))} giây` : 'dừng lại')
        : `còn ${remain} giây`);
      rowEl.append(light, sec);
      heroRows.append(rowEl);
    }
  }

  // Visual "vì sao": thanh hàng chờ hai chiều, mũi tên "đang chờ → nhường cho ... đang xanh",
  // 3 phần xác suất và một câu lý do ngắn. Số lấy từ signal-explainer-32.js, cập nhật mỗi tick.
  const percent = v => `${Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100)}%`;
  function renderWhy(row, model) {
    const bars = [riskKeep, riskShort, riskStrong, listKeep, listShort, listStrong];
    if (!row) {
      whyLine.textContent = '';
      for (const node of bars) node.style.width = '0%';
      qBarA.style.width = qBarB.style.width = '0%';
      qNumA.textContent = qNumB.textContent = '0 xe';
      cutRow.hidden = true;
      chipsEl.hidden = false; fixedLine.hidden = true; explainEl.hidden = false; laneLegendEl.hidden = false;
      estimateEl.hidden = true;
      outStrong.hidden = false; riskStrongRow.hidden = false; outcomesEl.dataset.strong = '1';
      keepPct.textContent = shortPct.textContent = strongPct.textContent = '—';
      oddsKeep.textContent = oddsShort.textContent = oddsStrong.textContent = '—';
      riskBar.setAttribute('aria-label', 'Chưa có dữ liệu đèn');
      return;
    }
    const m = model || earlyCutModel32(row);
    const qA = m.qA;
    const qB = m.qB;
    const qMax = Math.max(1, qA, qB);
    qBarA.style.width = `${Math.round(qA / qMax * 100)}%`;
    qBarB.style.width = `${Math.round(qB / qMax * 100)}%`;
    qNumA.textContent = `${Math.round(qA)} xe`;
    qNumB.textContent = `${Math.round(qB)} xe`;

    // Fixed mode: controller không rút xanh. Ẩn 4 chip thích ứng + details,
    // thay bằng đúng chu kỳ cố định; pCut đã bằng 0 từ model.
    chipsEl.hidden = m.fixed;
    fixedLine.hidden = !m.fixed;
    explainEl.hidden = m.fixed;
    laneLegendEl.hidden = m.fixed;
    // Chỉ có pressure thật (count − q_out) mới bỏ nhãn ước lượng; preview hiện tại chỉ có count.
    estimateEl.hidden = m.fixed || m.pressureFromQueue;
    outcomeStrongVisible(m.strongVisible);
    if (m.fixed) fixedLine.textContent = m.headline;

    // Mũi tên chỉ hiện khi controller thật sự có thể cắt: đang xanh, đã qua 8 s,
    // chiều kia đông hơn thật (không phải chỉ hơn 0 xe) và chênh ≥15%.
    const canCut = !m.fixed && m.active && m.elapsedS >= EXPLAIN_PARAMS_32.minGreenS
      && m.qOther > m.qGreen && m.margin > EXPLAIN_PARAMS_32.switchMargin;
    cutRow.hidden = !canCut;
    if (canCut) {
      const waitName = GROUP_NAME[m.otherGroup], greenName = GROUP_NAME[m.greenGroup];
      cutFrom.textContent = `Chiều ${waitName}`;
      cutFrom.className = `si32__cutChip si32__cutChip--${waitName.toLowerCase()}`;
      cutWait.textContent = `đang chờ ${Math.round(m.qOther)} xe`;
      cutTo.textContent = `Chiều ${greenName}`;
      cutTo.className = `si32__cutChip si32__cutChip--${greenName.toLowerCase()}`;
      cutGreenText.textContent = 'đang xanh';
    }
    // Một câu ngắn: fixed dùng câu "không rút xanh"; nhánh có thể cắt dùng câu nêu số xe;
    // các nhánh còn lại dùng headline của model (đang xanh đông hơn / bằng nhau / gần nhau / tối thiểu).
    whyLine.textContent = m.fixed ? m.reason : (canCut ? m.reason : m.headline);

    const keep = percent(m.outcomes.keep), short = percent(m.outcomes.short), strong = percent(m.outcomes.strong);
    riskKeep.style.width = keep;
    riskShort.style.width = short;
    riskStrong.style.width = strong;
    listKeep.style.width = keep;
    listShort.style.width = short;
    listStrong.style.width = strong;
    keepPct.textContent = keep;
    shortPct.textContent = short;
    strongPct.textContent = strong;
    riskBar.setAttribute('aria-label', m.strongAllowed
      ? `Giữ đủ ${keep}, rút ngắn ${short}, rút mạnh ${strong}`
      : `Giữ đủ ${keep}, rút ngắn ${short}`);
    oddsKeep.textContent = keep;
    oddsShort.textContent = short;
    oddsStrong.textContent = strong;
  }

  // "Rút mạnh" chỉ hiện khi model.strongVisible: có cắt thật, chiều chờ > chiều xanh,
  // chiều chờ ≥2 xe và pCut > 0. pCut = 0 hoặc chiều xanh đông hơn/bằng → ẩn hẳn hàng.
  function outcomeStrongVisible(allowed) {
    outStrong.hidden = !allowed;
    riskStrongRow.hidden = !allowed;
    outcomesEl.dataset.strong = allowed ? '1' : '0';
  }

  function renderDetail() {
    const row = rows.find(r => r.id === selected) || rows[0];
    if (!row) {
      detailName.textContent = '—'; detailType.textContent = ''; focusBtn.disabled = true;
      heroRows.textContent = '';
      renderWhy(null);
      allocBar.textContent = ''; timelineEl.textContent = ''; armsEl.textContent = '';
      plannedEl.textContent = 'Đã xanh: —'; jamEl.textContent = 'Dự báo kẹt: —';
      return;
    }
    selected = row.id;
    detailName.textContent = row.name || row.id;
    detailType.textContent = `${row.typeLabel || 'Giao lộ'} · ${row.armCount || 0} hướng · ${row.headCount ?? 0} đầu đèn`;
    focusBtn.disabled = false;
    const model = earlyCutModel32(row);
    renderHero(row);
    renderWhy(row, model);
    renderAllocation(row); renderTimeline(row); renderArms(row);
    // P2: không gọi nhãn "Xanh kế hoạch" cho adaptive vì plannedGreen.green[0] là greenLen
    // của nhóm đang phục vụ, không phải nhóm A. Chỉ hiện số giây đã xanh của đúng nhóm.
    const planned = row.plannedGreen;
    if (!planned) plannedEl.textContent = 'Đã xanh: —';
    else if (planned.source === 'fixed') plannedEl.textContent = model.headline;
    else if (planned.source === 'cycle') {
      plannedEl.textContent = `Xanh kế hoạch: A ${Math.round(planned.green[0])} s · B ${Math.round(planned.green[1])} s (chia lại theo áp lực chu kỳ)`;
    } else if (planned.source === 'adaptive') {
      plannedEl.textContent = model.active
        ? (model.elapsedS < EXPLAIN_PARAMS_32.minGreenS
          ? `Đã xanh: nhóm ${GROUP_NAME[model.greenGroup]} dưới ${EXPLAIN_PARAMS_32.minGreenS} giây`
          : `Đã xanh: nhóm ${GROUP_NAME[model.greenGroup]} ${Math.round(model.elapsedS)} s`)
        : 'Đã xanh: đang chuyển pha';
    } else plannedEl.textContent = 'Đã xanh: —';
    const jam = row.jam;
    jamEl.textContent = jam
      ? `Dự báo kẹt ${jam.horizonMin ? `${jam.horizonMin} phút` : 'gần'}: ${Math.round(jam.prob * 100)}% · độ tin cậy ${Math.round(jam.reliability * 100)}%${jam.name ? ` · ${jam.name}` : ''}`
      : 'Dự báo kẹt: chưa có cảnh báo cho hướng vào nút này';
  }

  // P2: tab "Đèn giao thông" có thể vừa hiện lại sau khi bị ẩn. Lúc đó phải đọc snapshot
  // ngay thay vì chờ nhịp 2 s, nếu không hero hiện số giây cũ. Khi ẩn thì bỏ nhịp nặng;
  // khi hiện lại, IntersectionObserver / click / đổi thuộc tính tab sẽ gọi tick(true).
  const isHiddenNow = () => {
    if (typeof root.checkVisibility === 'function') {
      try { return !root.checkVisibility({ checkVisibilityCSS: true }); } catch { /* dùng fallback dưới */ }
    }
    if (root.closest('[hidden]') || root.closest('.is-closed')) return true;
    return typeof root.getClientRects === 'function' && root.getClientRects().length === 0;
  };
  let wasHidden = isHiddenNow();
  const refreshOnShow = () => {
    const hidden = isHiddenNow();
    if (wasHidden && !hidden) tick(true);
    wasHidden = hidden;
  };

  function tick(force) {
    if (!force && isHiddenNow()) return;
    let snap;
    try { snap = readSnapshot(); }
    catch (e) { setStatus(`Lỗi đọc dữ liệu: ${errText(e)}`, true); return; }
    try {
      rows = snap.rows || [];
      syncCards(); updateCards(); renderDetail();
      // P2: nhãn chỉ đổi theo mode ĐÃ áp dụng. plannedGreen.source do controller tính bằng
      // curMode; getMode() có thể đang pending nên không dùng để đổi nhãn.
      const applied = rows.find(r => r.plannedGreen?.source)?.plannedGreen?.source;
      if (applied) modeEl.textContent = applied === 'fixed' ? 'Đèn cố định' : 'Đèn tự động';
      setStatus('', false);
    } catch (e) { setStatus(`Lỗi hiển thị: ${errText(e)}`, true); }
  }

  focusBtn.addEventListener('click', () => {
    const row = rows.find(r => r.id === selected);
    if (!row) { setStatus('Lỗi điều hướng: chưa có giao lộ', true); return; }
    invoke(() => onFocus(row.id), 'Lỗi điều hướng');
  });
  boxesEl.addEventListener('change', () => invoke(() => onBoxes(boxesEl.checked), 'Lỗi khung bao xe'));

  // Làm mới ngay khi tab/panel được mở bằng bất kỳ đường nào (bấm tab, bấm ghim, đổi class).
  let intersection = null;
  if (typeof IntersectionObserver === 'function') {
    try {
      intersection = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) refreshOnShow();
        else wasHidden = isHiddenNow();
      });
      intersection.observe(root);
    } catch { intersection = null; }
  }
  let attrObserver = null;
  if (typeof MutationObserver === 'function') {
    try {
      attrObserver = new MutationObserver(refreshOnShow);
      const hud = root.closest('#smartHud32');
      if (hud) attrObserver.observe(hud, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
      const tabPanel = root.closest('[role="tabpanel"]');
      if (tabPanel) attrObserver.observe(tabPanel, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    } catch { attrObserver = null; }
  }
  const onDocumentClick = () => {
    if (typeof setTimeout === 'function') setTimeout(refreshOnShow, 0);
    else refreshOnShow();
  };
  const onVisibilityChange = () => refreshOnShow();
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  tick();
  const timer = setInterval(tick, 2000);
  return {
    refresh: tick,
    snapshot: readSnapshot,
    select(id) { selected = id; syncSelection(); tick(true); },
    get selected() { return selected; },
    dispose() {
      clearInterval(timer);
      intersection?.disconnect();
      attrObserver?.disconnect();
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('click', onDocumentClick, true);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      root.remove();
    }
  };
}
