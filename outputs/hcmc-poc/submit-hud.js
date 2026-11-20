export function mountSubmitHud({ junctions, cameras = [], showOverview, focusJunction, showStandard }) {
  const hud = document.createElement('nav');
  hud.id = 'submit-hud';
  hud.setAttribute('aria-label', 'Điều hướng mô phỏng');
  hud.innerHTML = `
    <a href="/">Về trang chọn demo</a>
    <button type="button" data-overview>Toàn khu</button>
    <button type="button" data-standard>Góc chuẩn</button>
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

  document.documentElement.dataset.submitHud = 'true';
  document.body.append(hud);
  return () => {
    hud.remove();
    delete document.documentElement.dataset.submitHud;
  };
}
