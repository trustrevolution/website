/**
 * Mobile Navigation Toggle
 * Handles hamburger menu open/close with focus trapping
 */
(function() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');

  if (!toggle || !nav) return;

  function closeNav() {
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
    toggle.focus();
  }

  // Toggle menu on button click
  toggle.addEventListener('click', function() {
    const expanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', !expanded);
    nav.classList.toggle('is-open');
    document.body.classList.toggle('nav-open');

    // Focus first nav link when opening
    if (!expanded) {
      var firstLink = nav.querySelector('a');
      if (firstLink) firstLink.focus();
    }
  });

  // Close menu on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      closeNav();
    }

    // Focus trap within open nav
    if (e.key === 'Tab' && nav.classList.contains('is-open')) {
      var focusable = nav.querySelectorAll('a[href], button');
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
})();
