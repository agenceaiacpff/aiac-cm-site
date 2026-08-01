(function () {
  "use strict";

  function initializeOrganPage() {
    document.querySelectorAll(".reveal").forEach(function (element) {
      element.classList.add("on");
    });

    document.querySelectorAll("[data-count]").forEach(function (counter) {
      counter.textContent = counter.getAttribute("data-count") || "0";
    });

    document.querySelectorAll(".tab[data-tab]").forEach(function (tab) {
      tab.setAttribute("role", "button");
      tab.setAttribute("tabindex", "0");

      function activateTab() {
        var target = tab.getAttribute("data-tab");
        var scope = tab.closest("details") || document;

        scope.querySelectorAll(".tab[data-tab]").forEach(function (candidate) {
          candidate.classList.toggle("active", candidate === tab);
        });
        scope.querySelectorAll(".pane[data-pane]").forEach(function (pane) {
          pane.classList.toggle("active", pane.getAttribute("data-pane") === target);
        });
      }

      tab.addEventListener("click", activateTab);
      tab.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateTab();
        }
      });
    });

    var topButton = document.getElementById("topBtn");
    if (topButton) {
      topButton.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeOrganPage);
  } else {
    initializeOrganPage();
  }
})();
