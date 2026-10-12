/*
 * City Mode 31 · bước I kế hoạch 31A — "Chế độ Preview / Lite".
 *
 * `mode` là lớp trên cùng, gói sẵn các thiết lập:
 *   - preview = trải nghiệm hiện tại y nguyên (mặc định): chất lượng, mật độ, texture, UI như bây giờ.
 *   - lite = cho máy yếu: mật độ `light` (signature registry vẫn 100 %), texture thu nhỏ một nửa mỗi
 *     cạnh (pixel × 1/4), anisotropy thấp, tắt mipmap ở texture lite, hồ sơ chất lượng `performance`,
 *     UI gọn (ẩn bảng phụ nặng, giữ điều hướng data-view, ánh sáng, mật độ, khu mô phỏng, chế độ,
 *     chọn công trình, Flood Lab mở được).
 *
 * Người dùng vẫn chỉnh tay mật độ/khu/chất lượng sau khi chọn mode; lựa chọn tay được giữ
 * (localStorage/URL) và không bị mode ghi đè cho tới khi đổi mode. Đổi mode cần dựng lại pipeline
 * chất lượng nên tải lại trang có giữ trạng thái (view, light, region) và có thông báo rõ.
 * Không có ngẫu nhiên: mọi preset là hằng xác định.
 */

export const CITY_MODE_31_VERSION = 'mode-31i';
export const MODE_URL_PARAM = 'mode';
export const MODE_STORAGE_KEY = 'citylab.31i.mode';
export const DENSITY_STORAGE_KEY = 'citylab.31e.density';

export const MODES_31 = Object.freeze([
  Object.freeze({
    id: 'preview', label: 'Preview', hint: 'Preview · chất lượng đầy đủ',
    about: 'Trải nghiệm hiện tại y nguyên.',
    density: 'full', quality: 'presentation', textureScale: 1, uiCompact: false
  }),
  Object.freeze({
    id: 'lite', label: 'Lite', hint: 'Lite · máy yếu',
    about: 'Máy yếu: bớt nhà không cần (giữ signature), texture nhỏ, UI gọn.',
    density: 'light', quality: 'performance', textureScale: 0.5, uiCompact: true
  })
]);

const byId = new Map(MODES_31.map(mode => [mode.id, mode]));

// Giá trị URL/localStorage → id hợp lệ ('preview' | 'lite'); giá trị lạ trả về null.
export const normalizeModeId = value => (value === 'preview' || byId.has(value)) ? value : null;
export const modeById = id => byId.get(id) || null;
export const modeIds = () => MODES_31.map(mode => mode.id);

// URL (&mode=) > localStorage > mặc định preview. Trả {id, source}.
export function resolveMode(params = new URLSearchParams(location.search), storage = globalThis.localStorage) {
  let fromUrl = null, fromStorage = null;
  try { fromUrl = normalizeModeId(params.get(MODE_URL_PARAM)); } catch { fromUrl = null; }
  try { fromStorage = normalizeModeId(storage?.getItem(MODE_STORAGE_KEY)); } catch { fromStorage = null; }
  if (fromUrl) return { id: fromUrl, source: 'url' };
  if (fromStorage) return { id: fromStorage, source: 'storage' };
  return { id: 'preview', source: 'default' };
}

// URL texture theo mode. Bản lite là bản thu nhỏ một nửa mỗi cạnh bằng Pillow
// (xem README "Bước I 31A"); facade của công trình signature không mất, chỉ giảm độ phân giải.
export function textureUrlsForMode(modeId) {
  if (modeId === 'lite') {
    return Object.freeze({
      sentinel: 'data/sentinel-2016-lite.jpg',
      atlas: 'assets/facades15/facade-atlas-lite.jpg',
      mask: 'assets/facades15/facade-mask-lite.png'
    });
  }
  return Object.freeze({
    sentinel: 'data/sentinel-2016.jpg',
    atlas: 'assets/facades15/facade-atlas.jpg',
    mask: 'assets/facades15/facade-mask.png'
  });
}

// Anisotropy theo mode (giữ chi tiết ở preview, tiết kiệm ở lite).
export function anisotropyForMode(modeId, max) {
  const cap = Math.max(1, Math.floor(Number(max) || 1));
  return modeId === 'lite' ? Math.min(2, cap) : Math.min(8, cap);
}

// Bộ điều phối chế độ + UI radiogroup. onChoose(id) do app quyết định (mặc định: lưu, giữ trạng thái, tải lại).
export function createModeController({
  root = null, params = new URLSearchParams(location.search), storage = globalThis.localStorage,
  initial = null, onChoose = null
} = {}) {
  const resolved = initial || resolveMode(params, storage);
  let current = modeById(resolved.id) ? resolved.id : 'preview';
  let source = modeById(resolved.id) ? resolved.source : 'default';
  const buttons = root ? [...root.querySelectorAll('[data-mode]')] : [];

  function renderUi() {
    for (const button of buttons) {
      const on = button.dataset.mode === current;
      button.classList.toggle('active', on);
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    }
  }

  function choose(id, from = 'user') {
    if (!modeById(id)) return false;
    if (id === current) { renderUi(); return true; }   // đang ở mode này: không tải lại
    current = id;
    source = from;
    try { storage?.setItem(MODE_STORAGE_KEY, id); } catch { /* bỏ qua */ }
    renderUi();
    onChoose?.({ id, mode: modeById(id), from });
    return true;
  }

  for (const button of buttons) button.addEventListener('click', () => choose(button.dataset.mode, 'user'));
  root?.addEventListener('keydown', event => {
    const index = buttons.findIndex(button => button.dataset.mode === current);
    if (index < 0) return;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = buttons[(next + buttons.length) % buttons.length];
    choose(target.dataset.mode, 'user');
    target.focus();
  });

  renderUi();
  return {
    get id() { return current; },
    get source() { return source; },
    get mode() { return modeById(current); },
    choose,
    renderUi
  };
}
