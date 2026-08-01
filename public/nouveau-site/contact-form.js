(function () {
  "use strict";

  const form = document.getElementById("contactForm");
  if (!form || form.dataset.aiacContactReady === "true") return;
  form.dataset.aiacContactReady = "true";

  const mailLink = form.querySelector("#aiacMailLink");
  const whatsappLink = form.querySelector("#aiacWALink");
  const nameInput = form.querySelector("#name, #nom, [name='name'], [name='nom']");
  if (!mailLink || !whatsappLink || !nameInput) return;

  const style = document.createElement("style");
  style.textContent = `
    .aiac-sender-type {
      border: 1px solid rgba(148, 163, 184, .45);
      border-radius: 12px;
      display: grid;
      gap: .65rem;
      margin: .35rem 0 .9rem;
      padding: .85rem 1rem;
    }
    .aiac-sender-type legend { font-weight: 700; padding: 0 .35rem; }
    .aiac-sender-options { display: flex; flex-wrap: wrap; gap: .65rem 1.25rem; }
    .aiac-sender-options label { align-items: center; cursor: pointer; display: flex; gap: .45rem; margin: 0; }
    .aiac-sender-options input { height: auto; margin: 0; width: auto; }
    .aiac-organisation-field[hidden] { display: none !important; }
    #aiacMailLink[aria-disabled='true'], #aiacWALink[aria-disabled='true'] { cursor: not-allowed; opacity: .65; }
  `;
  document.head.appendChild(style);

  const nameLabel = form.querySelector(`label[for='${nameInput.id}']`);
  if (nameLabel) nameLabel.textContent = "Nom et prénom de la personne";
  nameInput.name = "full_name";
  nameInput.setAttribute("required", "");
  nameInput.autocomplete = "name";
  nameInput.placeholder = "Ex. : Marie Dupont";

  const senderType = document.createElement("fieldset");
  senderType.className = "aiac-sender-type";
  senderType.innerHTML = `
    <legend>Vous écrivez à titre :</legend>
    <div class="aiac-sender-options">
      <label><input type="radio" name="sender_type" value="Particulier" required> Particulier</label>
      <label><input type="radio" name="sender_type" value="Organisation"> Organisation</label>
    </div>
  `;

  const organisationField = document.createElement("div");
  organisationField.className = "aiac-organisation-field";
  organisationField.setAttribute("hidden", "");
  organisationField.innerHTML = `
    <label for="organisation">Nom de l’organisation</label>
    <input id="organisation" name="organisation" autocomplete="organization" placeholder="Ex. : Commune, association, ONG, entreprise…">
  `;

  const insertionPoint = nameLabel || nameInput;
  form.insertBefore(senderType, insertionPoint);
  form.insertBefore(organisationField, insertionPoint);

  const organisationInput = organisationField.querySelector("input");
  const senderRadios = Array.from(senderType.querySelectorAll("input[name='sender_type']"));

  function updateSenderType() {
    const selected = senderRadios.find((radio) => radio.checked)?.value;
    const isOrganisation = selected === "Organisation";
    if (isOrganisation) {
      organisationField.removeAttribute("hidden");
      organisationInput.setAttribute("required", "");
    } else {
      organisationField.setAttribute("hidden", "");
      organisationInput.removeAttribute("required");
    }
    if (!isOrganisation) organisationInput.value = "";
    updateLinks();
  }

  function getValue(...selectors) {
    for (const selector of selectors) {
      const field = form.querySelector(selector);
      if (field && typeof field.value === "string") return field.value.trim();
    }
    return "";
  }

  function getSenderType() {
    return senderRadios.find((radio) => radio.checked)?.value || "Non renseigné";
  }

  function buildMessage() {
    const pageName = document.title.split("|")[0].trim();
    const sender = getSenderType();
    const organisation = organisationInput.value.trim();
    const requestType = getValue("#type", "[name='type']");
    const fullName = nameInput.value.trim();
    const email = getValue("#email", "[name='email']");
    const phone = getValue("#phone", "#tel", "[name='phone']", "[name='tel']");
    const subject = getValue("#subject", "#objet", "[name='subject']", "[name='objet']");
    const message = getValue("#message", "[name='message']");
    const pageUrl = `${window.location.origin}${window.location.pathname}`;

    const lines = [
      `Formulaire de contact – ${pageName}`,
      "",
      `Qualité : ${sender}`,
      `Nom et prénom : ${fullName || "Non renseigné"}`,
      `Organisation : ${sender === "Organisation" ? organisation || "Non renseignée" : "Non applicable"}`,
      ...(requestType ? [`Type de demande : ${requestType}`] : []),
      `E-mail : ${email || "Non renseigné"}`,
      `Téléphone / WhatsApp : ${phone || "Non renseigné"}`,
      `Objet : ${subject || "Contact depuis le site AIAC"}`,
      "",
      "Message :",
      message || "Non renseigné",
      "",
      `Page concernée : ${pageUrl}`
    ];

    return {
      body: lines.join("\n"),
      subject: `[Contact site AIAC] ${subject || pageName}`
    };
  }

  function updateLinks() {
    const content = buildMessage();
    mailLink.href = `mailto:pca@aiac-cm.org?cc=${encodeURIComponent("siege@aiac-cm.org")}&subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(content.body)}`;
    whatsappLink.href = `https://wa.me/237671310883?text=${encodeURIComponent(`Bonjour AIAC,\n\n${content.body}`)}`;
  }

  function prepareSend(event) {
    updateLinks();
    if (!form.checkValidity()) {
      event.preventDefault();
      form.reportValidity();
      form.querySelector(":invalid")?.focus();
      return;
    }
    event.currentTarget.setAttribute("aria-disabled", "true");
    window.setTimeout(() => event.currentTarget.removeAttribute("aria-disabled"), 1200);
  }

  form.querySelectorAll("a[href^='mailto:']:not(#aiacMailLink), a[href*='wa.me/']:not(#aiacWALink), #mailtoBtn")
    .forEach((duplicate) => {
      duplicate.setAttribute("hidden", "");
      duplicate.setAttribute("aria-hidden", "true");
      duplicate.tabIndex = -1;
    });

  const helper = form.querySelector(".contact-actions + p");
  if (helper) helper.textContent = "Les deux boutons reprennent automatiquement toutes les informations du formulaire.";

  senderRadios.forEach((radio) => radio.addEventListener("change", updateSenderType));
  form.addEventListener("input", updateLinks);
  form.addEventListener("change", updateLinks);
  mailLink.addEventListener("click", prepareSend);
  whatsappLink.addEventListener("click", prepareSend);

  updateLinks();
})();
