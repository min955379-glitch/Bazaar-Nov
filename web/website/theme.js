(() => {
  const root = document.documentElement;
  let choice = 'dark';
  try { const saved = localStorage.getItem('bazaar-store-theme'); if (saved === 'light' || saved === 'dark') choice = saved; } catch (_) {}
  root.dataset.theme = choice;
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    const update = () => { button.textContent = choice === 'dark' ? '☀' : '☾'; button.setAttribute('aria-label', choice === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); };
    button.addEventListener('click', () => {
      choice = choice === 'dark' ? 'light' : 'dark'; root.dataset.theme = choice;
      try { localStorage.setItem('bazaar-store-theme', choice); } catch (_) {}
      update();
    });
    update();
  });
})();
