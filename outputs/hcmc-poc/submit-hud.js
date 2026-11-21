export function mountSubmitHud({ junctions, cameras = [], app = null, showOverview, focusJunction, showStandard }) {
  const hud = document.createElement('nav');
  hud.id = 'submit-hud';
  hud.setAttribute('aria-label', 'Điều hướng mô phỏng');
  hud.innerHTML = `
    <a href="/">Về trang chọn demo</a>
    <button type="button" data-overview>Toàn khu</button>
    <button type="button" data-standard>Góc chuẩn</button>
    <button type="button" data-panel aria-controls="smartHud32" aria-expanded="false">Bảng điều khiển</button>
    <details>
      <summary>Chi tiết nút giao</summary>
      <form>
        <label for="submit-junction">Chọn nút giao</label>
        <select id="submit-junction"></select>
        <p data-camera></p>
        <button type="submit">Tới nút giao</button>
      </form>
    </details>
    <output class="submit-hud-status" aria-live="polite"></output>
  `;

  const select = hud.querySelector('select');
  const details = hud.querySelector('details');
  const status = hud.querySelector('output');
  const cameraInfo = hud.querySelector('[data-camera]');
  const rowsById = new Map(junctions.map(row => [row.id, row]));
  select.add(new Option('Chọn nút giao', '', true, true));
  select.options[0].disabled = true;
  for (const row of rowsById.values()) {
    select.add(new Option(`${row.id} · ${row.name ?? row.label}`, row.id));
  }

  const form = hud.querySelector('form');
  const go = form.querySelector('button');
  go.disabled = true;
  select.addEventListener('change', () => {
    const matching = cameras.filter(camera => camera.junctionId === select.value);
    cameraInfo.textContent = matching.map(camera => `${camera.label} · ${camera.cameraId}`).join(' / ');
    go.disabled = !rowsById.has(select.value);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const row = rowsById.get(select.value);
    if (!row) return;
    focusJunction(row);
    details.open = false;
    details.querySelector('summary').focus();
    status.value = `Đang quan sát ${row.name ?? row.label}`;
  });
  hud.querySelector('[data-overview]').addEventListener('click', () => {
    showOverview();
    status.value = 'Đang quan sát toàn khu';
  });
  hud.querySelector('[data-standard]').addEventListener('click', () => {
    showStandard(rowsById.get(select.value));
    status.value = 'Đang quan sát từ góc chuẩn';
  });

  const panel = document.querySelector('#smartHud32');
  const panelButton = hud.querySelector('[data-panel]');
  const panelMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 1100px)') : null;
  // Bản đồ ghim là lớp chính khi mở trạm; bảng điều khiển mở khi người xem bấm ghim
  // hoặc bấm nút, nhờ vậy 5 ghim Hàng Xanh không bị bảng che.
  const applyPanelOpen = open => {
    if (!panel) return;
    const mobile = panelMedia ? panelMedia.matches : window.innerWidth <= 1100;
    panel.classList.toggle('is-closed', !open);
    panel.classList.toggle('is-open', open && mobile);
    panelButton.setAttribute('aria-expanded', String(open));
    panelButton.textContent = open ? 'Ẩn bảng điều khiển' : 'Bảng điều khiển';
  };
  applyPanelOpen(false);
  panelButton.addEventListener('click', () => {
    applyPanelOpen(panelButton.getAttribute('aria-expanded') !== 'true');
  });
  // Đổi breakpoint: giữ nguyên ý định mở/đóng, nhưng đổi đúng class cho desktop/mobile
  // để aria-expanded không lệch với panel đang thực sự thấy.
  const onPanelViewportChange = () => applyPanelOpen(panelButton.getAttribute('aria-expanded') === 'true');
  if (panelMedia) {
    if (panelMedia.addEventListener) panelMedia.addEventListener('change', onPanelViewportChange);
    else panelMedia.addListener?.(onPanelViewportChange);
  } else addEventListener('resize', onPanelViewportChange);

  // Bỏ thanh KPI rời: người xem chỉ cần bản đồ ghim, panel và nav.
  // Mở trạm ở góc nhìn "bản đồ ghim": đủ rộng để thấy 5 cụm đèn Hàng Xanh,
  // nhưng vẫn đọc được tên từng ghim. Bấm ghim sẽ mở thanh tra và bay vào nút giao.
  const hxRows = (app && app.modules && app.modules.signals && Array.isArray(app.modules.signals.layout)
    ? app.modules.signals.layout : []).filter(row => /^HX-/.test(row.id));
  const hxFallback = junctions.filter(row => /^HX-/.test(row.id));
  const pinsStart = hxRows.length ? hxRows : hxFallback;
  const start = pinsStart.length
    ? { ...pinsStart[0], x: pinsStart.reduce((sum, row) => sum + row.x, 0) / pinsStart.length, z: pinsStart.reduce((sum, row) => sum + row.z, 0) / pinsStart.length }
    : junctions[0];
  // Chỉ tự bay về Hàng Xanh khi URL không chỉ định view khác. Nhờ vậy `?view=ctn`
  // (hoặc hx/l81) giữ đúng góc người dùng mở, không bị nhịp 1,2 s ghi đè.
  let urlView = null;
  try { urlView = new URL(location.href).searchParams.get('view'); } catch { /* môi trường không có URL: dùng mặc định */ }
  const autoFocusHx = !urlView || urlView === 'bac';
  let focusTimer = start && autoFocusHx ? setTimeout(() => focusJunction({ ...start, distance: 950, polar: 1.1, az: .6, label: 'Ngã tư Hàng Xanh · 5 nút giao' }), 1200) : 0;
  // Người dùng bấm “Toàn khu”/“Góc chuẩn”/panel trước 1,2 s thì hủy auto-focus,
  // tránh timer kéo camera về Hàng Xanh ngay sau thao tác đầu.
  const cancelAutoFocus = () => { if (focusTimer) { clearTimeout(focusTimer); focusTimer = 0; } };
  addEventListener('pointerdown', cancelAutoFocus, { passive: true, once: true });
  addEventListener('keydown', cancelAutoFocus, { once: true });

  document.documentElement.dataset.submitHud = 'true';
  document.body.append(hud);
  // Panel #smartHud32 đọc biến này (submit-hud.css) để dừng trước nav 8 px.
  // Đo thay vì trừ cứng vì nav xuống dòng khác nhau ở 768/390 và khi chữ đổi.
  let navReserve = 0;
  const syncNavReserve = () => {
    const rect = hud.getBoundingClientRect();
    const bottomInset = parseFloat(getComputedStyle(hud).bottom) || 12;
    const reserve = Math.round(Math.max(1, rect.height) + bottomInset + 8);
    if (reserve === navReserve) return;
    navReserve = reserve;
    document.documentElement.style.setProperty('--submit-hud-reserve', `${reserve}px`);
  };
  syncNavReserve();
  const navObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncNavReserve) : null;
  if (navObserver) navObserver.observe(hud);
  else addEventListener('resize', syncNavReserve);
  return () => {
    clearTimeout(focusTimer);
    removeEventListener('pointerdown', cancelAutoFocus);
    removeEventListener('keydown', cancelAutoFocus);
    if (navObserver) navObserver.disconnect();
    else removeEventListener('resize', syncNavReserve);
    if (panelMedia) {
      if (panelMedia.removeEventListener) panelMedia.removeEventListener('change', onPanelViewportChange);
      else panelMedia.removeListener?.(onPanelViewportChange);
    } else removeEventListener('resize', onPanelViewportChange);
    document.documentElement.style.removeProperty('--submit-hud-reserve');
    hud.remove();
    delete document.documentElement.dataset.submitHud;
  };
}
