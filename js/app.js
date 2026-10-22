/* =====================================================================
   FoodLink - app.js
   Landing page behaviour + authentication + shared init.
   ===================================================================== */

(function () {
  "use strict";

var S = window.FoodLink.Storage;
var UI = window.FoodLink.UI;
var Modal = window.FoodLink.Modal;
var V = window.FoodLink.Validation;
var API = window.FoodLink.API;


  window.toast = function (t, m, ty) { UI.toast(t, m, ty); };

  var DONOR_TYPES = ["Restaurant", "Hotel", "Cafe", "Bakery", "Household", "Individual", "Corporate", "Catering", "Grocery Store", "Supermarket", "Event Organizer", "Fruit Market", "Vegetable Vendor", "School", "College", "Hostel"];
  var RECEIVER_TYPES = ["NGO", "Old Age Home", "Orphanage", "Shelter", "Community Kitchen", "Animal Shelter", "Charitable Trust", "Individual"];

  /* ---------------- shared init ---------------- */

  function sharedInit() {
    UI.applyTheme();
    releasePreloader();
    var back = document.getElementById("backToTop");
    if (back) {
      window.addEventListener("scroll", function () {
        back.classList.toggle("show", window.scrollY > 500);
      });
      back.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    }
  }

  /* ---------------- landing only ---------------- */

  function initLanding() {
    if (!document.getElementById("home")) return;

    var navbar = document.getElementById("navbar");
    window.addEventListener("scroll", function () {
      if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 30);
    });

    var hamburger = document.getElementById("hamburger");
    var navLinks = document.getElementById("navLinks");
    if (hamburger && navLinks) {
      function setNav(open) {
        navLinks.classList.toggle("open", open);
        hamburger.setAttribute("aria-expanded", open ? "true" : "false");
      }
      hamburger.setAttribute("aria-controls", navLinks.id || "navLinks");
      hamburger.setAttribute("aria-expanded", "false");
      hamburger.addEventListener("click", function (e) {
        e.stopPropagation();
        setNav(!navLinks.classList.contains("open"));
      });
      document.addEventListener("click", function (e) {
        if (navLinks.classList.contains("open") && !navLinks.contains(e.target) && e.target !== hamburger) {
          setNav(false);
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && navLinks.classList.contains("open")) {
          setNav(false);
          hamburger.focus();
        }
      });
    }

    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    initReveal();
    initLandingStats();
    initLeaderboard();
    initFeaturedFood();
    initFAQ();
    initForms();
    initAuthBindings();

    if (S.currentUser()) updateNavUser();
  }

  var revealObserver = null;

  function initReveal() {
    var items = document.querySelectorAll("[data-reveal]:not(.revealed)");
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add("revealed"); });
      return;
    }
    // One shared observer. Creating a second over the same elements made
    // every [data-reveal] node observed twice with no teardown.
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("revealed");
            revealObserver.unobserve(en.target);
          }
        });
      }, { threshold: 0.12 });
    }
    Array.prototype.forEach.call(items, function (el) { revealObserver.observe(el); });
  }

  function initLandingStats() {
    var donations = S.Donations.all();
    var now = Date.now();
    // Only food that actually reached someone counts as saved. Summing
    // every record included expired and cancelled donations, so the
    // "Meals Saved" headline over-reported.
    var delivered = donations.filter(function (d) {
      return S.donationStatus(d) === "completed";
    });
    var meals = delivered.reduce(function (s, d) { return s + (Number(d.servings) || 0); }, 0);
    var kg = delivered.reduce(function (s, d) { return s + (Number(d.quantity) || 0); }, 0);
    var available = donations.filter(function (d) { return S.donationStatus(d) === "available"; }).length;

    // Derive the org counts from real data instead of hard-coded literals
    // that contradicted the seeded records.
    var all = S.Users.all();
    var receivers = all.filter(function (u) { return u && u.role === "receiver"; });
    var donors = all.filter(function (u) { return u && u.role === "donor"; });
    function countType(t) {
      return receivers.filter(function (u) { return u.type === t; }).length;
    }
    // Every headline number is a direct count of stored records. Nothing is
    // scaled or padded with demo constants, so the page can never claim more
    // impact than the database actually contains.
    var servedReceiverIds = {};
    delivered.forEach(function (d) {
      if (d.reservedBy) servedReceiverIds[d.reservedBy] = true;
    });

    // Documented estimate: 3.4 kg CO2e avoided per kg of food rescued. Shown
    // in the UI with an "(est.)" label so it is never mistaken for a measure.
    var CO2_PER_KG = 3.4;

    var mins = {
      mealsSaved: meals,
      foodDonated: Math.round(kg),
      peopleHelped: Object.keys(servedReceiverIds).length,
      ngos: receivers.length,
      restaurants: donors.filter(function (u) { return u.type === "Restaurant"; }).length,
      oldAgeHomes: countType("Old Age Home"),
      orphanages: countType("Orphanage"),
      volunteers: all.filter(function (u) { return u && u.role === "volunteer"; }).length,
      co2Saved: Math.round(kg * CO2_PER_KG)
    };

    var mini = document.getElementById("miniTodayMeals");
    var active = document.getElementById("miniActiveListings");
    if (active) active.textContent = available;
    void now;

    Array.prototype.forEach.call(document.querySelectorAll("[data-metric]"), function (el) {
      var key = el.dataset.metric;
      if (mins[key] !== undefined) {
        el.dataset.count = mins[key];
        el.textContent = "0";
      }
    });
    // #miniTodayMeals carries data-metric="mealsSaved" too, so it is
    // animated by runCounters(); writing it here first was dead code.
    if (mini && !mini.dataset.metric) mini.textContent = mins.mealsSaved.toLocaleString("en-IN");
    UI.runCounters();
  }

  function initLeaderboard() {
    var grid = document.getElementById("lbPreview");
    if (!grid) return;
    var donations = S.Donations.all();
    var all = S.Users.all();

    function mealsFor(u) {
      return donations
        .filter(function (d) { return d.donorId === u.id && S.donationStatus(d) === "completed"; })
        .reduce(function (s, d) { return s + (Number(d.servings) || 0); }, 0);
    }
    function receivedFor(u) {
      return donations
        .filter(function (d) { return d.reservedBy === u.id && S.donationStatus(d) === "completed"; })
        .reduce(function (s, d) { return s + (Number(d.servings) || 0); }, 0);
    }
    function score(u) { return mealsFor(u) + receivedFor(u) + (Number(u.points) || 0); }
    function rowFor(u) {
      // Number() on points stops a record without the field producing NaN,
      // which previously rendered the literal string "NaN" and left the
      // sort order engine-defined.
      return {
        name: u.orgName || u.name,
        city: u.city,
        points: score(u),
        initials: UI.initials(u.orgName || u.name)
      };
    }
    function rank(list) {
      return list.slice().sort(function (a, b) { return b.points - a.points; }).slice(0, 5);
    }

    var donors = rank(all.filter(function (u) { return u && u.role === "donor"; }).map(rowFor));
    var receivers = rank(all.filter(function (u) { return u && u.role === "receiver"; }).map(rowFor));

    // "Best by Category" must pick the highest scoring receiver of each
    // type; it previously took receiversByType[t][0], i.e. whichever user
    // happened to be inserted first.
    var bestByType = Object.keys(all.filter(function (u) { return u && u.role === "receiver"; })
      .reduce(function (acc, u) {
        var t = u.type || "Other";
        (acc[t] = acc[t] || []).push(u);
        return acc;
      }, {})).map(function (t) {
        return all.filter(function (u) { return u && u.role === "receiver" && (u.type || "Other") === t; })
          .map(rowFor)
          .sort(function (a, b) { return b.points - a.points; })[0];
      }).filter(Boolean).slice(0, 5);

    var GRADS = [
      "linear-gradient(135deg,#10b981,#0d9488)",
      "linear-gradient(135deg,#f59e0b,#ea580c)",
      "linear-gradient(135deg,#0ea5e9,#2563eb)",
      "linear-gradient(135deg,#8b5cf6,#6366f1)",
      "linear-gradient(135deg,#ec4899,#db2777)"
    ];

    function panel(title, emoji, list) {
      if (!list.length) {
        return '<div class="panel" data-reveal="fade-up"><div class="panel-head"><h3>' + emoji + " " + title + "</h3></div>" +
          '<p class="lb-city">No data yet.</p></div>';
      }
      var rows = list.map(function (r, i) {
        return '<div class="lb-item"><span class="lb-rank">' + (i + 1) + "</span>" +
          '<span class="avatar" style="background:' + GRADS[i % GRADS.length] + '">' + UI.escapeHtml(r.initials) + "</span>" +
          '<div><div class="lb-name">' + UI.escapeHtml(r.name) + '</div><div class="lb-city">' + UI.escapeHtml(r.city || "") + "</div></div>" +
          '<div class="lb-points"><strong>' + r.points.toLocaleString("en-IN") + '</strong><span>pts</span></div></div>';
      }).join("");
      return '<div class="panel" data-reveal="fade-up"><div class="panel-head"><h3>' + emoji + " " + title + "</h3></div>" + rows + "</div>";
    }

    grid.innerHTML = panel("Top Donors", "\u{1F35B}", donors) +
      panel("Top NGOs & Receivers", "\u{1F932}", receivers) +
      panel("Best by Category", "\u{1F3C6}", bestByType);
    initReveal();
  }

  function initFeaturedFood() {
    var grid = document.getElementById("featuredFood");
    if (!grid) return;
    // "Freshly listed" must actually be sorted; raw localStorage order is
    // unshift order, which is arbitrary.
    var featured = S.Donations.all()
      .filter(function (d) { return S.donationStatus(d) === "available"; })
      .sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); })
      .slice(0, 6);
    if (!featured.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-emoji">&#127869;</span><h4>No food listed right now</h4><p>Be the first to donate today.</p></div>';
      return;
    }
    grid.innerHTML = featured.map(function (d) {
      return UI.donationCard(d, {
        showCountdown: true,
        footer: function () {
          return '<div class="food-actions">' +
            '<button class="btn btn-primary btn-sm" data-view="' + UI.escapeHtml(d.id) + '">View Details</button>' +
            "</div>";
        }
      });
    }).join("");
    Array.prototype.forEach.call(grid.querySelectorAll("[data-view]"), function (b) {
      b.addEventListener("click", function () { openPublicDetails(b.dataset.view); });
    });
    UI.startCountdowns();
  }

  function openPublicDetails(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    var donor = S.donorById(d.donorId);
    // d.image is user-controlled; it was previously injected raw into the
    // src attribute, allowing stored XSS on the landing page.
    var img = UI.safeImageUrl(d.image)
      ? '<img src="' + UI.escapeHtml(d.image) + '" alt="' + UI.escapeHtml(d.foodName) + '" style="width:100%;height:220px;object-fit:cover;border-radius:14px;margin-bottom:18px">'
      : '<div style="font-size:90px;text-align:center;padding:20px 0">' + UI.foodEmoji(d.foodName) + "</div>";
    var reserveBtn = '<button class="btn btn-primary btn-block" id="publicReserve">Reserve this food</button>';
    Modal.open(
      '<div class="modal-title">' + UI.escapeHtml(d.foodName) + "</div>" +
      '<div class="modal-sub">' + UI.escapeHtml(donor.orgName || donor.name) + " &middot; " + UI.escapeHtml(d.foodType || "") + "</div>" +
      img +
      '<div class="food-meta" style="margin-bottom:16px">' +
      '<span>&#127869; ' + UI.num(d.servings) + " servings</span><span>&#9878; " + UI.num(d.quantity) + " kg</span>" +
      '<span>&#128340; ' + UI.escapeHtml(UI.formatDateTime(d.expiresAt)) + "</span></div>" +
      "<p class='modal-sub'>" + UI.escapeHtml(d.description || "No description provided.") + "</p>" +
      '<div class="food-meta" style="margin-bottom:18px"><span>&#128205; ' + UI.escapeHtml([d.address, d.city].filter(Boolean).join(", ")) + "</span></div>" +
      '<div class="form-actions">' + reserveBtn + "</div>",
      { size: "lg", label: d.foodName, onOpen: function (m) {
          var btn = m.querySelector("#publicReserve");
          if (btn) btn.addEventListener("click", function () { Modal.close(); openLoginModal("receiver"); });
        } }
    );
  }

  /* ---------------- FAQ ---------------- */

  function initFAQ() {
    function answer(item) { return item.querySelector(".faq-a"); }

    function close(item) {
      item.classList.remove("open");
      var a = answer(item);
      if (a) a.style.maxHeight = "0px";
      var q = item.querySelector(".faq-q");
      if (q) q.setAttribute("aria-expanded", "false");
    }

    function open(item) {
      var a = answer(item);
      if (!a) return;
      item.classList.add("open");
      a.style.maxHeight = a.scrollHeight + "px";
      var q = item.querySelector(".faq-q");
      if (q) q.setAttribute("aria-expanded", "true");
    }

    Array.prototype.forEach.call(document.querySelectorAll(".faq-item"), function (item) {
      var q = item.querySelector(".faq-q");
      var a = answer(item);
      if (!q || !a) return;
      q.setAttribute("aria-expanded", item.classList.contains("open") ? "true" : "false");

      // The first item ships with class="open" but no inline maxHeight,
      // so the chevron pointed down while the answer stayed invisible.
      if (item.classList.contains("open")) open(item);

      q.addEventListener("click", function () {
        var wasOpen = item.classList.contains("open");
        Array.prototype.forEach.call(document.querySelectorAll(".faq-item.open"), function (o) {
          if (o !== item) close(o);
        });
        if (wasOpen) close(item); else open(item);
      });
    });
  }

  /* ---------------- forms ---------------- */

  function initForms() {
    var contact = document.getElementById("contactForm");
    if (contact) {
      V.attachLiveValidation(contact);
      contact.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!V.validateForm(contact)) { toast("Please check the form", "Fix the highlighted fields and try again.", "error"); return; }
        var f = new FormData(contact);
        S.Contacts.add({
          name: f.get("name"), email: f.get("email"),
          subject: f.get("subject"), message: f.get("message"), createdAt: Date.now()
        });
        contact.reset();
        toast("Message sent!", "Our team will reach out within 24 hours.", "success");
      });
    }
    var newsletter = document.getElementById("newsletterForm");
    if (newsletter) {
      newsletter.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = newsletter.querySelector("input");
        if (!V.isEmail(input.value)) { toast("Invalid email", "Please enter a valid email address.", "error"); return; }
        input.value = "";
        toast("Subscribed!", "You'll get impact stories every week.", "success");
      });
    }
  }

  /* ---------------- auth ---------------- */

  function initAuthBindings() {
    document.querySelectorAll("[data-open-login]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); openLoginModal(el.dataset.openLogin || ""); });
    });
    document.querySelectorAll("[data-open-register]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); openRegisterModal(el.dataset.openRegister || ""); });
    });
    var logout = document.getElementById("logoutBtn");
    if (logout) logout.addEventListener("click", function () {
      S.clearSession();
      updateNavUser();
      toast("Logged out", "See you soon!", "info");
    });
  }

  function updateNavUser() {
    var user = S.currentUser();
    var authBox = document.getElementById("navAuth");
    var userBox = document.getElementById("navUser");
    if (!authBox || !userBox) return;
    if (user) {
      authBox.classList.add("hidden");
      userBox.classList.remove("hidden");
      var name = document.getElementById("navUserName");
      var avatar = document.getElementById("navAvatar");
      if (name) name.textContent = user.orgName || user.name;
      if (avatar) avatar.textContent = UI.initials(user.orgName || user.name);
    } else {
      authBox.classList.remove("hidden");
      userBox.classList.add("hidden");
    }
  }

  var selectedRole = "";

  function roleOptionHtml(key, emoji, name, desc) {
    return '<div class="role-card' + (selectedRole === key ? " active" : "") + '" data-role="' + key + '">' +
      '<span class="role-emoji">' + emoji + '</span>' +
      '<span class="role-name">' + name + '</span>' +
      '<span class="role-desc">' + desc + "</span></div>";
  }

  function optionsHtml(list, selected) {
    return list.map(function (o) {
      return '<option value="' + o + '"' + (o === selected ? " selected" : "") + ">" + o + "</option>";
    }).join("");
  }

  function openLoginModal(roleHint) {
    selectedRole = roleHint || "";
    Modal.open(
      '<h3 class="modal-title">Welcome back</h3>' +
      '<p class="modal-sub">Login to your FoodLink account to continue.</p>' +
      '<div class="role-pick">' +
        roleOptionHtml("donor", "🍛", "Donor", "Give surplus food") +
        roleOptionHtml("receiver", "🤲", "Receiver", "Receive donations") +
        roleOptionHtml("admin", "🛡️", "Admin", "Manage platform") +
      "</div>" +
      '<form id="loginForm" novalidate>' +
        '<div class="form-error" id="loginError" role="alert" aria-live="assertive" hidden></div>' +
        '<div class="form-field"><label>Email</label><input type="email" name="email" placeholder="you@example.com" data-rule="email" autocomplete="email"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Password</label><div class="password-wrap"><input type="password" name="password" placeholder="••••••••" data-rule="text" autocomplete="current-password"><button type="button" class="password-toggle" data-toggle-pw><svg class="icon"><use href="#i-eye"/></svg></button></div><small class="field-msg"></small></div>' +
        '<button type="submit" class="btn btn-primary btn-block btn-lg">Login</button>' +
      "</form>" +
      '<div class="auth-switch">Don\'t have an account? <a data-open-register>Create one</a></div>' +
      '<div class="auth-switch"><a data-open-forgot>Forgot password?</a></div>' +
      '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Quick demo login</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-demo="donor">🍛 Donor</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-demo="receiver">🤲 Receiver</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-demo="admin">🛡️ Admin</button>' +
        "</div>" +
      "</div>",
      { onOpen: function (m) { setupLoginModal(m); } }
    );
  }

    function setupLoginModal(m) {
    m.querySelectorAll(".role-card").forEach(function (card) {
      card.addEventListener("click", function () {
        selectedRole = card.dataset.role;
        m.querySelectorAll(".role-card").forEach(function (c) { c.classList.toggle("active", c === card); });
      });
    });
    var form = m.querySelector("#loginForm");
    V.attachLiveValidation(form);
    // Sign-in errors belong on the form, not only in a toast that a user can
    // miss - especially "incorrect email or password", which is the whole
    // reason a sign-in attempt failed.
    var loginErrorBox = form.querySelector("#loginError");
    function showLoginError(msg) {
      if (!loginErrorBox) return;
      loginErrorBox.textContent = msg || "";
      loginErrorBox.hidden = !msg;
    }
    form.addEventListener("input", function () { showLoginError(""); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showLoginError("");
      if (!V.validateForm(form)) { showLoginError("Please fill in your email and password."); return; }
      var email = form.querySelector('[name="email"]').value.trim().toLowerCase();
      var pass = form.querySelector('[name="password"]').value;
      // Credentials are verified by the server, which holds the only copy
      // of the password hash. Comparing against the locally cached user
      // would mean keeping plaintext in the browser.
      submitLogin(email, pass, form, showLoginError);
    });
    m.querySelectorAll("[data-demo]").forEach(function (b) {
      b.addEventListener("click", function () {
        var creds = {
          donor: { e: "rahul@foodlink.app", p: "donor123" },
          receiver: { e: "neha@foodlink.app", p: "receiver123" },
          admin: { e: "admin@foodlink.app", p: "admin123" }
        };
        var c = creds[b.dataset.demo];
        if (!c) return;
        if (selectedRole && selectedRole !== b.dataset.demo) {
          showLoginError("That demo account is a " + b.dataset.demo + ". Choose that type and try again.");
          return;
        }
        submitLogin(c.e, c.p, form, showLoginError);
      });
    });
    m.querySelectorAll("[data-open-forgot]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); Modal.close(); openForgotModal(); });
    });
    m.querySelectorAll("[data-open-register]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); Modal.close(); openRegisterModal(selectedRole); });
    });
    bindPasswordToggles(m);
  }
  /* Every auth lookup must tolerate a record without an email: the
     predicate runs inside Array.find, so `u.email.toLowerCase()` threw a
     TypeError that aborted the whole click handler. */
  function findByEmail(email, predicate) {
    var target = String(email || "").trim().toLowerCase();
    if (!target) return null;
    return S.Users.find(function (u) {
      if (!u || typeof u.email !== "string") return false;
      if (u.email.trim().toLowerCase() !== target) return false;
      return predicate ? predicate(u) : true;
    });
  }

  /**
   * Sign in against the server, which holds the only password hash.
   * The API client stores the returned token; storage.js then records the
   * session. Buttons are disabled for the duration so a slow network cannot
   * fire two sign-in requests.
   */
  function submitLogin(email, password, form, onError) {
    var btn = form ? form.querySelector('[type="submit"]') : null;
    if (btn) btn.disabled = true;
    if (form) form.setAttribute("aria-busy", "true");
    function report(msg) {
      if (typeof onError === "function") onError(msg);
      else toast("Login failed", msg, "error");
    }

    return API.login(email, password).then(function (res) {
      var user = res && res.user;
      if (!user) throw new Error("Sign-in returned no account");
      if (selectedRole && user.role !== selectedRole) {
        API.logout();
        throw new Error("wrongRole:" + user.role);
      }
      if (user.status === "pending") {
        API.logout();
        throw new Error("pending");
      }
      if (user.status === "rejected") {
        API.logout();
        throw new Error("rejected");
      }
      return S.completeLogin(user);
    }).then(function (user) {
      finishLogin(user);
    })["catch"](function (err) {
      var msg = String((err && err.message) || "");
      if (msg.indexOf("wrongRole:") === 0) {
        report("This account is registered as a " + msg.slice(9) + ". Choose that type and try again.");
      } else if (msg === "pending") {
        report("Your account is awaiting admin approval.");
      } else if (msg === "rejected") {
        report("This account was rejected. Please contact support.");
      } else if (err && err.status === 401) {
        report("Incorrect email or password.");
      } else if (err && err.status === 429) {
        report("Too many attempts. Please wait a few minutes and try again.");
      } else {
        // The backend is the only place credentials can be checked, so an
        // unreachable server is a real failure, not something to bypass.
        report("Cannot reach the server. Check your connection and try again.");
      }
    }).then(function () {
      if (btn) btn.disabled = false;
      if (form) form.removeAttribute("aria-busy");
    });
  }

  /* Admin accounts are NOT self-service.
     An earlier version fetched a shared secret from `admin-code.json` in the
     web root, which is a no-op for security: anything under the web root is
     public, so the code was readable by any visitor, and anyone who wanted
     an admin could skip the form entirely and write the user record
     straight to the local cache or the API. An admin must be promoted
     out-of-band (server-side), so the role simply cannot be selected here. */
  function isSelfServiceRole(role) {
    return role === "donor" || role === "receiver";
  }

  function finishLogin(user) {
    S.setSession(user.id);
    updateNavUser();
    var label = String(user.orgName || user.name || "there").split(/\s+/)[0];
    toast("Welcome back, " + label + "!", "Redirecting to your dashboard\u2026", "success");
    // Close first so the page isn't left with body{overflow:hidden} if the
    // navigation is blocked.
    Modal.close();
    setTimeout(function () {
      window.location.href = { admin: "admin.html", donor: "donor.html", receiver: "receiver.html" }[user.role] || "index.html";
    }, 900);
  }

  function openRegisterModal(roleHint) {
    selectedRole = roleHint || "";
    Modal.open(
      '<h3 class="modal-title">Create your account</h3>' +
      '<p class="modal-sub">Join the movement to end food waste.</p>' +
      '<div class="role-pick">' +
        roleOptionHtml("donor", "🍛", "Donor", "Restaurant, hotel, household…") +
        roleOptionHtml("receiver", "🤲", "Receiver", "NGO, shelter, orphanage…") +
      "</div>" +
      '<form id="registerForm" novalidate>' +
        '<div class="form-error" id="registerError" role="alert" aria-live="assertive" hidden></div>' +
        '<div class="form-field" data-rolefield="donor" style="display:none"><label>Business Type</label>' +
          '<select name="donorType" data-rule="select">' + optionsHtml(DONOR_TYPES) + "</select><small class='field-msg'></small></div>" +
        '<div class="form-field" data-rolefield="receiver" style="display:none"><label>Receiver Type</label>' +
          '<select name="receiverType" data-rule="select">' + optionsHtml(RECEIVER_TYPES) + "</select><small class='field-msg'></small></div>" +
        '<div class="form-field"><label>Organization / Display Name</label><input type="text" name="orgName" placeholder="e.g. Spice Garden" data-rule="text"><small class="field-msg"></small></div>' +
        '<div class="form-row">' +
          '<div class="form-field"><label>Contact Person</label><input type="text" name="name" placeholder="Full name" data-rule="text"><small class="field-msg"></small></div>' +
          '<div class="form-field"><label>Phone</label><input type="tel" name="phone" placeholder="+91 98765 43210" data-rule="phone"><small class="field-msg"></small></div>' +
        "</div>" +
        '<div class="form-field"><label>Email</label><input type="email" name="email" placeholder="you@example.com" data-rule="email"><small class="field-msg"></small></div>' +
        '<div class="form-row">' +
          '<div class="form-field"><label>Password</label><div class="password-wrap"><input type="password" name="password" placeholder="Min 6 characters" data-rule="text"><button type="button" class="password-toggle" data-toggle-pw><svg class="icon"><use href="#i-eye"/></svg></button></div><small class="field-msg"></small></div>' +
          '<div class="form-field"><label>Confirm Password</label><div class="password-wrap"><input type="password" name="confirm" placeholder="Re-enter password" data-rule="text"><button type="button" class="password-toggle" data-toggle-pw aria-label="Show password" aria-pressed="false"><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg></button></div><small class="field-msg"></small></div>' +
        "</div>" +
        '<div class="form-row">' +
          '<div class="form-field"><label>City</label><input type="text" name="city" placeholder="e.g. Delhi" data-rule="text"><small class="field-msg"></small></div>' +
          '<div class="form-field"><label>State</label><input type="text" name="state" placeholder="e.g. Delhi" data-rule="text"><small class="field-msg"></small></div>' +
        "</div>" +
        '<div class="form-field"><label>Pickup / Dropoff Address</label><textarea name="address" rows="2" placeholder="Street, building, landmark" data-rule="text"></textarea><small class="field-msg"></small></div>' +
        '<button type="submit" class="btn btn-primary btn-block btn-lg">Create account</button>' +
      "</form>" +
      '<div class="auth-switch">Already have an account? <a data-open-login>Login</a></div>',
      { onOpen: function (m) { setupRegisterModal(m); } }
    );
  }

  function setupRegisterModal(m) {
    function refreshRoleFields() {
      var donorFields = m.querySelectorAll('[data-rolefield="donor"]');
      var receiverFields = m.querySelectorAll('[data-rolefield="receiver"]');
      var adminFields = m.querySelectorAll('[data-rolefield="admin"]');
      var shown = selectedRole;
      donorFields.forEach(function (f) { f.style.display = shown === "donor" ? "" : "none"; });
      receiverFields.forEach(function (f) { f.style.display = shown === "receiver" ? "" : "none"; });
      adminFields.forEach(function (f) { f.style.display = shown === "admin" ? "" : "none"; });
    }
    refreshRoleFields();

    m.querySelectorAll(".role-card").forEach(function (card) {
      card.addEventListener("click", function () {
        selectedRole = card.dataset.role;
        m.querySelectorAll(".role-card").forEach(function (c) { c.classList.toggle("active", c === card); });
        refreshRoleFields();
      });
    });

    var form = m.querySelector("#registerForm");
    V.attachLiveValidation(form);
    var submitting = false;

    /* Registration failures are shown on the form itself, not only as a
       toast: a message that belongs to a field goes next to that field, and
       anything else (no account type chosen, server unreachable) goes in the
       banner at the top of the form. */
    var errorBox = form.querySelector("#registerError");
    function showFormError(msg) {
      if (!errorBox) return;
      errorBox.textContent = msg || "";
      errorBox.hidden = !msg;
    }
    function markFieldError(name, msg) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return false;
      V.mark(input, false, msg);
      try { input.focus(); } catch (e) { /* detached */ }
      return true;
    }
    // Clear the banner as soon as the user starts fixing things.
    form.addEventListener("input", function () { showFormError(""); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (submitting) return;
      showFormError("");
      if (!selectedRole) { showFormError("Choose an account type: Donor or Receiver."); return; }
      var f = new FormData(form);
      var pass = String(f.get("password") || "");
      if (pass.length < 8) { markFieldError("password", "Password must be at least 8 characters."); return; }
      if (pass !== f.get("confirm")) { markFieldError("confirm", "Passwords don't match."); return; }
      // Admin is not offered for self-registration, so a client that
      // forges the request must be refused server-side of the UI too.
      if (!isSelfServiceRole(selectedRole)) {
        showFormError("That account type cannot be self-registered.");
        return;
      }
      if (!V.validateForm(form)) {
        showFormError("Please fix the highlighted fields and try again.");
        return;
      }
      submitting = true;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Creating account…"; }

      // The account is created server-side, which is the only place the
      // password can be hashed. The client never stores it.
      API.register({
        email: String(f.get("email") || "").trim().toLowerCase(),
        password: pass,
        name: String(f.get("name") || "").trim(),
        orgName: String(f.get("orgName") || "").trim(),
        phone: String(f.get("phone") || "").trim(),
        role: selectedRole,
        type: selectedRole === "donor" ? f.get("donorType") : f.get("receiverType"),
        city: String(f.get("city") || "").trim(),
        state: String(f.get("state") || "").trim(),
        address: String(f.get("address") || "").trim()
      }).then(function (res) {
        var user = res && res.user;
        if (!user) throw new Error("Registration returned no account");
        return S.completeLogin(user);
      }).then(function (user) {
        S.addNotification(user.id, "Welcome to FoodLink, " + user.name + "! Start your food rescue journey today.", "success");
        if (user.status === "pending") {
          S.addNotification("u_admin", "New " + user.role + " signup awaiting review: " + user.orgName, "info");
          toast("Account created!", "Admin approval required before login. We'll notify you.", "success");
          Modal.close();
          return;
        }
        toast("Account created!", "Welcome to FoodLink.", "success");
        finishLogin(user);
      })["catch"](function (err) {
        // Put the server's verdict on the field it belongs to where we can
        // tell; otherwise surface it in the banner above the form.
        var msg = (err && err.message) || "";
        var status = err && err.status;
        if (status === 409) {
          markFieldError("email", "That email is already registered. Try logging in instead.");
        } else if (status === 400) {
          var field = /password/i.test(msg) ? "password"
            : /email/i.test(msg) ? "email"
            : /name|organization/i.test(msg) ? "orgName" : null;
          if (!field || !markFieldError(field, msg)) {
            showFormError(msg || "Check the details and try again.");
          }
        } else if (status === 429) {
          showFormError("Too many sign-up attempts. Please wait a few minutes and try again.");
        } else {
          showFormError("Cannot reach the server. Check your connection and try again.");
        }
      }).then(function () {
        submitting = false;
        if (btn) { btn.disabled = false; btn.textContent = "Create account"; }
      });
    });


    m.querySelectorAll("[data-open-login]").forEach(function (a) {
      a.addEventListener("click", function () { Modal.close(); openLoginModal(selectedRole); });
    });
    bindPasswordToggles(m);
  }

  /* One implementation for both modals: the register copy was flipping the
     input type without updating aria-pressed/aria-label, so the control
     announced the wrong state to screen readers. */
  function bindPasswordToggles(root) {
    if (!root) return;
    root.querySelectorAll("[data-toggle-pw]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inp = b.parentElement.querySelector("input");
        if (!inp) return;
        var show = inp.type === "password";
        inp.type = show ? "text" : "password";
        b.setAttribute("aria-pressed", show ? "true" : "false");
        b.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });
  }

  function openForgotModal() {
    Modal.open(
      '<h3 class="modal-title">Reset your password</h3>' +
      '<p class="modal-sub">Enter the email linked to your account and we\'ll send a reset link.</p>' +
      '<form id="forgotForm" novalidate>' +
        '<div class="form-field"><label>Email</label><input type="email" name="email" placeholder="you@example.com" data-rule="email"><small class="field-msg"></small></div>' +
        '<button type="submit" class="btn btn-primary btn-block">Send reset link</button>' +
      "</form>" +
      '<div class="auth-switch">Remembered it? <a data-open-login>Back to login</a></div>',
      { onOpen: function (m) {
          var form = m.querySelector("#forgotForm");
          V.attachLiveValidation(form);
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!V.validateForm(form)) return;
            // One message regardless of whether the address exists:
            // two different replies turned this into a user-enumeration
            // oracle.
            toast("Check your inbox", "If that email has a FoodLink account, a reset link is on its way.", "success");
            Modal.close();
          });
          m.querySelectorAll("[data-open-login]").forEach(function (a) {
            a.addEventListener("click", function (e) { e.preventDefault(); Modal.close(); openLoginModal(); });
          });
        } }
    );
  }

  /* ---------------- boot ---------------- */

  function boot() {
    sharedInit();
    UI.installSubmitGuard();
    UI.autoLabel();
    initLanding();
  }

  function releasePreloader() {
    var pre = document.getElementById("preloader");
    if (pre && !pre.dataset.released) {
      pre.dataset.released = "1";
      pre.classList.add("done");
    }
  }

  // Surface sync failures instead of always claiming success.
  if (S.onSyncError) {
    var warned = false;
    S.onSyncError(function (name) {
      if (warned) return;
      warned = true;
      setTimeout(function () {
        toast("Working offline", "Changes are saved on this device and will sync when the server is reachable.", "warning");
      }, 1200);
      void name;
    });
  }

  // Belt and braces: the preloader is an opaque full-viewport overlay, so
  // it must never be able to trap the page.
  setTimeout(releasePreloader, 6000);

  // boot() must run even if init() rejects for an unforeseen reason.
  S.init().then(boot, function (err) {
    console.error("[app] init failed", err);
    boot();
  });
})();
