/* =====================================================================
   FoodLink - api.js
   Thin REST client for the Express + MongoDB backend (/api).
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

  function j(method, path, body) {
    return fetch(BASE + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("API " + method + " " + path + " -> " + r.status);
      return r.json();
    });
  }

  window.FoodLink.API = {
    BASE: BASE,
    health: function () { return j("GET", "/health"); },
    bootstrap: function () { return j("GET", "/bootstrap"); },
    getCollection: function (name) { return j("GET", "/c/" + encodeURIComponent(name)); },
    putCollection: function (name, list) { return j("PUT", "/c/" + encodeURIComponent(name), list); },
    add: function (name, rec) { return j("POST", "/c/" + encodeURIComponent(name), rec); },
    update: function (name, id, patch) { return j("PATCH", "/c/" + encodeURIComponent(name) + "/" + encodeURIComponent(id), patch); },
    del: function (name, id) { return j("DELETE", "/c/" + encodeURIComponent(name) + "/" + encodeURIComponent(id)); }
  };
})();
