// Dark mode
(function() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

document.addEventListener('DOMContentLoaded', function() {
  // Theme toggle
  const btn = document.getElementById('theme-btn');
  if (btn) {
    function updateIcon() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.innerHTML = isDark ? '&#9728;' : '&#9790;';
      btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }
    updateIcon();
    btn.addEventListener('click', function() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
      updateIcon();
    });
  }

  // Mobile hamburger
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  function openMenu() {
    sidebar && sidebar.classList.add('open');
    overlay && overlay.classList.add('open');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    sidebar && sidebar.classList.remove('open');
    overlay && overlay.classList.remove('open');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger && hamburger.addEventListener('click', function() {
    sidebar && sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay && overlay.addEventListener('click', closeMenu);

  // Mark active nav link
  const links = document.querySelectorAll('.sidebar nav a');
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  links.forEach(function(link) {
    const href = link.getAttribute('href');
    if (!href) return;
    try {
      const linkPath = new URL(href, window.location.href).pathname.replace(/\/$/, '') || '/';
      if (linkPath === path) link.classList.add('active');
    } catch(e) {}
  });
});
