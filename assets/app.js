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

  var svgNamespace = 'http://www.w3.org/2000/svg';

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function numberOr(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function svgElement(tag, attributes, text) {
    var element = document.createElementNS(svgNamespace, tag);
    Object.keys(attributes || {}).forEach(function (name) {
      element.setAttribute(name, attributes[name]);
    });
    if (text !== undefined) element.textContent = text;
    return element;
  }

  document.querySelectorAll('[data-forecast]').forEach(function (model) {
    var source = model.querySelector('[data-chart-config]');
    var chart = model.querySelector('[data-chart]');
    var time = model.querySelector('[data-time]');
    if (!source || !chart || !time) return;

    var config;
    try {
      config = JSON.parse(source.textContent);
    } catch (_) {
      return; // Keep the server-rendered fallback if its configuration is invalid.
    }
    if (!config || ['workload', 'coverage', 'search', 'history'].indexOf(config.kind) === -1) return;

    var historical = config.kind === 'history';
    var baseline = numberOr(config.baseline, NaN);
    var total = numberOr(config.total, baseline);
    var months = clamp(Math.round(numberOr(config.months, 6)), 1, 60);
    var observations = [];

    if (historical) {
      if (!Array.isArray(config.history) || config.history.length < 2) return;
      observations = config.history.map(function (point) {
        if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) return null;
        var date = new Date(point.date + 'T00:00:00Z');
        var value = numberOr(point.value, NaN);
        if (!Number.isFinite(date.getTime()) || !Number.isFinite(value) || value < 0) return null;
        return { date: date, value: value };
      });
      if (observations.some(function (point) { return point === null; })) return;
    } else if (!Number.isFinite(baseline) || baseline < 0 || !Number.isFinite(total) || total < baseline) {
      return;
    }

    var ukrainian = model.getAttribute('data-language') === 'uk';
    var locale = ukrainian ? 'uk-UA' : 'en-US';
    var format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    var axisFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    var shortMonth = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    var fullDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    var unit = model.querySelector('[data-unit]');
    var periodOutput = model.querySelector('[data-period]');
    var currentOutput = model.querySelector('[data-current]');
    var assumptionOutput = model.querySelector('[data-assumption-summary]');
    var status = model.querySelector('[data-chart-status]');
    var parameters = {};
    var points = [];
    var layout = null;
    var scheduledFrame = 0;
    var lastIndex = historical ? observations.length - 1 : months;
    var initialSelection = time.hasAttribute('value') ? numberOr(time.value, lastIndex) : lastIndex;
    var selected = clamp(Math.round(initialSelection), 0, lastIndex);

    model.querySelectorAll('[data-param]').forEach(function (input) {
      var name = input.getAttribute('data-param');
      if (['automation', 'review', 'gain', 'ramp'].indexOf(name) !== -1) parameters[name] = input;
    });

    function parameter(name, fallback, minimum, maximum) {
      return clamp(numberOr(parameters[name] ? parameters[name].value : fallback, fallback), minimum, maximum);
    }

    function settings() {
      return {
        automation: parameter('automation', 70, 0, 100),
        review: parameter('review', 20, 0, 100),
        gain: parameter('gain', config.kind === 'search' ? 50 : 70, 0, 100),
        ramp: parameter('ramp', 3, 1, months)
      };
    }

    function scenarioValue(month, values) {
      var progress = Math.min(month / values.ramp, 1);
      // Workload: the original batch minus automated work, plus human review
      // of the automated part. Review is a share of automation, not of the batch.
      if (config.kind === 'workload') {
        return baseline * (1 - values.automation / 100 * progress * (1 - values.review / 100));
      }
      // Coverage applies gain only to the currently uncovered remainder.
      if (config.kind === 'coverage') {
        return baseline + (total - baseline) * values.gain / 100 * progress;
      }
      // Search models a reduction in the observed unsuccessful test cases.
      return baseline * (1 - values.gain / 100 * progress);
    }

    function assumptions(values) {
      if (historical) return '';
      var ramp = format.format(values.ramp) + (ukrainian ? ' міс.' : ' months');
      if (config.kind === 'workload') {
        var item = config.item === 'domain'
          ? (ukrainian ? 'домен' : 'domain')
          : (ukrainian ? 'запит' : 'keyword');
        return ukrainian
          ? 'Модель: одна перевірка на ' + item + '. Автоматизація ' + values.automation + '%; ручний перегляд ' + values.review + '% автоматизованого. Вихід на ціль за ' + ramp
          : 'Model: one check per ' + item + '. ' + values.automation + '% automated; ' + values.review + '% of that reviewed manually. Target reached over ' + ramp;
      }
      if (config.kind === 'coverage') {
        return ukrainian
          ? 'Умовна ціль: охопити ' + values.gain + '% решти шаблонів за ' + ramp
          : 'Scenario target: cover ' + values.gain + '% of the remaining templates over ' + ramp;
      }
      return ukrainian
        ? 'Умовна ціль: на ' + values.gain + '% менше тестових запитів без результату за ' + ramp
        : 'Scenario target: ' + values.gain + '% fewer unsuccessful test queries over ' + ramp;
    }

    function periodLabel(index) {
      if (historical) return fullDate.format(observations[index].date);
      if (index === 0) return ukrainian ? 'Початок' : 'Start';
      return (ukrainian ? 'Місяць ' : 'Month ') + index;
    }

    function updateReadout() {
      var value = points[selected].value;
      var approximate = !historical && selected > 0;
      var formatted = format.format(value);
      var period = periodLabel(selected);
      if (unit) {
        var plural = new Intl.PluralRules(locale).select(Math.round(value));
        var forms = ukrainian ? {
          workload: ['ручна перевірка на повний список', 'ручні перевірки на повний список', 'ручних перевірок на повний список'],
          coverage: ['сторінка із посиланнями з інших шаблонів', 'сторінки із посиланнями з інших шаблонів', 'сторінок із посиланнями з інших шаблонів'],
          search: ['тестовий запит без результату', 'тестові запити без результату', 'тестових запитів без результату'],
          history: ['оцінений перехід на місяць', 'оцінені переходи на місяць', 'оцінених переходів на місяць']
        } : {
          workload: ['manual check for the full list', 'manual checks for the full list'],
          coverage: ['page linked from other templates', 'pages linked from other templates'],
          search: ['test query with no result', 'test queries with no result'],
          history: ['estimated click per month', 'estimated clicks per month']
        };
        setText(unit, forms[config.kind][plural === 'one' ? 0 : ukrainian && plural !== 'few' ? 2 : 1]);
      }
      var suffix = unit ? unit.textContent.trim() : '';
      var readout = period + ': ' + (approximate ? (ukrainian ? 'приблизно ' : 'approximately ') : '') + formatted + (suffix ? ' ' + suffix : '') + '.';
      var summary = assumptions(settings());
      var description = (historical
        ? (ukrainian ? 'Історичні дані. ' : 'Historical data. ')
        : (ukrainian ? 'Сценарій на ' + months + ' місяців. ' : months + '-month scenario. ')) + readout;
      if (summary) description += ' ' + summary;

      setText(periodOutput, period);
      setText(currentOutput, (approximate ? '≈ ' : '') + formatted);
      if (!historical) setText(assumptionOutput, summary);
      setText(status, description);
      time.value = String(selected);
      time.setAttribute('aria-valuetext', readout);
      chart.setAttribute('aria-label', description);
    }

    function drawChart() {
      var width = Math.max(240, chart.getBoundingClientRect().width || model.clientWidth || 480);
      var height = 232;
      var margin = { left: 54, right: 18, top: 16, bottom: 34 };
      var plotWidth = width - margin.left - margin.right;
      var plotHeight = height - margin.top - margin.bottom;
      var yMin = 0;
      var yMax = Math.max(1, config.kind === 'workload' ? baseline : total);
      if (!historical) {
        var scale = Math.pow(10, Math.floor(Math.log10(yMax)));
        yMax = Math.ceil(yMax / scale) * scale;
      }
      if (historical) {
        // Keep an explicit, labelled 15k–25k scale for this historical series.
        // Expand it if future supplied observations fall outside that range.
        var observedMin = Math.min.apply(null, observations.map(function (point) { return point.value; }));
        var observedMax = Math.max.apply(null, observations.map(function (point) { return point.value; }));
        yMin = Math.max(0, Math.min(15000, Math.floor(observedMin / 5000) * 5000));
        yMax = Math.max(25000, Math.ceil(observedMax / 5000) * 5000);
      }
      function x(index) { return margin.left + index / lastIndex * plotWidth; }
      function y(value) { return margin.top + (yMax - value) / (yMax - yMin) * plotHeight; }
      layout = { width: width, left: margin.left, plotWidth: plotWidth };

      chart.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      chart.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      chart.setAttribute('role', 'img');
      chart.setAttribute('focusable', 'false');
      chart.replaceChildren();

      [yMin, yMin + (yMax - yMin) / 2, yMax].forEach(function (value) {
        chart.appendChild(svgElement('line', {
          'class': 'chart-grid', x1: margin.left, x2: width - margin.right,
          y1: y(value), y2: y(value), stroke: '#dededa', 'stroke-width': 1
        }));
        chart.appendChild(svgElement('text', {
          'class': 'chart-axis', x: margin.left - 8, y: y(value),
          'text-anchor': 'end', 'dominant-baseline': 'middle',
          fill: '#666666', 'font-size': 11, 'font-family': 'inherit'
        }, axisFormat.format(value)));
      });

      var stride = Math.max(1, Math.ceil((lastIndex + 1) * (historical ? 32 : 22) / plotWidth));
      points.forEach(function (point, index) {
        if (index % stride !== 0 && index !== lastIndex) return;
        // Avoid squeezing the penultimate label against the always-visible end.
        if (index !== lastIndex && lastIndex - index < stride) return;
        var label = historical ? shortMonth.format(observations[index].date) : String(index);
        chart.appendChild(svgElement('line', {
          'class': 'chart-tick', x1: x(index), x2: x(index),
          y1: height - margin.bottom, y2: height - margin.bottom + 4,
          stroke: '#cccccc', 'stroke-width': 1
        }));
        chart.appendChild(svgElement('text', {
          'class': 'chart-axis', x: x(index), y: height - 12,
          'text-anchor': 'middle', fill: '#666666', 'font-size': 11,
          'font-family': 'inherit'
        }, label));
      });

      if (!historical) {
        chart.appendChild(svgElement('line', {
          'class': 'chart-baseline', x1: x(0), x2: x(lastIndex),
          y1: y(baseline), y2: y(baseline), stroke: '#999995',
          'stroke-width': 1, 'stroke-dasharray': '4 3'
        }));
      }
      var path = points.map(function (point, index) {
        return (index ? 'L' : 'M') + x(index) + ',' + y(point.value);
      }).join(' ');
      chart.appendChild(svgElement('path', {
        'class': historical ? 'chart-history' : 'chart-scenario',
        d: path, fill: 'none', stroke: historical ? '#303030' : '#2f6b4b',
        'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'stroke-dasharray': historical ? 'none' : '4 3'
      }));
      chart.appendChild(svgElement('line', {
        'class': 'chart-cursor', x1: x(selected), x2: x(selected),
        y1: margin.top, y2: height - margin.bottom,
        stroke: '#aaaaaa', 'stroke-width': 1
      }));
      chart.appendChild(svgElement('circle', {
        'class': 'chart-dot', cx: x(0), cy: y(points[0].value), r: 3,
        fill: '#303030'
      }));
      chart.appendChild(svgElement('circle', {
        'class': 'chart-dot', cx: x(selected), cy: y(points[selected].value), r: 4,
        fill: !historical && selected === 0 ? '#303030' : '#2f6b4b',
        stroke: '#ffffff', 'stroke-width': 1.5
      }));
      updateReadout();
    }

    function scheduleDraw() {
      if (scheduledFrame) return;
      scheduledFrame = requestAnimationFrame(function () {
        scheduledFrame = 0;
        drawChart();
      });
    }

    function recalculate() {
      var values = settings();
      points = historical
        ? observations.map(function (point) { return { value: point.value }; })
        : Array.from({ length: months + 1 }, function (_, month) {
          return { value: scenarioValue(month, values) };
        });
      Object.keys(parameters).forEach(function (name) {
        var value = values[name];
        var label = name === 'ramp'
          ? format.format(value) + (ukrainian ? ' міс.' : ' mo.')
          : format.format(value) + '%';
        setText(model.querySelector('[data-param-label="' + name + '"]'), label);
        parameters[name].setAttribute('aria-valuetext', label);
      });
      updateReadout();
      scheduleDraw();
    }

    function select(index) {
      var next = clamp(Math.round(index), 0, lastIndex);
      if (next === selected) return;
      selected = next;
      updateReadout();
      scheduleDraw();
    }

    function scrub(event) {
      if (!layout) return;
      var box = chart.getBoundingClientRect();
      if (!box.width) return;
      var position = (event.clientX - box.left) * layout.width / box.width;
      select((position - layout.left) / layout.plotWidth * lastIndex);
    }

    time.min = '0';
    time.max = String(lastIndex);
    time.step = '1';
    time.value = String(selected);
    time.disabled = false;
    time.addEventListener('input', function () { select(numberOr(time.value, selected)); });
    Object.keys(parameters).forEach(function (name) {
      parameters[name].disabled = false;
      parameters[name].addEventListener('input', recalculate);
    });
    chart.style.touchAction = 'pan-y';
    chart.addEventListener('pointermove', scrub);
    chart.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      scrub(event);
      if (chart.setPointerCapture) chart.setPointerCapture(event.pointerId);
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(scheduleDraw).observe(chart);
    } else {
      window.addEventListener('resize', scheduleDraw);
    }
    var details = model.closest('details');
    if (details) details.addEventListener('toggle', function () {
      if (details.open) scheduleDraw();
    });
    recalculate();
  });
})();
