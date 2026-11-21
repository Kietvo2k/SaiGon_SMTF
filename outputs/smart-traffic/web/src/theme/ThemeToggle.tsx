import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, THEME_KEY, type Theme } from './theme';

function label(theme: Theme) {
  return theme === 'light' ? 'Chuyển sang chế độ tối' : 'Chuyển sang chế độ sáng';
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY) return;
      applyTheme(event.newValue === 'light' ? 'light' : 'dark', false);
    };
    window.addEventListener('smtf-theme-change', sync);
    window.addEventListener('storage', onStorage);
    sync();
    return () => {
      window.removeEventListener('smtf-theme-change', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return <button
    type="button"
    className={`theme-toggle ${className}`.trim()}
    data-theme-toggle
    data-theme-state={theme}
    aria-label={label(theme)}
    title={label(theme)}
    onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')}
  >
    <svg className="theme-icon theme-icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
    <svg className="theme-icon theme-icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  </button>;
}
