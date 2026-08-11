(function () {
  window.FoodLink = window.FoodLink || {};

  var timers = {};

  function remainingMs(food) {
    var end = food.expiresAt || (Date.now() + food.expiryHours * 3600000);
    return Math.max(0, end - Date.now());
  }

  function freshnessPct(food) {
    var total = food.expiryHours ? food.expiryHours * 3600000 : 6 * 3600000;
    var left = remainingMs(food);
    return Math.min(100, Math.max(0, Math.round((left / total) * 100)));
  }

  function format(ms) {
    var total = Math.floor(ms / 1000);
    var d = Math.floor(total / 86400);
    var h = Math.floor((total % 86400) / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    if (d > 0) return d + "d " + pad(h) + "h";
    if (h > 0) return h + "h " + pad(m) + "m";
    if (m > 0) return m + "m " + pad(s) + "s";
    return s + "s";
  }

  function labelFor(ms) {
    var min = Math.floor(ms / 60000);
    if (min <= 0) return "Expiring now";
    if (min < 60) return min + "m left";
    var h = Math.floor(min / 60);
    return h + "h " + (min % 60) + "m left";
  }

  function freshnessState(food) {
    var pct = freshnessPct(food);
    if (pct > 55) return { pct: pct, cls: "good", label: "Excellent" };
    if (pct > 25) return { pct: pct, cls: "warn", label: "Good — grab soon" };
    if (pct > 5) return { pct: pct, cls: "danger", label: "Expiring fast" };
    return { pct: 0, cls: "danger", label: "Expired" };
  }

  function renderInto(el, food, urgentFn) {
    function tick() {
      var ms = remainingMs(food);
      var expired = ms <= 0;
      el.textContent = expired ? "Expired" : labelFor(ms);
      el.classList.toggle("urgent", !expired && ms < 30 * 60000);
      if (urgentFn && ms < 30 * 60000 && ms > 0) urgentFn(food);
      if (expired) { stop(); }
    }
    tick();
    var timer = setInterval(tick, 1000);
    timers[food.id + ":" + (el.dataset.countKey || "")] = timer;
    return function stop() { clearInterval(timer); delete timers[food.id]; };
  }

  function stopAll() {
    for (var k in timers) { clearInterval(timers[k]); delete timers[k]; }
  }

  var api = {
    remainingMs: remainingMs,
    freshnessPct: freshnessPct,
    format: format,
    labelFor: labelFor,
    freshnessState: freshnessState,
    renderInto: renderInto,
    stopAll: stopAll
  };

  FoodLink.Countdown = api;
})();
