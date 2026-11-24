// Load before styles to apply a saved choice without a theme flash.
(() => {
  const root = document.documentElement;
  let saved = 'dark';
  try { saved = localStorage.getItem('bazaar-admin-theme'); } catch (_) {}
  root.dataset.theme = saved === 'light' ? 'light' : 'dark';
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    const isDark = () => root.dataset.theme === 'dark';
    const update = () => {
      button.textContent = isDark() ? '☀' : '☾';
      button.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    };
    button.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem('bazaar-admin-theme', root.dataset.theme); } catch (_) {}
      update();
    });
    update();
  });
})();
