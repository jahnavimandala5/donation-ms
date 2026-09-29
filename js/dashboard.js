/* =====================================================================
   FoodLink - dashboard.js
   Shared dashboard shell (sidebar, topbar, notifications, theme),
   UI helpers and dependency-free canvas charts.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var S = window.FoodLink.Storage;

  /* ---------------- generic UI helpers ---------------- */

  function $1(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(title, msg, type) {
    var container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      container.id = "toastContainer";
      document.body.appendChild(container);
    }
    var icons = { success: "i-check", error: "i-error", info: "i-info", warning: "i-alert" };
    var el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.innerHTML =
      '<svg class="icon"><use href="#' + (icons[type] || "i-info") + '"/></svg>' +
      '<div><div class="toast-title">' + escapeHtml(title) + "</div>" +
      (msg ? '<div class="toast-msg">' + escapeHtml(msg) + "</div>" : "") + "</div>";
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add("hide");
      setTimeout(function () { el.remove(); }, 350);
    }, 3800);
  }

  function initials(name) {
    var words = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    return words.slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
  }

  var AVATAR_COLORS = [
    "linear-gradient(135deg,#10b981,#0d9488)",
    "linear-gradient(135deg,#f59e0b,#ea580c)",
    "linear-gradient(135deg,#0ea5e9,#2563eb)",
    "linear-gradient(135deg,#8b5cf6,#6366f1)",
    "linear-gradient(135deg,#ec4899,#db2777)",
    "linear-gradient(135deg,#14b8a6,#0f766e)"
  ];

  function avatarHtml(name, cls) {
    var color = AVATAR_COLORS[Math.abs(hashCode(String(name || ""))) % AVATAR_COLORS.length];
    return '<span class="avatar ' + (cls || "") + '" style="background:' + color + '">' + escapeHtml(initials(name)) + "</span>";
  }

  function hashCode(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return h;
  }

  function timeAgo(ts) {
    var t = Number(ts);
    if (!isFinite(t) || t <= 0) return "";
    var diff = Date.now() - t;
    if (diff < 0) return "just now";
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + " hr ago";
    var days = Math.floor(hrs / 24);
    if (days <= 7) return days + " day" + (days === 1 ? "" : "s") + " ago";
    return formatDate(t);
  }

  /* A bare date-only string such as "2026-03-01" is parsed as UTC
     midnight, which renders as the previous day west of UTC. Normalise
     those to local midnight first. */
  function toDate(ts) {
    if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
      var p = ts.split("-");
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    return new Date(ts);
  }

  function formatDate(ts) {
    var t = Number(ts);
    if (typeof ts === "string" && !isFinite(t)) {
      var d0 = toDate(ts);
      if (!isNaN(d0.getTime())) return d0.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      return "—";
    }
    if (!isFinite(t) || t <= 0) return "—";
    return toDate(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatDateTime(ts) {
    var t = Number(ts);
    if (typeof ts === "string" && !isFinite(t)) {
      var d0 = toDate(ts);
      if (!isNaN(d0.getTime())) return d0.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      return "—";
    }
    if (!isFinite(t) || t <= 0) return "—";
    var d = toDate(t);
    var sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-IN",
      sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }) +
      ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  /* Ordered most-specific first. Word boundaries stop "dal" matching
     inside unrelated words, and the previous map had "biryani" listed
     twice and "kheer" unreachable behind the cake row. */
  var FOOD_EMOJI_MAP = [
    [/kheer|pudding|rasmalai|falooda/, "\u{1F36E}"],
    [/pastr|croissant|bun|cake|pie|brownie|dessert|mithai|sweet|halwa|cupcake|cookie/, "\u{1F370}"],
    [/biryani|pulao|fried rice|khichdi|rice|chawal/, "\u{1F35B}"],
    [/pizza/, "\u{1F355}"],
    [/burger|sandwich|roll|wrap|sub/, "\u{1F96A}"],
    [/curry|sabzi|gravy|paneer|makhani|rajma|chole|\bdal\b|\bdaal\b/, "\u{1F35B}"],
    [/bread|roti|naan|chapati|paratha|baguette|toast/, "\u{1F950}"],
    [/salad|vegetable|veggies|sabzi mix|fruit/, "\u{1F957}"],
    [/coffee|lassi|juice|smoothie|beverage|tea|milk|shake/, "\u{1F964}"],
    [/chicken|mutton|pork|meat|egg|fish|non.?veg/, "\u{1F357}"],
    [/snack|starter|samosa|pakora|kebab|fries/, "\u{1F962}"],
    [/staple|grocery|grain|pulse|lentil|flour|atta|rice bag/, "\u{1F33E}"]
  ];

  function foodEmoji(name) {
    var n = String(name || "").toLowerCase();
    for (var i = 0; i < FOOD_EMOJI_MAP.length; i++) {
      if (FOOD_EMOJI_MAP[i][0].test(n)) return FOOD_EMOJI_MAP[i][1];
    }
    return "\u{1F37D}";
  }

  function statusMeta(status) {
    var map = {
      available: { label: "Available", cls: "pill-available", color: "#059669" },
      reserved: { label: "Reserved", cls: "pill-reserved", color: "#d97706" },
      collected: { label: "Collected", cls: "pill-collected", color: "#0284c7" },
      completed: { label: "Completed", cls: "pill-completed", color: "#7c3aed" },
      expired: { label: "Expired", cls: "pill-expired", color: "#dc2626" },
      cancelled: { label: "Cancelled", cls: "pill-cancelled", color: "#64748b" },
      pending: { label: "Pending", cls: "pill-pending", color: "#d97706" },
      approved: { label: "Approved", cls: "pill-approved", color: "#059669" },
      rejected: { label: "Rejected", cls: "pill-rejected", color: "#dc2626" }
    };
    return map[status] || { label: status, cls: "pill-cancelled", color: "#64748b" };
  }

  function donationCard(d, opts) {
    opts = opts || {};
    if (!d) return "";
    var meta = statusMeta(S.donationStatus(d));
    var donor = S.donorById(d.donorId);
    // `d.image` is user-supplied and previously went into the src
    // attribute unescaped, so a value like `x" onerror="...` produced
    // stored XSS on every visitor of the landing and browse pages.
    var img = safeImageUrl(d.image)
      ? '<img src="' + escapeHtml(d.image) + '" alt="' + escapeHtml(d.foodName) + '" loading="lazy" decoding="async">'
      : '<span class="food-emoji">' + foodEmoji(d.foodName) + "</span>";
    var donorName = d.donorName || donor.name;
    var donorType = d.foodType || donor.type || "Individual";
    var servings = num(d.servings);
    var kg = num(d.quantity);

    return (
      '<article class="food-card" data-id="' + escapeHtml(d.id) + '">' +
        '<div class="food-img">' + img +
          '<span class="veg-tag ' + (d.category === "veg" ? "veg" : "nonveg") + '"></span>' +
          '<span class="food-status ' + meta.cls + '">' + escapeHtml(meta.label) + "</span>" +
          (opts.showCountdown && S.donationStatus(d) === "available"
            ? '<span class="food-countdown" data-countdown="' + escapeHtml(d.id) + '">&#9201; <span>--:--:--</span></span>' : "") +
        "</div>" +
        '<div class="food-body">' +
          '<h3 class="food-name">' + escapeHtml(d.foodName) + "</h3>" +
          '<div class="food-donor">' + avatarHtml(donorName) +
            '<div><span class="food-donor-name">' + escapeHtml(donorName) + '</span>' +
            '<span class="food-donor-type">' + escapeHtml(donorType) + " &bull; " + escapeHtml(d.city || "") + "</span></div></div>" +
          '<div class="food-meta">' +
            '<span><svg class="icon" aria-hidden="true"><use href="#i-users"/></svg>' + escapeHtml(servings) + " servings</span>" +
            '<span>&#9878; ' + escapeHtml(kg) + " kg</span>" +
            '<span><svg class="icon" aria-hidden="true"><use href="#i-map-pin"/></svg>' + escapeHtml(d.city || "") + "</span>" +
          "</div>" +
          (opts.footer ? opts.footer(d) : "") +
        "</div>" +
      "</article>"
    );
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? String(Math.round(n * 100) / 100) : "0";
  }

  /* Only permit image sources we can safely emit into an attribute:
     http(s), a relative path, or a data: image (donor uploads). This
     blocks javascript: and other script-bearing schemes. */
  function safeImageUrl(src) {
    var s = String(src == null ? "" : src).trim();
    if (!s) return false;
    if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(s)) return true;
    if (/^https?:\/\//i.test(s)) return true;
    if (/^[\w./-]+\.(png|jpe?g|gif|webp|avif|svg)(\?[\w=&%-]*)?$/i.test(s)) return true;
    if (s.charAt(0) === "/" && !/^\/\//.test(s)) return true;
    return false;
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 800);
  }

  /* Fractional targets (e.g. 47.3 kg) used to be rounded to integers by
     Math.round, silently undoing the deliberate rounding at the call
     site. Keep up to one decimal when the target needs it. */
  function animateCount(el, target, suffix, dur) {
    if (!el) return;
    var to = Number(target);
    if (!isFinite(to)) return;
    var decimals = Math.abs(to % 1) > 1e-9 ? 1 : 0;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var t0 = null;

    function render(v) {
      var shown = decimals ? v.toFixed(decimals) : String(Math.round(v));
      el.textContent = Number(shown).toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) + (suffix || "");
    }

    if (reduced) { render(to); return; }

    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / (dur || 1200), 1);
      p = 1 - Math.pow(1 - p, 3);
      render(to * p);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function runCounters() {
    $all("[data-count]").forEach(function (el) {
      var target = Number(el.dataset.count || 0);
      var suffix = el.dataset.suffix || "";
      var dur = Number(el.dataset.dur || 1300);
      animateCount(el, target, suffix, dur);
    });
  }

  /* ---------------- dashboard shell ---------------- */

  var shellReady = false;

  function initShell() {
    if (shellReady) return;
    var user = S.currentUser();
    if (!user) return;
    shellReady = true;

    $all(".sidebar-user-name").forEach(function (el) { el.textContent = user.orgName || user.name; });
    $all(".sidebar-user-role").forEach(function (el) {
      el.textContent = user.role === "admin" ? "Administrator" : user.role === "donor" ? "Donor" : "Receiver";
    });
    var avatars = $all(".sidebar-avatar, .user-avatar");
    avatars.forEach(function (el) { el.textContent = initials(user.orgName || user.name); });

    var pointsEls = $all(".sidebar-points");
    pointsEls.forEach(function (el) { el.textContent = (user.points || 0) + " pts"; });

    $all(".sidebar-logout, [data-logout]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        S.clearSession();
        window.location.href = "index.html";
      });
    });

    $all(".side-item").forEach(function (item) {
      item.addEventListener("click", function () {
        showSection(item.dataset.section);
        closeSidebar();
      });
    });

    var menuBtn = $1("#menuBtn");
    if (menuBtn) menuBtn.addEventListener("click", toggleSidebar);
    var scrim = document.createElement("div");
    scrim.className = "sidebar-scrim";
    document.body.appendChild(scrim);
    scrim.addEventListener("click", closeSidebar);

    $all("#themeToggle, [data-theme-toggle]").forEach(function (b) {
      b.addEventListener("click", function () { toggleTheme(); });
    });

    initUserDropdown();
    initNotifications();
    installSubmitGuard();
    autoLabel();
  }

  function toggleSidebar() {
    var sb = $1("#sidebar");
    var scrim = $1(".sidebar-scrim");
    if (!sb) return;
    sb.classList.toggle("open");
    if (scrim) scrim.classList.toggle("show", sb.classList.contains("open"));
  }

  function closeSidebar() {
    var sb = $1("#sidebar");
    var scrim = $1(".sidebar-scrim");
    if (sb) sb.classList.remove("open");
    if (scrim) scrim.classList.remove("show");
  }

  function showSection(name, title) {
    $all(".content-section").forEach(function (s) { s.classList.remove("active"); });
    $all(".side-item").forEach(function (i) { i.dataset.section === name && i.classList.add("active"); });
    var sec = $1("#sec-" + name);
    // Every section was just deactivated, so a typo in data-section used to
    // render a completely blank page with no diagnostic.
    if (!sec) {
      console.warn("[dashboard] unknown section '" + name + "'");
      sec = $1(".content-section");
    }
    if (sec) sec.classList.add("active");
    var h1 = $1("#pageTitle");
    if (h1 && title) h1.textContent = title;
    closeSidebar();
    if (window.FoodLink.onSectionChange) window.FoodLink.onSectionChange(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initUserDropdown() {
    var dd = $1("#userDrop");
    if (!dd) return;
    var btn = $1("#userAvatarBtn");
    function setOpen(open) {
      dd.classList.toggle("open", open);
      if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (btn) {
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-expanded", "false");
      if (!dd.id) dd.id = "userDrop";
      btn.setAttribute("aria-controls", dd.id);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setOpen(!dd.classList.contains("open"));
      });
    }
    document.addEventListener("click", function (e) { if (!dd.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dd.classList.contains("open")) {
        setOpen(false);
        if (btn) btn.focus();
      }
    });
  }

  var notifBound = false;

  function initNotifications() {
    var bell = $1("#notifBell");
    var drop = $1("#notifDrop");
    if (!bell || !drop) return;
    var user = S.currentUser();
    if (!user) return;
    // Idempotent: this is also called after a profile save, and binding the
    // bell twice made the dropdown toggle open then immediately closed.
    if (notifBound) { renderNotifList(user); return; }
    notifBound = true;

    function renderList() { renderNotifList(user); }

    bell.setAttribute("aria-haspopup", "true");
    bell.setAttribute("aria-expanded", "false");
    bell.setAttribute("aria-controls", drop.id || "notifDrop");
    bell.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = drop.classList.toggle("open");
      bell.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) renderList();
    });
    document.addEventListener("click", function (e) {
      if (!drop.contains(e.target)) {
        drop.classList.remove("open");
        bell.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drop.classList.contains("open")) {
        drop.classList.remove("open");
        bell.setAttribute("aria-expanded", "false");
        bell.focus();
      }
    });
    var markBtn = $1("#markAllRead");
    if (markBtn) markBtn.addEventListener("click", function () {
      S.markAllRead(user.id);
      renderList();
    });
    renderList();
  }

  function renderNotifList(user) {
    var drop = $1("#notifDrop");
    var listEl = $1("#notifList");
    var countEl = $1("#notifCount");
    var list = S.notificationsFor(user.id);
    var unread = list.filter(function (n) { return !n.read; }).length;

    if (countEl) {
      countEl.textContent = unread > 99 ? "99+" : unread;
      // The markup uses the boolean `hidden` attribute; toggling a class
      // never clears it, so the badge was permanently invisible.
      if (unread > 0) {
        countEl.removeAttribute("hidden");
        countEl.classList.remove("hidden");
        countEl.setAttribute("aria-label", unread + " unread notifications");
      } else {
        countEl.setAttribute("hidden", "");
        countEl.classList.add("hidden");
        countEl.removeAttribute("aria-label");
      }
    }
    if (!listEl) return;
    if (!list.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:30px 16px"><span class="empty-emoji">&#128276;</span><h4>No notifications</h4></div>';
      return;
    }
    var meta = { success: "i-check", info: "i-info", warning: "i-alert", error: "i-error" };
    listEl.innerHTML = list.slice(0, 10).map(function (n) {
      var kind = meta[n.type] ? n.type : "info";
      return (
        '<div class="notif-item' + (n.read ? "" : " unread") + '" data-id="' + escapeHtml(n.id) + '">' +
          '<span class="notif-icon ' + kind + '"><svg class="icon" aria-hidden="true"><use href="#' + meta[n.type] + '"/></svg></span>' +
          '<div><div class="notif-item-title">' + escapeHtml(n.title) + "</div>" +
          '<div class="notif-item-msg">' + escapeHtml(n.message) + "</div>" +
          '<div class="notif-item-time">' + escapeHtml(timeAgo(n.createdAt)) + "</div></div></div>"
      );
    }).join("");
    $all(".notif-item", listEl).forEach(function (item) {
      item.addEventListener("click", function () {
        S.Notifications.update(item.dataset.id, { read: true });
        renderNotifList(user);
      });
    });
    if (drop) {
      var sr = document.createElement("span");
      sr.className = "sr-only";
      sr.setAttribute("role", "status");
      sr.setAttribute("aria-live", "polite");
      sr.textContent = unread ? unread + " unread notification" + (unread > 1 ? "s" : "") : "";
      drop.appendChild(sr);
    }
  }

  function toggleTheme() {
    var html = document.documentElement;
    var next = html.dataset.theme === "dark" ? "light" : "dark";
    html.dataset.theme = next;
    S.set(S.KEYS.theme, next);
  }

  function applyTheme() {
    var saved = S.get(S.KEYS.theme, "light");
    document.documentElement.dataset.theme = saved;
  }

  /* ---------------- countdown timers ---------------- */

  /* One shared interval for the whole page. Previously every call created
     a new 1 Hz timer that was never cleared, so re-rendering the browse
     grid or favorites list leaked another permanent timer each time. */
  var countdownTimer = null;
  var countdownPending = false;

  function tickCountdowns() {
    // Coalesce: a tick that arrives while one is still running is skipped
    // rather than queued, so a slow re-render cannot build a backlog.
    if (countdownPending) return;
    countdownPending = true;
    try {
      $all("[data-countdown]").forEach(function (el) {
        var d = S.Donations.byId(el.dataset.countdown);
        if (!d) { el.remove(); return; }
        var left = Number(d.expiresAt) - Date.now();
        var target = el.querySelector("span");
        if (left <= 0) {
          // Re-render only once; afterwards the child <span> is the
          // "EXPIRED" node and must not be written to again.
          if (!el.dataset.expired) {
            el.innerHTML = "<span>EXPIRED</span>";
            el.dataset.expired = "1";
          }
          el.classList.add("urgent");
          el.classList.remove("warn");
          return;
        }
        if (!target) return;
        var h = Math.floor(left / 3600000);
        var m = Math.floor((left % 3600000) / 60000);
        var s = Math.floor((left % 60000) / 1000);
        target.textContent = (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
        el.classList.toggle("warn", left < 2 * 3600000);
        el.classList.toggle("urgent", left < 3600000);
      });
    } finally {
      countdownPending = false;
    }
  }

  function startCountdowns() {
    tickCountdowns();
    if (countdownTimer !== null) return;
    countdownTimer = setInterval(tickCountdowns, 1000);
    // Don't keep a background tab ticking.
    if (document.addEventListener) {
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) tickCountdowns();
      });
    }
  }

  /* ---------------- charts (vanilla canvas) ---------------- */

  /* Only these colour formats may reach a canvas API. Anything else
     (for example a caller-supplied rgb() string) is rejected rather than
     silently producing an invalid addColorStop(). */
  var SAFE_COLOR = /^#[0-9a-f]{6}$/i;

  function safeColor(c, fallback) {
    var s = String(c == null ? "" : c).trim();
    return SAFE_COLOR.test(s) ? s : (fallback || "#10b981");
  }

  /* Expand #abc to #aabbcc so a short hex can be alpha-suffixed safely. */
  function withAlpha(hex, alpha) {
    var c = safeColor(hex, "#10b981");
    var r = parseInt(c.slice(1, 3), 16);
    var g = parseInt(c.slice(3, 5), 16);
    var b = parseInt(c.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  /* Size the backing store and return the CSS-pixel box. Returns null when
     the canvas has no usable area, so every draw routine can bail out
     instead of computing negative widths and throwing IndexSizeError. */
  function prepCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    // Integer backing store: a fractional width is truncated by the
    // canvas element but not by clearRect(), causing a sub-pixel offset.
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (!(w > 0) || !(h > 0)) return null;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function themeGridColor() {
    return document.documentElement.dataset.theme === "dark" ? "rgba(148,163,184,0.15)" : "rgba(15,40,32,0.08)";
  }

  /* Axis labels and captions are text, not grid lines. Reusing the 8-15%
     grid alpha for them made every label effectively invisible. */
  function themeTextColor() {
    return document.documentElement.dataset.theme === "dark" ? "#94a3b8" : "#5c6f68";
  }

  function themeSurfaceColor() {
    return document.documentElement.dataset.theme === "dark" ? "#16241f" : "#ffffff";
  }

  function drawAxes(ctx, g, padL, padR, padT, ch, max, opts) {
    opts = opts || {};
    ctx.strokeStyle = themeGridColor();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (var gi = 0; gi <= 4; gi++) {
      var y = padT + ch - (ch * gi / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(g.w - padR, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = themeTextColor();
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    for (var gj = 0; gj <= 4; gj++) {
      var yj = padT + ch - (ch * gj / 4);
      ctx.fillText(String(Math.round(max * gj / 4)), padL - 8, yj + 4);
    }
  }

  function drawLineChart(canvas, labels, data, opts) {
    opts = opts || {};
    var g = prepCanvas(canvas);
    if (!g) return;
    data = (data || []).map(function (v) { return Number(v) || 0; });
    labels = labels || [];
    if (!data.length) { drawNoData(g.ctx, g, "No data"); return; }

    var ctx = g.ctx;
    var padL = 44, padR = 14, padT = 20, padB = 34;
    var cw = g.w - padL - padR, ch = g.h - padT - padB;
    if (cw <= 0 || ch <= 0) return;
    var max = Math.max.apply(null, data.concat([1])) * 1.15;
    var color = safeColor(opts.color, "#10b981");

    drawAxes(ctx, g, padL, padR, padT, ch, max);

    // Centre each point in its own slot so a single point sits in the
    // middle of the plot rather than hard against the y-axis.
    var slot = cw / data.length;
    var pts = data.map(function (v, i) {
      return { x: padL + slot * i + slot / 2, y: padT + ch - (ch * v / max) };
    });

    var grad = ctx.createLinearGradient(0, padT, 0, g.h);
    grad.addColorStop(0, withAlpha(color, 0.33));
    grad.addColorStop(1, withAlpha(color, 0));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padT + ch);
    pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(pts[pts.length - 1].x, padT + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    pts.forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = themeSurfaceColor(); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatCompact(data[i]), p.x, p.y - 10);
    });

    // Labels are centred on the same slot positions as the points.
    ctx.fillStyle = themeTextColor();
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    labels.forEach(function (lb, i) {
      if (i >= pts.length) return;
      ctx.fillText(String(lb), pts[i].x, g.h - 12);
    });
  }

  function drawBarChart(canvas, labels, data, opts) {
    opts = opts || {};
    var g = prepCanvas(canvas);
    if (!g) return;
    data = (data || []).map(function (v) { return Number(v) || 0; });
    labels = labels || [];
    if (!data.length) { drawNoData(g.ctx, g, "No data"); return; }

    var ctx = g.ctx;
    var padL = 40, padR = 12, padT = 24, padB = 34;
    var cw = g.w - padL - padR, ch = g.h - padT - padB;
    if (cw <= 0 || ch <= 0) return;
    var max = Math.max.apply(null, data.concat([1])) * 1.2;

    drawAxes(ctx, g, padL, padR, padT, ch, max);

    var slot = cw / data.length;
    var barW = Math.max(Math.min(slot * 0.55, 46), 2);
    data.forEach(function (v, i) {
      var h = ch * v / max;
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + ch - h;
      // Fall back per-index so a short colours array cannot reach
      // addColorStop() with undefined and throw.
      var top = safeColor(opts.colors ? opts.colors[i] : null, "#10b981");
      var bottom = safeColor(opts.colors ? opts.colors[i] : null, "#0d9488");
      var grd = ctx.createLinearGradient(0, y, 0, padT + ch);
      grd.addColorStop(0, top);
      grd.addColorStop(1, withAlpha(bottom, 0.47));
      roundRect(ctx, x, y, barW, h, Math.min(6, barW / 2));
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.fillStyle = top;
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatCompact(v), x + barW / 2, y - 6);
      ctx.fillStyle = themeTextColor();
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(String(labels[i] == null ? "" : labels[i]), x + barW / 2, g.h - 10);
    });
  }

  function drawNoData(ctx, g, msg) {
    ctx.fillStyle = themeTextColor();
    ctx.font = "600 14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(msg || "No data", g.w / 2, g.h / 2);
  }

  function formatCompact(v) {
    var n = Number(v) || 0;
    return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n * 10) / 10);
  }

  function drawDonutChart(canvas, slices, opts) {
    opts = opts || {};
    var g = prepCanvas(canvas);
    if (!g) return;
    var ctx = g.ctx;
    var cx = g.w / 2, cy = g.h / 2;
    // Guard: a hidden section reports 0x0, which would make the radius
    // negative and throw IndexSizeError on arc().
    var r = Math.min(g.w, g.h) / 2 - 14;
    if (r <= 0) return;
    var inner = r * 0.62;

    // Drop non-numeric and non-positive slices so one bad value cannot
    // produce a reversed sweep or turn the total into a string.
    var clean = (slices || []).filter(function (s) {
      return s && isFinite(Number(s.value)) && Number(s.value) > 0;
    }).map(function (s) {
      return { label: s.label, value: Number(s.value), color: safeColor(s.color, "#10b981") };
    });
    var total = clean.reduce(function (sum, s) { return sum + s.value; }, 0);

    if (total <= 0) {
      ctx.strokeStyle = themeGridColor();
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.arc(cx, cy, r - 9, 0, Math.PI * 2); ctx.stroke();
      drawNoData(ctx, { w: g.w, h: g.h }, "No data");
      if (opts.legend) renderLegend(canvas.parentElement, clean);
      return;
    }

    var start = -Math.PI / 2;
    clean.forEach(function (s) {
      var ang = (s.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      start += ang;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = themeSurfaceColor();
    ctx.fill();
    ctx.fillStyle = document.documentElement.dataset.theme === "dark" ? "#e6f2ee" : "#0f1f1a";
    ctx.font = "800 22px Poppins, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(total)), cx, cy - 2);
    ctx.fillStyle = themeTextColor();
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(String(opts.centerLabel || "total"), cx, cy + 16);
    if (opts.legend) renderLegend(canvas.parentElement, clean);
  }

  function renderLegend(container, slices) {
    if (!container) return;
    var el = container.querySelector(".donut-legend");
    if (!el) {
      el = document.createElement("div");
      el.className = "donut-legend";
      container.appendChild(el);
    }
    legendCss();
    el.innerHTML = slices.map(function (s) {
      // label is caller data reaching a text node, and color reaches a
      // style attribute: both must be escaped / validated.
      return '<span><i style="background:' + safeColor(s.color, "#10b981") + '"></i>' +
        escapeHtml(s.label) + " · " + escapeHtml(String(s.value)) + "</span>";
    }).join("");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function legendCss() {
    if (document.getElementById("donutLegendCss")) return;
    var s = document.createElement("style");
    s.id = "donutLegendCss";
    s.textContent = ".donut-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;justify-content:center}.donut-legend span{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--muted)}.donut-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}";
    document.head.appendChild(s);
  }

  /* Rapid double-clicks on a submit button posted the record twice (a
     donation listing, a food request, a broadcast). One capture-phase
     guard covers every form in the app: a form that was already
     submitted inside the cooldown window swallows the repeat. */
  var SUBMIT_COOLDOWN = 1500;
  var lastSubmitAt = typeof WeakMap === "function" ? new WeakMap() : null;

  function installSubmitGuard() {
    if (document.__flSubmitGuard) return;
    document.__flSubmitGuard = true;
    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var now = Date.now();
      if (lastSubmitAt) {
        var prev = lastSubmitAt.get(form) || 0;
        if (now - prev < SUBMIT_COOLDOWN) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lastSubmitAt.set(form, now);
      } else if (form.__flLastSubmit && now - form.__flLastSubmit < SUBMIT_COOLDOWN) {
        e.preventDefault();
        e.stopPropagation();
        return;
      } else {
        form.__flLastSubmit = now;
      }
    }, true);
  }

  /* ---------------- skeleton helpers ---------------- */

  function skeletonCards(n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      out += '<div class="skeleton-card"><div class="skeleton skeleton-img"></div>' +
        '<div class="skeleton skeleton-line"></div>' +
        '<div class="skeleton skeleton-line short"></div></div>';
    }
    return out;
  }

  /* Every form in this app uses a wrapping <label> with no `for`, so
     screen readers announce nothing for the inputs. Bind each label to the
     control it wraps (or to a following control) and give the control an
     id, leaving already-correct markup untouched. */
  var labelSeq = 0;
  function autoLabel(scope) {
    var root = scope || document;
    $all("label", root).forEach(function (label) {
      if (label.getAttribute("for")) return;
      if (label.getAttribute("data-no-auto-label") === "1") return;
      var control = label.querySelector("input, select, textarea");
      if (!control) {
        var parent = label.parentElement;
        if (!parent) return;
        control = parent.querySelector("input, select, textarea");
      }
      if (!control) return;
      if (!control.id) {
        labelSeq += 1;
        control.id = "flF" + labelSeq + "_" + (control.name || "x");
      }
      label.setAttribute("for", control.id);
    });
    // Controls with no label at all (search boxes relying on a placeholder)
    // get an accessible name.
    $all("input, select, textarea", root).forEach(function (control) {
      if (control.type === "hidden") return;
      if (control.getAttribute("aria-label") || control.getAttribute("aria-labelledby")) return;
      if (control.id && document.querySelector('label[for="' + control.id + '"]')) return;
      if (control.closest("label")) return;
      var ph = control.getAttribute("placeholder") || control.getAttribute("name") || control.type;
      if (ph) control.setAttribute("aria-label", String(ph).replace(/[-_]/g, " "));
    });
  }

  window.FoodLink.UI = {
    $1: $1,
    $all: $all,
    escapeHtml: escapeHtml,
    toast: toast,
    autoLabel: autoLabel,
    initials: initials,
    avatarHtml: avatarHtml,
    num: num,
    safeImageUrl: safeImageUrl,
    timeAgo: timeAgo,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    foodEmoji: foodEmoji,
    statusMeta: statusMeta,
    donationCard: donationCard,
    downloadFile: downloadFile,
    animateCount: animateCount,
    runCounters: runCounters,
    showSection: showSection,
    toggleTheme: toggleTheme,
    applyTheme: applyTheme,
    startCountdowns: startCountdowns,
    installSubmitGuard: installSubmitGuard,
    skeletonCards: skeletonCards
  };

  window.FoodLink.Charts = {
    line: drawLineChart,
    bar: drawBarChart,
    donut: drawDonutChart,
    legendCss: legendCss
  };

  window.FoodLink.Shell = {
    init: initShell,
    initNotifications: initNotifications
  };

  if (document.getElementById("sidebar")) {
    document.addEventListener("DOMContentLoaded", function () { initShell(); });
  }
})();
