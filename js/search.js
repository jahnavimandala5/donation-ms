/* =====================================================================
   FoodLink - search.js
   Tokenised full-text search across donation and user fields.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var MIN_TOKEN = 2;

  /* Fold diacritics and punctuation so "cafe" matches "Cafe" and
     "Bengaluru" matches "bengaluru", and collapse phone spacing. */
  function normalize(str) {
    var s = String(str == null ? "" : str).toLowerCase().trim();
    if (!s) return "";
    if (s.normalize) {
      try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) { /* ignore */ }
    }
    return s.replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  }

  function tokens(str) {
    var n = normalize(str);
    if (!n) return [];
    return n.split(" ").filter(Boolean);
  }

  /* A token shorter than MIN_TOKEN matches almost everything, so a
     single keystroke would return the entire list. */
  function meaningful(qTokens) {
    if (!qTokens.length) return false;
    return qTokens.some(function (t) { return t.length >= MIN_TOKEN; });
  }

  function matches(haystack, q, qTokens) {
    if (haystack.indexOf(q) !== -1) return true;
    return qTokens.every(function (t) { return haystack.indexOf(t) !== -1; });
  }

  function searchFoods(list, query) {
    var q = normalize(query);
    if (!q) return list.slice();
    var qTokens = tokens(q);
    if (!meaningful(qTokens)) return list.slice();
    var S = window.FoodLink.Storage;

    return (list || []).filter(function (d) {
      if (!d) return false;
      // donorName / donorType do not exist on records created by the
      // donation form, which only stores donorId. Resolving the donor here
      // is what makes searching by donor name work at all.
      var donor = (S && d.donorId) ? S.donorById(d.donorId) : null;
      var haystack = normalize([
        d.foodName,
        d.description,
        d.city,
        d.state,
        d.address,
        d.foodType,
        d.pincode,
        d.category,
        donor ? donor.orgName : null,
        donor ? donor.name : null,
        donor ? donor.type : null
      ].filter(Boolean).join(" "));
      return matches(haystack, q, qTokens);
    });
  }

  function searchUsers(list, query) {
    var q = normalize(query);
    if (!q) return list.slice();
    var qTokens = tokens(q);
    if (!meaningful(qTokens)) return list.slice();
    return (list || []).filter(function (u) {
      if (!u) return false;
      // `role` is deliberately excluded: including it let anyone
      // enumerate privileged accounts by typing "admin".
      var haystack = normalize([u.name, u.orgName, u.email, u.phone, u.city, u.type].filter(Boolean).join(" "));
      return matches(haystack, q, qTokens);
    });
  }

  window.FoodLink.Search = {
    food: searchFoods,
    user: searchUsers,
    normalize: normalize,
    tokens: tokens
  };
})();
