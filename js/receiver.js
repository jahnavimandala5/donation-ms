/* =====================================================================
   FoodLink - receiver.js
   Receiver dashboard: overview, browse/reserve food, favorites,
   reservations, requests, rewards and profile.
   ===================================================================== */

(function () {
  "use strict";

  var S = window.FoodLink.Storage;
  var UI = window.FoodLink.UI;
  var Modal = window.FoodLink.Modal;
  var V = window.FoodLink.Validation;
  var Charts = window.FoodLink.Charts;
  var Shell = window.FoodLink.Shell;
  var Filter = window.FoodLink.Filter;

  var esc = UI.escapeHtml;
  var user = null;

  var SECTION_TITLES = {
    overview: "Overview",
    browse: "Browse Food",
    reservations: "My Reservations",
    favorites: "Favorites",
    requests: "My Requests",
    rewards: "Rewards",
    profile: "Profile"
  };

  var RECEIVER_TYPES = ["NGO", "Old Age Home", "Orphanage", "Shelter", "Community Kitchen", "Animal Shelter", "Charitable Trust", "Individual"];

  var browseState = { query: "", veg: "", sort: "expiry" };

  /* ---------------- data helpers ---------------- */

  function myReservations() {
    if (!user) return [];
    return S.Donations.all()
      .filter(function (d) { return d.reservedBy === user.id; })
      .sort(function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });
  }

  function myFavorites() {
    if (!user) return [];
    var favs = S.Favorites.all().filter(function (f) { return f.receiverId === user.id; });
    return favs.map(function (f) { return S.Donations.byId(f.donationId); })
      .filter(Boolean)
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function optionsHtml(list, selected) {
    return list.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === selected ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
  }

  /* ---------------- shell bits ---------------- */

  function refreshShellUser() {
    var name = user.orgName || user.name;
    document.querySelectorAll(".sidebar-user-name").forEach(function (el) { el.textContent = name; });
    var avatar = document.getElementById("topAvatar");
    if (avatar) avatar.textContent = UI.initials(name);
    var dropName = document.getElementById("dropUserName");
    if (dropName) dropName.textContent = name;
  }

  /* ---------------- overview ---------------- */

  function statBox(emoji, num, label, suffix, accent) {
    return (
      '<div class="stat-box">' +
        '<div class="stat-icon-wrap" style="--stat-bg:' + (accent ? accent + "22" : "var(--primary-soft)") + ";--stat-color:" + (accent || "var(--primary-2)") + '">' + emoji + "</div>" +
        '<div><div class="stat-num" data-count="' + num + '" data-suffix="' + esc(suffix || "") + '">0</div>' +
        '<div class="stat-lbl">' + label + "</div></div>" +
      "</div>"
    );
  }

  function renderOverview() {
    var available = S.Donations.all().filter(function (d) { return S.donationStatus(d) === "available"; });
    var res = myReservations();
    var done = res.filter(function (d) { var s = S.donationStatus(d); return s === "collected" || s === "completed"; });
    var meals = done.reduce(function (s, d) { return s + (d.servings || 0); }, 0);
    var kg = done.reduce(function (s, d) { return s + (d.quantity || 0); }, 0);

    var stats = document.getElementById("overviewStats");
    if (stats) {
      stats.innerHTML =
        statBox("🍽️", available.length, "Listings available", "", "#10b981") +
        statBox("🤝", res.length, "My reservations", "", "#f59e0b") +
        statBox("🍛", meals, "Meals received", " meals", "#0ea5e9") +
        statBox("⚖️", Math.round(kg * 10) / 10, "Food saved", " kg", "#8b5cf6");
      UI.runCounters();
    }

    var lineEl = document.getElementById("receiverLineChart");
    if (lineEl) {
      var days = [], counts = [], now = new Date();
      for (var i = 6; i >= 0; i--) {
        var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime();
        var dayEnd = dayStart + 86400000;
        var mealsDay = res.filter(function (d) {
          var st = S.donationStatus(d);
          return (st === "collected" || st === "completed") && (d.updatedAt || d.createdAt) >= dayStart && (d.updatedAt || d.createdAt) < dayEnd;
        }).reduce(function (s, d) { return s + (d.servings || 0); }, 0);
        days.push(new Date(dayStart).toLocaleDateString("en-IN", { weekday: "short" }));
        counts.push(mealsDay);
      }
      Charts.line(lineEl, days, counts, { color: "#10b981" });
    }

    var donutEl = document.getElementById("receiverDonutChart");
    if (donutEl) {
      var counts2 = { reservations: 0, collected: 0, completed: 0, cancelled: 0 };
      res.forEach(function (d) {
        var st = S.donationStatus(d);
        if (st === "collected") counts2.collected++;
        else if (st === "completed") counts2.completed++;
        else if (st === "cancelled") counts2.cancelled++;
        else counts2.reservations++;
      });
      var slices = [
        { label: "Reserved", value: counts2.reservations, color: "#f59e0b" },
        { label: "Collected", value: counts2.collected, color: "#0284c7" },
        { label: "Completed", value: counts2.completed, color: "#10b981" },
        { label: "Cancelled", value: counts2.cancelled, color: "#94a3b8" }
      ].filter(function (s) { return s.value > 0; });
      Charts.donut(donutEl, slices, { centerLabel: "activity" });
      Charts.legendCss();
    }

    renderRecentActivity();
  }

  function renderRecentActivity() {
    var box = document.getElementById("recentActivity");
    if (!box) return;
    var rows = myReservations().slice(0, 5);
    if (!rows.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📋</span><h4>No reservations yet</h4><p>Head over to Browse Food to reserve a donation.</p></div>';
      return;
    }
    box.innerHTML =
      '<div class="table-wrap"><table>' +
        "<thead><tr><th>Food</th><th>Donor</th><th>Status</th><th>Servings</th><th>Updated</th></tr></thead><tbody>" +
        rows.map(function (d) {
          var meta = UI.statusMeta(S.donationStatus(d));
          var donor = S.donorById(d.donorId);
          return (
            "<tr>" +
              '<td><span class="cell-strong">' + esc(d.foodName) + "</span></td>" +
              '<td class="cell-muted">' + esc(donor.orgName || donor.name) + "</td>" +
              '<td><span class="pill ' + meta.cls + '">' + meta.label + "</span></td>" +
              "<td>" + d.servings + "</td>" +
              '<td class="cell-muted">' + UI.timeAgo(d.updatedAt || d.createdAt) + "</td>" +
            "</tr>"
          );
        }).join("") +
      "</tbody></table></div>";
  }

  /* ---------------- browse & reserve ---------------- */

  function bindBrowse() {
    var search = document.getElementById("browseSearch");
    if (search) search.addEventListener("input", function () { browseState.query = search.value; renderBrowse(); });

    var chips = document.getElementById("browseChips");
    if (chips) {
      chips.innerHTML =
        '<button class="chip active" data-value="" type="button">All</button>' +
        '<button class="chip" data-value="veg" type="button">🥬 Vegetarian</button>' +
        '<button class="chip" data-value="nonveg" type="button">🍗 Non-veg</button>';
      chips.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          chips.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          browseState.veg = chip.dataset.value;
          renderBrowse();
        });
      });
    }

    var sort = document.getElementById("browseSort");
    if (sort) sort.addEventListener("change", function () { browseState.sort = sort.value; renderBrowse(); });

    var panel = document.getElementById("browseFilters");
    if (panel) {
      var types = ["Restaurant", "Hotel", "Cafe", "Bakery", "Household", "Catering", "Grocery Store", "Supermarket", "Corporate", "Event Organizer", "School", "College", "Hostel", "Individual"];
      panel.innerHTML =
        '<div class="form-field"><label>City</label><input type="text" id="fltCity" placeholder="e.g. Delhi"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Donor type</label><div class="chip-group">' +
          types.map(function (t) { return '<button class="chip" data-type="' + esc(t) + '" type="button">' + esc(t) + "</button>"; }).join("") +
        "</div></div>" +
        '<button class="btn btn-ghost" id="clearFilters" type="button" style="align-self:flex-end">Clear filters</button>';
      panel.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          chip.classList.toggle("active");
          renderBrowse();
        });
      });
      var city = document.getElementById("fltCity");
      if (city) city.addEventListener("input", function () { renderBrowse(); });
      var clear = document.getElementById("clearFilters");
      if (clear) clear.addEventListener("click", function () {
        panel.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        if (city) city.value = "";
        renderBrowse();
      });
    }
  }

  function browseList() {
    var list = S.Donations.all().filter(function (d) { return S.donationStatus(d) === "available"; });
    var panel = document.getElementById("browseFilters");
    if (panel) {
      var city = document.getElementById("fltCity");
      var activeTypes = panel.querySelectorAll(".chip.active");
      if (city && city.value.trim()) {
        var c = city.value.toLowerCase().trim();
        list = list.filter(function (d) { return (d.city || "").toLowerCase().indexOf(c) !== -1; });
      }
      if (activeTypes.length) {
        list = list.filter(function (d) {
          return Array.prototype.some.call(activeTypes, function (t) { return d.foodType === t.dataset.type; });
        });
      }
    }
    if (browseState.veg) list = list.filter(function (d) { return d.category === browseState.veg; });
    if (browseState.query) list = window.FoodLink.Search.food(list, browseState.query);
    list.sort(Filter.SORTS[browseState.sort] || Filter.SORTS.expiry);
    return list;
  }

  function renderBrowse() {
    var grid = document.getElementById("browseGrid");
    if (!grid) return;
    var list = browseList();
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-emoji">🍽️</span><h4>No food available</h4><p>Try adjusting your search or check back soon.</p></div>';
      return;
    }
    grid.innerHTML = list.map(function (d) {
      return UI.donationCard(d, {
        showCountdown: true,
        footer: function () {
          var fav = S.isFavorite(user.id, d.id);
          return '<div class="food-actions">' +
            '<button class="btn btn-primary btn-sm" data-reserve="' + d.id + '">Reserve</button>' +
            '<button class="btn btn-ghost btn-sm" data-fav="' + d.id + '" title="Favorite">' + (fav ? "❤️" : "🤍") + "</button>" +
          "</div>";
        }
      });
    }).join("");
    grid.querySelectorAll("[data-reserve]").forEach(function (b) {
      b.addEventListener("click", function () { reserveDonation(b.dataset.reserve); });
    });
    grid.querySelectorAll("[data-fav]").forEach(function (b) {
      b.addEventListener("click", function () { toggleFavorite(b.dataset.fav); });
    });
    grid.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { openFoodDetails(b.dataset.view); });
    });
    UI.startCountdowns();
  }

  function reserveDonation(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    if (S.donationStatus(d) !== "available") { UI.toast("Already taken", "This donation was just reserved by someone else.", "warning"); renderBrowse(); renderOverview(); return; }
    var donor = S.donorById(d.donorId);
    Modal.confirm("Reserve this food?", "Reserve '" + esc(d.foodName) + "' from " + esc(donor.orgName || donor.name) + " (" + d.servings + " servings)?", { okText: "Confirm reservation" }).then(function (ok) {
      if (!ok) return;
      if (S.donationStatus(d) !== "available") { UI.toast("Already taken", "This donation was just reserved by someone else.", "warning"); renderBrowse(); renderOverview(); return; }
      S.Donations.update(id, {
        status: "reserved",
        reservedBy: user.id,
        reservedByName: user.orgName || user.name,
        updatedAt: Date.now()
      });
      S.addNotification(d.donorId, (user.orgName || user.name) + " reserved your '" + d.foodName + "'. Please prepare for pickup.", "success");
      S.addNotification(user.id, "You reserved '" + d.foodName + "'. Keep an eye on its status.", "success");
      UI.toast("Reserved!", "The donor has been notified. Pickup details are below.", "success");
      renderBrowse();
      renderOverview();
      renderReservations();
      renderFavorites();
    });
  }

  function toggleFavorite(id) {
    var fav = S.toggleFavorite(user.id, id);
    UI.toast(fav ? "Added to favorites" : "Removed from favorites", fav ? "You'll find it under Favorites." : "It's no longer in your favorites.", "info");
    renderBrowse();
    renderFavorites();
  }

  function openFoodDetails(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    var donor = S.donorById(d.donorId);
    var meta = UI.statusMeta(S.donationStatus(d));
    var fav = S.isFavorite(user.id, d.id);
    Modal.open(
      '<div class="modal-title">' + esc(d.foodName) + "</div>" +
      '<div class="modal-sub">' + esc(donor.orgName || donor.name) + " • " + esc(d.foodType || "") + "</div>" +
      '<div class="form-actions" style="justify-content:flex-start"><span class="pill ' + meta.cls + '">' + meta.label + "</span></div>" +
      '<div class="food-meta" style="margin:14px 0">' +
        "<span>&#127869; " + UI.num(d.servings) + " servings</span><span>&#9878; " + UI.num(d.quantity) + " kg</span>" +
        "<span>&#128340; " + esc(UI.formatDateTime(d.expiresAt)) + "</span>" +
      "</div>" +
      "<p class='modal-sub'>" + esc(d.description || "No description provided.") + "</p>" +
      '<div class="food-meta" style="margin:14px 0"><span>&#128205; ' + esc([d.address, d.city, d.state].filter(Boolean).join(", ") || "—") + "</span></div>" +
      '<div class="form-actions">' +
        (S.donationStatus(d) === "available" ? '<button class="btn btn-primary" type="button" id="reserveBtn">Reserve this food</button>' : "") +
        '<button class="btn btn-ghost" type="button" id="favBtn" aria-pressed="' + (fav ? "true" : "false") + '">' + (fav ? "Saved" : "Save") + "</button>" +
        '<button class="btn btn-ghost" type="button" data-close>Close</button>' +
      "</div>",
      { size: "md", label: d.foodName, onOpen: function (m) {
          var closeBtn = m.querySelector("[data-close]");
          if (closeBtn) closeBtn.addEventListener("click", Modal.close);
          var r = m.querySelector("#reserveBtn");
          if (r) r.addEventListener("click", function () { Modal.close(); reserveDonation(d.id); });
          var favBtn = m.querySelector("#favBtn");
          // Previously the toggle gave no feedback at all from the modal.
          if (favBtn) favBtn.addEventListener("click", function () {
            var nowFav = S.toggleFavorite(user.id, d.id);
            favBtn.setAttribute("aria-pressed", nowFav ? "true" : "false");
            favBtn.textContent = nowFav ? "Saved" : "Save";
            UI.toast(nowFav ? "Saved" : "Removed", nowFav ? "Added to your favourites." : "Removed from your favourites.", "info");
            renderBrowse();
            renderFavorites();
          });
        } }
    );
  }

  /* ---------------- reservations ---------------- */

  function renderReservations() {
    var box = document.getElementById("reservationList");
    if (!box) return;
    var list = myReservations();
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📋</span><h4>No reservations</h4><p>Browse available food and reserve a donation to see it here.</p></div>';
      return;
    }
    box.innerHTML = list.map(function (d) {
      var meta = UI.statusMeta(S.donationStatus(d));
      var donor = S.donorById(d.donorId);
      var actions = "";
      if (S.donationStatus(d) === "reserved") {
        actions = '<button class="btn btn-ghost btn-sm" data-rcancel="' + d.id + '">Cancel reservation</button>';
      }
      actions += '<button class="btn btn-ghost btn-sm" data-rview="' + d.id + '">View</button>';
      return (
        '<div class="donation-row">' +
          '<div class="donation-thumb">' + UI.foodEmoji(d.foodName) + "</div>" +
          '<div class="donation-info">' +
            "<h4>" + esc(d.foodName) + ' <span class="pill ' + meta.cls + ' donation-chip">' + meta.label + "</span></h4>" +
            "<p>" + esc(donor.orgName || donor.name) + " • " + d.servings + " servings • ⚖️ " + d.quantity + " kg • 📍 " + esc(d.city || "") + "</p>" +
            (S.donationStatus(d) === "reserved" ? "<p>📞 " + esc(d.phone || donor.phone || "—") + " • 📍 " + esc(d.address || "") + "</p>" : "") +
          "</div>" +
          '<div class="table-actions">' + actions + "</div>" +
        "</div>"
      );
    }).join("");
    box.querySelectorAll("[data-rview]").forEach(function (b) {
      b.addEventListener("click", function () { openFoodDetails(b.dataset.rview); });
    });
    box.querySelectorAll("[data-rcancel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = S.Donations.byId(b.dataset.rcancel);
        if (!d) return;
        Modal.confirm("Cancel reservation?", "This frees up '" + esc(d.foodName) + "' for other receivers.", { danger: true, okText: "Cancel reservation" }).then(function (ok) {
          if (!ok) return;
          S.Donations.update(d.id, { status: "available", reservedBy: null, reservedByName: "", updatedAt: Date.now() });
          S.addNotification(d.donorId, "Your '" + d.foodName + "' reservation by " + (user.orgName || user.name) + " was cancelled.", "warning");
          UI.toast("Reservation cancelled", "The listing is available again.", "info");
          renderReservations();
          renderOverview();
          renderBrowse();
        });
      });
    });
  }

  /* ---------------- favorites ---------------- */

  function renderFavorites() {
    var grid = document.getElementById("favoritesGrid");
    if (!grid) return;
    var list = myFavorites();
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-emoji">🤍</span><h4>No favorites yet</h4><p>Tap the heart on any food card to save it here.</p></div>';
      return;
    }
    grid.innerHTML = list.map(function (d) {
      return UI.donationCard(d, {
        showCountdown: true,
        footer: function () {
          return '<div class="food-actions">' +
            (S.donationStatus(d) === "available"
              ? '<button class="btn btn-primary btn-sm" data-reserve="' + d.id + '">Reserve</button>'
              : '<span class="cell-muted">' + (UI.statusMeta(S.donationStatus(d))).label + "</span>") +
            '<button class="btn btn-ghost btn-sm" data-fav="' + d.id + '" title="Remove favorite">❤️</button>' +
          "</div>";
        }
      });
    }).join("");
    grid.querySelectorAll("[data-reserve]").forEach(function (b) {
      b.addEventListener("click", function () { reserveDonation(b.dataset.reserve); });
    });
    grid.querySelectorAll("[data-fav]").forEach(function (b) {
      b.addEventListener("click", function () { toggleFavorite(b.dataset.fav); });
    });
    UI.startCountdowns();
  }

  /* ---------------- requests ---------------- */

  function bindRequestForm() {
    var form = document.getElementById("requestForm");
    if (!form) return;
    V.attachLiveValidation(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!V.validateForm(form)) { UI.toast("Check the form", "Fix the highlighted fields and try again.", "error"); return; }
      var f = new FormData(form);
      S.Requests.add({
        receiverId: user.id,
        receiverName: user.orgName || user.name,
        foodRequired: f.get("foodRequired").trim(),
        quantity: f.get("quantity").trim(),
        peopleCount: Number(f.get("peopleCount")),
        urgency: f.get("urgency"),
        description: f.get("description").trim(),
        status: "open",
        createdAt: Date.now()
      });
      S.addNotification("u_admin", "New request from " + (user.orgName || user.name) + ": " + f.get("foodRequired"), "info");
      UI.toast("Request posted!", "Donors in your area can now see what you need.", "success");
      form.reset();
      renderRequests();
    });
  }

  function renderRequests() {
    var box = document.getElementById("myRequestsList");
    if (!box || !user) return;
    var list = S.Requests.all()
      .filter(function (r) { return r.receiverId === user.id; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📣</span><h4>No requests yet</h4><p>Post a request above to tell donors what you need.</p></div>';
      return;
    }
    box.innerHTML = list.map(function (r) {
      var meta = r.status === "open" ? { label: "Open", cls: "pill-available" } : { label: "Closed", cls: "pill-cancelled" };
      return (
        '<div class="donation-row">' +
          '<div class="donation-thumb">📣</div>' +
          '<div class="donation-info">' +
            "<h4>" + esc(r.foodRequired) + ' <span class="pill ' + meta.cls + ' donation-chip">' + meta.label + "</span></h4>" +
            "<p>👥 " + (r.peopleCount || "?") + " people • 📦 " + esc(r.quantity || "") + " • ⚡ " + esc(r.urgency || "") + "</p>" +
            (r.description ? "<p>" + esc(r.description) + "</p>" : "") +
          "</div>" +
          '<div class="table-actions">' +
            (r.status === "open" ? '<button class="btn btn-ghost btn-sm" data-rqdel="' + r.id + '">Close</button>' : "") +
          "</div>" +
        "</div>"
      );
    }).join("");
    box.querySelectorAll("[data-rqdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = S.Requests.byId(b.dataset.rqdel);
        if (!r) return;
        Modal.confirm("Close this request?", "Mark '" + esc(r.foodRequired) + "' as fulfilled or no longer needed?", { okText: "Close request" }).then(function (ok) {
          if (!ok) return;
          S.Requests.update(r.id, { status: "closed" });
          UI.toast("Request closed", "It will no longer be shown to donors.", "info");
          renderRequests();
        });
      });
    });
  }

  /* ---------------- rewards ---------------- */

  function renderRewards() {
    if (!user) return;
    var coins = document.getElementById("rewardCoins");
    if (coins) coins.textContent = (user.points || 0).toLocaleString("en-IN");
    var tier = S.tierFor(user.points || 0);
    var next = S.nextTier(user.points || 0);
    var tierEl = document.getElementById("rewardTier");
    if (tierEl) {
      tierEl.textContent = tier.emoji + " " + tier.name + " tier" + (next ? " • " + (next.min - (user.points || 0)) + " pts to " + next.name : " • Highest tier reached!");
    }
    var grid = document.getElementById("badgeGrid");
    if (!grid) return;
    grid.innerHTML = S.TIERS.map(function (t) {
      var earned = (user.points || 0) >= t.min;
      return (
        '<div class="badge-card' + (earned ? "" : " locked") + '">' +
          '<span class="badge-emoji">' + t.emoji + "</span>" +
          "<h4>" + t.name + "</h4>" +
          "<p>" + (t.min === 0 ? "Start earning" : "Reach " + t.min + " points") + "</p>" +
          '<span class="pill ' + (earned ? "pill-available" : "pill-cancelled") + '">' + (earned ? "Unlocked" : "Locked") + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------------- profile ---------------- */

  function renderProfile() {
    var form = document.getElementById("profileForm");
    if (!form || !user) return;
    form.innerHTML =
      '<div class="form-row">' +
        '<div class="form-field"><label>Organization / Display Name</label><input type="text" name="orgName" value="' + esc(user.orgName || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Contact Person</label><input type="text" name="name" value="' + esc(user.name || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-row">' +
        '<div class="form-field"><label>Phone</label><input type="tel" name="phone" value="' + esc(user.phone || "") + '" data-rule="phone"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Email</label><input type="email" name="email" value="' + esc(user.email || "") + '" data-rule="email"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-row">' +
        '<div class="form-field"><label>Organization Type</label><select name="type" data-rule="select">' + optionsHtml(RECEIVER_TYPES, user.type) + "</select><small class='field-msg'></small></div>" +
        '<div class="form-field"><label>City</label><input type="text" name="city" value="' + esc(user.city || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-row">' +
        '<div class="form-field"><label>State</label><input type="text" name="state" value="' + esc(user.state || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Pincode</label><input type="text" name="pincode" value="' + esc(user.pincode || "") + '" data-rule="pincode"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-field"><label>Address</label><textarea name="address" rows="2" data-rule="text">' + esc(user.address || "") + "</textarea><small class='field-msg'></small></div>" +
      '<div class="form-field"><label>About</label><textarea name="description" rows="3">' + esc(user.description || "") + "</textarea><small class='field-msg'></small></div>" +
      '<button type="submit" class="btn btn-primary btn-lg">Save profile</button>';

    V.attachLiveValidation(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!V.validateForm(form)) { UI.toast("Check the form", "Fix the highlighted fields and try again.", "error"); return; }
      var f = new FormData(form);
      // Email changes go through a verification flow the server owns, so
      // they are not part of a plain profile save.
      S.updateMyProfile({
        orgName: f.get("orgName"),
        name: f.get("name"),
        phone: f.get("phone"),
        type: f.get("type"),
        city: f.get("city"),
        state: f.get("state"),
        pincode: f.get("pincode"),
        address: f.get("address"),
        description: f.get("description")
      }).then(function () {
        user = S.currentUser();
        refreshShellUser();
        Shell.initNotifications();
        UI.toast("Profile updated", "Your details have been saved.", "success");
      })["catch"](function (err) {
        UI.toast("Could not save", (err && err.message) || "Your profile was not updated. Try again.", "error");
      });
    });
  }

  /* ---------------- boot ---------------- */

  function bindMisc() {
    document.querySelectorAll('[data-go="index"]').forEach(function (b) {
      b.addEventListener("click", function () { window.location.href = "index.html"; });
    });
  }

  function start() {
    user = S.requireRole(["receiver"]);
    if (!user) return;
    Shell.init();
    UI.applyTheme();
    refreshShellUser();
    bindMisc();
    bindBrowse();
    bindRequestForm();

    window.FoodLink.onSectionChange = function (name) {
      var h1 = document.getElementById("pageTitle");
      if (h1 && SECTION_TITLES[name]) h1.textContent = SECTION_TITLES[name];
      if (name === "overview") renderOverview();
      else if (name === "browse") renderBrowse();
      else if (name === "reservations") renderReservations();
      else if (name === "favorites") renderFavorites();
      else if (name === "requests") renderRequests();
      else if (name === "rewards") renderRewards();
    };

    renderOverview();
    renderBrowse();
    renderReservations();
    renderFavorites();
    renderRequests();
    renderRewards();
    renderProfile();
    UI.startCountdowns();
  }

  S.init().then(start);
})();
