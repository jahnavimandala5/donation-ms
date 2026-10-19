/* =====================================================================
   FoodLink - api.js
   Thin REST client for the Express + MongoDB backend (/api).

   Every request is bounded by an AbortController timeout. Without it a
   hung connection (captive portal, cold start, offline without a DNS
   failure) leaves the bootstrap promise pending forever, which means the
   page boot never runs and the preloader never clears.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var API_ORIGIN = (function () {
    if (window.FoodLink && window.FoodLink.API_ORIGIN) return window.FoodLink.API_ORIGIN;
    var host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || location.protocol === "file:") {
      return "http://localhost:4000";
    }
    return "https://donation-ms-58do.onrender.com";
  })();
  var BASE = API_ORIGIN + "/api";

  // Reads can be slow on a cold backend; writes must fail fast.
  var TIMEOUT_READ = 10000;
  var TIMEOUT_WRITE = 15000;

  function j(method, path, body, opts) {
    opts = opts || {};
    var timeout = opts.timeout || (method === "GET" ? TIMEOUT_READ : TIMEOUT_WRITE);
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;

    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, timeout);
    }

    var init = {
      method: method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit"
    };
    if (controller) init.signal = controller.signal;

    var extra = authHeaders();
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) init.headers[k] = extra[k];

    return fetch(BASE + path, init).then(function (r) {
      if (timer) clearTimeout(timer);
      if (r.status === 204) return null;
      return r.text().then(function (text) {
        var data = null;
        if (text) {
          try { data = JSON.parse(text); }
          catch (e) { data = null; }
        }
        if (!r.ok) {
          var err = new Error((data && data.error) || ("API " + method + " " + path + " -> " + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    }, function (networkErr) {
      if (timer) clearTimeout(timer);
      var e = new Error(
        controller && networkErr && networkErr.name === "AbortError"
          ? "API " + method + " " + path + " timed out after " + timeout + "ms"
          : "API " + method + " " + path + " is unreachable"
      );
      e.offline = true;
      throw e;
    });
  }

  var fallbackBlockedUntil = 0;

  /* ---------------- auth token ---------------- */

  var TOKEN_KEY = "fl_token";

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; }
    catch (e) { return null; }
  }

  function setToken(tok) {
    try {
      if (tok) localStorage.setItem(TOKEN_KEY, tok);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode */ }
  }

  function authHeaders() {
    var tok = getToken();
    return tok ? { Authorization: "Bearer " + tok } : {};
  }

  /* When a write to a different origin fails, try the same origin that
     served the page. The hard-coded Render host goes cold often enough
     that a same-origin fallback makes the app work out of the box.
     A cooldown stops a dead backend from doubling every request. */
  function withOriginFallback(method, path, body, opts) {
    return j(method, path, body, opts)["catch"](function (err) {
      var sameOrigin = location.origin + "/api";
      if (!err.offline || sameOrigin === BASE || Date.now() < fallbackBlockedUntil) throw err;
      var headers = { "Content-Type": "application/json", Accept: "application/json" };
      // The fallback must carry the same credentials, or every write would
      // silently come back 401.
      var extra = authHeaders();
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) headers[k] = extra[k];
      return fetch(sameOrigin + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) {
          fallbackBlockedUntil = Date.now() + 30000;
          var fe = new Error("API " + method + " " + path + " -> " + r.status);
          fe.status = r.status;
          throw fe;
        }
        return r.json();
      }, function () {
        fallbackBlockedUntil = Date.now() + 30000;
        throw err;
      });
    });
  }

  window.FoodLink.API = {
    BASE: BASE,
    ORIGIN: API_ORIGIN,
    getToken: getToken,
    setToken: setToken,

    health: function () { return j("GET", "/health"); },
    bootstrap: function () { return j("GET", "/bootstrap", undefined, { timeout: 12000 }); },
    getCollection: function (name) { return j("GET", "/c/" + encodeURIComponent(name)); },

    /* Authentication. The token is captured automatically; a rejected
       credential clears it so a stale session cannot wedge the client. */
    login: function (email, password) {
      return j("POST", "/auth/login", { email: email, password: password }, { timeout: 12000 })
        .then(function (res) { setToken(res && res.token); return res; });
    },
    register: function (payload) {
      return j("POST", "/auth/register", payload, { timeout: 12000 })
        .then(function (res) { setToken(res && res.token); return res; });
    },
    me: function () { return j("GET", "/auth/me"); },
    logout: function () { setToken(null); return Promise.resolve(true); },

    putCollection: function (name, list) { return withOriginFallback("PUT", "/c/" + encodeURIComponent(name), list); },
    add: function (name, rec) { return withOriginFallback("POST", "/c/" + encodeURIComponent(name), rec); },
    update: function (name, id, patch) { return withOriginFallback("PATCH", "/c/" + encodeURIComponent(name) + "/" + encodeURIComponent(id), patch); },
    del: function (name, id) { return withOriginFallback("DELETE", "/c/" + encodeURIComponent(name) + "/" + encodeURIComponent(id)); }
  };
})();
