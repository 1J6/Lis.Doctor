(function() {
  var s = localStorage.getItem('theme');
  if (s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

document.addEventListener('DOMContentLoaded', function() {
  // Pill toggle
  var pill = document.getElementById('theme-pill');
  function updatePill() {
    if (!pill) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    pill.querySelectorAll('.pill-option').forEach(function(o) {
      o.classList.toggle('active', o.getAttribute('data-mode') === (dark ? 'dark' : 'light'));
    });
  }
  updatePill();
  if (pill) {
    pill.addEventListener('click', function(e) {
      var opt = e.target.closest('.pill-option');
      if (!opt) return;
      var mode = opt.getAttribute('data-mode');
      document.documentElement.setAttribute('data-theme', mode);
      localStorage.setItem('theme', mode);
      updatePill();
    });
  }

  // Hamburger
  var ham = document.getElementById('hamburger');
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  function open()  { sidebar && sidebar.classList.add('open'); overlay && overlay.classList.add('open'); }
  function close() { sidebar && sidebar.classList.remove('open'); overlay && overlay.classList.remove('open'); }
  ham && ham.addEventListener('click', function() { sidebar.classList.contains('open') ? close() : open(); });
  overlay && overlay.addEventListener('click', close);

  // Active link
  var path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.sidebar nav a').forEach(function(a) {
    try {
      var lp = new URL(a.href).pathname.replace(/\/$/, '') || '/';
      if (lp === path) a.classList.add('active');
    } catch(e) {}
  });
});
