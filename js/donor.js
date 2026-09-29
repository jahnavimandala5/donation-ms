/* =====================================================================
   FoodLink - donor.js
   Donor dashboard: overview stats/charts, add donation, my donations,
   receiver requests, rewards and profile.
   ===================================================================== */

(function () {
  "use strict";

  var S = window.FoodLink.Storage;
  var UI = window.FoodLink.UI;
  var Modal = window.FoodLink.Modal;
  var V = window.FoodLink.Validation;
  var Charts = window.FoodLink.Charts;
  var Shell = window.FoodLink.Shell;

  var esc = UI.escapeHtml;
  var user = null;

  var SECTION_TITLES = {
    overview: "Overview",
    add: "Add Donation",
    myDonations: "My Donations",
    requests: "Receiver Requests",
    rewards: "Rewards",
    profile: "Profile"
  };

  var DONOR_TYPES = ["Restaurant", "Hotel", "Cafe", "Bakery", "Household", "Individual", "Corporate", "Catering", "Grocery Store", "Supermarket", "Event Organizer", "Fruit Market", "Vegetable Vendor", "School", "College", "Hostel"];

  var SLICE_COLORS = {
    available: { label: "Available", color: "#10b981" },
    reserved: { label: "Reserved", color: "#f59e0b" },
    collected: { label: "Collected", color: "#0284c7" },
    completed: { label: "Completed", color: "#7c3aed" },
    expired: { label: "Expired", color: "#ef4444" },
    cancelled: { label: "Cancelled", color: "#94a3b8" }
  };

  /* ---------------- data helpers ---------------- */

  function myDonations() {
    if (!user) return [];
    return S.Donations.all()
      .filter(function (d) { return d.donorId === user.id; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function doneDonations() {
    return myDonations().filter(function (d) {
      var s = S.donationStatus(d);
      return s === "collected" || s === "completed";
    });
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

  function statBox(emoji, num, label, suffix, trend, trendUp, accent) {
    return (
      '<div class="stat-box">' +
        '<div class="stat-icon-wrap" style="--stat-bg:' + (accent ? accent + "22" : "var(--primary-soft)") + ";--stat-color:" + (accent || "var(--primary-2)") + '">' + emoji + "</div>" +
        '<div><div class="stat-num" data-count="' + num + '" data-suffix="' + esc(suffix || "") + '">0</div>' +
        '<div class="stat-lbl">' + label + "</div></div>" +
        (trend ? '<span class="stat-trend ' + (trendUp ? "up" : "down") + '">' + trend + "</span>" : "") +
      "</div>"
    );
  }

  function renderOverview() {
    var list = myDonations();
    var active = list.filter(function (d) { return S.donationStatus(d) === "available"; });
    var reserved = list.filter(function (d) { return S.donationStatus(d) === "reserved"; });
    var done = doneDonations();
    var kg = done.reduce(function (s, d) { return s + (d.quantity || 0); }, 0);
    var meals = done.reduce(function (s, d) { return s + (d.servings || 0); }, 0);
    var views = list.reduce(function (s, d) { return s + (d.views || 0); }, 0);

    var stats = document.getElementById("overviewStats");
    if (stats) {
      stats.innerHTML =
        statBox("🍽️", active.length, "Active listings", "", null, null, "#10b981") +
        statBox("🤝", reserved.length, "Reserved", "", null, null, "#f59e0b") +
        statBox("🍛", meals, "Meals served", " meals", null, null, "#0ea5e9") +
        statBox("⚖️", Math.round(kg * 10) / 10, "Food donated", " kg", null, null, "#8b5cf6");
      UI.runCounters();
    }

    // "This week" must mean the current calendar week, not the first seven
    // records in the array.
    var nowTs = Date.now();
    var weekStart = (function () {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getTime();
    })();
    var week = list.filter(function (d) {
      return Number(d.createdAt) >= weekStart && Number(d.createdAt) <= nowTs;
    }).reduce(function (s, d) { return s + (Number(d.servings) || 0); }, 0);
    var lastWeek = 0;
    var lineEl = document.getElementById("donorLineChart");
    if (lineEl) {
      var days = [], counts = [], now = new Date();
      for (var i = 6; i >= 0; i--) {
        var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime();
        var dayEnd = dayStart + 86400000;
        var cnt = list.filter(function (d) { return d.createdAt >= dayStart && d.createdAt < dayEnd; }).length;
        days.push(new Date(dayStart).toLocaleDateString("en-IN", { weekday: "short" }));
        counts.push(cnt);
      }
      Charts.line(lineEl, days, counts, { color: "#10b981" });
    }
    var _lw = document.getElementById("donorWeekTotals");
    if (_lw) {
      _lw.textContent = "Week: " + week + " servings";
      lastWeek = week;
    }

    var donutEl = document.getElementById("donorDonutChart");
    if (donutEl) {
      var counts2 = {};
      list.forEach(function (d) {
        var st = S.donationStatus(d);
        counts2[st] = (counts2[st] || 0) + 1;
      });
      var slices = Object.keys(counts2).map(function (st) {
        return { label: (SLICE_COLORS[st] || { label: st, color: "#94a3b8" }).label, value: counts2[st], color: (SLICE_COLORS[st] || { color: "#94a3b8" }).color };
      });
      Charts.donut(donutEl, slices, { centerLabel: "donations" });
      Charts.legendCss();
    }

    renderRecent();
  }

  function renderRecent() {
    var box = document.getElementById("recentTable");
    if (!box) return;
    var rows = myDonations().slice(0, 5);
    if (!rows.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">🍽️</span><h4>No donations yet</h4><p>List your first surplus meal to start earning points.</p></div>';
      return;
    }
    box.innerHTML =
      '<div class="table-wrap"><table>' +
        "<thead><tr><th>Food</th><th>Status</th><th>Servings</th><th>Listed</th><th>Actions</th></tr></thead><tbody>" +
        rows.map(function (d) {
          var meta = UI.statusMeta(S.donationStatus(d));
          return (
            "<tr>" +
              '<td><span class="cell-strong">' + esc(d.foodName) + '</span><br><span class="cell-muted">' + esc(d.city || "") + " • " + esc(d.foodType || "") + "</span></td>" +
              '<td><span class="pill ' + meta.cls + '">' + meta.label + "</span></td>" +
              "<td>" + d.servings + "</td>" +
              '<td class="cell-muted">' + UI.formatDate(d.createdAt) + "</td>" +
              '<td><div class="table-actions">' +
                '<button class="btn btn-ghost btn-sm" data-dview="' + d.id + '">View</button>' +
                (S.donationStatus(d) === "available" ? '<button class="btn btn-ghost btn-sm" data-dedit="' + d.id + '">Edit</button>' : "") +
              "</div></td>" +
            "</tr>"
          );
        }).join("") +
      "</tbody></table></div>";
    box.querySelectorAll("[data-dview]").forEach(function (b) {
      b.addEventListener("click", function () { openDonationDetails(b.dataset.dview); });
    });
    box.querySelectorAll("[data-dedit]").forEach(function (b) {
      b.addEventListener("click", function () { openEditModal(b.dataset.dedit); });
    });
  }

  /* ---------------- add / edit donation ---------------- */

  function fillForm(form) {
    form.reset();
    form.elements["category"].value = "veg";
    var q = form.querySelector('[name="quantity"]');
    if (q) q.value = "";
    var s = form.querySelector('[name="servings"]');
    if (s) s.value = "";
  }

  function bindDonationForm() {
    var form = document.getElementById("donationForm");
    if (!form) return;
    V.attachLiveValidation(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!V.validateForm(form)) { UI.toast("Check the form", "Fix the highlighted fields and try again.", "error"); return; }
      var f = new FormData(form);
      var hours = Number(f.get("expiresIn") || 1);
      var rec = {
        donorId: user.id,
        donorName: user.orgName || user.name,
        foodName: f.get("foodName").trim(),
        category: f.get("category"),
        foodType: user.type || "Individual",
        quantity: Number(f.get("quantity")),
        servings: Number(f.get("servings")),
        preparedAt: Date.now(),
        expiresAt: S.hoursFromNow(hours),
        pickupTime: f.get("pickupTime").trim(),
        city: f.get("city").trim(),
        state: f.get("state").trim(),
        pincode: user.pincode || "",
        phone: user.phone || "",
        address: f.get("address").trim(),
        description: f.get("description").trim(),
        image: null,
        status: "available",
        reservedBy: null,
        reservedByName: "",
        views: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      S.Donations.add(rec);
      S.addNotification("u_admin", "New donation listed: " + rec.foodName + " from " + (user.orgName || user.name), "info");
      UI.toast("Food listed!", rec.servings + " servings are now live for receivers.", "success");
      fillForm(form);
      UI.showSection("myDonations", SECTION_TITLES.myDonations);
    });
  }

  /* ---------------- my donations ---------------- */

  var myState = { status: "", query: "" };

  function bindMyList() {
    var bar = document.getElementById("myDonChips");
    if (bar) {
      var statuses = [
        { v: "", l: "All" }, { v: "available", l: "Available" }, { v: "reserved", l: "Reserved" },
        { v: "collected", l: "Collected" }, { v: "completed", l: "Completed" },
        { v: "expired", l: "Expired" }, { v: "cancelled", l: "Cancelled" }
      ];
      bar.innerHTML = statuses.map(function (s) {
        return '<button class="chip' + (s.v === "" ? " active" : "") + '" data-value="' + s.v + '" type="button">' + s.l + "</button>";
      }).join("");
      bar.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          bar.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          myState.status = chip.dataset.value;
          renderMyList();
        });
      });
    }
    var search = document.getElementById("myDonSearch");
    if (search) {
      search.addEventListener("input", function () {
        myState.query = search.value;
        renderMyList();
      });
    }
  }

  function renderMyList() {
    var box = document.getElementById("myDonList");
    if (!box) return;
    var list = myDonations();
    if (myState.query) list = window.FoodLink.Search.food(list, myState.query);
    if (myState.status) list = list.filter(function (d) { return S.donationStatus(d) === myState.status; });

    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📦</span><h4>Nothing here yet</h4><p>' +
        (myState.status ? "No donations match the current filter." : "When you list surplus food it will show up here.") + "</p></div>";
      return;
    }

    box.innerHTML = list.map(function (d) {
      var meta = UI.statusMeta(S.donationStatus(d));
      var actions = "";
      var st = S.donationStatus(d);
      if (st === "available") {
        actions = '<button class="btn btn-ghost btn-sm" data-dedit="' + d.id + '">Edit</button>' +
                  '<button class="btn btn-ghost btn-sm" data-dcancel="' + d.id + '">Cancel</button>';
      } else if (st === "reserved") {
        actions = '<button class="btn btn-primary btn-sm" data-dcollect="' + d.id + '">Mark collected</button>' +
                  '<button class="btn btn-ghost btn-sm" data-dcancel="' + d.id + '">Cancel</button>';
      } else if (st === "collected") {
        actions = '<button class="btn btn-primary btn-sm" data-dcomplete="' + d.id + '">Mark completed</button>';
      }
      actions += '<button class="btn btn-ghost btn-sm" data-dview="' + d.id + '">View</button>';
      return (
        '<div class="donation-row">' +
          '<div class="donation-thumb">' + UI.foodEmoji(d.foodName) + "</div>" +
          '<div class="donation-info">' +
            "<h4>" + esc(d.foodName) + ' <span class="pill ' + meta.cls + ' donation-chip">' + meta.label + "</span></h4>" +
            "<p>" + (d.reservedByName ? "Reserved by " + esc(d.reservedByName) + " • " : "") + d.servings + " servings • ⚖️ " + d.quantity + " kg • 📍 " + esc(d.city || "") + "</p>" +
          "</div>" +
          '<div class="table-actions">' + actions + "</div>" +
        "</div>"
      );
    }).join("");

    box.querySelectorAll("[data-dview]").forEach(function (b) {
      b.addEventListener("click", function () { openDonationDetails(b.dataset.dview); });
    });
    box.querySelectorAll("[data-dedit]").forEach(function (b) {
      b.addEventListener("click", function () { openEditModal(b.dataset.dedit); });
    });
    box.querySelectorAll("[data-dcancel]").forEach(function (b) {
      b.addEventListener("click", function () { cancelDonation(b.dataset.dcancel); });
    });
    box.querySelectorAll("[data-dcollect]").forEach(function (b) {
      b.addEventListener("click", function () { collectDonation(b.dataset.dcollect); });
    });
    box.querySelectorAll("[data-dcomplete]").forEach(function (b) {
      b.addEventListener("click", function () { completeDonation(b.dataset.dcomplete); });
    });
  }

  function cancelDonation(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    Modal.confirm("Cancel this donation?", "The listing for '" + esc(d.foodName) + "' will be removed from the feed.", { danger: true, okText: "Cancel listing" }).then(function (ok) {
      if (!ok) return;
      S.Donations.update(id, { status: "cancelled", updatedAt: Date.now() });
      if (d.reservedBy) S.addNotification(d.reservedBy, "'" + d.foodName + "' from " + (user.orgName || user.name) + " was cancelled.", "warning");
      UI.toast("Listing cancelled", "Receivers can no longer see this donation.", "info");
      renderOverview();
      renderMyList();
    });
  }

  function collectDonation(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    Modal.confirm("Confirm pickup", "Mark '" + esc(d.foodName) + "' as handed over to " + esc(d.reservedByName || "the receiver") + "?", { okText: "Confirm pickup" }).then(function (ok) {
      if (!ok) return;
      S.Donations.update(id, { status: "collected", updatedAt: Date.now() });
      S.addNotification(d.reservedBy, "'" + d.foodName + "' has been collected. Thanks for picking up!", "success");
      UI.toast("Marked collected", "Update the status to completed after the receiver confirms.", "success");
      renderOverview();
      renderMyList();
    });
  }

  function completeDonation(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    Modal.confirm("Mark completed", "Confirm that '" + esc(d.foodName) + "' reached the people in need?", { okText: "Yes, completed" }).then(function (ok) {
      if (!ok) return;
      S.Donations.update(id, { status: "completed", updatedAt: Date.now() });
      var pts = Math.max(5, Math.round(d.servings || 0));
      S.addPoints(user.id, pts);
      if (d.reservedBy) S.addNotification(d.reservedBy, "'" + d.foodName + "' donation completed. " + pts + " Green Points earned!", "success");
      UI.toast("Donation completed", "+" + pts + " Green Points added to your account.", "success");
      renderOverview();
      renderMyList();
    });
  }

  function openDonationDetails(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    var meta = UI.statusMeta(S.donationStatus(d));
    var steps = [
      { label: "Listed", done: true },
      { label: "Reserved", done: d.reservedBy || ["reserved", "collected", "completed"].indexOf(S.donationStatus(d)) !== -1 },
      { label: "Collected", done: ["collected", "completed"].indexOf(S.donationStatus(d)) !== -1 },
      { label: "Completed", done: S.donationStatus(d) === "completed" }
    ];
    Modal.open(
      '<div class="modal-title">' + esc(d.foodName) + "</div>" +
      '<div class="modal-sub">' + UI.foodEmoji(d.foodName) + " " + d.servings + " servings • ⚖️ " + d.quantity + " kg • 📍 " + esc(d.city || "") + "</div>" +
      '<div class="form-actions" style="justify-content:flex-start"><span class="pill ' + meta.cls + '">' + meta.label + "</span></div>" +
      '<div class="status-track">' + steps.map(function (s, i) {
        return '<div class="status-step' + (s.done ? " done" : (i === 0 ? " active" : "")) + '"><div class="status-dot">' + (s.done ? "✓" : (i + 1)) + "</div><span>" + s.label + "</span></div>";
      }).join("") + "</div>" +
      "<p class='modal-sub' style='margin-top:14px'>" + esc(d.description || "No description provided.") + "</p>" +
      '<div class="form-actions">' +
      '<button class="btn btn-ghost" data-close>Close</button>' +
      "</div>",
      { onOpen: function (m) {
          m.querySelector("[data-close]").addEventListener("click", Modal.close);
        } }
    );
  }

  function openEditModal(id) {
    var d = S.Donations.byId(id);
    if (!d) return;
    Modal.open(
      '<div class="modal-title">Edit listing</div>' +
      '<p class="modal-sub">' + esc(d.foodName) + "</p>" +
      '<form id="editDonationForm" novalidate>' +
        '<div class="form-row">' +
          '<div class="form-field"><label>Quantity (kg)</label><input type="number" name="quantity" min="0.1" step="0.1" value="' + d.quantity + '" data-rule="number"><small class="field-msg"></small></div>' +
          '<div class="form-field"><label>Servings</label><input type="number" name="servings" min="1" value="' + d.servings + '" data-rule="number"><small class="field-msg"></small></div>' +
        "</div>" +
        '<div class="form-field"><label>Pickup time</label><input type="text" name="pickupTime" value="' + esc(d.pickupTime || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Safe to consume for</label><select name="expiresIn" data-rule="select">' +
          // `cur` was recomputed inside the loop and never constrained to
          // the option set, so a remaining time of 5 or 30 hours matched
          // nothing and the browser silently selected "1 hour", collapsing
          // the deadline on save. Snap to the nearest offered value.
          (function () {
            var HOURS = [1, 2, 3, 4, 6, 8, 12, 24];
            var cur = d.expiresAt ? Math.round((d.expiresAt - Date.now()) / 3600000) : 1;
            if (cur < HOURS[0]) cur = HOURS[0];
            if (cur > HOURS[HOURS.length - 1]) cur = HOURS[HOURS.length - 1];
            var best = HOURS[0];
            for (var i = 0; i < HOURS.length; i++) {
              if (Math.abs(HOURS[i] - cur) < Math.abs(best - cur)) best = HOURS[i];
            }
            return HOURS.map(function (h) {
              return '<option value="' + h + '"' + (h === best ? " selected" : "") + ">" + h + " hours</option>";
            }).join("");
          })() +
        "</select><small class='field-msg'></small></div>" +
        '<div class="form-row">' +
          '<div class="form-field"><label>City</label><input type="text" name="city" value="' + esc(d.city || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
          '<div class="form-field"><label>State</label><input type="text" name="state" value="' + esc(d.state || "") + '" data-rule="text"><small class="field-msg"></small></div>' +
        "</div>" +
        '<div class="form-field"><label>Address</label><textarea name="address" rows="2" data-rule="text">' + esc(d.address || "") + "</textarea><small class='field-msg'></small></div>" +
        '<div class="form-actions">' +
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
        '<button type="submit" class="btn btn-primary">Save changes</button>' +
        "</div>" +
      "</form>",
      { onOpen: function (m) {
          m.querySelector("[data-close]").addEventListener("click", Modal.close);
          var form = m.querySelector("#editDonationForm");
          V.attachLiveValidation(form);
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!V.validateForm(form)) { UI.toast("Check the form", "Fix the highlighted fields and try again.", "error"); return; }
            var f = new FormData(form);
            var hours = Number(f.get("expiresIn") || 1);
            S.Donations.update(id, {
              quantity: Number(f.get("quantity")),
              servings: Number(f.get("servings")),
              pickupTime: f.get("pickupTime").trim(),
              expiresAt: S.hoursFromNow(hours),
              city: f.get("city").trim(),
              state: f.get("state").trim(),
              address: f.get("address").trim(),
              updatedAt: Date.now()
            });
            Modal.close();
            UI.toast("Listing updated", "The changes are now live.", "success");
            renderOverview();
            renderMyList();
          });
        } }
    );
  }

  /* ---------------- receiver requests ---------------- */

  function renderRequests() {
    var box = document.getElementById("requestsList");
    if (!box) return;
    var list = S.Requests.all().filter(function (r) { return r.status === "open"; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">🤲</span><h4>No open requests</h4><p>Check back soon for requests from NGOs and shelters.</p></div>';
      return;
    }
    var urgencies = { "Immediate": "pill-expired", "Today": "pill-reserved", "Tomorrow": "pill-pending" };
    box.innerHTML = list.map(function (r) {
      var receiver = S.Users.byId(r.receiverId);
      return (
        '<div class="donation-row" style="align-items:flex-start">' +
          '<div class="donation-thumb">🤲</div>' +
          '<div class="donation-info">' +
            "<h4>" + esc(r.foodRequired) + ' <span class="pill ' + (urgencies[r.urgency] || "pill-cancelled") + ' donation-chip">' + esc(r.urgency || "Normal") + "</span></h4>" +
            "<p>" + esc(r.receiverName || (receiver && receiver.orgName) || "Receiver") + " • 👥 " + (r.peopleCount || "?") + " people • 📦 " + esc(r.quantity || "") + "</p>" +
            (r.description ? "<p>" + esc(r.description) + "</p>" : "") +
          "</div>" +
          '<div class="table-actions">' +
            '<button class="btn btn-primary btn-sm" data-rc="' + r.id + '">Offer help</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
    box.querySelectorAll("[data-rc]").forEach(function (b) {
      b.addEventListener("click", function () { offerHelp(b.dataset.rc); });
    });
  }

  function offerHelp(id) {
    var r = S.Requests.byId(id);
    if (!r) return;
    var receiver = S.Users.byId(r.receiverId) || {};
    Modal.open(
      '<div class="modal-title">Contact ' + esc(r.receiverName || (receiver.orgName || "receiver")) + "</div>" +
      '<p class="modal-sub">' + esc(r.foodRequired) + " • 📦 " + esc(r.quantity || "") + " • 👥 " + (r.peopleCount || "?") + " people</p>" +
      '<div class="form-card" style="box-shadow:none;border:1px solid var(--border);padding:20px">' +
        "<p><strong>Organization:</strong> " + esc(receiver.orgName || r.receiverName || "—") + "</p>" +
        "<p><strong>Contact:</strong> " + esc(receiver.name || "—") + "</p>" +
        "<p><strong>Phone:</strong> " + esc(receiver.phone || "—") + "</p>" +
        "<p><strong>Email:</strong> " + esc(receiver.email || "—") + "</p>" +
        "<p><strong>Address:</strong> " + esc([receiver.address, receiver.city].filter(Boolean).join(", ") || "—") + "</p>" +
      "</div>" +
      '<div class="form-actions"><button class="btn btn-ghost" type="button" data-close>Close</button></div>',
      { size: "md", label: "Request details", onOpen: function (m) {
          var closeBtn = m.querySelector("[data-close]");
          if (closeBtn) closeBtn.addEventListener("click", Modal.close);
        } }
    );
  }

  /* ---------------- rewards ---------------- */

  function renderRewards() {
    if (!user) return;
    var coins = document.getElementById("rewardCoins");
    if (coins) {
      coins.textContent = (user.points || 0).toLocaleString("en-IN");
    }
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
        '<div class="form-field"><label>Business Type</label><select name="type" data-rule="select">' + optionsHtml(DONOR_TYPES, user.type) + "</select><small class='field-msg'></small></div>" +
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
      // `email` and `updatedAt` are deliberately absent: the server decides
      // who may change what, and it rejects fields outside its whitelist.
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
    var goHome = document.querySelectorAll('[data-go="index"]');
    goHome.forEach(function (b) {
      b.addEventListener("click", function () { window.location.href = "index.html"; });
    });
  }

  function start() {
    user = S.requireRole(["donor"]);
    if (!user) return;
    Shell.init();
    UI.applyTheme();
    refreshShellUser();
    bindMisc();
    bindDonationForm();
    bindMyList();

    window.FoodLink.onSectionChange = function (name) {
      var h1 = document.getElementById("pageTitle");
      if (h1 && SECTION_TITLES[name]) h1.textContent = SECTION_TITLES[name];
      if (name === "overview") renderOverview();
      else if (name === "myDonations") renderMyList();
      else if (name === "requests") renderRequests();
      else if (name === "rewards") renderRewards();
    };

    renderOverview();
    renderMyList();
    renderRequests();
    renderRewards();
    renderProfile();
    UI.startCountdowns();
  }

  S.init().then(start);
})();
