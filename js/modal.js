/* =====================================================================
   FoodLink - modal.js
   Generic modal + confirm dialog system.
   ===================================================================== */

window.FoodLink = window.FoodLink || {};

(function () {
  "use strict";

  var root = null;

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

  function openModal(html, opts) {
    opts = opts || {};
    var r = ensureRoot();
    r.innerHTML = '<div class="modal' + (opts.size ? " modal-" + opts.size : "") + '">' +
      '<button class="modal-close" aria-label="Close"><svg class="icon"><use href="#i-x"/></svg></button>' +
      html + "</div>";
    var closeBtn = r.querySelector(".modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    document.addEventListener("keydown", escHandler);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { r.classList.add("show"); });
    var m = r.querySelector(".modal");
    if (m) m.addEventListener("click", function (e) { e.stopPropagation(); });
    if (opts.onOpen) opts.onOpen(m, r);
    return r;
  }

  function closeModal() {
    if (!root) return;
    root.classList.remove("show");
    document.removeEventListener("keydown", escHandler);
    document.body.style.overflow = "";
    setTimeout(function () { if (root) root.innerHTML = ""; }, 250);
  }

  function escHandler(e) {
    if (e.key === "Escape") closeModal();
  }

  function confirmDialog(title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      openModal(
        '<h3 class="modal-title">' + title + "</h3>" +
        '<p class="modal-sub">' + message + "</p>" +
        '<div class="form-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-act="ok">' +
        (opts.okText || "Confirm") + "</button></div>",
        { onOpen: function (m) {
            m.querySelector('[data-act="ok"]').addEventListener("click", function () { closeModal(); resolve(true); });
            m.querySelector('[data-act="cancel"]').addEventListener("click", function () { closeModal(); resolve(false); });
          } }
      );
    });
  }

  window.FoodLink.Modal = {
    open: openModal,
    close: closeModal,
    confirm: confirmDialog
  };
})();
