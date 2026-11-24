// Load before styles to apply a saved choice without a theme flash.
(() => {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('bazaar-admin-theme'); } catch (_) {}
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const update = () => {
      button.textContent = isDark() ? '☀' : '☾';
      button.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
    };
    button.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem('bazaar-admin-theme', root.dataset.theme); } catch (_) {}
      update();
    });
    const media = matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) media.addEventListener('change', update);
    update();
  });
})();
