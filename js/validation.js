/* =====================================================================
   FoodLink - validation.js
   Reusable form validation helpers.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
  }

  function isPhone(v) {
    return /^[+]?[\d\s-]{10,15}$/.test(String(v || "").trim());
  }

  function isPincode(v) {
    return /^[1-9][0-9]{5}$/.test(String(v || "").trim());
  }

  function isNumber(v, min, max) {
    var n = Number(v);
    if (isNaN(n)) return false;
    if (min !== undefined && n < min) return false;
    if (max !== undefined && n > max) return false;
    return true;
  }

  function isRequired(v) {
    return String(v || "").trim().length > 0;
  }

  function isDateInFuture(v) {
    if (!v) return false;
    var t = new Date(v).getTime();
    return !isNaN(t) && t > Date.now();
  }

  var RULES = {
    text: function (v) { return isRequired(v); },
    required: function (v) { return isRequired(v); },
    email: function (v) { return isRequired(v) && isEmail(v); },
    phone: function (v) { return !isRequired(v) || isPhone(v); },
    pincode: function (v) { return !isRequired(v) || isPincode(v); },
    number: function (v, min, max) { return isRequired(v) && isNumber(v, min, max); },
    numberOptional: function (v, min, max) { return !isRequired(v) || isNumber(v, min, max); },
    select: function (v) { return isRequired(v); },
    future: function (v) { return isRequired(v) && isDateInFuture(v); }
  };

  function validateField(input) {
    var rule = (input.dataset && input.dataset.rule) || "text";
    var min = input.min !== undefined && input.min !== "" ? Number(input.min) : undefined;
    var max = input.max !== undefined && input.max !== "" ? Number(input.max) : undefined;
    var fn = RULES[rule] || RULES.text;
    return fn(input.value, min, max);
  }

  function mark(input, ok, msg) {
    var field = input.closest(".form-field") || input;
    field.classList.toggle("invalid", !ok);
    field.classList.toggle("valid", ok);
    var el = field.querySelector(".field-msg");
    if (el) {
      el.textContent = ok ? "" : (msg || "This field is invalid");
      el.classList.toggle("ok", ok);
    }
  }

  function validateAndMark(input, msg) {
    var ok = validateField(input);
    mark(input, ok, msg);
    return ok;
  }

  function validateForm(form, config) {
    var valid = true;
    var required = form.querySelectorAll("[data-rule]");
    required.forEach(function (input) {
      var ok = validateField(input);
      if (!ok) valid = false;
    });
    if (config && config.before) {
      var extra = config.before();
      if (extra === false) valid = false;
    }
    return valid;
  }

  function attachLiveValidation(form) {
    form.querySelectorAll("[data-rule]").forEach(function (input) {
      var evt = (input.tagName === "SELECT" || input.type === "date" || input.type === "time") ? "change" : "input";
      input.addEventListener(evt, function () { validateAndMark(input); });
    });
  }

  window.FoodLink.Validation = {
    isEmail: isEmail,
    isPhone: isPhone,
    isPincode: isPincode,
    isNumber: isNumber,
    isRequired: isRequired,
    validateField: validateField,
    mark: mark,
    validateAndMark: validateAndMark,
    validateForm: validateForm,
    attachLiveValidation: attachLiveValidation
  };
})();
