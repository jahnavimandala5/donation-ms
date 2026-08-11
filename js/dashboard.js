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
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) { return w[0].toUpperCase(); })
      .join("");
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
    if (!ts) return "";
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + " hr ago";
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + " day" + (days > 1 ? "s" : "") + " ago";
    return formatDate(ts);
  }

  function formatDate(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatDateTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  function foodEmoji(name) {
    var n = String(name || "").toLowerCase();
    var map = [
      [/biryani|pulao|fried rice|rice/, "🍛"],
      [/biryani/, "🍛"],
      [/pizza/, "🍕"],
      [/burger|sandwich|roll|wrap/, "🥪"],
      [/curry|sabzi|gravy|paneer|dal|makhani|rajma|chole/, "🍛"],
      [/bread|roti|naan|chapati|paratha|baguette|pastr|croissant/, "🥐"],
      [/cake|pastry|brownie|dessert|mithai|sweet|kheer|halwa|cupcake/, "🍰"],
      [/fruit|salad|vegetable|veggies/, "🥗"],
      [/kheer|pudding/, "🍮"],
      [/coffee|lassi|juice|smoothie|beverage|tea/, "🥤"],
      [/chicken|mutton|pork|meat|egg|fish|non.?veg/, "🍗"],
      [/snack|starter|spring roll|samosa|pakora|kebab/, "🍢"],
      [/staple|grocery|grain|pulse|flour/, "🌾"]
    ];
    for (var i = 0; i < map.length; i++) { if (map[i][0].test(n)) return map[i][1]; }
    return "🍽️";
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
    var meta = statusMeta(S.donationStatus(d));
    var donor = S.donorById(d.donorId);
    var img = d.image
      ? '<img src="' + d.image + '" alt="' + escapeHtml(d.foodName) + '">'
      : '<span class="food-emoji">' + foodEmoji(d.foodName) + "</span>";
    var donorName = d.donorName || donor.name;
    var donorType = d.foodType || donor.type || "Individual";

    return (
      '<article class="food-card" data-id="' + d.id + '">' +
        '<div class="food-img">' + img +
          '<span class="veg-tag ' + (d.category === "veg" ? "veg" : "nonveg") + '"></span>' +
          '<span class="food-status ' + meta.cls + '">' + meta.label + "</span>" +
          (opts.showCountdown && S.donationStatus(d) === "available"
            ? '<span class="food-countdown" data-countdown="' + d.id + '">⏱ <span>--:--:--</span></span>' : "") +
        "</div>" +
        '<div class="food-body">' +
          '<h3 class="food-name">' + escapeHtml(d.foodName) + "</h3>" +
          '<div class="food-donor">' + avatarHtml(donorName) +
            '<div><span class="food-donor-name">' + escapeHtml(donorName) + '</span>' +
            '<span class="food-donor-type">' + escapeHtml(donorType) + " • " + escapeHtml(d.city || "") + "</span></div></div>" +
          '<div class="food-meta">' +
            '<span><svg class="icon"><use href="#i-users"/></svg>' + d.servings + " servings</span>" +
            '<span>⚖️ ' + d.quantity + " kg</span>" +
            '<span><svg class="icon"><use href="#i-map-pin"/></svg>' + escapeHtml(d.city || "") + "</span>" +
          "</div>" +
          (opts.footer ? opts.footer(d) : "") +
        "</div>" +
      "</article>"
    );
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

  function animateCount(el, target, suffix, dur) {
    if (!el) return;
    var start = 0;
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / (dur || 1200), 1);
      p = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * p).toLocaleString("en-IN") + (suffix || "");
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
    $all(".side-item").forEach(function (i) { i.classList.toggle("active", i.dataset.section === name); });
    var sec = $1("#sec-" + name);
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
    if (btn) btn.addEventListener("click", function (e) { e.stopPropagation(); dd.classList.toggle("open"); });
    document.addEventListener("click", function (e) {
      if (!dd.contains(e.target)) dd.classList.remove("open");
    });
  }

  function initNotifications() {
    var bell = $1("#notifBell");
    var drop = $1("#notifDrop");
    if (!bell || !drop) return;
    var user = S.currentUser();
    if (!user) return;

    function renderList() {
      var list = S.notificationsFor(user.id);
      var listEl = $1("#notifList");
      var countEl = $1("#notifCount");
      if (!listEl) return;
      var unread = list.filter(function (n) { return !n.read; }).length;
      if (countEl) {
        countEl.textContent = unread;
        countEl.classList.toggle("hidden", unread === 0);
      }
      if (!list.length) {
        listEl.innerHTML = '<div class="empty-state" style="padding:30px 16px"><span class="empty-emoji">🔔</span><h4>No notifications</h4></div>';
        return;
      }
      listEl.innerHTML = list.slice(0, 10).map(function (n) {
        var meta = { success: "i-check", info: "i-info", warning: "i-alert" };
        return (
          '<div class="notif-item' + (n.read ? "" : " unread") + '" data-id="' + n.id + '">' +
            '<span class="notif-icon ' + n.type + '"><svg class="icon"><use href="#' + (meta[n.type] || "i-info") + '"/></svg></span>' +
            '<div><div class="notif-item-title">' + escapeHtml(n.title) + "</div>" +
            '<div class="notif-item-msg">' + escapeHtml(n.message) + "</div>" +
            '<div class="notif-item-time">' + timeAgo(n.createdAt) + "</div></div></div>"
        );
      }).join("");
      listEl.querySelectorAll(".notif-item").forEach(function (item) {
        item.addEventListener("click", function () {
          S.Notifications.update(item.dataset.id, { read: true });
          renderList();
        });
      });
    }

    bell.addEventListener("click", function (e) {
      e.stopPropagation();
      drop.classList.toggle("open");
      if (drop.classList.contains("open")) renderList();
    });
    document.addEventListener("click", function (e) {
      if (!drop.contains(e.target)) drop.classList.remove("open");
    });
    var markBtn = $1("#markAllRead");
    if (markBtn) markBtn.addEventListener("click", function () {
      S.markAllRead(user.id);
      renderList();
    });
    renderList();
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

  function startCountdowns() {
    function tick() {
      $all("[data-countdown]").forEach(function (el) {
        var d = S.Donations.byId(el.dataset.countdown);
        if (!d) { el.remove(); return; }
        var left = d.expiresAt - Date.now();
        if (left <= 0) {
          el.innerHTML = "<span>EXPIRED</span>";
          el.classList.add("urgent");
          return;
        }
        var h = Math.floor(left / 3600000);
        var m = Math.floor((left % 3600000) / 60000);
        var s = Math.floor((left % 60000) / 1000);
        var pad = function (x) { return x < 10 ? "0" + x : x; };
        el.querySelector("span").textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
        el.classList.toggle("warn", left < 2 * 3600000);
        el.classList.toggle("urgent", left < 3600000);
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- charts (vanilla canvas) ---------------- */

  function prepCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(rect.width, 10) * dpr;
    canvas.height = Math.max(rect.height, 10) * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  function themeGridColor() {
    return document.documentElement.dataset.theme === "dark" ? "rgba(148,163,184,0.15)" : "rgba(15,40,32,0.08)";
  }

  function drawLineChart(canvas, labels, data, opts) {
    opts = opts || {};
    var g = prepCanvas(canvas);
    var ctx = g.ctx;
    var padL = 44, padR = 14, padT = 20, padB = 34;
    var cw = g.w - padL - padR, ch = g.h - padT - padB;
    var max = Math.max.apply(null, data.concat([1])) * 1.15;
    var color = opts.color || "#10b981";

    ctx.strokeStyle = themeGridColor();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (var gi = 0; gi <= 4; gi++) {
      var y = padT + ch - (ch * gi / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(g.w - padR, y); ctx.stroke();
      ctx.fillStyle = themeGridColor();
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(max * gi / 4), padL - 8, y + 4);
    }
    ctx.setLineDash([]);

    var step = cw / Math.max(data.length - 1, 1);
    var pts = data.map(function (v, i) { return { x: padL + i * step, y: padT + ch - (ch * v / max) }; });

    var grad = ctx.createLinearGradient(0, padT, 0, g.h);
    grad.addColorStop(0, color + "55");
    grad.addColorStop(1, color + "00");
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
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(data[i])), p.x, p.y - 10);
    });

    ctx.fillStyle = themeGridColor();
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    var lstep = cw / Math.max(labels.length, 1);
    labels.forEach(function (lb, i) {
      ctx.fillText(String(lb), padL + lstep * i + lstep / 2, g.h - 12);
    });
  }

  function drawBarChart(canvas, labels, data, opts) {
    opts = opts || {};
    var g = prepCanvas(canvas);
    var ctx = g.ctx;
    var padL = 40, padR = 12, padT = 24, padB = 34;
    var cw = g.w - padL - padR, ch = g.h - padT - padB;
    var max = Math.max.apply(null, data.concat([1])) * 1.2;

    ctx.strokeStyle = themeGridColor();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (var gi = 0; gi <= 4; gi++) {
      var y = padT + ch - (ch * gi / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(g.w - padR, y); ctx.stroke();
      ctx.fillStyle = themeGridColor();
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(max * gi / 4), padL - 8, y + 4);
    }
    ctx.setLineDash([]);

    var slot = cw / data.length;
    var barW = Math.min(slot * 0.55, 46);
    data.forEach(function (v, i) {
      var h = ch * v / max;
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + ch - h;
      var grd = ctx.createLinearGradient(0, y, 0, padT + ch);
      grd.addColorStop(0, opts.colors ? opts.colors[i] : "#10b981");
      grd.addColorStop(1, opts.colors ? opts.colors[i] + "77" : "#0d9488");
      roundRect(ctx, x, y, barW, h, 6);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.fillStyle = opts.colors ? opts.colors[i] : "#059669";
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.round(v)), x + barW / 2, y - 6);
      ctx.fillStyle = themeGridColor();
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(String(labels[i]), x + barW / 2, g.h - 10);
    });
  }

  function drawDonutChart(canvas, slices, opts) {
    opts = opts || {};
    var g = prepCanvas(canvas);
    var ctx = g.ctx;
    var cx = g.w / 2, cy = g.h / 2;
    var r = Math.min(g.w, g.h) / 2 - 14;
    var inner = r * 0.62;
    var total = 0;
    slices.forEach(function (s) { total += s.value; });
    if (total <= 0) {
      ctx.strokeStyle = themeGridColor();
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.arc(cx, cy, r - 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = themeGridColor();
      ctx.font = "700 16px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No data", cx, cy + 6);
      return;
    }
    var start = -Math.PI / 2;
    slices.forEach(function (s) {
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
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = "#0f1f1a";
    ctx.font = "800 22px Poppins, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(total), cx, cy - 2);
    ctx.fillStyle = themeGridColor();
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(opts.centerLabel || "total", cx, cy + 16);
    if (opts.legend) renderLegend(canvas.parentElement, slices);
  }

  function renderLegend(container, slices) {
    var el = container.querySelector(".donut-legend");
    if (!el) {
      el = document.createElement("div");
      el.className = "donut-legend";
      container.appendChild(el);
    }
    el.innerHTML = slices.map(function (s) {
      return '<span><i style="background:' + s.color + '"></i>' + s.label + " · " + s.value + "</span>";
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

  window.FoodLink.UI = {
    $1: $1,
    $all: $all,
    escapeHtml: escapeHtml,
    toast: toast,
    initials: initials,
    avatarHtml: avatarHtml,
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
