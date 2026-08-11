/* =====================================================================
   FoodLink - admin.js
   Admin dashboard: platform overview, user moderation, donation/request
   management, feedback, messages, broadcast and settings.
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
    users: "Users",
    donations: "Donations",
    requests: "Requests",
    feedback: "Feedback",
    contacts: "Messages",
    broadcast: "Notify All",
    settings: "Settings"
  };

  var userState = { query: "", role: "" };
  var donState = { query: "", status: "" };

  var STATUS_PILL = {
    approved: "pill-available",
    pending: "pill-pending",
    rejected: "pill-rejected",
    available: "pill-available",
    reserved: "pill-reserved",
    collected: "pill-collected",
    completed: "pill-completed",
    expired: "pill-expired",
    cancelled: "pill-cancelled"
  };

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
    var users = S.Users.all();
    var donations = S.Donations.all();
    var requests = S.Requests.all();
    var contacts = S.Contacts.all();
    var donors = users.filter(function (u) { return u.role === "donor"; }).length;
    var receivers = users.filter(function (u) { return u.role === "receiver"; }).length;
    var pending = users.filter(function (u) { return u.status === "pending"; }).length;
    var meals = donations.reduce(function (s, d) { return s + (d.servings || 0); }, 0);
    var kg = donations.reduce(function (s, d) { return s + (d.quantity || 0); }, 0);
    var active = donations.filter(function (d) { return S.donationStatus(d) === "available"; }).length;
    var openReq = requests.filter(function (r) { return r.status === "open"; }).length;

    var stats = document.getElementById("overviewStats");
    if (stats) {
      stats.innerHTML =
        statBox("👥", users.length, "Total users", "", "#10b981") +
        statBox("🍛", donations.length, "Total listings", "", "#f59e0b") +
        statBox("🍽️", meals, "Meals listed", " meals", "#0ea5e9") +
        statBox("⚖️", Math.round(kg * 10) / 10, "Food shared", " kg", "#8b5cf6");
      UI.runCounters();
    }

    var lineEl = document.getElementById("adminLineChart");
    if (lineEl) {
      var days = [], counts = [], now = new Date();
      for (var i = 6; i >= 0; i--) {
        var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime();
        var dayEnd = dayStart + 86400000;
        var cnt = donations.filter(function (d) { return d.createdAt >= dayStart && d.createdAt < dayEnd; }).length;
        days.push(new Date(dayStart).toLocaleDateString("en-IN", { weekday: "short" }));
        counts.push(cnt);
      }
      Charts.line(lineEl, days, counts, { color: "#10b981" });
    }

    var donutEl = document.getElementById("adminDonutChart");
    if (donutEl) {
      Charts.donut(donutEl, [
        { label: "Donors", value: donors, color: "#10b981" },
        { label: "Receivers", value: receivers, color: "#0ea5e9" },
        { label: "Pending", value: pending, color: "#f59e0b" }
      ].filter(function (s) { return s.value > 0; }), { centerLabel: "users" });
      Charts.legendCss();
    }

    var latest = document.getElementById("latestUsers");
    if (latest) {
      var recent = users.slice().sort(function (a, b) { return (b.joinedAt || 0) - (a.joinedAt || 0); }).slice(0, 5);
      if (!recent.length) {
        latest.innerHTML = '<div class="empty-state"><span class="empty-emoji">👥</span><h4>No users yet</h4></div>';
      } else {
        latest.innerHTML = recent.map(function (u) {
          var pill = STATUS_PILL[u.status] || "pill-cancelled";
          return (
            '<div class="donation-row" style="margin-bottom:10px;padding:12px 14px">' +
              UI.avatarHtml(u.orgName || u.name) +
              '<div class="donation-info"><h4 style="font-size:14px">' + esc(u.orgName || u.name) + '</h4>' +
              "<p>" + esc(u.email || "") + " • " + esc(u.city || "") + "</p></div>" +
              '<span class="pill ' + pill + '">' + esc(u.status) + "</span>" +
            "</div>"
          );
        }).join("");
      }
    }

    var attention = document.getElementById("attentionList");
    if (attention) {
      var items = [
        { emoji: "🕓", text: pending + " account" + (pending === 1 ? "" : "s") + " pending approval", act: "users", show: pending > 0 },
        { emoji: "📣", text: openReq + " open food request" + (openReq === 1 ? "" : "s"), act: "requests", show: openReq > 0 },
        { emoji: "📨", text: contacts.length + " contact message" + (contacts.length === 1 ? "" : "s") + " to review", act: "contacts", show: contacts.length > 0 }
      ];
      var shown = items.filter(function (i) { return i.show; });
      if (!shown.length) {
        attention.innerHTML = '<div class="empty-state"><span class="empty-emoji">✅</span><h4>All caught up</h4><p>Nothing needs your attention right now.</p></div>';
      } else {
        attention.innerHTML = shown.map(function (i) {
          return (
            '<div class="donation-row" style="margin-bottom:10px;padding:12px 14px">' +
              '<div class="donation-thumb" style="width:44px;height:44px;font-size:20px">' + i.emoji + "</div>" +
              '<div class="donation-info"><p style="font-size:14px">' + i.text + "</p></div>" +
              '<button class="btn btn-ghost btn-sm" data-goto="' + i.act + '">Review</button>' +
            "</div>"
          );
        }).join("");
        attention.querySelectorAll("[data-goto]").forEach(function (b) {
          b.addEventListener("click", function () { UI.showSection(b.dataset.goto, SECTION_TITLES[b.dataset.goto]); });
        });
      }
    }
  }

  /* ---------------- users ---------------- */

  function bindUsers() {
    var search = document.getElementById("userSearch");
    if (search) search.addEventListener("input", function () { userState.query = search.value; renderUsers(); });
    var chips = document.getElementById("userRoleChips");
    if (chips) {
      chips.innerHTML =
        '<button class="chip active" data-value="" type="button">All</button>' +
        '<button class="chip" data-value="donor" type="button">🍛 Donors</button>' +
        '<button class="chip" data-value="receiver" type="button">🤲 Receivers</button>' +
        '<button class="chip" data-value="pending" type="button">🕓 Pending</button>';
      chips.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          chips.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          userState.role = chip.dataset.value;
          renderUsers();
        });
      });
    }
    var exportBtn = document.getElementById("exportUsers");
    if (exportBtn) exportBtn.addEventListener("click", exportCsv);
  }

  function visibleUsers() {
    var list = S.Users.all().slice();
    if (userState.role) {
      if (userState.role === "pending") list = list.filter(function (u) { return u.status === "pending"; });
      else list = list.filter(function (u) { return u.role === userState.role; });
    }
    if (userState.query) list = window.FoodLink.Search.user(list, userState.query);
    return list.sort(function (a, b) { return (b.joinedAt || 0) - (a.joinedAt || 0); });
  }

  function renderUsers() {
    var box = document.getElementById("usersTable");
    if (!box) return;
    var list = visibleUsers();
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">👥</span><h4>No users found</h4></div>';
      return;
    }
    box.innerHTML =
      '<div class="table-wrap"><table>' +
        "<thead><tr><th>User</th><th>Role</th><th>City</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>" +
        list.map(function (u) {
          var pill = STATUS_PILL[u.status] || "pill-cancelled";
          var actions = "";
          if (u.status === "pending") {
            actions = '<button class="btn btn-ghost btn-sm" data-approve="' + u.id + '">Approve</button>' +
                      '<button class="btn btn-ghost btn-sm" data-reject="' + u.id + '">Reject</button>';
          } else {
            actions = '<button class="btn btn-ghost btn-sm" data-verify="' + u.id + '">' + (u.verified ? "Unverify" : "Verify") + "</button>";
          }
          actions += '<button class="btn btn-ghost btn-sm" data-udel="' + u.id + '">Delete</button>';
          return (
            "<tr>" +
              "<td>" + UI.avatarHtml(u.orgName || u.name, "sm") +
                '<span class="cell-strong" style="margin-left:8px">' + esc(u.orgName || u.name) + "</span><br>" +
                '<span class="cell-muted" style="margin-left:48px">' + esc(u.email || "") + "</span></td>" +
              '<td>' + esc(u.role) + (u.verified ? " ✓" : "") + "</td>" +
              '<td class="cell-muted">' + esc(u.city || "") + "</td>" +
              '<td><span class="pill ' + pill + '">' + esc(u.status) + "</span></td>" +
              '<td class="cell-muted">' + UI.formatDate(u.joinedAt) + "</td>" +
              '<td><div class="table-actions">' + actions + "</div></td>" +
            "</tr>"
          );
        }).join("") +
      "</tbody></table></div>";

    box.querySelectorAll("[data-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.Users.update(b.dataset.approve, { status: "approved", verified: true });
        S.addNotification(b.dataset.approve, "Your account was approved. Welcome to FoodLink!", "success");
        UI.toast("Account approved", "The user can now log in.", "success");
        renderUsers();
        renderOverview();
      });
    });
    box.querySelectorAll("[data-reject]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.Users.update(b.dataset.reject, { status: "rejected" });
        S.addNotification(b.dataset.reject, "Your account was not approved. Contact support for details.", "warning");
        UI.toast("Account rejected", "The user has been notified.", "info");
        renderUsers();
        renderOverview();
      });
    });
    box.querySelectorAll("[data-verify]").forEach(function (b) {
      b.addEventListener("click", function () {
        var u = S.Users.byId(b.dataset.verify);
        if (!u) return;
        S.Users.update(u.id, { verified: !u.verified });
        UI.toast("Verification updated", u.orgName + " is now " + (!u.verified ? "verified" : "not verified") + ".", "success");
        renderUsers();
      });
    });
    box.querySelectorAll("[data-udel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var u = S.Users.byId(b.dataset.udel);
        if (!u) return;
        Modal.confirm("Delete account?", "Delete " + esc(u.orgName || u.name) + "? This cannot be undone.", { danger: true, okText: "Delete account" }).then(function (ok) {
          if (!ok) return;
          S.Users.remove(u.id);
          UI.toast("Account deleted", esc(u.orgName || u.name) + " has been removed.", "info");
          renderUsers();
          renderOverview();
        });
      });
    });
  }

  function exportCsv() {
    var rows = visibleUsers().map(function (u) {
      return [u.name, u.orgName, u.role, u.type, u.email, u.phone, u.city, u.status, u.joinedAt ? new Date(u.joinedAt).toLocaleDateString("en-IN") : ""];
    });
    var csv = "Name,Organization,Role,Type,Email,Phone,City,Status,Joined\n" +
      rows.map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\n");
    UI.downloadFile("foodlink-users.csv", csv, "text/csv;charset=utf-8");
    UI.toast("Export ready", "users.csv downloaded.", "success");
  }

  /* ---------------- donations ---------------- */

  function bindDonations() {
    var search = document.getElementById("donationSearch");
    if (search) search.addEventListener("input", function () { donState.query = search.value; renderDonations(); });
    var chips = document.getElementById("donationChips");
    if (chips) {
      chips.innerHTML =
        '<button class="chip active" data-value="" type="button">All</button>' +
        '<button class="chip" data-value="available" type="button">Available</button>' +
        '<button class="chip" data-value="reserved" type="button">Reserved</button>' +
        '<button class="chip" data-value="collected" type="button">Collected</button>' +
        '<button class="chip" data-value="completed" type="button">Completed</button>' +
        '<button class="chip" data-value="expired" type="button">Expired</button>' +
        '<button class="chip" data-value="cancelled" type="button">Cancelled</button>';
      chips.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          chips.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          donState.status = chip.dataset.value;
          renderDonations();
        });
      });
    }
  }

  function visibleDonations() {
    var list = S.Donations.all().slice();
    if (donState.status) list = list.filter(function (d) { return S.donationStatus(d) === donState.status; });
    if (donState.query) list = window.FoodLink.Search.food(list, donState.query);
    return list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function renderDonations() {
    var box = document.getElementById("donationsTable");
    if (!box) return;
    var list = visibleDonations();
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📦</span><h4>No donations found</h4></div>';
      return;
    }
    box.innerHTML =
      '<div class="table-wrap"><table>' +
        "<thead><tr><th>Food</th><th>Donor</th><th>Status</th><th>Servings</th><th>City</th><th>Expires</th><th>Actions</th></tr></thead><tbody>" +
        list.map(function (d) {
          var meta = UI.statusMeta(S.donationStatus(d));
          var donor = S.donorById(d.donorId);
          return (
            "<tr>" +
              '<td><span class="cell-strong">' + esc(d.foodName) + "</span><br><span class='cell-muted'>" + UI.foodEmoji(d.foodName) + " " + esc(d.foodType || "") + "</span></td>" +
              '<td class="cell-muted">' + esc(donor.orgName || donor.name) + "</td>" +
              '<td><span class="pill ' + meta.cls + '">' + meta.label + "</span></td>" +
              "<td>" + d.servings + "</td>" +
              '<td class="cell-muted">' + esc(d.city || "") + "</td>" +
              '<td class="cell-muted">' + UI.formatDateTime(d.expiresAt) + "</td>" +
              '<td><div class="table-actions">' +
                '<button class="btn btn-ghost btn-sm" data-dview="' + d.id + '">View</button>' +
                (["available", "reserved", "collected"].indexOf(S.donationStatus(d)) !== -1 ? '<button class="btn btn-ghost btn-sm" data-ddel="' + d.id + '">Remove</button>' : "") +
              "</div></td>" +
            "</tr>"
          );
        }).join("") +
      "</tbody></table></div>";

    box.querySelectorAll("[data-dview]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = S.Donations.byId(b.dataset.dview);
        if (!d) return;
        Modal.open(
          '<div class="modal-title">' + esc(d.foodName) + "</div>" +
          '<div class="modal-sub">' + esc(S.donorById(d.donorId).orgName || "Unknown donor") + " • " + esc(d.city || "") + "</div>" +
          '<div class="food-meta" style="margin:14px 0"><span>🍽️ ' + d.servings + " servings</span><span>⚖️ " + d.quantity + " kg</span><span>👀 " + (d.views || 0) + " views</span></div>" +
          "<p class='modal-sub'>" + esc(d.description || "No description provided.") + "</p>" +
          '<div class="form-actions"><button class="btn btn-ghost" data-close>Close</button></div>',
          { onOpen: function (m) { m.querySelector("[data-close]").addEventListener("click", Modal.close); } }
        );
      });
    });
    box.querySelectorAll("[data-ddel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = S.Donations.byId(b.dataset.ddel);
        if (!d) return;
        Modal.confirm("Remove listing?", "Remove '" + esc(d.foodName) + "' from the platform?", { danger: true, okText: "Remove" }).then(function (ok) {
          if (!ok) return;
          S.Donations.update(d.id, { status: "cancelled", updatedAt: Date.now() });
          UI.toast("Listing removed", "The donation is no longer active.", "info");
          renderDonations();
          renderOverview();
        });
      });
    });
  }

  /* ---------------- requests ---------------- */

  function renderRequests() {
    var box = document.getElementById("requestsTable");
    if (!box) return;
    var list = S.Requests.all().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📣</span><h4>No requests yet</h4></div>';
      return;
    }
    box.innerHTML =
      '<div class="table-wrap"><table>' +
        "<thead><tr><th>Needed</th><th>Receiver</th><th>People</th><th>Urgency</th><th>Status</th><th>Posted</th><th>Actions</th></tr></thead><tbody>" +
        list.map(function (r) {
          var pill = r.status === "open" ? "pill-available" : "pill-cancelled";
          var urgencyPill = { "Immediate": "pill-expired", "Today": "pill-reserved", "Tomorrow": "pill-pending" }[r.urgency] || "pill-cancelled";
          return (
            "<tr>" +
              '<td><span class="cell-strong">' + esc(r.foodRequired) + "</span><br><span class='cell-muted'>📦 " + esc(r.quantity || "") + "</span></td>" +
              '<td class="cell-muted">' + esc(r.receiverName || "") + "</td>" +
              "<td>" + (r.peopleCount || "?") + "</td>" +
              '<td><span class="pill ' + urgencyPill + '">' + esc(r.urgency || "—") + "</span></td>" +
              '<td><span class="pill ' + pill + '">' + esc(r.status) + "</span></td>" +
              '<td class="cell-muted">' + UI.formatDate(r.createdAt) + "</td>" +
              '<td><div class="table-actions">' +
                (r.status === "open" ? '<button class="btn btn-ghost btn-sm" data-rqclose="' + r.id + '">Close</button>' : "") +
                '<button class="btn btn-ghost btn-sm" data-rqdel="' + r.id + '">Delete</button>' +
              "</div></td>" +
            "</tr>"
          );
        }).join("") +
      "</tbody></table></div>";

    box.querySelectorAll("[data-rqclose]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.Requests.update(b.dataset.rqclose, { status: "closed" });
        UI.toast("Request closed", "It is no longer shown to donors.", "info");
        renderRequests();
        renderOverview();
      });
    });
    box.querySelectorAll("[data-rqdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.Requests.remove(b.dataset.rqdel);
        UI.toast("Request deleted", "Removed from the platform.", "info");
        renderRequests();
      });
    });
  }

  /* ---------------- feedback ---------------- */

  function renderFeedback() {
    var box = document.getElementById("feedbackList");
    if (!box) return;
    var list = S.Feedback.all().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">💬</span><h4>No feedback yet</h4></div>';
      return;
    }
    box.innerHTML = list.map(function (f) {
      var stars = "";
      for (var i = 0; i < 5; i++) stars += '<svg class="icon" style="width:18px;height:18px;color:' + (i < f.rating ? "#f59e0b" : "var(--border)") + '"><use href="#i-star"/></svg>';
      return (
        '<div class="donation-row" style="align-items:flex-start">' +
          UI.avatarHtml(f.name || "?") +
          '<div class="donation-info">' +
            "<h4 style='font-size:15px'>" + esc(f.name || "Anonymous") + ' <span class="cell-muted">• ' + esc(f.role || "") + "</span></h4>" +
            '<div style="display:flex;gap:2px;margin:6px 0">' + stars + "</div>" +
            "<p>" + esc(f.message || "") + "</p>" +
            '<p class="cell-muted" style="margin-top:6px">' + UI.timeAgo(f.createdAt) + "</p>" +
          "</div>" +
          '<div class="table-actions"><button class="btn btn-ghost btn-sm" data-fbdel="' + f.id + '">Delete</button></div>' +
        "</div>"
      );
    }).join("");
    box.querySelectorAll("[data-fbdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.Feedback.remove(b.dataset.fbdel);
        UI.toast("Feedback deleted", "Removed from the platform.", "info");
        renderFeedback();
      });
    });
  }

  /* ---------------- contacts ---------------- */

  function renderContacts() {
    var box = document.getElementById("contactsList");
    if (!box) return;
    var list = S.Contacts.all().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><span class="empty-emoji">📨</span><h4>No messages yet</h4></div>';
      return;
    }
    box.innerHTML = list.map(function (c) {
      return (
        '<div class="donation-row" style="align-items:flex-start">' +
          '<div class="donation-thumb">📨</div>' +
          '<div class="donation-info">' +
            "<h4 style='font-size:15px'>" + esc(c.name || "Anonymous") + ' <span class="cell-muted">• ' + esc(c.email || "") + "</span></h4>" +
            (c.subject ? '<p class="cell-strong" style="margin:4px 0">' + esc(c.subject) + "</p>" : "") +
            "<p>" + esc(c.message || "") + "</p>" +
            '<p class="cell-muted" style="margin-top:6px">' + UI.timeAgo(c.createdAt) + "</p>" +
          "</div>" +
          '<div class="table-actions">' +
            '<a class="btn btn-ghost btn-sm" href="mailto:' + esc(c.email) + '?subject=Re: ' + encodeURIComponent(c.subject || "") + '">Reply</a>' +
            '<button class="btn btn-ghost btn-sm" data-ctdel="' + c.id + '">Delete</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
    box.querySelectorAll("[data-ctdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.Contacts.remove(b.dataset.ctdel);
        UI.toast("Message deleted", "Removed from the inbox.", "info");
        renderContacts();
        renderOverview();
      });
    });
  }

  /* ---------------- broadcast ---------------- */

  function bindBroadcast() {
    var form = document.getElementById("broadcastForm");
    if (!form) return;
    V.attachLiveValidation(form);
    var count = S.Users.all().filter(function (u) { return u.role !== "admin"; }).length;
    var cEl = document.getElementById("broadcastCount");
    if (cEl) cEl.textContent = count + " users will receive this notification.";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!V.validateForm(form)) { UI.toast("Check the form", "Write a message before sending.", "error"); return; }
      var f = new FormData(form);
      var message = f.get("message").trim();
      var type = f.get("type");
      S.Users.all().filter(function (u) { return u.role !== "admin"; }).forEach(function (u) {
        S.addNotification(u.id, message, type);
      });
      UI.toast("Broadcast sent!", "All users have been notified.", "success");
      form.reset();
    });
  }

  /* ---------------- settings ---------------- */

  function renderSettings() {
    var form = document.getElementById("settingsForm");
    if (!form) return;
    var s = S.getSettings();
    form.innerHTML =
      '<div class="form-row">' +
        '<div class="form-field"><label>Site name</label><input type="text" name="siteName" value="' + esc(s.siteName) + '" data-rule="text"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Tagline</label><input type="text" name="siteTagline" value="' + esc(s.siteTagline) + '" data-rule="text"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-row">' +
        '<div class="form-field"><label>Contact email</label><input type="email" name="contactEmail" value="' + esc(s.contactEmail) + '" data-rule="email"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Contact phone</label><input type="text" name="contactPhone" value="' + esc(s.contactPhone) + '" data-rule="phone"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-row">' +
        '<div class="form-field"><label>Emergency contact</label><input type="text" name="emergencyContact" value="' + esc(s.emergencyContact) + '" data-rule="phone"><small class="field-msg"></small></div>' +
        '<div class="form-field"><label>Currency symbol</label><input type="text" name="currency" value="' + esc(s.currency) + '" data-rule="text"><small class="field-msg"></small></div>' +
      "</div>" +
      '<div class="form-field"><label class="cell-strong"><input type="checkbox" name="requireApproval" style="margin-right:8px"' + (s.requireApproval ? " checked" : "") + ">Require admin approval for new accounts</label></div>" +
      '<div class="form-field"><label class="cell-strong"><input type="checkbox" name="announcementsEnabled" style="margin-right:8px"' + (s.announcementsEnabled ? " checked" : "") + ">Enable announcements to users</label></div>" +
      '<button type="submit" class="btn btn-primary btn-lg">Save settings</button>';

    V.attachLiveValidation(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!V.validateForm(form)) { UI.toast("Check the form", "Fix the highlighted fields and try again.", "error"); return; }
      var f = new FormData(form);
      S.saveSettings({
        siteName: f.get("siteName"),
        siteTagline: f.get("siteTagline"),
        contactEmail: f.get("contactEmail"),
        contactPhone: f.get("contactPhone"),
        emergencyContact: f.get("emergencyContact"),
        currency: f.get("currency"),
        requireApproval: !!f.get("requireApproval"),
        announcementsEnabled: !!f.get("announcementsEnabled")
      });
      UI.toast("Settings saved", "The platform settings are now live.", "success");
    });
  }

  /* ---------------- boot ---------------- */

  function bindMisc() {
    document.querySelectorAll('[data-go="index"]').forEach(function (b) {
      b.addEventListener("click", function () { window.location.href = "index.html"; });
    });
  }

  function start() {
    user = S.requireRole(["admin"]);
    if (!user) return;
    Shell.init();
    UI.applyTheme();
    refreshShellUser();
    bindMisc();
    bindUsers();
    bindDonations();
    bindBroadcast();

    window.FoodLink.onSectionChange = function (name) {
      var h1 = document.getElementById("pageTitle");
      if (h1 && SECTION_TITLES[name]) h1.textContent = SECTION_TITLES[name];
      if (name === "overview") renderOverview();
      else if (name === "users") renderUsers();
      else if (name === "donations") renderDonations();
      else if (name === "requests") renderRequests();
      else if (name === "feedback") renderFeedback();
      else if (name === "contacts") renderContacts();
    };

    renderOverview();
    renderUsers();
    renderDonations();
    renderRequests();
    renderFeedback();
    renderContacts();
    renderSettings();
  }

  S.init().then(start);
})();
