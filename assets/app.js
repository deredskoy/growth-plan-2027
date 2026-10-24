(function () {
  'use strict';

  var grid = document.querySelector('[data-hours-grid]');
  var groups = document.querySelectorAll('[data-hours-key]');
  if (!grid || !groups.length) return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var frag = document.createDocumentFragment();
  var n = 0;

  groups.forEach(function (g) {
    var key = g.getAttribute('data-hours-key');
    var hours = parseInt(g.getAttribute('data-hours'), 10) || 0;
    for (var i = 0; i < hours; i++, n++) {
      var cell = document.createElement('i');
      cell.className = 'cell cell-' + key;
      if (!calm) cell.style.animationDelay = n * 9 + 'ms';
      frag.appendChild(cell);
    }
  });
  grid.appendChild(frag);

  function activate(key) {
    grid.setAttribute('data-active', key);
  }

  groups.forEach(function (g) {
    var key = g.getAttribute('data-hours-key');
    g.addEventListener('mouseenter', function () { activate(key); });
    g.addEventListener('mouseleave', function () { activate(''); });
    g.addEventListener('focusin', function () { activate(key); });
    g.addEventListener('focusout', function () { activate(''); });
  });
})();
