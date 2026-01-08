(function() {
  const overlay = document.getElementById('search-overlay');
  const container = document.getElementById('search-container');
  
  // Guard against missing elements
  if (!overlay || !container) {
    console.warn('Search: Required elements not found');
    return;
  }
  
  const closeBtn = overlay.querySelector('.search-close');
  if (!closeBtn) {
    console.warn('Search: Close button not found');
    return;
  }

  // State object instead of loose variables
  const state = {
    isOpen: false,
    selectedIndex: -1,
    observer: null,
    pagefindUI: null
  };

  // Close mobile nav if open
  function closeMobileNav() {
    const nav = document.querySelector('.site-nav');
    const toggle = document.querySelector('.nav-toggle');
    if (nav && nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      document.body.classList.remove('nav-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  }

  // Initialize Pagefind UI lazily
  function initPagefind() {
    if (!state.pagefindUI && typeof PagefindUI !== 'undefined') {
      state.pagefindUI = new PagefindUI({
        element: '#search-container',
        showSubResults: true,
        showImages: false,
        autofocus: true
      });
    }
  }

  // Focus the search input
  function focusInput() {
    setTimeout(function() {
      const input = container.querySelector('input');
      if (input) input.focus();
    }, 100);
  }

  // Start observing for result changes
  function startObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver(function() {
      state.selectedIndex = -1;
    });
    state.observer.observe(container, { childList: true, subtree: true });
  }

  // Stop observing
  function stopObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }

  function openSearch() {
    if (state.isOpen) return;
    
    closeMobileNav();
    
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    state.isOpen = true;

    initPagefind();
    focusInput();
    startObserver();
  }

  function closeSearch() {
    if (!state.isOpen) return;
    
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.isOpen = false;
    
    stopObserver();
    state.selectedIndex = -1;
  }

  // Get all search results
  function getResults() {
    return container.querySelectorAll('.pagefind-ui__result');
  }

  // Update the selected result
  function updateSelection(newIndex) {
    const results = getResults();
    if (results.length === 0) return;

    // Clear previous selection
    results.forEach(function(r) { r.classList.remove('is-selected'); });
    state.selectedIndex = -1;

    // Set new selection
    if (newIndex >= 0 && newIndex < results.length) {
      state.selectedIndex = newIndex;
      results[state.selectedIndex].classList.add('is-selected');
      results[state.selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Navigate to the selected result
  function navigateToSelected() {
    const results = getResults();
    if (state.selectedIndex >= 0 && state.selectedIndex < results.length) {
      const link = results[state.selectedIndex].querySelector('.pagefind-ui__result-link');
      if (link) link.click();
    }
  }

  // Handle slash key to open search
  function handleSlashKey(e) {
    if (state.isOpen) return;
    
    const activeEl = document.activeElement;
    const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
    if (!isInput) {
      e.preventDefault();
      openSearch();
    }
  }

  // Handle escape key to close search
  function handleEscapeKey() {
    if (state.isOpen) {
      closeSearch();
    }
  }

  // Handle arrow key navigation
  function handleArrowNavigation(e) {
    if (!state.isOpen) return;
    
    const results = getResults();
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = state.selectedIndex < results.length - 1 ? state.selectedIndex + 1 : 0;
      updateSelection(newIndex);
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = state.selectedIndex > 0 ? state.selectedIndex - 1 : results.length - 1;
      updateSelection(newIndex);
    }
  }

  // Handle enter key to navigate
  function handleEnterKey(e) {
    if (state.isOpen && state.selectedIndex >= 0) {
      e.preventDefault();
      navigateToSelected();
    }
  }

  // Event Listeners

  // Trigger button (delegated)
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
  document.addEventListener('keydown', function(e) {
    if (e.key === '/') {
      handleSlashKey(e);
    } else if (e.key === 'Escape') {
      handleEscapeKey();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      handleArrowNavigation(e);
    } else if (e.key === 'Enter') {
      handleEnterKey(e);
    }
  });
})();
