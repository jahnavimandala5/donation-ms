/* =====================================================================
   FoodLink - modal.js
   Generic modal + confirm dialog system.

   Contract notes:
   - Modal.open(html) injects raw HTML. Every caller MUST pre-escape any
     user-controlled value (use UI.escapeHtml).
   - Modal.confirm() ALWAYS settles its promise, on every dismiss path
     (confirm, cancel, Escape, backdrop click, close button). Callers can
     therefore rely on cleanup running in `.then()`.
   - close() is generation-guarded, so close() immediately followed by
     open() no longer wipes the freshly rendered dialog.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var root = null;
  var generation = 0;
  var lastFocused = null;
  var onDismiss = null;
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function ensureRoot() {
    if (!root) {
      root = document.createElement("div");
      root.id = "flModalRoot";
      root.className = "modal-root";
      root.addEventListener("click", function (e) {
        if (e.target === root) closeModal();
      });
      document.body.appendChild(root);
    }
    return root;
  }

  function focusables(scope) {
    return Array.prototype.filter.call(
      (scope || document).querySelectorAll(FOCUSABLE),
      function (el) {
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
      }
    );
  }

  function openModal(html, opts) {
    opts = opts || {};
    var r = ensureRoot();

    // A pending close() from a previous dialog must not blank this one.
    generation += 1;
    onDismiss = typeof opts.onDismiss === "function" ? opts.onDismiss : null;
    lastFocused = document.activeElement;

    r.innerHTML = '<div class="modal' + (opts.size ? " modal-" + opts.size : "") + '" role="dialog" aria-modal="true"' + (opts.label ? ' aria-label="' + escapeAttr(opts.label) + '"' : "") + '>' +
      '<button class="modal-close" type="button" aria-label="Close dialog"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>' +
      html + "</div>";

    var closeBtn = r.querySelector(".modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    document.addEventListener("keydown", escHandler, true);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { r.classList.add("show"); });

    var m = r.querySelector(".modal");
    if (m) {
      m.addEventListener("click", function (e) { e.stopPropagation(); });
      if (!opts.label) {
        var h = m.querySelector(".modal-title");
        if (h) {
          if (!h.id) h.id = "flModalTitle";
          m.setAttribute("aria-labelledby", h.id);
        }
      }
    }

    requestAnimationFrame(function () {
      var list = focusables(m);
      var target = (m && m.querySelector("[data-autofocus]")) || list[0];
      if (target && target.focus) target.focus();
    });

    if (opts.onOpen) opts.onOpen(m, r);
    // Generated forms ship bare wrapping labels; bind them after render.
    if (window.FoodLink && window.FoodLink.UI && window.FoodLink.UI.autoLabel) {
      try { window.FoodLink.UI.autoLabel(r); } catch (e) { /* non-fatal */ }
    }
    return r;
  }

  function closeModal(result) {
    if (!root) return;
    var gen = ++generation;
    var settle = onDismiss;
    onDismiss = null;

    root.classList.remove("show");
    document.removeEventListener("keydown", escHandler, true);
    document.body.style.overflow = "";

    // Guarded: if another dialog opened before the timer fires, keep it.
    setTimeout(function () {
      if (root && gen === generation) root.innerHTML = "";
    }, 250);

    if (lastFocused && lastFocused.focus && document.contains(lastFocused)) {
      try { lastFocused.focus(); } catch (e) { /* element detached */ }
    }
    lastFocused = null;

    if (settle) settle(result);
  }

  function escHandler(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeModal(false);
      return;
    }
    if (e.key !== "Tab" || !root) return;
    var list = focusables(root);
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function confirmDialog(title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      function settle(value) {
        if (done) return;
        done = true;
        resolve(value);
      }
      // Registered through opts so Escape/backdrop/close also settle it.
      openModal(
        '<h3 class="modal-title">' + escapeAttr(title) + "</h3>" +
        '<p class="modal-sub">' + escapeAttr(message) + "</p>" +
        '<div class="form-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="cancel">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" type="button" data-autofocus data-act="ok">' +
        escapeAttr(opts.okText || "Confirm") + "</button></div>",
        {
          label: title,
          onDismiss: settle,
          onOpen: function (m) {
            var ok = m.querySelector('[data-act="ok"]');
            var cancel = m.querySelector('[data-act="cancel"]');
            if (ok) ok.addEventListener("click", function () { closeModal(true); });
            if (cancel) cancel.addEventListener("click", function () { closeModal(false); });
          }
        }
      );
    });
  }

  window.FoodLink.Modal = {
    open: openModal,
    close: closeModal,
    confirm: confirmDialog
  };
})();
