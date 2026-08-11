(function () {
  window.FoodLink = window.FoodLink || {};

  var Storage = null;
  var Notifications = null;
  var Validation = null;

  function ready() {
    Storage = FoodLink.Storage;
    Notifications = FoodLink.Notifications;
    Validation = FoodLink.Validation;
  }

  var I18N = {
    en: {
      "nav.home": "Home", "nav.donate": "Donate", "nav.browse": "Browse", "nav.impact": "Impact",
      "nav.volunteer": "Volunteer", "nav.about": "About", "nav.contact": "Contact",
      "nav.login": "Login", "nav.register": "Register", "nav.logout": "Logout",
      "hero.badge": "Smart Food Waste Exchange Platform", "hero.sub": "Reduce food waste by connecting restaurants, hotels, households, NGOs, volunteers and communities.",
      "hero.donate": "Donate Food", "hero.browse": "Browse Food", "hero.trust": "meals rescued by our community",
      "stats.meals": "Meals Saved", "stats.listings": "Food Listings", "stats.people": "People Served",
      "stats.ngos": "NGOs", "stats.volunteers": "Volunteers", "stats.co2": "CO₂ Saved",
      "steps.donate": "Donate Surplus", "steps.pickup": "Volunteers Pick Up", "steps.deliver": "Serve the Community",
      "donate.submit": "List this food", "home.viewAll": "View all listings"
    },
    hi: {
      "nav.home": "होम", "nav.donate": "दान करें", "nav.browse": "भोजन देखें", "nav.impact": "प्रभाव",
      "nav.volunteer": "स्वयंसेवक", "nav.about": "हमारे बारे में", "nav.contact": "संपर्क",
      "nav.login": "लॉगिन", "nav.register": "पंजीकरण", "nav.logout": "लॉगआउट",
      "hero.badge": "स्मार्ट फूड वेस्ट एक्सचेंज प्लेटफ़ॉर्म",
      "hero.sub": "रेस्टोरेंट, होटल, घर, NGO, स्वयंसेवकों और समुदायों को जोड़कर खाद्य अपशिष्ट कम करें।",
      "hero.donate": "भोजन दान करें", "hero.browse": "भोजन देखें",
      "hero.trust": "हमारे समुदाय द्वारा बचाए गए भोजन",
      "stats.meals": "बचाए गए भोजन", "stats.listings": "सूची", "stats.people": "लोगों को भोजन",
      "stats.ngos": "NGO", "stats.volunteers": "स्वयंसेवक", "stats.co2": "CO₂ बचत",
      "steps.donate": "अतिरिक्त भोजन दान करें", "steps.pickup": "स्वयंसेवक लें", "steps.deliver": "समुदाय की सेवा",
      "donate.submit": "भोजन सूचीबद्ध करें", "home.viewAll": "सभी सूची देखें"
    },
    es: {
      "nav.home": "Inicio", "nav.donate": "Donar", "nav.browse": "Explorar", "nav.impact": "Impacto",
      "nav.volunteer": "Voluntarios", "nav.about": "Nosotros", "nav.contact": "Contacto",
      "nav.login": "Entrar", "nav.register": "Registrarse", "nav.logout": "Salir",
      "hero.badge": "Plataforma inteligente de intercambio de alimentos",
      "hero.sub": "Reduce el desperdicio conectando restaurantes, hoteles, hogares, ONG, voluntarios y comunidades.",
      "hero.donate": "Donar comida", "hero.browse": "Ver alimentos",
      "hero.trust": "comidas rescatadas por nuestra comunidad",
      "stats.meals": "Comidas salvadas", "stats.listings": "Publicaciones", "stats.people": "Personas atendidas",
      "stats.ngos": "ONG", "stats.volunteers": "Voluntarios", "stats.co2": "CO₂ ahorrado",
      "steps.donate": "Dona el excedente", "steps.pickup": "Voluntarios recogen", "steps.deliver": "Sirve a la comunidad",
      "donate.submit": "Publicar comida", "home.viewAll": "Ver todas las publicaciones"
    }
  };

  function applyLanguage(lang) {
    if (!I18N[lang]) lang = "en";
    document.documentElement.lang = lang === "hi" ? "hi" : lang;
    var dict = I18N[lang];
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (dict[key]) nodes[i].textContent = dict[key];
    }
    var sel = document.getElementById("langSelect");
    if (sel) sel.value = lang;
  }

  function initLanguage() {
    var lang = Storage.getLang();
    applyLanguage(lang);
    var sel = document.getElementById("langSelect");
    if (sel) {
      sel.addEventListener("change", function () {
        Storage.setLang(sel.value);
        applyLanguage(sel.value);
        Notifications.info("Language updated", "🌐");
      });
    }
  }

  function initTheme() {
    var saved = Storage.getTheme();
    document.documentElement.setAttribute("data-theme", saved === "dark" ? "dark" : "light");
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", function () {
        var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        Storage.setTheme(next);
      });
    }
  }

  function initCustomizer() {
    var saved = Storage.getCustomizer();
    if (saved) applyCustomizer(saved, false);
    var panel = document.getElementById("customizer");
    var toggle = document.getElementById("customizerToggle");
    var close = document.getElementById("customizerClose");

    if (toggle) {
      toggle.addEventListener("click", function () {
        panel.classList.toggle("open");
        panel.setAttribute("aria-hidden", panel.classList.contains("open") ? "false" : "true");
      });
    }
    if (close) close.addEventListener("click", function () { panel.classList.remove("open"); });

    var swatches = document.querySelectorAll(".swatch");
    swatches.forEach(function (sw) {
      sw.addEventListener("click", function () {
        var accent = sw.getAttribute("data-accent");
        applyCustomizer({ accent: accent }, true);
        swatches.forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
      });
    });

    var radiusOpts = document.querySelectorAll(".radius-opt");
    radiusOpts.forEach(function (opt) {
      if (opt.hasAttribute("data-radius")) {
        opt.addEventListener("click", function () {
          applyCustomizer({ radius: opt.getAttribute("data-radius") }, true);
          radiusOpts.forEach(function (o) {
            if (o.hasAttribute("data-radius")) o.classList.remove("active");
          });
          opt.classList.add("active");
        });
      }
      if (opt.hasAttribute("data-glass")) {
        opt.addEventListener("click", function () {
          applyCustomizer({ glass: opt.getAttribute("data-glass") }, true);
          radiusOpts.forEach(function (o) {
            if (o.hasAttribute("data-glass")) o.classList.remove("active");
          });
          opt.classList.add("active");
        });
      }
      if (opt.hasAttribute("data-fontscale")) {
        opt.addEventListener("click", function () {
          applyCustomizer({ fontScale: opt.getAttribute("data-fontscale") }, true);
          radiusOpts.forEach(function (o) {
            if (o.hasAttribute("data-fontscale")) o.classList.remove("active");
          });
          opt.classList.add("active");
        });
      }
    });

    var reset = document.getElementById("resetCustomizer");
    if (reset) {
      reset.addEventListener("click", function () {
        Storage.remove(Storage.KEYS.customizer);
        document.documentElement.style.setProperty("--primary", "#2E7D32");
        document.documentElement.style.setProperty("--primary-light", "#4CAF50");
        document.documentElement.style.setProperty("--primary-dark", "#1B5E20");
        document.documentElement.style.setProperty("--accent", "#4CAF50");
        document.documentElement.style.setProperty("--radius", "16px");
        document.documentElement.style.setProperty("--font-scale", "1");
        document.documentElement.removeAttribute("data-glass");
        document.querySelectorAll(".swatch").forEach(function (s) { s.classList.remove("active"); });
        document.querySelectorAll(".radius-opt").forEach(function (o) { o.classList.remove("active"); });
        var firstSwatch = document.querySelector('.swatch[data-accent="#2E7D32"]');
        if (firstSwatch) firstSwatch.classList.add("active");
        document.querySelectorAll('.radius-opt[data-radius="16"]').forEach(function (o) { o.classList.add("active"); });
        document.querySelectorAll('.radius-opt[data-glass="1"]').forEach(function (o) { o.classList.add("active"); });
        document.querySelectorAll('.radius-opt[data-fontscale="1"]').forEach(function (o) { o.classList.add("active"); });
        Notifications.success("Theme restored to defaults");
      });
    }
  }

  function applyCustomizer(cfg, persist) {
    var root = document.documentElement.style;
    if (cfg.accent) {
      root.setProperty("--primary", cfg.accent);
      root.setProperty("--primary-light", cfg.accent);
      root.setProperty("--primary-dark", cfg.accent);
      root.setProperty("--accent", cfg.accent);
      document.querySelectorAll(".swatch").forEach(function (s) {
        s.classList.toggle("active", s.getAttribute("data-accent") === cfg.accent);
      });
    }
    if (cfg.radius) {
      root.setProperty("--radius", cfg.radius + "px");
      document.querySelectorAll('.radius-opt[data-radius]').forEach(function (o) {
        o.classList.toggle("active", o.getAttribute("data-radius") === cfg.radius);
      });
    }
    if (cfg.glass !== undefined) {
      if (cfg.glass === "1") document.documentElement.removeAttribute("data-glass");
      else document.documentElement.setAttribute("data-glass", "solid");
      document.querySelectorAll('.radius-opt[data-glass]').forEach(function (o) {
        o.classList.toggle("active", o.getAttribute("data-glass") === cfg.glass);
      });
    }
    if (cfg.fontScale) {
      root.setProperty("--font-scale", cfg.fontScale);
      document.querySelectorAll('.radius-opt[data-fontscale]').forEach(function (o) {
        o.classList.toggle("active", o.getAttribute("data-fontscale") === cfg.fontScale);
      });
    }
    if (persist) {
      var full = {
        accent: cfg.accent || "",
        radius: cfg.radius || "",
        glass: cfg.glass !== undefined ? cfg.glass : "",
        fontScale: cfg.fontScale || ""
      };
      Storage.setCustomizer(full);
    }
  }

  function initClock() {
    var el = document.getElementById("liveClock");
    if (!el) return;
    function tick() {
      var d = new Date();
      var h = d.getHours();
      var ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      var mm = d.getMinutes();
      var ss = d.getSeconds();
      function pad(n) { return n < 10 ? "0" + n : "" + n; }
      el.textContent = pad(h) + ":" + pad(mm) + ":" + pad(ss) + " " + ampm;
    }
    tick();
    setInterval(tick, 1000);
  }

  var WEATHER_POOL = [
    { icon: "☀️", desc: "Sunny", temps: [30, 34, 36] },
    { icon: "⛅", desc: "Partly cloudy", temps: [26, 30, 33] },
    { icon: "🌧️", desc: "Light rain", temps: [22, 25, 27] },
    { icon: "🌤️", desc: "Clear skies", temps: [27, 31, 34] },
    { icon: "☁️", desc: "Cloudy", temps: [24, 28, 30] }
  ];

  function initWeather() {
    var tempEl = document.getElementById("weatherTemp");
    var descEl = document.getElementById("weatherDesc");
    var iconEl = document.getElementById("weatherIcon");
    if (!tempEl || !descEl || !iconEl) return;

    function update() {
      var idx = Math.floor((Date.now() / 1000 / 900) % WEATHER_POOL.length);
      var w = WEATHER_POOL[idx];
      var hour = new Date().getHours();
      var temp = w.temps[hour < 12 ? 0 : hour < 18 ? 2 : 1];
      iconEl.textContent = w.icon;
      tempEl.textContent = temp + "°C";
      descEl.textContent = w.desc + " · Bengaluru";
    }
    update();
    setInterval(update, 900000);
  }

  function initAccordion() {
    var items = document.querySelectorAll(".faq-item");
    items.forEach(function (item) {
      var btn = item.querySelector(".faq-question");
      var answer = item.querySelector(".faq-answer");
      if (!btn || !answer) return;
      btn.addEventListener("click", function () {
        var open = item.classList.contains("open");
        items.forEach(function (other) {
          if (other !== item) {
            other.classList.remove("open");
            var oBtn = other.querySelector(".faq-question");
            var oAns = other.querySelector(".faq-answer");
            if (oBtn) oBtn.setAttribute("aria-expanded", "false");
            if (oAns) oAns.style.maxHeight = null;
          }
        });
        if (open) {
          item.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          answer.style.maxHeight = null;
        } else {
          item.classList.add("open");
          btn.setAttribute("aria-expanded", "true");
          answer.style.maxHeight = answer.scrollHeight + "px";
        }
      });
    });
  }

  function initNavbar() {
    var navbar = document.getElementById("navbar");
    var hamburger = document.getElementById("hamburger");
    var navLinks = document.getElementById("navLinks");
    var backToTop = document.getElementById("backToTop");

    function onScroll() {
      var y = window.pageYOffset;
      if (navbar) navbar.classList.toggle("scrolled", y > 30);
      if (backToTop) backToTop.classList.toggle("visible", y > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (hamburger && navLinks) {
      hamburger.addEventListener("click", function () {
        var open = navLinks.classList.toggle("open");
        hamburger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      navLinks.addEventListener("click", function (e) {
        if (e.target.closest("a") || e.target.closest(".nav-logout")) {
          navLinks.classList.remove("open");
          hamburger.setAttribute("aria-expanded", "false");
        }
      });
    }

    if (backToTop) {
      backToTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  function initChat() {
    var fab = document.getElementById("chatFab");
    var widget = document.getElementById("chatWidget");
    var form = document.getElementById("chatForm");
    var input = document.getElementById("chatText");
    var body = document.getElementById("chatBody");

    if (fab && widget) {
      fab.addEventListener("click", function () {
        var open = widget.classList.toggle("open");
        fab.classList.toggle("open", open);
        widget.setAttribute("aria-hidden", open ? "false" : "true");
        if (open && input) input.focus();
      });
    }

    var quickBtns = document.querySelectorAll(".chat-quick button");
    quickBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        if (input) {
          input.value = b.getAttribute("data-q");
          send();
        }
      });
    });

    function addMsg(text, who) {
      var div = document.createElement("div");
      div.className = "chat-msg " + who;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    function botReply(msg) {
      var t = msg.toLowerCase();
      if (t.indexOf("donat") !== -1 || t.indexOf("दान") !== -1) {
        return "To donate, go to the Donate page and list your surplus food. Add details like servings, pickup window and city, and NGOs nearby will reserve it! 🍱";
      }
      if (t.indexOf("volunteer") !== -1 || t.indexOf("स्वयंसेवक") !== -1) {
        return "Head to the Volunteer page and hit 'Become a volunteer'. You'll get a profile badge and can accept pickups on your route. 🚴";
      }
      if (t.indexOf("pickup") !== -1 || t.indexOf("pick up") !== -1) {
        return "Pickups happen within the safe window you choose (1–48h). The matched volunteer/NGO will confirm before arriving. ⏰";
      }
      if (t.indexOf("coin") !== -1 || t.indexOf("reward") !== -1) {
        return "Every donation earns Green Coins. 100 = Silver, 300 = Gold, 600 = Diamond. Check your Profile → Rewards! 🪙";
      }
      if (t.indexOf("ngos") !== -1 || t.indexOf("partner") !== -1) {
        return "NGOs can join free with zero commission. Open the NGO Partners page and click 'Become a partner'. 🏛️";
      }
      return "I can help with donating food, volunteering, pickup details, rewards and NGO partnerships. What would you like to know? 😊";
    }

    function send() {
      var text = input.value.trim();
      if (!text) return;
      addMsg(text, "user");
      input.value = "";
      setTimeout(function () { addMsg(botReply(text), "bot"); }, 600);
    }

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        send();
      });
    }
  }

  function initNewsletter() {
    var form = document.getElementById("newsletterForm");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("nlEmail");
      var msg = document.getElementById("nlMsg");
      if (!Validation.isEmail(input.value)) {
        if (msg) msg.textContent = "Please enter a valid email address.";
        input.classList.add("invalid");
        return;
      }
      input.classList.remove("invalid");
      if (msg) msg.textContent = "";
      Notifications.success("Subscribed! Welcome to the FoodLink family. 🎉", "Newsletter");
      form.reset();
    });
  }

  function initPasswordToggles() {
    var toggles = document.querySelectorAll(".toggle-pass");
    toggles.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-target"));
        if (target) {
          target.type = target.type === "password" ? "text" : "password";
        }
      });
    });
  }

  function imageToDataURL(file, maxDim, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  var api = {
    initTheme: initTheme,
    initCustomizer: initCustomizer,
    applyCustomizer: applyCustomizer,
    initLanguage: initLanguage,
    applyLanguage: applyLanguage,
    initClock: initClock,
    initWeather: initWeather,
    initAccordion: initAccordion,
    initNavbar: initNavbar,
    initChat: initChat,
    initNewsletter: initNewsletter,
    initPasswordToggles: initPasswordToggles,
    imageToDataURL: imageToDataURL,
    init: function () {
      ready();
      initTheme();
      initCustomizer();
      initLanguage();
      initClock();
      initWeather();
      initAccordion();
      initNavbar();
      initChat();
      initNewsletter();
      initPasswordToggles();
    }
  };

  FoodLink.UI = api;
})();
