(function () {
  window.FoodLink = window.FoodLink || {};

  var reducedMotion = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  var revealObserver = null;

  function initReveal() {
    if (reducedMotion()) {
      var all = document.querySelectorAll("[data-reveal]");
      for (var i = 0; i < all.length; i++) all[i].classList.add("revealed");
      return;
    }
    if (!("IntersectionObserver" in window)) {
      var nodes = document.querySelectorAll("[data-reveal]");
      for (var j = 0; j < nodes.length; j++) nodes[j].classList.add("revealed");
      return;
    }
    if (revealObserver) return;
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    var els = document.querySelectorAll("[data-reveal]");
    for (var k = 0; k < els.length; k++) revealObserver.observe(els[k]);
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute("data-count") || "0");
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = parseInt(el.getAttribute("data-duration") || "2200", 10);
    var isFloat = (el.getAttribute("data-count") || "").indexOf(".") !== -1;
    var start = null;

    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = (isFloat ? val.toFixed(1) : Math.round(val).toLocaleString("en-IN")) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function animateCounters(scope) {
    var els = (scope || document).querySelectorAll("[data-count]");
    for (var i = 0; i < els.length; i++) {
      animateCounter(els[i]);
    }
  }

  function initCountersOnView() {
    var sections = document.querySelectorAll("[data-counter-scope]");
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (!("IntersectionObserver" in window)) { animateCounters(section); continue; }
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounters(entry.target);
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      obs.observe(section);
    }
  }

  var TYPE_PHRASES = ["Feed Lives.", "Protect the Planet.", "Unite Communities.", "Rescue Meals."];

  function initTypewriter(el) {
    if (!el) return;
    var phrase = 0;
    var char = 0;
    var deleting = false;

    function tick() {
      var text = TYPE_PHRASES[phrase];
      if (!deleting) {
        char++;
        el.textContent = text.slice(0, char);
        if (char === text.length) {
          deleting = true;
          setTimeout(tick, 1900);
          return;
        }
        setTimeout(tick, reducedMotion() ? 10 : 65);
      } else {
        char--;
        el.textContent = text.slice(0, char);
        if (char === 0) {
          deleting = false;
          phrase = (phrase + 1) % TYPE_PHRASES.length;
          setTimeout(tick, 300);
          return;
        }
        setTimeout(tick, reducedMotion() ? 10 : 32);
      }
    }
    tick();
  }

  function initRipple() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".ripple-btn");
      if (!btn) return;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = e.clientX - rect.left - size / 2 + "px";
      span.style.top = e.clientY - rect.top - size / 2 + "px";
      btn.appendChild(span);
      setTimeout(function () { span.remove(); }, 650);
    });
  }

  function initLoader(onDone) {
    var loader = document.getElementById("loader");
    if (!loader) { if (onDone) onDone(); return; }
    setTimeout(function () {
      loader.classList.add("hidden");
      if (onDone) onDone();
    }, reducedMotion() ? 100 : 900);
  }

  var confettiCanvas = null;
  var confettiCtx = null;
  var confettiRunning = false;

  function getCanvas() {
    if (!confettiCanvas) {
      confettiCanvas = document.getElementById("confettiCanvas");
      if (confettiCanvas) {
        confettiCanvas.className = "confetti-canvas";
        confettiCtx = confettiCanvas.getContext("2d");
      }
    }
    return confettiCanvas;
  }

  function confettiBurst(duration) {
    var canvas = getCanvas();
    if (!canvas || reducedMotion()) return;
    var ctx = confettiCtx;
    var W = (canvas.width = window.innerWidth);
    var H = (canvas.height = window.innerHeight);
    var colors = ["#2E7D32", "#FF9800", "#4CAF50", "#E53935", "#FFC107", "#00BCD4", "#9C27B0"];
    var pieces = [];
    var count = Math.min(180, Math.floor(W / 8));
    for (var i = 0; i < count; i++) {
      pieces.push({
        x: W / 2 + (Math.random() - 0.5) * 220,
        y: H / 2 + (Math.random() - 0.5) * 140,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 1.2) * 14 - 2,
        size: Math.random() * 9 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.4,
        shape: Math.random() > 0.5 ? "rect" : "circle"
      });
    }
    var start = null;
    confettiRunning = true;
    function frame(ts) {
      if (!start) start = ts;
      var elapsed = ts - start;
      ctx.clearRect(0, 0, W, H);
      for (var j = pieces.length - 1; j >= 0; j--) {
        var p = pieces[j];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.32;
        p.vx *= 0.985;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        if (p.y > H + 40 || elapsed > duration + 1200) pieces.splice(j, 1);
      }
      if (pieces.length && elapsed < duration + 1400) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, W, H);
        confettiRunning = false;
      }
    }
    requestAnimationFrame(frame);
  }

  function togglePageTransition() {
    var overlay = document.getElementById("transitionOverlay");
    if (!overlay) return Promise.resolve();
    return new Promise(function (resolve) {
      overlay.classList.add("active");
      setTimeout(function () {
        resolve();
      }, 430);
      setTimeout(function () {
        overlay.classList.remove("active");
      }, 850);
    });
  }

  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var target = el.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: target, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  var api = {
    initReveal: initReveal,
    animateCounters: animateCounters,
    animateCounter: animateCounter,
    initCountersOnView: initCountersOnView,
    initTypewriter: initTypewriter,
    initRipple: initRipple,
    initLoader: initLoader,
    confettiBurst: confettiBurst,
    togglePageTransition: togglePageTransition,
    scrollToId: scrollToId,
    reducedMotion: reducedMotion
  };

  FoodLink.Animation = api;
})();
