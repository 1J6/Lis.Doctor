// Apply theme immediately before paint (also inlined in each page head)
(function() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

document.addEventListener('DOMContentLoaded', function() {

  // --- Pill toggle ---
  const pill = document.getElementById('theme-pill');
  if (pill) {
    function updatePill() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const lightOpt = pill.querySelector('[data-mode="light"]');
      const darkOpt  = pill.querySelector('[data-mode="dark"]');
      if (lightOpt) lightOpt.classList.toggle('active', !isDark);
      if (darkOpt)  darkOpt.classList.toggle('active', isDark);
    }
    updatePill();
    pill.addEventListener('click', function(e) {
      const opt = e.target.closest('[data-mode]');
      if (!opt) return;
      const mode = opt.getAttribute('data-mode');
      document.documentElement.setAttribute('data-theme', mode);
      localStorage.setItem('theme', mode);
      updatePill();
    });
  }

  // --- Mobile hamburger ---
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.querySelector('.sidebar');
  const overlay   = document.getElementById('sidebar-overlay');

  function openMenu()  {
    sidebar  && sidebar.classList.add('open');
    overlay  && overlay.classList.add('open');
    hamburger && hamburger.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    sidebar  && sidebar.classList.remove('open');
    overlay  && overlay.classList.remove('open');
    hamburger && hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger && hamburger.addEventListener('click', function() {
    sidebar && sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay && overlay.addEventListener('click', closeMenu);

  // --- Active nav link ---
  const links = document.querySelectorAll('.sidebar nav a');
  const path  = window.location.pathname.replace(/\/$/, '') || '/';
  links.forEach(function(link) {
    const href = link.getAttribute('href');
    if (!href) return;
    try {
      const linkPath = new URL(href, window.location.href).pathname.replace(/\/$/, '') || '/';
      if (linkPath === path) link.classList.add('active');
    } catch(e) {}
  });

});
