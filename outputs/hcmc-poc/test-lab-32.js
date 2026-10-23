// test-lab-32.js — Bảng điều khiển #smartHud32 chia hai tab: "Vận hành" (toàn bộ panel hiện có)
// và "Thử nghiệm" (kịch bản + khu thử NPC).
//   - Dời node DOM sẵn có vào tab tương ứng (giữ nguyên node, không tạo lại → listener cũ vẫn chạy).
//   - Kịch bản (.scn-sec32) nằm ở tab "Thử nghiệm"; các panel khác ở tab "Vận hành".
//   - Khu thử NPC: chọn số xe thêm (1/10/50), nút "Thêm NPC" / "Dọn NPC thử", đếm số xe đang chạy.
//   - NPC là phương tiện ảo trong bản đồ điều khiển (tương ứng xe chạy trong bản đồ), không phải người thật;
//     tối đa 200 xe thử cùng lúc; các vi phạm đã lưu không bị ảnh hưởng khi thêm/dọn NPC thử.
// Không phụ thuộc thư viện ngoài. Chạy được trong trình duyệt và trong test Node (DOM giả).

export const TEST_LAB_32_VERSION = 'test-lab-32a';
export const TEST_LAB_CSS_ID_32 = 'testLabCss32';
export const NPC_CHOICES_32 = Object.freeze([1, 10, 50]);   // số xe thử chọn được mỗi lần bấm
export const NPC_MAX_EXTRA_32 = 200;                       // trần xe thử được thêm cùng lúc

export const TEST_LAB_TABS_32 = Object.freeze([
  Object.freeze({ key: 'op', label: 'Vận hành' }),
  Object.freeze({ key: 'signals', label: 'Đèn & dự báo' }),
  Object.freeze({ key: 'test', label: 'Thử & spawn' })
]);

// ---- CSS cục bộ: tối gọn, nền tối, không vỡ trên màn hình hẹp ----
export const TEST_LAB_CSS_32 = `
.tl-root32{display:flex;flex-direction:column;gap:8px;min-width:0}
.tl-tabs32{position:sticky;top:0;z-index:2;display:flex;gap:5px;margin:0 0 8px;padding:6px 0;background:#193238;border-radius:10px}
.tl-tab32{flex:1 1 0;min-width:0;max-width:100%;padding:8px 4px;border-radius:10px;border:1px solid rgba(137,216,223,.35);background:rgba(3,17,21,.32);color:inherit;font:inherit;font-size:11px;line-height:1.25;cursor:pointer;-webkit-appearance:none;appearance:none}
.tl-tab32[aria-selected="true"]{background:rgba(64,190,160,.45);border-color:rgba(64,190,160,.85);font-weight:700}
.tl-tab32:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
.tl-panel32{min-width:0}
.tl-panel32:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
.tl-lab32{margin:12px 0 0;padding:10px 11px;border:1px solid rgba(137,216,223,.25);border-radius:14px;background:rgba(3,17,21,.22)}
.tl-lab32 h3{margin:0 0 6px;font-size:12px;font-weight:700}
.tl-note32{margin:0 0 8px;font-size:11px;line-height:1.45;opacity:.85}
.tl-row32{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 8px;font-size:11px}
.tl-label32{flex:none}
.tl-select32{font:inherit;font-size:11px;border-radius:9px;padding:4px 6px;background:rgba(3,17,41,.45);color:inherit;border:1px solid rgba(137,216,223,.35);max-width:100%}
.tl-btn32{flex:1 1 120px;min-width:104px;max-width:100%;padding:8px 9px;border-radius:11px;border:1px solid rgba(137,216,223,.35);background:rgba(3,17,21,.32);color:inherit;font:inherit;font-size:11px;cursor:pointer}
.tl-btn32:hover{background:rgba(64,190,160,.24)}
.tl-btn32:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
.tl-count32{margin:0 0 6px;font-size:11px}
.tl-status32{margin:0;font-size:11px;line-height:1.4;min-height:1.4em;opacity:.95}
.tl-root32 [hidden]{display:none!important}
@media (max-width:520px){
  .tl-root32{gap:6px}
  .tl-tab32{flex:1 1 0;min-width:0}
  .tl-btn32{flex:1 1 100%;min-width:0}
  .tl-row32{gap:6px}
}
`;

let instanceSeq32 = 0;

function appendNode32(parent, node) {
  if (!parent || !node) return false;
  if (typeof parent.appendChild === 'function') { parent.appendChild(node); return true; }
  if (typeof parent.append === 'function') { parent.append(node); return true; }
  return false;
}

function removeNode32(node) {
  if (!node) return;
  if (typeof node.remove === 'function') { node.remove(); return; }
  if (node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

// Số nguyên hoặc null khi không đọc được (null ≠ 0 để không báo nhầm "tổng 0 xe").
const intOf32 = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// Thông báo lỗi: luôn đưa qua textContent (không dựng HTML) và cắt ngắn cho gọn.
const errText32 = e => {
  const raw = e && e.message ? String(e.message) : String(e == null ? 'lỗi không rõ' : e);
  return raw.length > 160 ? raw.slice(0, 157) + '…' : raw;
};

/**
 * Gắn tab "Vận hành / Thử nghiệm" vào bảng #smartHud32.
 * @param {Element} host phần tử #smartHud32 (đã có sẵn)
 * @param {{spawnNpc?:Function, clearNpcs?:Function, npcCount?:Function}} deps
 * @returns {{dispose:Function}}
 */
export function mountTestLab32(host, { spawnNpc = null, clearNpcs = null, npcCount = null } = {}) {
  const noop = { dispose() {} };
  if (!host) return noop;
  const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return noop;

  const uid = `tl${++instanceSeq32}`;
  const ids = {
    opTab: `${uid}TabOp32`,
    opPanel: `${uid}PanelOp32`,
    testTab: `${uid}TabTest32`,
    testPanel: `${uid}PanelTest32`,
    select: `${uid}NpcCount32`
  };

  // 1) Ghi nhớ node gốc của host TRƯỚC khi dời để dispose trả lại đúng thứ tự cũ.
  const originalNodes = host.childNodes ? Array.from(host.childNodes) : [];

  // 2) CSS cục bộ (chỉ tạo 1 lần; nếu đã có thì không nhân bản).
  let style = null;
  let styleCreated = false;
  if (!doc.getElementById || !doc.getElementById(TEST_LAB_CSS_ID_32)) {
    style = doc.createElement('style');
    style.id = TEST_LAB_CSS_ID_32;
    style.textContent = TEST_LAB_CSS_32;
    const head = doc.head || (doc.getElementsByTagName ? doc.getElementsByTagName('head')[0] : null) || doc.documentElement;
    if (head) { appendNode32(head, style); styleCreated = true; }
  }

  // 3) Khung tab + 2 tabpanel.
  const root = doc.createElement('div');
  root.className = 'tl-root32';

  const tablist = doc.createElement('div');
  tablist.className = 'tl-tabs32';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Chuyển giữa bảng vận hành và bảng thử nghiệm');

  const tabs = [];
  const panels = {};
  for (const def of TEST_LAB_TABS_32) {
    const tabId = `${uid}Tab${def.key}32`;
    const panelId = `${uid}Panel${def.key}32`;

    const tab = doc.createElement('button');
    tab.type = 'button';
    tab.className = 'tl-tab32';
    tab.id = tabId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    tab.setAttribute('aria-selected', 'false');
    tab.textContent = def.label;
    tab.tabIndex = -1;
    appendNode32(tablist, tab);
    tabs.push({ def, tab });

    const panel = doc.createElement('div');
    panel.className = 'tl-panel32';
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    panel.tabIndex = 0;
    panel.hidden = true;
    panels[def.key] = panel;
  }

  // 4) Dời panel cũ: kịch bản sang tab "Thử nghiệm", phần còn lại sang tab "Vận hành".
  const scenario = typeof host.querySelector === 'function' ? host.querySelector('.scn-sec32') : null;
  const signals=host.querySelector('.si32');
  for (const node of originalNodes) {
    if (node === scenario || node===signals) continue;
    appendNode32(panels.op, node);
  }
  if (scenario) appendNode32(panels.test, scenario);
  if(signals) appendNode32(panels.signals,signals);

  // 5) Khu thử NPC (chỉ trong tab "Thử nghiệm").
  const lab = doc.createElement('section');
  lab.className = 'tl-lab32';
  lab.setAttribute('aria-label', 'Thử nghiệm và thêm xe');

  const heading = doc.createElement('h3');
  heading.textContent = 'Thêm xe / NPC để thử';

  const note = doc.createElement('p');
  note.className = 'tl-note32';
  note.textContent = `Thêm ô tô và xe máy vào chỗ trống an toàn, tối đa ${NPC_MAX_EXTRA_32} xe thử. `
    + `Nếu đã đầy, giảm mật độ trong tab Vận hành rồi thử lại. Dọn NPC không xóa vi phạm đã lưu. `
    + `Bật “Khung bao xe” ở tab Đèn & dự báo để nhìn khung từng xe. `
    + `Xe cứu thương dùng mục Kịch bản bên dưới; phần này đang ở mức thử, chưa mở rộng thêm.`;

  const count = doc.createElement('p');
  count.className = 'tl-count32';

  const row = doc.createElement('div');
  row.className = 'tl-row32';
  const label = doc.createElement('label');
  label.className = 'tl-label32';
  label.setAttribute('for', ids.select);
  label.textContent = 'Số NPC thêm';
  const select = doc.createElement('select');
  select.id = ids.select;
  select.className = 'tl-select32';
  select.setAttribute('aria-label', 'Số NPC thêm');
  for (const n of NPC_CHOICES_32) {
    const opt = doc.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    if (n === NPC_CHOICES_32[0]) opt.selected = true;
    appendNode32(select, opt);
  }
  appendNode32(row, label);
  appendNode32(row, select);

  const addBtn = doc.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tl-btn32';
  addBtn.textContent = 'Thêm NPC';

  const clearBtn = doc.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'tl-btn32';
  clearBtn.textContent = 'Dọn NPC thử';

  const status = doc.createElement('p');
  status.className = 'tl-status32';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.textContent = 'Chưa thực hiện thao tác thử nghiệm nào.';

  appendNode32(lab, heading);
  appendNode32(lab, note);
  appendNode32(lab, count);
  appendNode32(lab, row);
  appendNode32(lab, addBtn);
  appendNode32(lab, clearBtn);
  appendNode32(lab, status);
  // Đặt phần thêm xe lên trước Kịch bản để mở tab là thấy ngay.
  if (scenario && typeof panels.test.insertBefore === 'function') panels.test.insertBefore(lab, scenario);
  else appendNode32(panels.test, lab);

  // 6) Chọn tab (roving tabindex + aria-selected + hidden).
  const selectTab = (key, { focus = false } = {}) => {
    for (const { def, tab } of tabs) {
      const on = def.key === key;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[def.key].hidden = !on;
      if (on && focus && typeof tab.focus === 'function') tab.focus();
    }
  };

  const onTabClick = e => {
    const btn = e && e.currentTarget ? e.currentTarget : null;
    if (!btn) return;
    const hit = tabs.find(t => t.tab === btn);
    if (hit) selectTab(hit.def.key);
  };

  const onTabKey = e => {
    const btn = e && e.currentTarget ? e.currentTarget : null;
    const idx = tabs.findIndex(t => t.tab === btn);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    selectTab(tabs[next].def.key, { focus: true });
  };

  for (const { tab } of tabs) {
    if (typeof tab.addEventListener === 'function') {
      tab.addEventListener('click', onTabClick);
      tab.addEventListener('keydown', onTabKey);
    }
  }
  selectTab(TEST_LAB_TABS_32[0].key);

  // 7) Hàm đọc số xe + ghi trạng thái.
  const readCount = () => {
    if (typeof npcCount !== 'function') return null;
    try { return intOf32(npcCount()); } catch { return null; }
  };
  const setStatus = text => { status.textContent = String(text == null ? '' : text); };
  const refreshCount = () => {
    const n = readCount();
    count.textContent = n === null ? 'Số NPC thử: không đọc được' : `Số NPC thử: ${n} xe`;
    return n;
  };

  const wanted = () => {
    const n = intOf32(select.value);
    return NPC_CHOICES_32.indexOf(n) >= 0 ? n : NPC_CHOICES_32[0];
  };

  // Thêm NPC: báo đúng số thực tế thêm được (có thể thiếu chỗ trống an toàn).
  const onAdd = () => {
    if (typeof spawnNpc !== 'function') { setStatus('Chưa có hàm thêm NPC trong phiên này.'); return; }
    const want = wanted();
    const before = readCount();
    let res = null;
    try {
      res = spawnNpc(want);
    } catch (e) {
      setStatus(`Không thêm được NPC: ${errText32(e)}`);
      refreshCount();
      return;
    }
    const after = readCount();
    const resAdded = intOf32(res && res.added);
    const resTotal = intOf32(res && res.total);
    const added = resAdded !== null
      ? resAdded
      : (after !== null && before !== null ? Math.max(0, after - before) : 0);
    const total = resTotal !== null ? resTotal : after;
    refreshCount();
    const tail = total === null ? '' : ` Tổng NPC thử: ${total}.`;
    if (added <= 0) setStatus(`Không thêm được NPC: đã đủ 200 xe thử hoặc không còn chỗ trống an toàn (yêu cầu ${want} xe).${tail}`);
    else if (added < want) setStatus(`Chỉ thêm được ${added}/${want} NPC: có thể không còn đủ chỗ trống an toàn.${tail}`);
    else setStatus(`Đã thêm ${added} NPC.${tail}`);
  };

  // Dọn NPC thử.
  const onClear = () => {
    if (typeof clearNpcs !== 'function') { setStatus('Chưa có hàm dọn NPC trong phiên này.'); return; }
    const before = readCount();
    let res = null;
    try {
      res = clearNpcs();
    } catch (e) {
      setStatus(`Không dọn được NPC: ${errText32(e)}`);
      refreshCount();
      return;
    }
    const after = readCount();
    const resRemoved = intOf32(res && res.removed);
    const resTotal = intOf32(res && res.total);
    const removed = resRemoved !== null
      ? resRemoved
      : (after !== null && before !== null ? Math.max(0, before - after) : 0);
    const total = resTotal !== null ? resTotal : after;
    refreshCount();
    const tail = total === null ? '' : ` Còn ${total} NPC thử${total>0?' (giữ xe khẩn cấp đang chạy)':''}.`;
    if (removed > 0) setStatus(`Đã dọn ${removed} NPC thử.${tail}`);
    else setStatus(`Không có NPC thử nào để dọn.${tail}`);
  };

  if (typeof addBtn.addEventListener === 'function') addBtn.addEventListener('click', onAdd);
  if (typeof clearBtn.addEventListener === 'function') clearBtn.addEventListener('click', onClear);
  refreshCount();
  const countTimer=setInterval(refreshCount,1000);

  // 8) Đưa khung tab vào host.
  appendNode32(root, tablist);
  for(const {key} of TEST_LAB_TABS_32) appendNode32(root,panels[key]);
  appendNode32(host, root);

  return {
    dispose() {
      clearInterval(countTimer);
      for (const { tab } of tabs) {
        if (typeof tab.removeEventListener === 'function') {
          tab.removeEventListener('click', onTabClick);
          tab.removeEventListener('keydown', onTabKey);
        }
      }
      if (typeof addBtn.removeEventListener === 'function') addBtn.removeEventListener('click', onAdd);
      if (typeof clearBtn.removeEventListener === 'function') clearBtn.removeEventListener('click', onClear);
      removeNode32(root);                 // chỉ gỡ UI do module này tạo
      for (const node of originalNodes) appendNode32(host, node);   // trả node gốc về đúng thứ tự cũ
      if (styleCreated) removeNode32(style);
    }
  };
}

export default mountTestLab32;
