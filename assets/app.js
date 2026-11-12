(function () {
  'use strict';

  // Native details keep the brief usable without JavaScript.
  // Direct links reveal the target idea, including on back/forward navigation.
  function revealHash() {
    var id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch (_) {
      return;
    }
    var target = document.getElementById(id);
    if (!target) return;
    var details = target.closest('details');
    if (details) {
      while (details) {
        details.open = true;
        details = details.parentElement && details.parentElement.closest('details');
      }
      requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); });
    }
  }

  window.addEventListener('hashchange', revealHash);
  revealHash();
})();
