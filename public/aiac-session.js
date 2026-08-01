(function () {
  "use strict";

  var style = document.createElement("style");
  style.textContent = [
    "#aiac-session-shell{position:sticky;top:0;z-index:2147483000;background:#071523;color:#e2e8f0;border-bottom:1px solid #28536a;box-shadow:0 7px 22px rgba(0,0,0,.28);font-family:Arial,Helvetica,sans-serif}",
    "#aiac-session-shell *{box-sizing:border-box}",
    ".aiac-session-inner{max-width:1180px;margin:0 auto;min-height:58px;padding:8px 16px;display:flex;align-items:center;gap:12px}",
    ".aiac-session-avatar{width:38px;height:38px;border-radius:50%;background:#38bdf8;color:#07111f;font-weight:900;display:flex;align-items:center;justify-content:center;flex:0 0 auto}",
    ".aiac-session-person{display:grid;line-height:1.2;min-width:0}",
    ".aiac-session-person b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".aiac-session-person small{font-size:11px;color:#94a3b8}",
    ".aiac-session-state{font-size:12px;color:#86efac;margin-left:auto;white-space:nowrap}",
    ".aiac-session-action{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:9px 13px;font-size:12px;font-weight:800;text-decoration:none!important;white-space:nowrap}",
    ".aiac-session-workspace{background:#38bdf8;color:#07111f!important}",
    ".aiac-session-login{background:#38bdf8;color:#07111f!important;margin-left:auto}",
    ".aiac-session-logout{border:1px solid #466579;background:transparent;color:#e2e8f0;cursor:pointer}",
    ".aiac-identity-note{background:#e0f2fe;border:1px solid #7dd3fc;border-radius:10px;color:#0c4a6e;font:600 13px/1.4 Arial,Helvetica,sans-serif;margin:0 0 14px;padding:10px 12px}",
    "@media(max-width:680px){.aiac-session-inner{align-items:stretch;flex-wrap:wrap}.aiac-session-state{display:none}.aiac-session-person{flex:1}.aiac-session-action{flex:1}.aiac-session-login{margin-left:auto;flex:0 0 auto}}"
  ].join("");
  document.head.appendChild(style);

  var contactFormReady = Promise.resolve();
  if (document.getElementById("contactForm")) {
    contactFormReady = new Promise(function (resolve) {
      var contactScript = document.createElement("script");
      contactScript.src = "/nouveau-site/contact-form.js";
      contactScript.onload = resolve;
      contactScript.onerror = resolve;
      document.head.appendChild(contactScript);
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>\"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function fillIdentity(profile) {
    document.querySelectorAll("form#contactForm").forEach(function (form) {
      var name = form.querySelector('[name="full_name"], [name="name"], [name="nom"]');
      var email = form.querySelector('[name="email"]');
      var phone = form.querySelector('[name="phone"], [name="tel"]');
      if (name) { name.value = profile.fullName; name.readOnly = true; }
      if (email) { email.value = profile.email; email.readOnly = true; }
      if (phone && !phone.value && profile.phone) phone.value = profile.phone;
      [name, email, phone].filter(Boolean).forEach(function (field) {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
      if (!form.querySelector(".aiac-identity-note")) {
        var note = document.createElement("p");
        note.className = "aiac-identity-note";
        note.textContent = "Vous écrivez en tant que " + profile.fullName + " (" + profile.roleLabel + "). Votre identité AIAC sera reprise automatiquement.";
        form.insertBefore(note, form.firstChild);
      }
    });
  }

  function renderAnonymous() {
    var shell = document.createElement("div");
    shell.id = "aiac-session-shell";
    shell.innerHTML = '<div class="aiac-session-inner"><b>AIAC</b><span style="color:#94a3b8;font-size:12px">Site public</span><a class="aiac-session-action aiac-session-login" href="/connexion?retour=' + encodeURIComponent(location.pathname + location.search) + '">Se connecter</a></div>';
    document.body.insertBefore(shell, document.body.firstChild);
  }

  function renderAuthenticated(data) {
    var profile = data.profile;
    var shell = document.createElement("div");
    shell.id = "aiac-session-shell";
    shell.innerHTML = '<div class="aiac-session-inner"><span class="aiac-session-avatar" aria-hidden="true">' + escapeHtml(profile.fullName.charAt(0).toUpperCase()) + '</span><span class="aiac-session-person"><b>' + escapeHtml(profile.fullName) + '</b><small>' + escapeHtml(profile.roleLabel) + '</small></span><span class="aiac-session-state">● Session active — vous naviguez en votre nom</span><a class="aiac-session-action aiac-session-workspace" href="' + escapeHtml(data.workspaceHref) + '">Mon espace de travail</a><button class="aiac-session-action aiac-session-logout" type="button">Se déconnecter</button></div>';
    document.body.insertBefore(shell, document.body.firstChild);
    fillIdentity(profile);
    shell.querySelector(".aiac-session-logout").addEventListener("click", function () {
      fetch("/api/session/logout", { method: "POST", credentials: "same-origin", redirect: "follow" })
        .then(function (response) { window.location.assign(response.url || "/connexion"); })
        .catch(function () { window.location.assign("/connexion"); });
    });
  }

  fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
    .then(function (response) { return response.ok ? response.json() : { authenticated: false }; })
    .then(function (data) {
      if (data.authenticated) {
        contactFormReady.then(function () { renderAuthenticated(data); });
      } else {
        renderAnonymous();
      }
    })
    .catch(renderAnonymous);
})();
