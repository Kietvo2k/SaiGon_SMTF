import './theme.css';

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'smtf-theme';
const EVENT = 'smtf-theme-change';

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* chế độ riêng tư: vẫn đổi trong phiên */ }
  }
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
}

export function toggleTheme() {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

function label(theme: Theme) {
  return theme === 'light' ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng';
}

function syncButton(button: HTMLElement, theme: Theme) {
  button.dataset.themeState = theme;
  button.setAttribute('aria-label', label(theme));
  button.setAttribute('title', label(theme));
}

let storageBound = false;

export function initTheme() {
  const root = document.documentElement;
  if (root.dataset.theme !== 'light' && root.dataset.theme !== 'dark') {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch { /* bỏ qua */ }
    root.dataset.theme = stored === 'light' ? 'light' : 'dark';
  }

  for (const button of document.querySelectorAll<HTMLElement>('[data-theme-toggle]')) {
    if (button.dataset.themeBound === '1') continue;
    button.dataset.themeBound = '1';
    syncButton(button, currentTheme());
    button.addEventListener('click', toggleTheme);
    window.addEventListener(EVENT, () => syncButton(button, currentTheme()));
  }

  if (!storageBound) {
    storageBound = true;
    window.addEventListener('storage', event => {
      if (event.key !== THEME_KEY) return;
      const next: Theme = event.newValue === 'light' ? 'light' : 'dark';
      if (next !== currentTheme()) applyTheme(next, false);
    });
  }
}
