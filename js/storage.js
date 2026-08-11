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
    siteTagline: "Save Food • Feed People • Reduce Waste",
    contactEmail: "hello@foodlink.app",
    contactPhone: "+91 98765 43210",
    emergencyContact: "+91 90000 10000",
    requireApproval: false,
    announcementsEnabled: true,
    currency: "₹"
  };

  /* ---------------- low level ---------------- */

  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function remove(key) { localStorage.removeItem(key); }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- time helpers ---------------- */

  var HOUR = 3600000;
  var DAY = 86400000;
  function hoursFromNow(h) { return Date.now() + h * HOUR; }
  function daysAgo(d) { return Date.now() - d * DAY; }

  /* ---------------- collection accessors ---------------- */

  var SERVER_KEYS = ["users", "donations", "requests", "notifications", "favorites", "feedback", "contacts", "settings"];

  /* Push the current in-browser collection to the MongoDB backend.
     Fire-and-forget: never blocks the UI, never throws. */
  function pushCollection(key) {
    try {
      if (!window.FoodLink.API) return;
      var name = key.replace("fl_", "");
      var v = name === "settings" ? [get(KEYS.settings, {})] : get(key, []);
      window.FoodLink.API.putCollection(name, v).catch(function () {});
    } catch (e) { /* ignore sync errors */ }
  }

  /* Load every collection from the backend into the browser cache.
     Falls back to local seeding when the server is unreachable. */
  function init() {
    if (!window.FoodLink.API) { seed(); return Promise.resolve(false); }
    return window.FoodLink.API.bootstrap()
      .then(function (data) {
        if (!data || typeof data !== "object") { seed(); return false; }
        SERVER_KEYS.forEach(function (k) {
          var v = data[k];
          if (v === undefined) return;
          if (k === "settings") {
            set(KEYS.settings, Array.isArray(v) && v.length ? v[0] : {});
          } else {
            set(KEYS[k], Array.isArray(v) ? v : []);
          }
        });
        set(KEYS.seeded, true);
        return true;
      })
      .catch(function () {
        seed();
        return false;
      });
  }

  function collection(key) {
    return {
      all: function () { return get(key, []); },
      save: function (list) { var ok = set(key, list); pushCollection(key); return ok; },
      find: function (fn) {
        var list = get(key, []);
        for (var i = 0; i < list.length; i++) { if (fn(list[i])) return list[i]; }
        return null;
      },
      byId: function (id) {
        return this.find(function (r) { return r.id === id; });
      },
      add: function (row) {
        if (!row.id) row.id = uid(key.replace("fl_", ""));
        var list = get(key, []);
        list.unshift(row);
        set(key, list);
        pushCollection(key);
        return row;
      },
      update: function (id, patch) {
        var list = get(key, []);
        var out = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) {
            for (var k in patch) {
              if (Object.prototype.hasOwnProperty.call(patch, k)) list[i][k] = patch[k];
            }
            out = list[i]; break;
          }
        }
        set(key, list);
        pushCollection(key);
        return out;
      },
      remove: function (id) {
        set(key, get(key, []).filter(function (r) { return r.id !== id; }));
        pushCollection(key);
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
    if (roles.indexOf(u.role) === -1) {
      window.location.href = u.role === "admin" ? "admin.html" : (u.role === "donor" ? "donor.html" : "receiver.html");
      return null;
    }
    return u;
  }

  /* ---------------- points / badges ---------------- */

  var TIERS = [
    { key: "bronze", name: "Bronze", emoji: "🥉", color: "#b07a4a", min: 0 },
    { key: "silver", name: "Silver", emoji: "🥈", color: "#9aa4ad", min: 100 },
    { key: "gold", name: "Gold", emoji: "🥇", color: "#f59e0b", min: 300 },
    { key: "diamond", name: "Diamond", emoji: "💎", color: "#22d3ee", min: 600 }
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
    var u = Users.byId(userId);
    if (!u) return;
    u.points = (u.points || 0) + amount;
    if (!u.badges) u.badges = [];
    var tier = tierFor(u.points);
    if (u.badges.indexOf(tier.key) === -1) {
      u.badges.push(tier.key);
      addNotification(userId, "New badge unlocked: " + tier.name + " tier!", "success");
    }
    Users.save(Users.all());
  }

  /* ---------------- notifications ---------------- */

  function addNotification(userId, message, type) {
    var n = {
      id: uid("n"),
      userId: userId,
      title: (type === "success" ? "Great news" : type === "warning" ? "Heads up" : "Update"),
      message: message,
      type: type || "info",
      read: false,
      createdAt: Date.now()
    };
    Notifications.add(n);
    return n;
  }

  function notificationsFor(userId) {
    return Notifications.all()
      .filter(function (n) { return n.userId === userId; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
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
    var existing = Favorites.find(function (f) { return f.receiverId === receiverId && f.donationId === donationId; });
    if (existing) { Favorites.remove(existing.id); return false; }
    Favorites.add({ receiverId: receiverId, donationId: donationId, createdAt: Date.now() });
    return true;
  }

  /* ---------------- donation helpers ---------------- */

  function donationStatus(d) {
    if (d.status === "available" && d.expiresAt < Date.now()) return "expired";
    return d.status;
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
        phone: "9000000001", password: "admin123", orgName: "FoodLink HQ",
        city: "Delhi", state: "Delhi", address: "10 Cyber Hub, Gurugram", pincode: "122002",
        description: "Platform administrator", status: "approved", verified: true,
        points: 0, badges: [], joinedAt: daysAgo(220), avatar: null
      },
      {
        id: "u_d1", role: "donor", name: "Rahul Sharma", email: "rahul@foodlink.app",
        phone: "9810000011", password: "donor123", orgName: "Spice Garden", type: "Restaurant",
        city: "Delhi", state: "Delhi", address: "21, Hauz Khas Village", pincode: "110016",
        description: "North Indian family restaurant, 80 seats", status: "approved", verified: true,
        points: 340, badges: ["bronze", "silver", "gold"], joinedAt: daysAgo(180), avatar: null
      },
      {
        id: "u_d2", role: "donor", name: "Priya Verma", email: "priya@foodlink.app",
        phone: "9810000022", password: "donor123", orgName: "Grand Palace Hotel", type: "Hotel",
        city: "Mumbai", state: "Maharashtra", address: "45, Linking Road, Bandra West", pincode: "400050",
        description: "Full service hotel with buffet banquets", status: "approved", verified: true,
        points: 210, badges: ["bronze", "silver"], joinedAt: daysAgo(150), avatar: null
      },
      {
        id: "u_d3", role: "donor", name: "Amit Patel", email: "amit@foodlink.app",
        phone: "9810000033", password: "donor123", orgName: "Brew & Beans", type: "Cafe",
        city: "Bengaluru", state: "Karnataka", address: "88, Indiranagar 100 Ft Road", pincode: "560038",
        description: "Specialty coffee cafe with bakery section", status: "approved", verified: true,
        points: 90, badges: ["bronze"], joinedAt: daysAgo(90), avatar: null
      },
      {
        id: "u_d4", role: "donor", name: "Sunita Rao", email: "sunita@foodlink.app",
        phone: "9810000044", password: "donor123", orgName: "Sunita Rao", type: "Household",
        city: "Pune", state: "Maharashtra", address: "33, FC Road, Shivajinagar", pincode: "411005",
        description: "Home cook, surplus from family functions", status: "approved", verified: true,
        points: 60, badges: ["bronze"], joinedAt: daysAgo(40), avatar: null
      },
      {
        id: "u_d5", role: "donor", name: "Karan Malhotra", email: "karan@foodlink.app",
        phone: "9810000055", password: "donor123", orgName: "Sweet Symphony Bakery", type: "Bakery",
        city: "Kolkata", state: "West Bengal", address: "12, Park Street", pincode: "700016",
        description: "Bakery, cakes and breads", status: "pending", verified: false,
        points: 0, badges: [], joinedAt: daysAgo(2), avatar: null
      },
      {
        id: "u_r1", role: "receiver", name: "Neha Gupta", email: "neha@foodlink.app",
        phone: "9811000011", password: "receiver123", orgName: "Feed the Future", type: "NGO",
        city: "Delhi", state: "Delhi", address: "14, Lajpat Nagar II", pincode: "110024",
        description: "Community kitchen serving 400 meals a day", status: "approved", verified: true,
        points: 180, badges: ["bronze", "silver"], joinedAt: daysAgo(170), avatar: null
      },
      {
        id: "u_r2", role: "receiver", name: "Fr. Joseph D'Souza", email: "joseph@foodlink.app",
        phone: "9811000022", password: "receiver123", orgName: "Hope Home", type: "Orphanage",
        city: "Mumbai", state: "Maharashtra", address: "8, Dharavi Main Road", pincode: "400017",
        description: "Home for 60 children, needs 3 meals daily", status: "approved", verified: true,
        points: 120, badges: ["bronze", "silver"], joinedAt: daysAgo(160), avatar: null
      },
      {
        id: "u_r3", role: "receiver", name: "Meera Iyer", email: "meera@foodlink.app",
        phone: "9811000033", password: "receiver123", orgName: "Snehashray", type: "Old Age Home",
        city: "Bengaluru", state: "Karnataka", address: "22, Jayanagar 4th Block", pincode: "560011",
        description: "Shelter for 45 senior citizens", status: "approved", verified: true,
        points: 90, badges: ["bronze"], joinedAt: daysAgo(120), avatar: null
      },
      {
        id: "u_r4", role: "receiver", name: "Asha Deshmukh", email: "asha@foodlink.app",
        phone: "9811000044", password: "receiver123", orgName: "Anna Seva Kitchen", type: "Community Kitchen",
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

  function resetAll() {
    remove(KEYS.users); remove(KEYS.donations); remove(KEYS.requests);
    remove(KEYS.notifications); remove(KEYS.favorites); remove(KEYS.feedback);
    remove(KEYS.contacts); remove(KEYS.settings); remove(KEYS.session);
    remove(KEYS.seeded); remove(KEYS.theme);
    seed();
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
      return s;
    },
    currentUser: currentUser,
    requireRole: requireRole,
    setSession: function (userId) { set(KEYS.session, userId); },
    clearSession: function () { remove(KEYS.session); },
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
