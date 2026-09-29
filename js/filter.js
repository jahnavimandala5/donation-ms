/* =====================================================================
   FoodLink - filter.js
   Declarative filter + sort pipeline for food listings.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var SORTS = {
    newest: function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); },
    expiry: function (a, b) { return (Number(a.expiresAt) || 0) - (Number(b.expiresAt) || 0); },
    quantity: function (a, b) { return (Number(b.quantity) || 0) - (Number(a.quantity) || 0); },
    servings: function (a, b) { return (Number(b.servings) || 0) - (Number(a.servings) || 0); }
  };

  function apply(list, opts) {
    opts = opts || {};
    var out = list.slice();
    var S = window.FoodLink.Storage;

    if (opts.status) {
      // Compare against the *effective* status: an expired listing still
      // carries status "available" in storage, so filtering on the raw
      // field returned food nobody could safely eat.
      out = out.filter(function (d) {
        return S.donationStatus(d) === opts.status;
      });
    }

    if (opts.veg === "veg") out = out.filter(function (d) { return d.category === "veg"; });
    if (opts.veg === "nonveg") out = out.filter(function (d) { return d.category === "nonveg"; });

    if (opts.foodTypes && opts.foodTypes.length) {
      out = out.filter(function (d) {
        return opts.foodTypes.some(function (t) { return d.foodType === t; });
      });
    }

    if (opts.city) {
      var c = String(opts.city).toLowerCase().trim();
      if (c) out = out.filter(function (d) { return String(d.city || "").toLowerCase().indexOf(c) !== -1; });
    }

    if (opts.query) {
      out = window.FoodLink.Search.food(out, opts.query);
    }

    if (opts.sort && SORTS[opts.sort]) {
      out.sort(SORTS[opts.sort]);
    }

    return out;
  }

  function readFilterState(panel) {
    if (!panel) return {};
    var state = {};
    var veg = panel.querySelector('[name="fltVeg"]:checked');
    state.veg = veg ? veg.value : "";
    var types = panel.querySelectorAll('[name="fltType"]:checked');
    state.foodTypes = Array.prototype.map.call(types, function (t) { return t.value; });
    var sort = panel.querySelector('[name="fltSort"]');
    state.sort = sort ? sort.value : "newest";
    var city = panel.querySelector('[name="fltCity"]');
    state.city = city ? city.value : "";
    return state;
  }

  function bindChipToggle(chip) {
    chip.addEventListener("click", function () {
      chip.classList.toggle("active");
      var evt = new CustomEvent("chipchange", { detail: { name: chip.dataset.chip, value: chip.dataset.value, active: chip.classList.contains("active") } });
      document.dispatchEvent(evt);
    });
  }

  window.FoodLink.Filter = {
    SORTS: SORTS,
    apply: apply,
    readFilterState: readFilterState,
    bindChipToggle: bindChipToggle
  };
})();
