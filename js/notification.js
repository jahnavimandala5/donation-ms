(function () {
  window.FoodLink = window.FoodLink || {};

  var container = null;

  function ensureContainer() {
    if (!container) {
      container = document.getElementById("toastContainer");
      if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        container.id = "toastContainer";
        document.body.appendChild(container);
      }
    }
    return container;
  }

  var ICONS = {
    success: "i-check",
    warning: "i-alert",
    info: "i-info",
    error: "i-error"
  };

  function show(type, title, message, duration) {
    var box = ensureContainer();
    var toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.setAttribute("role", "status");

    toast.innerHTML =
      '<span class="toast-icon"><svg class="icon" aria-hidden="true"><use href="#' + ICONS[type] + '"/></svg></span>' +
      '<div><p class="toast-title"></p><p class="toast-msg"></p></div>' +
      '<button class="toast-close" aria-label="Dismiss"><svg class="icon" style="width:16px;height:16px"><use href="#i-x"/></svg></button>';

    toast.querySelector(".toast-title").textContent = title;
    toast.querySelector(".toast-msg").textContent = message || "";

    var close = function () {
      if (toast.classList.contains("leaving")) return;
      toast.classList.add("leaving");
      setTimeout(function () { toast.remove(); }, 350);
    };

    toast.querySelector(".toast-close").addEventListener("click", close);
    box.appendChild(toast);

    var ttl = duration || 4200;
    setTimeout(close, ttl);
    return toast;
  }

  var api = {
    success: function (msg, title) { return show("success", title || "Success", msg); },
    warning: function (msg, title) { return show("warning", title || "Heads up", msg); },
    info: function (msg, title) { return show("info", title || "Did you know", msg); },
    error: function (msg, title) { return show("error", title || "Something went wrong", msg); },
    show: show
  };

  FoodLink.Notifications = api;
})();
