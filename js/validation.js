/* =====================================================================
   FoodLink - validation.js
   Reusable form validation helpers.

   Markup contract: an input opts in with `data-rule="<name>"`. The rule
   name is looked up in RULES (own-properties only, so `data-rule="toString"`
   cannot reach Object.prototype). The input must sit inside a
   `.form-field` wrapper that contains a `.field-msg` element, otherwise
   classes are applied to the input itself and no message is shown.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var MESSAGES = {
    text: "This field is required",
    required: "This field is required",
    select: "Please choose an option",
    email: "Enter a valid email address",
    phone: "Enter a valid phone number",
    pincode: "Enter a valid 6-digit PIN code",
    number: "Enter a valid number",
    future: "Choose a date in the future"
  };

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v == null ? "" : v).trim());
  }

  function isPhone(v) {
    var s = String(v == null ? "" : v).trim();
    if (!/^[+]?[\d\s()-]+$/.test(s)) return false;
    // Require a realistic digit count, not just a character count,
    // so punctuation-only strings such as "----------" are rejected.
    var digits = s.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  function isPincode(v) {
    return /^[1-9][0-9]{5}$/.test(String(v == null ? "" : v).trim());
  }

  function isNumber(v, min, max) {
    // Reject "", null, booleans, arrays and objects, all of which Number()
    // happily coerces to a value.
    if (typeof v === "boolean" || v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    if (typeof v === "object") return false;
    var n = typeof v === "number" ? v : Number(String(v).trim());
    if (!isFinite(n)) return false;
    if (min !== undefined && min !== null && !isNaN(min) && n < min) return false;
    if (max !== undefined && max !== null && !isNaN(max) && n > max) return false;
    return true;
  }

  function isRequired(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return isFinite(v);
    if (typeof v === "boolean") return v;
    return String(v).trim().length > 0;
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

  function readRule(input) {
    var rule = (input.dataset && input.dataset.rule) || "text";
    // Own-property lookup only: never resolve through Object.prototype.
    if (!Object.prototype.hasOwnProperty.call(RULES, rule)) return null;
    return rule;
  }

  function readBound(input, attr) {
    if (!input.hasAttribute || !input.hasAttribute(attr)) return undefined;
    var raw = input.getAttribute(attr);
    if (raw === null || String(raw).trim() === "") return undefined;
    var n = Number(raw);
    return isNaN(n) ? undefined : n;
  }

  function validateField(input) {
    var rule = readRule(input);
    if (!rule) return true;
    return RULES[rule](input.value, readBound(input, "min"), readBound(input, "max"));
  }

  function messageFor(input) {
    var rule = readRule(input);
    return MESSAGES[rule] || MESSAGES.text;
  }

  function mark(input, ok, msg) {
    // The stylesheet keys off .form-field; fall back to the input itself
    // so the state is never silently dropped.
    var field = input.closest ? (input.closest(".form-field") || input) : input;
    field.classList.toggle("invalid", !ok);
    field.classList.toggle("valid", ok);
    if (input.setAttribute) {
      if (ok) input.removeAttribute("aria-invalid");
      else input.setAttribute("aria-invalid", "true");
    }
    var el = field.querySelector(".field-msg");
    if (el) {
      el.textContent = ok ? "" : (msg || messageFor(input));
      el.classList.toggle("ok", ok);
    }
  }

  function clear(input) {
    var field = input.closest ? (input.closest(".form-field") || input) : input;
    field.classList.remove("invalid", "valid");
    if (input.removeAttribute) input.removeAttribute("aria-invalid");
    var el = field.querySelector(".field-msg");
    if (el) { el.textContent = ""; el.classList.remove("ok"); }
  }

  function validateAndMark(input, msg) {
    var ok = validateField(input);
    mark(input, ok, msg);
    return ok;
  }

  function validateForm(form, config) {
    if (!form) return false;
    var valid = true;
    var firstBad = null;
    var fields = form.querySelectorAll("[data-rule]");

    for (var i = 0; i < fields.length; i++) {
      var input = fields[i];
      // A field the user has not touched yet stays visually neutral; only
      // touched-but-invalid fields are marked during live validation.
      var ok = validateField(input);
      if (!ok) {
        valid = false;
        mark(input, false);
        if (!firstBad) firstBad = input;
      } else {
        clear(input);
      }
    }

    if (config && typeof config.before === "function") {
      try {
        if (config.before() === false) valid = false;
      } catch (e) {
        valid = false;
      }
    }

    if (!valid && firstBad && config && config.focus !== false) {
      try { firstBad.focus(); } catch (e) { /* detached */ }
    }
    return valid;
  }

  function attachLiveValidation(form) {
    if (!form) return;
    var fields = form.querySelectorAll("[data-rule]");
    for (var i = 0; i < fields.length; i++) {
      (function (input) {
        if (input.dataset.flValidated === "1") return;
        input.dataset.flValidated = "1";
        var isPicker = input.tagName === "SELECT" ||
          /^(date|time|datetime-local|month|week)$/.test(input.type || "");
        function revalidate() {
          // Only surface a message once the user has interacted with the
          // field, so untouched required inputs are not pre-flagged red.
          if (input.value === "" && !input.dataset.flTouched) { clear(input); return; }
          input.dataset.flTouched = "1";
          validateAndMark(input);
        }
        input.addEventListener(isPicker ? "change" : "input", revalidate);
        input.addEventListener("blur", revalidate);
      })(fields[i]);
    }
  }

  window.FoodLink.Validation = {
    isEmail: isEmail,
    isPhone: isPhone,
    isPincode: isPincode,
    isNumber: isNumber,
    isRequired: isRequired,
    isDateInFuture: isDateInFuture,
    validateField: validateField,
    mark: mark,
    clear: clear,
    validateAndMark: validateAndMark,
    validateForm: validateForm,
    attachLiveValidation: attachLiveValidation
  };
})();
