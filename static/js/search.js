(function() {
  const overlay = document.getElementById('search-overlay');
  const container = document.getElementById('search-container');
  const closeBtn = overlay.querySelector('.search-close');
  let pagefindUI = null;

  function openSearch() {
    // Close mobile nav if open
    const nav = document.querySelector('.site-nav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      document.body.classList.remove('nav-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Initialize Pagefind on first open
    if (!pagefindUI && typeof PagefindUI !== 'undefined') {
      pagefindUI = new PagefindUI({
        element: '#search-container',
        showSubResults: true,
        showImages: false,
        autofocus: true
      });
    }

    // Focus the input
    setTimeout(function() {
      const input = container.querySelector('input');
      if (input) input.focus();
    }, 100);
  }

  function closeSearch() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Trigger button
  document.addEventListener('click', function(e) {
    if (e.target.closest('.search-trigger')) {
      e.preventDefault();
      openSearch();
    }
  });

  // Close button
  closeBtn.addEventListener('click', closeSearch);

  // Click outside to close
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeSearch();
  });

  // Keyboard navigation
  let selectedIndex = -1;
  let observer = null;

  function getResults() {
    return container.querySelectorAll('.pagefind-ui__result');
  }

  function updateSelection(newIndex) {
    const results = getResults();
    if (results.length === 0) return;

    // Clear previous selection
    results.forEach(function(r) { r.classList.remove('is-selected'); });
    selectedIndex = -1;

    // Set new selection
    if (newIndex >= 0 && newIndex < results.length) {
      selectedIndex = newIndex;
      results[selectedIndex].classList.add('is-selected');
      results[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function navigateToSelected() {
    const results = getResults();
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      const link = results[selectedIndex].querySelector('.pagefind-ui__result-link');
      if (link) link.click();
    }
  }

  document.addEventListener('keydown', function(e) {
    // Open with /
    if (e.key === '/' && !overlay.classList.contains('is-open')) {
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
      if (!isInput) {
        e.preventDefault();
        openSearch();
      }
    }
    // Close with Escape
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeSearch();
    }

    // Arrow navigation when overlay is open
    if (overlay.classList.contains('is-open')) {
      const results = getResults();
      if (results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = selectedIndex < results.length - 1 ? selectedIndex + 1 : 0;
        updateSelection(newIndex);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = selectedIndex > 0 ? selectedIndex - 1 : results.length - 1;
        updateSelection(newIndex);
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        navigateToSelected();
      }
    }
  });

  // Reset selection when results change, with cleanup
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function() {
      selectedIndex = -1;
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // Start observer when search opens, stop when it closes
  const originalOpen = openSearch;
  openSearch = function() {
    originalOpen();
    startObserver();
  };

  const originalClose = closeSearch;
  closeSearch = function() {
    originalClose();
    stopObserver();
    selectedIndex = -1;
  };
})();
