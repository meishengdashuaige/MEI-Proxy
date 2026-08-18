/**
 * MEIProxy - Theme Manager
 * Supports 'auto' (follow system prefers-color-scheme), 'light', and 'dark'
 */

let mediaQueryListener = null;

export function applyTheme(theme = 'auto') {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  if (mediaQueryListener) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.removeEventListener('change', mediaQueryListener);
    mediaQueryListener = null;
  }

  if (theme === 'auto') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const updateAutoTheme = (e) => {
      root.setAttribute('data-actual-theme', e.matches ? 'dark' : 'light');
    };
    updateAutoTheme(mq);
    mediaQueryListener = updateAutoTheme;
    mq.addEventListener('change', mediaQueryListener);
  } else {
    root.setAttribute('data-actual-theme', theme);
  }
}
