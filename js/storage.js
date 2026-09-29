/* =====================================================================
   FoodLink - storage.js
   LocalStorage "database" + CRUD helpers + sample seed data.
   Designed so each collection maps 1:1 to a future MongoDB model.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var KEYS = {
    users: "fl_users",
    donations: "fl_donations",
    requests: "fl_requests",
    notifications: "fl_notifications",
    favorites: "fl_favorites",
    feedback: "fl_feedback",
    contacts: "fl_contacts",
    settings: "fl_settings",
    session: "fl_session",
    theme: "fl_theme",
    lang: "fl_lang",
    customizer: "fl_customizer",
    seeded: "fl_seeded_v2"
  };

  var DEFAULT_SETTINGS = {
    siteName: "FoodLink",
    siteTagline: "Save Food â€¢ Feed People â€¢ Reduce Waste",
    contactEmail: "hello@foodlink.app",
    contactPhone: "+91 98765 43210",
    emergencyContact: "+91 90000 10000",
    requireApproval: false,
    announcementsEnabled: true,
    currency: "â‚¹"
  };

  /* ---------------- low level ---------------- */

  var quotaWarned = false;

  function get(key, fallback) {
    var raw;
    try { raw = localStorage.getItem(key); }
    catch (e) { return fallback; }
    if (raw === null) return fallback;
    try {
      var parsed = JSON.parse(raw);
      // A stored collection must stay an array. Anything else (corrupt
      // write, hand-edited devtools value, another tab mid-write) is
      // discarded so the caller never iterates a string or a number.
      if (fallback !== undefined && Array.isArray(fallback) && !Array.isArray(parsed)) {
        return fallback;
      }
      return parsed;
    } catch (e) {
      // Drop the unparseable value so it cannot fail forever.
      try { localStorage.removeItem(key); } catch (e2) { /* ignore */ }
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (!quotaWarned) {
        quotaWarned = true;
        console.error("[storage] localStorage write failed for " + key + ":", e && e.name);
      }
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  var idCounter = 0;
  function uid(prefix) {
    idCounter = (idCounter + 1) % 1296;
    var seq = idCounter.toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    if (window.crypto && window.crypto.getRandomValues) {
      try {
        var buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        rand = buf[0].toString(36);
      } catch (e) { /* fall back to Math.random */ }
    }
    return (prefix || "id") + "_" + Date.now().toString(36) + seq + rand;
  }

  /* ---------------- time helpers ---------------- */

  var HOUR = 3600000;
  var DAY = 86400000;
  function hoursFromNow(h) { return Date.now() + h * HOUR; }
  function daysAgo(d) { return Date.now() - d * DAY; }

  /* ---------------- collection accessors ---------------- */

  var SERVER_KEYS = ["users", "donations", "requests", "notifications", "favorites", "feedback", "contacts", "settings"];

  var syncQueues = {};
  var syncState = { pending: {}, lastError: null, lastErrorAt: 0, online: true };
  var onSyncError = null;

  /* The backend no longer accepts wholesale collection replacement from
     ordinary accounts: a full PUT is an administrative operation, and every
     user write is ownership-checked server-side. So the client stops
     mirroring "the whole array" and instead reconciles it record by record
     with POST / PATCH / DELETE.

     `serverSnapshots` holds the last known server state per collection.
     A diff against it is what turns a local edit into a minimal set of
     requests, and it is what stops the browser from re-uploading - or
     deleting - rows it never actually changed. */
  var serverSnapshots = {};

  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; }
  }

  function rememberServerState(name, rows) {
    if (!Array.isArray(rows)) return;
    var map = {};
    rows.forEach(function (r) { if (r && r.id) map[r.id] = clone(r); });
    serverSnapshots[name] = map;
  }

  function syncState_() { return syncState; }

  function noteSyncError(name, message) {
    syncState.online = false;
    syncState.lastError = message;
    syncState.lastErrorAt = Date.now();
    if (typeof onSyncError === "function") {
      try { onSyncError(name, message); } catch (e) { /* ignore */ }
    } else {
      console.error("[storage] sync failed for " + name + ": " + message);
    }
  }

  function noteSyncOk() {
    syncState.online = true;
  }

  /* Runs one record operation, keeping a single queue per collection so two
     edits never race. A failure stops the remaining ops for that
     collection: replaying later writes over an earlier failed one would
     leave the server in a half-applied state. */
  function enqueueOps(name, ops) {
    if (!ops.length) return Promise.resolve(true);
    syncState.pending[name] = true;
    var q = syncQueues[name] || (syncQueues[name] = { running: false, queued: null });
    q.queued = q.queued ? q.queued.concat(ops) : ops;
    if (q.running) return Promise.resolve(true);
    q.running = true;

    var API = window.FoodLink.API;

    function pump() {
      var batch = q.queued;
      q.queued = null;
      if (!batch || !batch.length) { q.running = false; delete syncState.pending[name]; return; }

      function step(i) {
        if (i >= batch.length) {
          noteSyncOk();
          q.running = false;
          delete syncState.pending[name];
          if (q.queued && q.queued.length) { q.running = true; pump(); }
          return;
        }
        var op = batch[i];
        var p;
        if (op.kind === "post") p = API.add(name, op.doc);
        else if (op.kind === "patch") p = API.update(name, op.id, op.patch);
        else p = API.del(name, op.id);

        p.then(function (saved) {
          if (op.kind === "post" && saved && saved.id && serverSnapshots[name]) {
            serverSnapshots[name][saved.id] = clone(saved);
          }
          step(i + 1);
        })["catch"](function (err) {
          // 401/403 here means the session or the role no longer allows the
          // write. Retrying would fail identically, so the queue is dropped.
          delete syncState.pending[name];
          q.running = false;
          q.queued = null;
          noteSyncError(name, (err && err.message) || String(err));
        });
      }
      step(0);
    }
    pump();
    return Promise.resolve(true);
  }

  function rowsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /* Reconcile one local collection with the server.

     New local rows are created, changed rows are patched, and rows the
     server has but the browser no longer does are deleted. The delete leg
     only runs for administrators: for an ordinary account the browser copy
     is a filtered view of shared data, so a missing row means "not mine to
     see", not "no longer exists". */
  function pushCollection(key, opts) {
    opts = opts || {};
    try {
      var API = window.FoodLink.API;
      if (!API || !API.add) return;
      var name = key.indexOf("fl_") === 0 ? key.slice(3) : key;
      if (name === "users" && !opts.admin) return; // accounts are server-owned

      var local = name === "settings" ? [get(KEYS.settings, {})] : get(key, []);
      if (!Array.isArray(local)) return;
      var snap = serverSnapshots[name];
      // With no baseline we cannot tell new from pre-existing, and guessing
      // would either duplicate or destroy rows. Wait for a bootstrap.
      if (!snap) return;

      var isAdmin = !!opts.admin;
      var me = currentUser();
      var ops = [];
      var seen = {};

      local.forEach(function (row) {
        if (!row || !row.id) return;
        seen[row.id] = true;
        var before = snap[row.id];
        if (!before) {
          ops.push({ kind: "post", doc: row });
        } else if (!rowsEqual(before, row)) {
          var patch = {};
          Object.keys(row).forEach(function (k) {
            if (k === "__proto__" || k === "constructor" || k === "prototype") return;
            if (JSON.stringify(row[k]) !== JSON.stringify(before[k])) patch[k] = row[k];
          });
          if (Object.keys(patch).length) ops.push({ kind: "patch", id: row.id, patch: patch });
        }
      });

      if (name !== "users") {
        var ownerField = { donations: "donorId", requests: "receiverId",
                           favorites: "receiverId", notifications: "userId",
                           feedback: "userId" }[name];
        var myId = me ? me.id : null;
        Object.keys(snap).forEach(function (id) {
          if (seen[id]) return;
          var row = snap[id];
          // An administrator may reconcile any row. Everyone else may only
          // remove rows the server already attributes to them: for any other
          // collection the browser copy is a filtered view of shared data,
          // so a missing row means "not mine", not "no longer exists".
          if (!isAdmin) {
            if (!myId || !ownerField) return;
            if (String(row[ownerField]) !== String(myId)) return;
          }
          ops.push({ kind: "del", id: id });
        });
      }

      enqueueOps(name, ops);
    } catch (e) { /* ignore sync errors */ }
  }

  /* Load every collection from the backend into the browser cache.
     Falls back to local seeding when the server is unreachable. */
  function init() {
    if (!window.FoodLink.API) { seed(); return Promise.resolve(false); }
    return window.FoodLink.API.bootstrap()
      .then(function (data) {
        if (!data || typeof data !== "object") { seed(); return false; }

        // A reachable-but-empty server must not wipe good local data or
        // latch the "seeded" flag, otherwise the app boots with zero users
        // and no admin account, which is unrecoverable from the UI.
        var totalRows = 0;
        SERVER_KEYS.forEach(function (k) {
          var v = data[k];
          if (Array.isArray(v)) totalRows += (k === "settings" ? Math.min(v.length, 1) : v.length);
        });
        if (totalRows === 0 && get(KEYS.users, []).length === 0) {
          seed();
          return false;
        }

        SERVER_KEYS.forEach(function (k) {
          var v = data[k];
          if (v === undefined) return;
          if (k === "settings") {
            // Never clobber local settings with an empty server copy.
            if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object") {
              set(KEYS.settings, v[0]);
            }
            return;
          }
          if (!Array.isArray(v)) return;
          // This is the reconciliation baseline for later diffs. A key the
          // server withholds (contacts for a non-admin) is deliberately not
          // recorded, so the client never tries to delete rows it cannot see.
          rememberServerState(k, v);
          var local = get(KEYS[k], []);
          // Keep whichever copy actually has rows; never replace data with [].
          if (v.length || !local.length) set(KEYS[k], v);
        });
        set(KEYS.seeded, true);
        refreshDemoFreshness();
        return true;
      })
      ["catch"](function () {
        syncState.online = false;
        seed();
        return false;
      });
  }

  function collection(key) {
    var prefix = key.indexOf("fl_") === 0 ? key.slice(3) : key;
    function read() { return get(key, []); }
    // Account writes are server-owned, so the local user cache is never
    // mirrored wholesale; a signed-in user edits their own record through
    // the authenticated PATCH route instead.
    function isAdminNow() {
      var u = currentUser();
      return !!(u && u.role === "admin");
    }
    function sync() { pushCollection(key, { admin: isAdminNow() }); }
    return {
      all: function () { return read(); },
      save: function (list) {
        if (!Array.isArray(list)) return false;
        var ok = set(key, list);
        sync();
        return ok;
      },
      find: function (fn) {
        var list = read();
        for (var i = 0; i < list.length; i++) { if (fn(list[i])) return list[i]; }
        return null;
      },
      // Deliberately not `this`-dependent so a detached reference is safe.
      byId: function (id) {
        var list = read();
        for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === id) return list[i]; }
        return null;
      },
      add: function (row) {
        if (!row || typeof row !== "object") return null;
        if (!row.id || this.byId(row.id)) row.id = uid(prefix);
        var list = read();
        list.unshift(row);
        set(key, list);
        sync();
        return row;
      },
      update: function (id, patch) {
        if (!patch || typeof patch !== "object") return null;
        var list = read();
        var out = null;
        var changed = false;
        for (var i = 0; i < list.length; i++) {
          if (!list[i] || list[i].id !== id) continue;
          for (var k in patch) {
            // Block prototype-pollution keys and never write an own `id`.
            if (k === "__proto__" || k === "constructor" || k === "prototype" || k === "id") continue;
            if (Object.prototype.hasOwnProperty.call(patch, k) && list[i][k] !== patch[k]) {
              list[i][k] = patch[k];
              changed = true;
            }
          }
          out = list[i];
          break;
        }
        // No match means no write and no destructive full-collection PUT.
        if (!changed) return out;
        set(key, list);
        sync();
        return out;
      },
      remove: function (id) {
        var list = read();
        var next = list.filter(function (r) { return !r || r.id !== id; });
        if (next.length === list.length) return false;
        set(key, next);
        sync();
        return true;
      }
    };
  }

  var Users = collection(KEYS.users);
  var Donations = collection(KEYS.donations);
  var Requests = collection(KEYS.requests);
  var Notifications = collection(KEYS.notifications);
  var Favorites = collection(KEYS.favorites);
  var Feedback = collection(KEYS.feedback);
  var Contacts = collection(KEYS.contacts);

  /* ---------------- session ---------------- */

  function currentUser() {
    var id = get(KEYS.session, null);
    if (!id) return null;
    return Users.byId(id) || null;
  }

  function requireRole(roles) {
    var u = currentUser();
    if (!u) { window.location.href = "index.html"; return null; }
    if (roles.indexOf(u.role) !== -1) return u;

    // A role the app does not know must not bounce between dashboards in
    // an infinite loop; fall back to the landing page instead.
    var home = { admin: "admin.html", donor: "donor.html", receiver: "receiver.html" }[u.role];
    if (!home) {
      console.warn("[storage] unknown role '" + u.role + "' - sending user to index.html");
      clearSession();
      window.location.href = "index.html";
      return null;
    }
    window.location.href = home;
    return null;
  }

  /**
   * Called once the server has verified credentials and issued a token.
   * The cached public copy of the account is replaced with the
   * authoritative record so that role, status and verification checks in
   * the UI are made against server truth rather than the public projection.
   */
  function completeLogin(user) {
    if (!user || !user.id) return null;
    var list = Users.all().slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === user.id) { idx = i; break; }
    }
    var merged = Object.assign({}, idx === -1 ? {} : list[idx], user);
    if (idx === -1) list.push(merged); else list[idx] = merged;
    set(KEYS.users, list);
    rememberServerState("users", list);
    set(KEYS.session, user.id);
    return currentUser();
  }

  /* Fields the server lets an account change on itself. Anything else -
     role, status, verified, points, badges - is server-owned, so a client
     that tries to edit them is quietly ignored rather than trusted. */
  var SELF_EDITABLE = ["name", "orgName", "type", "phone", "address", "pincode",
    "city", "state", "description", "avatar"];

  /**
   * Save the signed-in user's own profile. The local cache is only updated
   * after the server confirms, so a rejected edit never leaves the screen
   * showing a value the database does not hold.
   */
  function updateMyProfile(patch) {
    var me = currentUser();
    if (!me || !me.id) return Promise.reject(new Error("Not signed in"));
    if (!patch || typeof patch !== "object") return Promise.reject(new Error("Nothing to save"));

    var body = {};
    SELF_EDITABLE.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) body[k] = patch[k];
    });
    if (!Object.keys(body).length) return Promise.resolve(me);

    return window.FoodLink.API.update("users", me.id, body).then(function (saved) {
      if (saved) {
        var list = Users.all().slice();
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].id === me.id) { list[i] = Object.assign({}, list[i], saved); break; }
        }
        set(KEYS.users, list);
        if (serverSnapshots.users) serverSnapshots.users[me.id] = clone(saved);
      }
      return currentUser();
    });
  }

  /* ---------------- points / badges ---------------- */

  var TIERS = [
    { key: "bronze", name: "Bronze", emoji: "ðŸ¥‰", color: "#b07a4a", min: 0 },
    { key: "silver", name: "Silver", emoji: "ðŸ¥ˆ", color: "#9aa4ad", min: 100 },
    { key: "gold", name: "Gold", emoji: "ðŸ¥‡", color: "#f59e0b", min: 300 },
    { key: "diamond", name: "Diamond", emoji: "ðŸ’Ž", color: "#22d3ee", min: 600 }
  ];

  function tierFor(points) {
    var tier = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) { if (points >= TIERS[i].min) tier = TIERS[i]; }
    return tier;
  }

  function nextTier(points) {
    for (var i = 0; i < TIERS.length; i++) { if (TIERS[i].min > points) return TIERS[i]; }
    return null;
  }

  function addPoints(userId, amount) {
    var delta = Number(amount);
    if (!userId || !isFinite(delta) || delta === 0) return 0;

    // Mutate the array we actually persist. `Users.byId()` returns a
    // detached copy, so saving a freshly re-read list would discard the
    // increment entirely.
    var list = Users.all();
    var u = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === userId) { u = list[i]; break; }
    }
    if (!u) return 0;

    var before = Number(u.points) || 0;
    u.points = Math.max(0, before + delta);
    if (!Array.isArray(u.badges)) u.badges = [];

    // Award every tier the user has now reached, so a large jump never
    // skips straight to the top tier. Bronze (min 0) is the baseline and
    // is never announced as an unlock.
    var unlocked = [];
    for (var t = 0; t < TIERS.length; t++) {
      var tier = TIERS[t];
      if (tier.min > 0 && u.points >= tier.min && u.badges.indexOf(tier.key) === -1) {
        u.badges.push(tier.key);
        unlocked.push(tier);
      }
    }
    if (!u.badges.length) u.badges.push(TIERS[0].key);

    Users.save(list);

    for (var j = 0; j < unlocked.length; j++) {
      addNotification(userId, "New badge unlocked: " + unlocked[j].name + " tier!", "success");
    }
    return u.points;
  }

  /* ---------------- notifications ---------------- */

  function addNotification(userId, message, type) {
    var kind = (type === "success" || type === "warning" || type === "error" || type === "info") ? type : "info";
    var n = {
      id: uid("n"),
      userId: userId,
      title: (kind === "success" ? "Great news" : kind === "warning" ? "Heads up" : kind === "error" ? "Action needed" : "Update"),
      message: String(message == null ? "" : message),
      type: kind,
      read: false,
      createdAt: Date.now()
    };
    Notifications.add(n);
    return n;
  }

  function notificationsFor(userId) {
    return Notifications.all()
      .filter(function (n) { return n && n.userId === userId; })
      // Fall back to 0 so records missing createdAt never produce a NaN
      // comparator, which would leave the order engine-defined.
      .sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
  }

  function markAllRead(userId) {
    var list = Notifications.all();
    list.forEach(function (n) { if (n.userId === userId) n.read = true; });
    Notifications.save(list);
  }

  /* ---------------- favorites ---------------- */

  function isFavorite(receiverId, donationId) {
    return !!Favorites.find(function (f) { return f.receiverId === receiverId && f.donationId === donationId; });
  }

  function toggleFavorite(receiverId, donationId) {
    if (!receiverId || !donationId) return false;
    // Remove every duplicate so repeated toggles cannot leave orphans.
    var list = Favorites.all();
    var matches = list.filter(function (f) {
      return f && f.receiverId === receiverId && f.donationId === donationId;
    });
    if (matches.length) {
      var keep = list.filter(function (f) {
        return !f || (f.receiverId !== receiverId || f.donationId !== donationId);
      });
      Favorites.save(keep);
      return false;
    }
    Favorites.add({ receiverId: receiverId, donationId: donationId, createdAt: Date.now() });
    return true;
  }

  /* ---------------- donation helpers ---------------- */

  function donationStatus(d) {
    if (!d) return "unknown";
    var exp = Number(d.expiresAt);
    var hasExpiry = isFinite(exp) && exp > 0;
    if (!hasExpiry) return d.status || "available";
    // Anything still in flight past its deadline is unusable, not just
    // "available" - otherwise expired food stays reservable and collectable.
    if (d.expiresAt < Date.now() &&
        (d.status === "available" || d.status === "reserved")) {
      return "expired";
    }
    return d.status || "available";
  }

  function donorById(id) {
    var u = Users.byId(id);
    return u || { name: "Unknown Donor", type: "Individual", orgName: "Unknown" };
  }

  function donorLabel(u) {
    if (!u) return "Unknown";
    return u.orgName && u.orgName !== u.name ? u.orgName + " (" + u.name + ")" : u.name;
  }

  /* ---------------- seed data ---------------- */

  function seed() {
    if (get(KEYS.seeded, false)) return;

    var now = Date.now();

    var users = [
      {
        id: "u_admin", role: "admin", name: "Aarav Mehta", email: "admin@foodlink.app",
        phone: "9000000001", orgName: "FoodLink HQ",
        city: "Delhi", state: "Delhi", address: "10 Cyber Hub, Gurugram", pincode: "122002",
        description: "Platform administrator", status: "approved", verified: true,
        points: 0, badges: [], joinedAt: daysAgo(220), avatar: null
      },
      {
        id: "u_d1", role: "donor", name: "Rahul Sharma", email: "rahul@foodlink.app",
        phone: "9810000011", orgName: "Spice Garden", type: "Restaurant",
        city: "Delhi", state: "Delhi", address: "21, Hauz Khas Village", pincode: "110016",
        description: "North Indian family restaurant, 80 seats", status: "approved", verified: true,
        points: 340, badges: ["bronze", "silver", "gold"], joinedAt: daysAgo(180), avatar: null
      },
      {
        id: "u_d2", role: "donor", name: "Priya Verma", email: "priya@foodlink.app",
        phone: "9810000022", orgName: "Grand Palace Hotel", type: "Hotel",
        city: "Mumbai", state: "Maharashtra", address: "45, Linking Road, Bandra West", pincode: "400050",
        description: "Full service hotel with buffet banquets", status: "approved", verified: true,
        points: 210, badges: ["bronze", "silver"], joinedAt: daysAgo(150), avatar: null
      },
      {
        id: "u_d3", role: "donor", name: "Amit Patel", email: "amit@foodlink.app",
        phone: "9810000033", orgName: "Brew & Beans", type: "Cafe",
        city: "Bengaluru", state: "Karnataka", address: "88, Indiranagar 100 Ft Road", pincode: "560038",
        description: "Specialty coffee cafe with bakery section", status: "approved", verified: true,
        points: 90, badges: ["bronze"], joinedAt: daysAgo(90), avatar: null
      },
      {
        id: "u_d4", role: "donor", name: "Sunita Rao", email: "sunita@foodlink.app",
        phone: "9810000044", orgName: "Sunita Rao", type: "Household",
        city: "Pune", state: "Maharashtra", address: "33, FC Road, Shivajinagar", pincode: "411005",
        description: "Home cook, surplus from family functions", status: "approved", verified: true,
        points: 60, badges: ["bronze"], joinedAt: daysAgo(40), avatar: null
      },
      {
        id: "u_d5", role: "donor", name: "Karan Malhotra", email: "karan@foodlink.app",
        phone: "9810000055", orgName: "Sweet Symphony Bakery", type: "Bakery",
        city: "Kolkata", state: "West Bengal", address: "12, Park Street", pincode: "700016",
        description: "Bakery, cakes and breads", status: "pending", verified: false,
        points: 0, badges: [], joinedAt: daysAgo(2), avatar: null
      },
      {
        id: "u_r1", role: "receiver", name: "Neha Gupta", email: "neha@foodlink.app",
        phone: "9811000011", orgName: "Feed the Future", type: "NGO",
        city: "Delhi", state: "Delhi", address: "14, Lajpat Nagar II", pincode: "110024",
        description: "Community kitchen serving 400 meals a day", status: "approved", verified: true,
        points: 180, badges: ["bronze", "silver"], joinedAt: daysAgo(170), avatar: null
      },
      {
        id: "u_r2", role: "receiver", name: "Fr. Joseph D'Souza", email: "joseph@foodlink.app",
        phone: "9811000022", orgName: "Hope Home", type: "Orphanage",
        city: "Mumbai", state: "Maharashtra", address: "8, Dharavi Main Road", pincode: "400017",
        description: "Home for 60 children, needs 3 meals daily", status: "approved", verified: true,
        points: 120, badges: ["bronze", "silver"], joinedAt: daysAgo(160), avatar: null
      },
      {
        id: "u_r3", role: "receiver", name: "Meera Iyer", email: "meera@foodlink.app",
        phone: "9811000033", orgName: "Snehashray", type: "Old Age Home",
        city: "Bengaluru", state: "Karnataka", address: "22, Jayanagar 4th Block", pincode: "560011",
        description: "Shelter for 45 senior citizens", status: "approved", verified: true,
        points: 90, badges: ["bronze"], joinedAt: daysAgo(120), avatar: null
      },
      {
        id: "u_r4", role: "receiver", name: "Asha Deshmukh", email: "asha@foodlink.app",
        phone: "9811000044", orgName: "Anna Seva Kitchen", type: "Community Kitchen",
        city: "Pune", state: "Maharashtra", address: "5, Shivaji Nagar", pincode: "411005",
        description: "Daily free kitchen for students and workers", status: "pending", verified: false,
        points: 0, badges: [], joinedAt: daysAgo(1), avatar: null
      }
    ];

    var donations = [
      {
        id: "d_1", donorId: "u_d1", foodName: "Veg Biryani with Raita",
        category: "veg", foodType: "Restaurant", quantity: 6, servings: 30,
        preparedAt: now - 2 * HOUR, expiresAt: hoursFromNow(4),
        pickupTime: "6:00 PM - 9:00 PM", address: "21, Hauz Khas Village", city: "Delhi",
        state: "Delhi", pincode: "110016", phone: "9810000011",
        description: "Freshly prepared vegetable biryani with curd raita, packed hygienically in food-grade containers.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 42, createdAt: now - 2 * HOUR, updatedAt: now - 2 * HOUR
      },
      {
        id: "d_2", donorId: "u_d2", foodName: "Chicken Curry & Rice",
        category: "nonveg", foodType: "Hotel", quantity: 5, servings: 25,
        preparedAt: now - 3 * HOUR, expiresAt: hoursFromNow(3),
        pickupTime: "5:00 PM - 8:00 PM", address: "45, Linking Road, Bandra West", city: "Mumbai",
        state: "Maharashtra", pincode: "400050", phone: "9810000022",
        description: "Banquet leftover chicken curry with steamed rice. Sealed and chilled.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 55, createdAt: now - 3 * HOUR, updatedAt: now - 3 * HOUR
      },
      {
        id: "d_3", donorId: "u_d3", foodName: "Bakery Pastries & Sandwiches",
        category: "veg", foodType: "Cafe", quantity: 3, servings: 18,
        preparedAt: now - 4 * HOUR, expiresAt: hoursFromNow(6),
        pickupTime: "Anytime today", address: "88, Indiranagar 100 Ft Road", city: "Bengaluru",
        state: "Karnataka", pincode: "560038", phone: "9810000033",
        description: "Assorted croissants, puffs and sandwiches from today's counter.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 31, createdAt: now - 4 * HOUR, updatedAt: now - 4 * HOUR
      },
      {
        id: "d_4", donorId: "u_d4", foodName: "Home-made Paneer Sabzi",
        category: "veg", foodType: "Household", quantity: 2, servings: 10,
        preparedAt: now - 1 * HOUR, expiresAt: hoursFromNow(5),
        pickupTime: "7:00 PM", address: "33, FC Road, Shivajinagar", city: "Pune",
        state: "Maharashtra", pincode: "411005", phone: "9810000044",
        description: "Extra paneer curry from family dinner. Vegetarian, mild spice.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 20, createdAt: now - 1 * HOUR, updatedAt: now - 1 * HOUR
      },
      {
        id: "d_5", donorId: "u_d1", foodName: "Dal Makhani & Butter Rotis",
        category: "veg", foodType: "Restaurant", quantity: 8, servings: 40,
        preparedAt: now - 5 * HOUR, expiresAt: hoursFromNow(2),
        pickupTime: "4:00 PM - 7:00 PM", address: "21, Hauz Khas Village", city: "Delhi",
        state: "Delhi", pincode: "110016", phone: "9810000011",
        description: "Batch from lunch service. Restaurant grade packaging.",
        image: null, status: "reserved", reservedBy: "u_r1", reservedByName: "Feed the Future",
        views: 68, createdAt: now - 5 * HOUR, updatedAt: now - 1 * HOUR
      },
      {
        id: "d_6", donorId: "u_d2", foodName: "Wedding Banquet Spread",
        category: "veg", foodType: "Hotel", quantity: 12, servings: 60,
        preparedAt: now - 8 * HOUR, expiresAt: hoursFromNow(1),
        pickupTime: "Immediate pickup", address: "45, Linking Road, Bandra West", city: "Mumbai",
        state: "Maharashtra", pincode: "400050", phone: "9810000022",
        description: "Full banquet spread from last night's function - gravies, rice, breads, desserts.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 80, createdAt: now - 8 * HOUR, updatedAt: now - 8 * HOUR
      },
      {
        id: "d_7", donorId: "u_d3", foodName: "Cold Coffee & Fruit Snacks",
        category: "veg", foodType: "Cafe", quantity: 1.5, servings: 12,
        preparedAt: now - 6 * HOUR, expiresAt: hoursFromNow(8),
        pickupTime: "Anytime today", address: "88, Indiranagar 100 Ft Road", city: "Bengaluru",
        state: "Karnataka", pincode: "560038", phone: "9810000033",
        description: "Packaged cold coffees and fresh fruit cups. Chilled.",
        image: null, status: "collected", reservedBy: "u_r3", reservedByName: "Snehashray",
        views: 25, createdAt: now - 6 * HOUR, updatedAt: now - 30 * 60000
      },
      {
        id: "d_8", donorId: "u_d4", foodName: "Homemade Kheer",
        category: "veg", foodType: "Household", quantity: 1.2, servings: 8,
        preparedAt: now - 12 * HOUR, expiresAt: hoursFromNow(-2),
        pickupTime: "Yesterday", address: "33, FC Road, Shivajinagar", city: "Pune",
        state: "Maharashtra", pincode: "411005", phone: "9810000044",
        description: "Rice kheer made for a small function.",
        image: null, status: "expired", reservedBy: null, reservedByName: "",
        views: 15, createdAt: now - 12 * HOUR, updatedAt: now - 12 * HOUR
      },
      {
        id: "d_9", donorId: "u_d1", foodName: "Rajma Chawal Lunch Boxes",
        category: "veg", foodType: "Restaurant", quantity: 4, servings: 20,
        preparedAt: daysAgo(1), expiresAt: hoursFromNow(-24),
        pickupTime: "Completed", address: "21, Hauz Khas Village", city: "Delhi",
        state: "Delhi", pincode: "110016", phone: "9810000011",
        description: "Completed donation - 20 lunch boxes served at a night shelter.",
        image: null, status: "completed", reservedBy: "u_r1", reservedByName: "Feed the Future",
        views: 40, createdAt: daysAgo(1), updatedAt: daysAgo(1)
      },
      {
        id: "d_10", donorId: "u_d2", foodName: "Pasta & Salad Buffet",
        category: "veg", foodType: "Hotel", quantity: 5, servings: 24,
        preparedAt: daysAgo(2), expiresAt: hoursFromNow(-48),
        pickupTime: "Completed", address: "45, Linking Road, Bandra West", city: "Mumbai",
        state: "Maharashtra", pincode: "400050", phone: "9810000022",
        description: "Completed donation to Hope Home orphanage.",
        image: null, status: "completed", reservedBy: "u_r2", reservedByName: "Hope Home",
        views: 38, createdAt: daysAgo(2), updatedAt: daysAgo(2)
      },
      {
        id: "d_11", donorId: "u_d4", foodName: "Festive Sweets Box",
        category: "veg", foodType: "Household", quantity: 2, servings: 14,
        preparedAt: now - 2 * HOUR, expiresAt: hoursFromNow(9),
        pickupTime: "6:30 PM", address: "33, FC Road, Shivajinagar", city: "Pune",
        state: "Maharashtra", pincode: "411005", phone: "9810000044",
        description: "Box of assorted mithai from a family celebration. Sealed boxes.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 18, createdAt: now - 2 * HOUR, updatedAt: now - 2 * HOUR
      },
      {
        id: "d_12", donorId: "u_d3", foodName: "Mushroom Pizza Slices",
        category: "veg", foodType: "Cafe", quantity: 3, servings: 16,
        preparedAt: now - 3 * HOUR, expiresAt: hoursFromNow(2),
        pickupTime: "5:30 PM - 8:00 PM", address: "88, Indiranagar 100 Ft Road", city: "Bengaluru",
        state: "Karnataka", pincode: "560038", phone: "9810000033",
        description: "Whole pizzas and slices left at closing. Boxed and ready.",
        image: null, status: "available", reservedBy: null, reservedByName: "",
        views: 29, createdAt: now - 3 * HOUR, updatedAt: now - 3 * HOUR
      }
    ];

    var requests = [
      {
        id: "rq_1", receiverId: "u_r1", receiverName: "Feed the Future",
        foodRequired: "Rice or Biryani for 150 people", quantity: "10 kg",
        peopleCount: 150, urgency: "Immediate", description: "Night shelter distribution at 8 PM.",
        status: "open", createdAt: now - 2 * HOUR
      },
      {
        id: "rq_2", receiverId: "u_r2", receiverName: "Hope Home",
        foodRequired: "Vegetables & staples", quantity: "15 kg",
        peopleCount: 60, urgency: "Tomorrow", description: "Weekly ration for the children's home.",
        status: "open", createdAt: now - 6 * HOUR
      },
      {
        id: "rq_3", receiverId: "u_r3", receiverName: "Snehashray",
        foodRequired: "Soft food & desserts for seniors", quantity: "5 kg",
        peopleCount: 45, urgency: "Today", description: "Dinner service at 7 PM.",
        status: "open", createdAt: now - 3 * HOUR
      }
    ];

    var notifications = [
      { id: "n_1", userId: "u_d1", title: "New reservation", message: "Feed the Future reserved your 'Dal Makhani & Butter Rotis'. Please prepare for pickup.", type: "success", read: false, createdAt: now - 50 * 60000 },
      { id: "n_2", userId: "u_d1", title: "Food expiring soon", message: "'Veg Biryani with Raita' expires in 4 hours. Share it to reach more receivers.", type: "warning", read: false, createdAt: now - 100 * 60000 },
      { id: "n_3", userId: "u_d1", title: "Donation completed", message: "Your Rajma Chawal donation was completed. +20 Green Points earned!", type: "success", read: true, createdAt: daysAgo(1) },
      { id: "n_4", userId: "u_r1", title: "New food nearby", message: "Spice Garden listed 'Veg Biryani with Raita' in Delhi, 3 km away.", type: "info", read: false, createdAt: now - 120 * 60000 },
      { id: "n_5", userId: "u_r1", title: "Reservation confirmed", message: "You reserved 'Dal Makhani & Butter Rotis' from Spice Garden.", type: "success", read: false, createdAt: now - 45 * 60000 },
      { id: "n_6", userId: "u_r3", title: "Collection done", message: "You collected 'Cold Coffee & Fruit Snacks'. Thanks for serving!", type: "success", read: true, createdAt: now - 25 * 60000 },
      { id: "n_7", userId: "u_admin", title: "New signups awaiting review", message: "2 new accounts are pending verification.", type: "info", read: false, createdAt: daysAgo(1) }
    ];

    var favorites = [
      { id: "fav_1", receiverId: "u_r1", donationId: "d_1", createdAt: now - 90 * 60000 },
      { id: "fav_2", receiverId: "u_r1", donationId: "d_6", createdAt: now - 80 * 60000 }
    ];

    var feedback = [
      { id: "fb_1", userId: "u_r1", name: "Neha Gupta", role: "Receiver", rating: 5, message: "Seamless platform. We rescued 200+ meals last month through FoodLink.", createdAt: daysAgo(6) },
      { id: "fb_2", userId: "u_d1", name: "Rahul Sharma", role: "Donor", rating: 5, message: "Zero-waste kitchen is now a reality for our restaurant. Love the Green Points!", createdAt: daysAgo(9) },
      { id: "fb_3", userId: "u_r3", name: "Meera Iyer", role: "Receiver", rating: 4, message: "Reliable donations for our senior home. Would love more breakfast items.", createdAt: daysAgo(12) }
    ];

    var contacts = [
      { id: "ct_1", name: "Vikram Singh", email: "vikram@example.com", subject: "Partnership", message: "I run a catering service and want to donate daily surplus.", createdAt: daysAgo(4) }
    ];

    set(KEYS.users, users);
    set(KEYS.donations, donations);
    set(KEYS.requests, requests);
    set(KEYS.notifications, notifications);
    set(KEYS.favorites, favorites);
    set(KEYS.feedback, feedback);
    set(KEYS.contacts, contacts);
    set(KEYS.settings, DEFAULT_SETTINGS);
    set(KEYS.seeded, true);
  }

  /* Demo data is seeded with absolute epoch timestamps, so every "available"
     listing expires a few hours after the first visit and the app is left
     with nothing to browse. When every remaining listing has lapsed, shift
     the whole expiry window forward so the demo stays usable, preserving
     the original spread between records. */
  var LAST_REFRESH_KEY = "fl_demo_refreshed";

  function refreshDemoFreshness() {
    var list = Donations.all();
    if (!list.length) return false;

    var live = list.filter(function (d) {
      return d && d.status === "available" && Number(d.expiresAt) > Date.now();
    });
    if (live.length) return false;

    // Don't rebase more than once a day.
    var last = Number(get(LAST_REFRESH_KEY, 0)) || 0;
    if (last && Date.now() - last < DAY) return false;

    var now = Date.now();
    var fresh = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || d.status === "completed" || d.status === "cancelled") { fresh.push(d); continue; }
      // Re-open lapsed records on a rolling schedule so the demo always
      // has something reservable, staggered rather than all at once.
      var offset = (i % 6) * 2 + 1;
      d.expiresAt = now + offset * HOUR;
      d.preparedAt = now - ((i % 4) + 1) * HOUR;
      if (d.status === "expired") d.status = "available";
      d.updatedAt = now;
      fresh.push(d);
    }
    Donations.save(fresh);
    set(LAST_REFRESH_KEY, now);
    return true;
  }

  function resetAll() {
    remove(KEYS.users); remove(KEYS.donations); remove(KEYS.requests);
    remove(KEYS.notifications); remove(KEYS.favorites); remove(KEYS.feedback);
    remove(KEYS.contacts); remove(KEYS.settings); remove(KEYS.session);
    remove(KEYS.seeded); remove(KEYS.theme); remove(KEYS.lang); remove(KEYS.customizer);
    remove(LAST_REFRESH_KEY);
    seed();
    // Push the reseeded state so the next bootstrap cannot restore the
    // previous server contents over the top of the reset.
    SERVER_KEYS.forEach(function (k) { if (k !== "settings") pushCollection(KEYS[k]); });
    pushCollection(KEYS.settings);
  }

  /* ---------------- user preferences (theme / language / customizer) ---------------- */

  function getLang() { return get(KEYS.lang, "en"); }
  function setLang(v) { return set(KEYS.lang, v); }
  function getTheme() { return get(KEYS.theme, "light"); }
  function setTheme(v) { return set(KEYS.theme, v); }
  function getCustomizer() { return get(KEYS.customizer, null); }
  function setCustomizer(v) { return set(KEYS.customizer, v); }

  /* ---------------- public API ---------------- */

  window.FoodLink.Storage = {
    KEYS: KEYS,
    get: get,
    set: set,
    remove: remove,
    uid: uid,
    HOUR: HOUR,
    DAY: DAY,
    hoursFromNow: hoursFromNow,
    daysAgo: daysAgo,
    init: init,
    seed: seed,
    refreshDemoFreshness: refreshDemoFreshness,
    resetAll: resetAll,
    getLang: getLang,
    setLang: setLang,
    getTheme: getTheme,
    setTheme: setTheme,
    getCustomizer: getCustomizer,
    setCustomizer: setCustomizer,
    Users: Users,
    Donations: Donations,
    Requests: Requests,
    Notifications: Notifications,
    Favorites: Favorites,
    Feedback: Feedback,
    Contacts: Contacts,
    getSettings: function () { return Object.assign({}, DEFAULT_SETTINGS, get(KEYS.settings, {})); },
    saveSettings: function (patch) {
      var s = Object.assign({}, DEFAULT_SETTINGS, get(KEYS.settings, {}), patch);
      set(KEYS.settings, s);
      // Without this the change lived only in localStorage and was
      // overwritten by the next bootstrap; the admin UI claimed it was live.
      pushCollection(KEYS.settings);
      return s;
    },
    onSyncError: function (fn) { onSyncError = typeof fn === "function" ? fn : null; },
    syncState: syncState,
    currentUser: currentUser,
    completeLogin: completeLogin,
    updateMyProfile: updateMyProfile,
    requireRole: requireRole,
    setSession: function (userId) { set(KEYS.session, userId); },
    clearSession: function () {
      remove(KEYS.session);
      // Dropping the token too, otherwise a sign-out leaves a live credential
      // in localStorage that any script on the page could replay.
      if (window.FoodLink && window.FoodLink.API) window.FoodLink.API.logout();
    },

    addNotification: addNotification,
    notificationsFor: notificationsFor,
    markAllRead: markAllRead,
    isFavorite: isFavorite,
    toggleFavorite: toggleFavorite,
    addPoints: addPoints,
    TIERS: TIERS,
    tierFor: tierFor,
    nextTier: nextTier,
    donationStatus: donationStatus,
    donorById: donorById,
    donorLabel: donorLabel
  };
})();
