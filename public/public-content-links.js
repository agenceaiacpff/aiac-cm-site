(function () {
  "use strict";

  var categories = [
    ["projets", "Projets"], ["rapports", "Rapports"], ["agenda", "Agenda"],
    ["galerie", "Galerie"], ["videos", "Vidéos"], ["annonces", "Annonces"], ["livre-dor", "Livre d’or"]
  ];
  var organs = {
    AIAC_PFF: "OS-01", AIAC_PDH: "OS-02", AIAC_SANTE_TRAUMA: "OS-03", AIAC_EDUCATION: "OS-04",
    AIAC_ENVIRONNEMENT: "OS-05", AIAC_BIODIVERSITE: "OS-06", AIAC_HUMANITAIRE: "OS-07",
    AIAC_DEVLOCAL: "OS-08", AIAC_DEPLACES_REFUGIES: "OS-09", AIAC_SECURITE_SURETE: "OS-10",
    AIAC_PGC_Catastrophes: "OS-11"
  };
  var legacy = {
    "projets.html": "projets", "rapports.html": "rapports", "agenda.html": "agenda", "galerie.html": "galerie",
    "videos.html": "videos", "livre-dor.html": "livre-dor"
  };

  function initializeResponsiveMenus() {
    document.querySelectorAll("button.burger, #burger, [data-menu-toggle]").forEach(function (button) {
      if (button.dataset.aiacMenuReady === "true") return;

      var controlledId = button.getAttribute("aria-controls");
      var menu = controlledId ? document.getElementById(controlledId) : null;
      if (!menu) menu = document.getElementById("links");
      if (!menu) {
        var navigationArea = button.closest(".topbar, .nav, header") || document;
        menu = navigationArea.querySelector(".links, .nav-links, nav");
      }
      if (!menu) return;

      if (!menu.id) menu.id = "aiac-menu-" + Math.random().toString(36).slice(2, 9);
      button.dataset.aiacMenuReady = "true";
      button.setAttribute("aria-controls", menu.id);
      button.setAttribute("aria-expanded", menu.classList.contains("open") ? "true" : "false");

      function closeMenu() {
        menu.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
      }

      button.addEventListener("click", function () {
        var isOpen = menu.classList.toggle("open");
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
      menu.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", closeMenu);
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeMenu();
      });
    });
  }

  initializeResponsiveMenus();

  Object.keys(legacy).forEach(function (file) {
    document.querySelectorAll('a[href$="autres/' + file + '"],a[href$="' + file + '"]').forEach(function (link) {
      link.href = "/publications/" + legacy[file];
    });
  });

  var pathParts = location.pathname.split("/").filter(Boolean);
  var organKey = Object.keys(organs).find(function (key) { return pathParts.indexOf(key) !== -1; });
  if (organKey) {
    var organCode = organs[organKey];
    var style = document.createElement("style");
    style.textContent = ".aiac-publications-bar{background:#ecfeff;border-bottom:1px solid #99f6e4;box-sizing:border-box;font-family:Arial,sans-serif;overflow:hidden;padding:12px clamp(8px,3vw,18px);width:100%}.aiac-publications-bar *{box-sizing:border-box}.aiac-publications-bar>div{align-items:center;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:1180px;margin:auto;overflow:visible;width:100%}.aiac-publications-bar b{color:#115e59;flex:1 0 100%;margin:0 0 3px;text-align:center;white-space:normal}.aiac-publications-bar a{background:#fff;border:1px solid #99f6e4;border-radius:999px;color:#0f766e;display:inline-flex;font-size:12px;font-weight:800;justify-content:center;max-width:100%;padding:8px 11px;text-align:center;text-decoration:none;white-space:nowrap}.aiac-publications-bar a:hover{background:#0f766e;color:#fff}@media(min-width:1000px){.aiac-publications-bar b{flex:0 0 auto;margin:0 8px 0 0;text-align:left}}";
    document.head.appendChild(style);
    var bar = document.createElement("nav");
    bar.className = "aiac-publications-bar";
    bar.setAttribute("aria-label", "Publications de cet organe");
    bar.innerHTML = '<div><b>Publications ' + organCode + '</b>' + categories.map(function (entry) {
      return '<a href="/publications/' + entry[0] + '?organe=' + organCode + '">' + entry[1] + '</a>';
    }).join("") + "</div>";
    var header = document.querySelector("header");
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling); else document.body.insertBefore(bar, document.body.firstChild);
  }

  var isCentralHome = /\/nouveau-site\/(?:index\.html)?$/.test(location.pathname);
  if (isCentralHome && !document.querySelector('a[href="/publications/annonces"]')) {
    var projectCard = document.querySelector('a[href="/publications/projets"]');
    var grid = projectCard && projectCard.parentElement;
    if (grid) {
      var announcement = document.createElement("a");
      announcement.className = "card";
      announcement.href = "/publications/annonces";
      announcement.innerHTML = "<h3>Annonces</h3><p>Recrutements, appels, communiqués et avis officiels.</p><span class=\"pill\">Ouvrir</span>";
      grid.appendChild(announcement);
    }
  }
})();
