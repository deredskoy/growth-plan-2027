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

  document.querySelectorAll('[data-forecast]').forEach(function (model) {
    var automation = model.querySelector('[data-automation]');
    var review = model.querySelector('[data-review]');
    var ukrainian = model.getAttribute('data-language') === 'uk';

    function updateForecast() {
      var automated = Math.max(0, Math.min(100, Number(automation.value) || 0));
      var reviewPercent = Math.max(0, Math.min(100, Number(review.value) || 0));
      var manual = 100 - automated;
      var reviews = Math.round(automated * reviewPercent / 100);
      var total = manual + reviews;

      model.querySelector('[data-automation-value]').textContent = automated + '%';
      model.querySelector('[data-review-value]').textContent = reviewPercent + '%';
      automation.setAttribute('aria-valuetext', automated + '%');
      review.setAttribute('aria-valuetext', reviewPercent + '%');
      model.querySelector('[data-after-total]').textContent = total;
      model.querySelector('[data-after-bar]').style.width = total + '%';
      model.querySelector('[data-breakdown]').textContent = ukrainian
        ? 'Виконання вручну: ' + manual + '. Перевірки: ' + reviews + '.'
        : 'Manual tasks: ' + manual + '. Reviews: ' + reviews + '.';
      model.querySelector('.forecast-chart').setAttribute('aria-label', ukrainian
        ? 'Умовний сценарій: до — 100 ручних дій, після — ' + total + '.'
        : 'Illustrative scenario: 100 manual actions before, ' + total + ' after.');
    }

    automation.disabled = false;
    review.disabled = false;
    automation.addEventListener('input', updateForecast);
    review.addEventListener('input', updateForecast);
    updateForecast();
  });
})();
