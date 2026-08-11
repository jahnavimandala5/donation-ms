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

  window.toast = function (t, m, ty) { UI.toast(t, m, ty); };

  var DONOR_TYPES = ["Restaurant", "Hotel", "Cafe", "Bakery", "Household", "Individual", "Corporate", "Catering", "Grocery Store", "Supermarket", "Event Organizer", "Fruit Market", "Vegetable Vendor", "School", "College", "Hostel"];
  var RECEIVER_TYPES = ["NGO", "Old Age Home", "Orphanage", "Shelter", "Community Kitchen", "Animal Shelter", "Charitable Trust", "Individual"];

  /* ---------------- shared init ---------------- */

  function sharedInit() {
    UI.applyTheme();
    var pre = document.getElementById("preloader");
    if (pre) {
      setTimeout(function () { pre.classList.add("done"); }, 500);
    }
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
      hamburger.addEventListener("click", function () {
        navLinks.classList.toggle("open");
      });
      document.addEventListener("click", function (e) {
        if (navLinks.classList.contains("open") && !navLinks.contains(e.target) && e.target !== hamburger) {
          navLinks.classList.remove("open");
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

  function initReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("revealed"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("revealed"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  function initLandingStats() {
    var donations = S.Donations.all();
    var meals = donations.reduce(function (s, d) { return s + (d.servings || 0); }, 0);
    var kg = donations.reduce(function (s, d) { return s + (d.quantity || 0); }, 0);
    var available = donations.filter(function (d) { return S.donationStatus(d) === "available"; }).length;
    var mins = { mealsSaved: meals, foodDonated: kg, peopleHelped: Math.round(meals * 0.82), ngos: 328, restaurants: 420, oldAgeHomes: 185, orphanages: 210, volunteers: 1845, co2Saved: Math.round(kg * 3.4) };
    var mini = document.getElementById("miniTodayMeals");
    var active = document.getElementById("miniActiveListings");
    if (mini) mini.textContent = meals.toLocaleString("en-IN");
    if (active) active.textContent = available;

    document.querySelectorAll("[data-metric]").forEach(function (el) {
      var key = el.dataset.metric;
      if (mins[key] !== undefined) {
        el.dataset.count = mins[key];
        el.textContent = "0";
      }
    });
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
        .reduce(function (s, d) { return s + (d.servings || 0); }, 0);
    }
    function receivedFor(u) {
      return donations
        .filter(function (d) { return d.reservedBy === u.id && S.donationStatus(d) === "completed"; })
        .reduce(function (s, d) { return s + (d.servings || 0); }, 0);
    }

    var donors = all.filter(function (u) { return u.role === "donor"; })
      .map(function (u) { return { name: u.orgName, city: u.city, meals: mealsFor(u) + u.points, initials: UI.initials(u.orgName) }; })
      .sort(function (a, b) { return b.meals - a.meals; }).slice(0, 5);
    var receivers = all.filter(function (u) { return u.role === "receiver"; })
      .map(function (u) { return { name: u.orgName, city: u.city, meals: receivedFor(u) + u.points, initials: UI.initials(u.orgName) }; })
      .sort(function (a, b) { return b.meals - a.meals; }).slice(0, 5);
    var receiversByType = all.filter(function (u) { return u.role === "receiver"; })
      .reduce(function (acc, u) {
        var t = u.type || "Other";
        if (!acc[t]) acc[t] = [];
        acc[t].push(u);
        return acc;
      }, {});

    function panel(title, emoji, list) {
      var rows = list.map(function (r, i) {
        return '<div class="lb-item"><span class="lb-rank">' + (i + 1) + "</span>" +
          '<span class="avatar" style="background:' + ["linear-gradient(135deg,#10b981,#0d9488)", "linear-gradient(135deg,#f59e0b,#ea580c)", "linear-gradient(135deg,#0ea5e9,#2563eb)", "linear-gradient(135deg,#8b5cf6,#6366f1)", "linear-gradient(135deg,#ec4899,#db2777)"][i % 5] + '">' + r.initials + "</span>" +
          '<div><div class="lb-name">' + UI.escapeHtml(r.name) + '</div><div class="lb-city">' + UI.escapeHtml(r.city || "") + "</div></div>" +
          '<div class="lb-points"><strong>' + r.meals.toLocaleString("en-IN") + '</strong><span>pts</span></div></div>';
      }).join("");
      return '<div class="panel" data-reveal="fade-up"><div class="panel-head"><h3>' + emoji + " " + title + "</h3></div>" + rows + "</div>";
    }

    var topNgo = panel("Top NGOs & Receivers", "🤲", receivers);
    var topDonor = panel("Top Donors", "🍛", donors);
    var bestType = Object.keys(receiversByType).map(function (t) {
      var u = receiversByType[t][0];
      return { name: u.orgName, city: u.city, meals: receivedFor(u) + u.points, initials: UI.initials(u.orgName) };
    }).sort(function (a, b) { return b.meals - a.meals; }).slice(0, 5);
    grid.innerHTML = topDonor + topNgo + panel("Best by Category", "🏅", bestType);
    initReveal();
  }

  function initFeaturedFood() {
    var grid = document.getElementById("featuredFood");
    if (!grid) return;
    var featured = S.Donations.all()
      .filter(function (d) { return S.donationStatus(d) === "available"; })
      .slice(0, 6);
    if (!featured.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-emoji">🍽️</span><h4>No food listed right now</h4><p>Be the first to donate today.</p></div>';
      return;
    }
    grid.innerHTML = featured.map(function (d) {
      return UI.donationCard(d, {
        showCountdown: true,
        footer: function () {
          return '<div class="food-actions">' +
            '<button class="btn btn-primary btn-sm" data-view="' + d.id + '">View Details</button>' +
            "</div>";
        }
      });
    }).join("");
    grid.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { openPublicDetails(b.dataset.view); });
    });
    UI.startCountdowns();
  }

  function openPublicDetails(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    var donor = S.donorById(d.donorId);
    var img = d.image
      ? '<img src="' + d.image + '" alt="' + UI.escapeHtml(d.foodName) + '" style="width:100%;height:220px;object-fit:cover;border-radius:14px;margin-bottom:18px">'
      : '<div style="font-size:90px;text-align:center;padding:20px 0">' + UI.foodEmoji(d.foodName) + "</div>";
    Modal.open(
      '<div class="modal-title">' + UI.escapeHtml(d.foodName) + "</div>" +
      '<div class="modal-sub">' + UI.escapeHtml(donor.orgName || donor.name) + " · " + UI.escapeHtml(d.foodType || "") + "</div>" +
      img +
      '<div class="food-meta" style="margin-bottom:16px">' +
      '<span>🍽️ ' + d.servings + " servings</span><span>⚖️ " + d.quantity + " kg</span>" +
      '<span>🕐 ' + UI.formatDateTime(d.expiresAt) + "</span></div>" +
      "<p class='modal-sub'>" + UI.escapeHtml(d.description || "No description provided.") + "</p>" +
      '<div class="food-meta" style="margin-bottom:18px"><span>📍 ' + UI.escapeHtml(d.address + ", " + d.city) + "</span></div>" +
      '<div class="form-actions">' +
      '<button class="btn btn-primary btn-block" id="publicReserve">Reserve this food</button>' +
      "</div>",
      { size: "lg", onOpen: function (m) {
          m.querySelector("#publicReserve").addEventListener("click", function () { openLoginModal("receiver"); });
        } }
    );
  }

  /* ---------------- FAQ ---------------- */

  function initFAQ() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      item.querySelector(".faq-q").addEventListener("click", function () {
        var open = item.classList.contains("open");
        document.querySelectorAll(".faq-item.open").forEach(function (o) {
          o.classList.remove("open");
          o.querySelector(".faq-a").style.maxHeight = "0px";
        });
        if (!open) {
          item.classList.add("open");
          item.querySelector(".faq-a").style.maxHeight = item.querySelector(".faq-a").scrollHeight + "px";
        }
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
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!V.validateForm(form)) { toast("Missing details", "Please fill your email and password.", "error"); return; }
      var email = form.querySelector('[name="email"]').value.trim().toLowerCase();
      var pass = form.querySelector('[name="password"]').value;
      var user = S.Users.find(function (u) { return u.email.toLowerCase() === email && u.password === pass; });
      if (!user) { toast("Login failed", "Incorrect email or password.", "error"); return; }
      if (user.status === "pending") { toast("Account pending approval", "An admin must verify your account first.", "warning"); return; }
      if (selectedRole && user.role !== selectedRole) {
        toast("Wrong account type", "This account is registered as " + user.role + ".", "warning");
        return;
      }
      finishLogin(user);
    });
    m.querySelectorAll("[data-demo]").forEach(function (b) {
      b.addEventListener("click", function () {
        var role = b.dataset.demo;
        var creds = {
          donor: { e: "rahul@foodlink.app", p: "donor123" },
          receiver: { e: "neha@foodlink.app", p: "receiver123" },
          admin: { e: "admin@foodlink.app", p: "admin123" }
        };
        var c = creds[role];
        var user = S.Users.find(function (u) { return u.email === c.e && u.password === c.p; });
        if (user) finishLogin(user);
      });
    });
    m.querySelectorAll("[data-open-forgot]").forEach(function (a) {
      a.addEventListener("click", function () { Modal.close(); openForgotModal(); });
    });
    m.querySelectorAll("[data-open-register]").forEach(function (a) {
      a.addEventListener("click", function () { Modal.close(); openRegisterModal(selectedRole); });
    });
    m.querySelectorAll("[data-toggle-pw]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inp = b.parentElement.querySelector("input");
        inp.type = inp.type === "password" ? "text" : "password";
      });
    });
  }

  function finishLogin(user) {
    S.setSession(user.id);
    updateNavUser();
    toast("Welcome back, " + (user.name.split(" ")[0]) + "!", "Redirecting to your dashboard…", "success");
    setTimeout(function () {
      window.location.href = user.role === "admin" ? "admin.html" : user.role === "donor" ? "donor.html" : "receiver.html";
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
        roleOptionHtml("admin", "🛡️", "Admin", "Platform administrator") +
      "</div>" +
      '<form id="registerForm" novalidate>' +
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
          '<div class="form-field"><label>Confirm Password</label><div class="password-wrap"><input type="password" name="confirm" placeholder="Re-enter password" data-rule="text"><button type="button" class="password-toggle" data-toggle-pw><svg class="icon"><use href="#i-eye"/></svg></button></div><small class="field-msg"></small></div>' +
        "</div>" +
        '<div class="form-field" data-rolefield="admin" style="display:none"><label>Admin Code</label><input type="text" name="adminCode" placeholder="Enter admin access code"><small class="field-msg"></small></div>' +
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
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!selectedRole) { toast("Choose an account type", "Select Donor, Receiver or Admin.", "error"); return; }
      var f = new FormData(form);
      if (f.get("password").length < 6) { toast("Weak password", "Password must be at least 6 characters.", "error"); return; }
      if (f.get("password") !== f.get("confirm")) { toast("Passwords don't match", "Please re-enter the same password.", "error"); return; }
      if (selectedRole === "admin" && f.get("adminCode") !== "admin123") { toast("Invalid admin code", "The admin access code is incorrect.", "error"); return; }
      if (!V.validateForm(form)) { toast("Please check the form", "Fix the highlighted fields and try again.", "error"); return; }
      var email = f.get("email").trim().toLowerCase();
      if (S.Users.find(function (u) { return u.email.toLowerCase() === email; })) {
        toast("Email already registered", "Try logging in instead.", "error");
        return;
      }
      var user = {
        id: S.uid("u"),
        role: selectedRole,
        name: f.get("name"),
        email: email,
        phone: f.get("phone"),
        password: f.get("password"),
        orgName: f.get("orgName"),
        type: selectedRole === "donor" ? f.get("donorType") : selectedRole === "receiver" ? f.get("receiverType") : "Admin",
        city: f.get("city"),
        state: f.get("state"),
        address: f.get("address"),
        pincode: "",
        description: "",
        status: selectedRole === "admin" ? "approved" : "pending",
        verified: false,
        points: 0,
        badges: [],
        joinedAt: Date.now(),
        avatar: null
      };
      if (S.getSettings().requireApproval && selectedRole !== "admin") user.status = "pending";
      S.Users.add(user);
      S.addNotification(user.id, "Welcome to FoodLink " + user.name + "! Start your food rescue journey today.", "success");
      if (user.status === "pending") {
        S.addNotification("u_admin", "New " + user.role + " signup awaiting review: " + user.orgName, "info");
        toast("Account created!", "Admin approval required before login. We'll notify you.", "success");
        Modal.close();
        return;
      }
      finishLogin(user);
    });

    m.querySelectorAll("[data-open-login]").forEach(function (a) {
      a.addEventListener("click", function () { Modal.close(); openLoginModal(selectedRole); });
    });
    m.querySelectorAll("[data-toggle-pw]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inp = b.parentElement.querySelector("input");
        inp.type = inp.type === "password" ? "text" : "password";
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
            var email = form.querySelector('[name="email"]').value.trim().toLowerCase();
            var user = S.Users.find(function (u) { return u.email.toLowerCase() === email; });
            toast("Reset link sent", user ? "Check " + user.email + " for instructions." : "If that email exists, a reset link is on its way.", "success");
            Modal.close();
          });
          m.querySelectorAll("[data-open-login]").forEach(function (a) {
            a.addEventListener("click", function () { Modal.close(); openLoginModal(); });
          });
        } }
    );
  }

  /* ---------------- boot ---------------- */

  function boot() {
    sharedInit();
    initLanding();
  }

  S.init().then(boot);
})();
