/* =====================================================================
   FoodLink - search.js
   Fuzzy-ish full-text search across donation fields.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  function normalize(str) {
    return String(str || "").toLowerCase().trim();
  }

  function tokens(str) {
    return normalize(str).split(/\s+/).filter(Boolean);
  }

  function searchFoods(list, query) {
    var q = normalize(query);
    if (!q) return list;
    var qTokens = tokens(q);

    return list.filter(function (d) {
      var haystack = [
        d.foodName,
        d.description,
        d.city,
        d.state,
        d.address,
        d.donorName,
        d.donorType,
        d.foodType,
        d.pincode
      ].map(normalize).join(" ");

      if (haystack.indexOf(q) !== -1) return true;
      return qTokens.every(function (t) { return haystack.indexOf(t) !== -1; });
    });
  }

  function searchUsers(list, query) {
    var q = normalize(query);
    if (!q) return list;
    var qTokens = tokens(q);
    return list.filter(function (u) {
      var haystack = [u.name, u.orgName, u.email, u.phone, u.city, u.type, u.role].map(normalize).join(" ");
      if (haystack.indexOf(q) !== -1) return true;
      return qTokens.every(function (t) { return haystack.indexOf(t) !== -1; });
    });
  }

  window.FoodLink.Search = {
    food: searchFoods,
    user: searchUsers,
    normalize: normalize
  };
})();
