(async function () {
  "use strict";

  // Legacy single-template key from before the Messages tab supported multiple,
  // named messages - read once below to migrate anyone's saved text forward.
  const LEGACY_MESSAGE_TEMPLATE_KEY = "wpd-message-template";
  const MESSAGES_KEY = "wpd-messages";
  const ACTIVE_MESSAGE_KEY = "wpd-active-message-id";

  function makeMessageId() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // messages: [{ id, messageName, messageText, formLink }, ...] - always at least one entry.
  // formLink is an optional Google Form prefilled link - when set, Copy Message
  // also submits a response to that form (see submitToGoogleForm).
  let messages = [];
  let activeMessageId = "";
  try {
    const stored = JSON.parse(localStorage.getItem(MESSAGES_KEY) || "null");
    if (Array.isArray(stored) && stored.length) {
      messages = stored.map((m) => ({
        id: (m && m.id) || makeMessageId(),
        messageName: (m && m.messageName) || "Message",
        messageText: (m && m.messageText) || "",
        formLink: (m && m.formLink) || ""
      }));
    }
  } catch (e) {
    messages = [];
  }
  if (!messages.length) {
    let legacyText = "";
    try {
      legacyText = localStorage.getItem(LEGACY_MESSAGE_TEMPLATE_KEY) || "";
    } catch (e) {
      legacyText = "";
    }
    messages = [{ id: makeMessageId(), messageName: "Message 1", messageText: legacyText, formLink: "" }];
  }
  try {
    activeMessageId = localStorage.getItem(ACTIVE_MESSAGE_KEY) || "";
  } catch (e) {
    activeMessageId = "";
  }
  if (!messages.some((m) => m.id === activeMessageId)) {
    activeMessageId = messages[0].id;
  }

  function getActiveMessage() {
    return messages.find((m) => m.id === activeMessageId) || messages[0];
  }

  function messagesHaveContent() {
    return messages.some((m) => m.messageText.trim().length > 0);
  }

  function saveMessages() {
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
      localStorage.setItem(ACTIVE_MESSAGE_KEY, activeMessageId);
    } catch (e) {
      // localStorage may be unavailable - messages just won't persist
    }
  }

  // Staged data from the Messages tab's Import Values controls (paste/upload/example) -
  // transient (not persisted), survives closing/reopening the instructions modal within
  // the same page load, like the rest of the grid's session-only settings.
  let importedHeaders = [];
  let importedRows = [];
  let importedMemberIdIndex = -1;

  function getUnitInfo() {
    for (const input of document.querySelectorAll("input")) {
      if (input.type === "hidden" && !isNaN(input.value) && input.value !== "") {
        return {
          number: input.value,
          name: input.nextElementSibling ? input.nextElementSibling.innerText : "Unit"
        };
      }
    }
    return null;
  }

  async function loadMembers(unitNumber) {
    const url = `https://directory.churchofjesuschrist.org/api/v4/households?unit=${unitNumber}`;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`Failed to load household directory (status ${response.status})`);
    }
    const households = await response.json();
    const members = [];
    for (const household of households) {
      for (const member of household.members) {
        member.address = household.address;
        member.coordinates = household.coordinates;
        member.random = Math.random();
        members.push(member);
      }
    }
    return members;
  }

  function normalizeAddress(address) {
    return (address || "").replace(/\s*\n\s*/g, ", ").trim();
  }

  function makeCard(member) {
    const callings = [];
    let callingLabel = "";
    if (member.positions) {
      for (const calling of member.positions) {
        callings.push(calling.positionTypeName);
      }
      callingLabel = callings.length === 1 ? "Calling" : "Callings";
    }
    const addressAttr = normalizeAddress(member.address).replace(/"/g, "&quot;");

    return `
<div class="card" id="${member.uuid}" draggable="false" data-address="${addressAttr}">
    <div class="photo">
        <img class="photo-img" draggable="false" src="https://directory.churchofjesuschrist.org/api/v4/photos/members/${member.uuid}">
    </div>
    <div class="name-container">
      <div class="name">
        ${member.displayName}
      </div>
    </div>
    <div class='data' style="display:none">
      <div class="data-label">${member.phone ? "Phone" : ""}</div>
      <div class="data-item">${member?.phone?.number || ""}</div>
      <div class="data-label">${member.email ? "Email" : ""}</div>
      <div class="data-item">${member?.email?.email || ""}</div>
      <div class="data-label">${member.address ? "Address" : ""}</div>
      <div class="data-item">${member?.address?.replace("\n", "<br>") || ""}</div>
      <div class="data-label">${callingLabel}</div>
      <div class="data-item">${callings.join("<br>")}</div>
      ${cardActionsHTML(member.uuid)}
    </div>
</div>`;
  }

  const CARD_ICONS = {
    copy: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
    delete: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 7h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>',
    lcr: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 3v2h3.59L9.17 13.41l1.41 1.41L19 6.41V10h2V3h-7zM5 5h6V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6h-2v6H5V5z"/></svg>',
    paste: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>',
    message: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6.83L4 18.83V4h16v12z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>'
  };

  function cardActionsHTML(uuid) {
    const messageButton = messagesHaveContent()
      ? `<button type="button" class="card-icon-btn" data-card-action="copy-message" title="Copy Message (Ctrl+click to choose which one)" aria-label="Copy Message">${CARD_ICONS.message}</button>`
      : "";
    return `
    <div class="card-toolbar">
      <button type="button" class="card-icon-btn" data-card-action="copy" title="Copy Card" aria-label="Copy Card">${CARD_ICONS.copy}</button>
      ${messageButton}
      <button type="button" class="card-icon-btn" data-card-action="paste-before" title="Paste Card Before" aria-label="Paste Card Before">${CARD_ICONS.paste}</button>
      <button type="button" class="card-icon-btn" data-card-action="delete" title="Delete Card" aria-label="Delete Card">${CARD_ICONS.delete}</button>
      <a class="card-icon-btn" data-card-action="open-lcr" href="https://lcr.churchofjesuschrist.org/mlt/records/member-profile/${uuid}" target="_blank" rel="noopener noreferrer" title="Open in LCR" aria-label="Open in LCR">${CARD_ICONS.lcr}</a>
    </div>`;
  }

  function fillTemplate(template, params) {
    return template.replace(/<([A-Z0-9 ]+)>/g, (match, rawTag) => {
      const key = rawTag.trim();
      return Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match;
    });
  }

  function labelToTag(label) {
    return (label || "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Reads label/value pairs out of a card's .imported-fields/.roommate-fields blocks
  // (added by Apply Values and Group By Address respectively) so they can show up as
  // message tags too, even though they're DOM-only and not part of the member record.
  function getCardExtraDetails(card) {
    const details = [];
    const dataDiv = card.querySelector(".data");
    if (!dataDiv) return details;
    for (const block of dataDiv.querySelectorAll(".imported-fields, .roommate-fields")) {
      const labels = block.querySelectorAll(".data-label");
      const items = block.querySelectorAll(".data-item");
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i].textContent.trim();
        if (!label) continue;
        const item = items[i];
        const value = item ? (item.dataset.rawValue ?? item.textContent) : "";
        details.push({ label, value });
      }
    }
    return details;
  }

  function getMessageParams(member, card) {
    const callings = member.positions ? member.positions.map((p) => p.positionTypeName) : [];
    const params = {
      "FULL NAME": member.displayName || "",
      "FIRST NAME": member.givenName || "",
      "LAST NAME": member.surname || "",
      "PHONE": member?.phone?.number || "",
      "EMAIL": member?.email?.email || "",
      "ADDRESS": normalizeAddress(member.address),
      "CALLINGS": callings.join(", ")
    };
    if (card) {
      for (const detail of getCardExtraDetails(card)) {
        const key = labelToTag(detail.label);
        if (key && !(key in params)) {
          params[key] = detail.value;
        }
      }
    }
    return params;
  }

  function getAvailableMessageTags() {
    const tags = ["FULL NAME", "FIRST NAME", "LAST NAME", "PHONE", "EMAIL", "ADDRESS", "CALLINGS"];
    const seen = new Set(tags);
    for (const card of document.querySelectorAll(".card")) {
      for (const detail of getCardExtraDetails(card)) {
        const key = labelToTag(detail.label);
        if (key && !seen.has(key)) {
          seen.add(key);
          tags.push(key);
        }
      }
    }
    return tags;
  }

  function refreshMessageButtons() {
    const shouldShow = messagesHaveContent();
    for (const toolbar of document.querySelectorAll(".card-toolbar")) {
      const existing = toolbar.querySelector('[data-card-action="copy-message"]');
      if (shouldShow && !existing) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "card-icon-btn";
        btn.dataset.cardAction = "copy-message";
        btn.title = "Copy Message (Ctrl+click to choose which one)";
        btn.setAttribute("aria-label", "Copy Message");
        btn.innerHTML = CARD_ICONS.message;
        const copyBtn = toolbar.querySelector('[data-card-action="copy"]');
        if (copyBtn) {
          copyBtn.after(btn);
        } else {
          toolbar.prepend(btn);
        }
      } else if (!shouldShow && existing) {
        existing.remove();
      }
    }
  }

  // Character-by-character parser so quoted fields (commas/newlines inside a quoted CSV
  // cell, e.g. from an Excel/Sheets export) are handled correctly for both comma- and
  // tab-delimited input.
  function parseDelimitedText(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    const len = text.length;
    while (i < len) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (ch === "\r") {
        i++;
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  }

  // Requires a header row, at least one data row, at least two columns, and a column
  // whose header reduces to "memberid" (lowercased, spaces removed) - returns null if
  // the text doesn't look usable.
  function parseImportTable(text, delimiter) {
    const rows = parseDelimitedText(text, delimiter);
    if (rows.length < 2) return null;
    const headers = rows[0];
    if (headers.length < 2) return null;
    const memberIdIndex = headers.findIndex(
      (h) => (h || "").toLowerCase().replace(/\s+/g, "") === "memberid"
    );
    if (memberIdIndex === -1) return null;
    const dataRows = rows.slice(1).filter((r) => r.some((c) => (c || "").trim() !== ""));
    if (!dataRows.length) return null;
    return { headers, rows: dataRows, memberIdIndex };
  }

  function inferDisplayName(uuid, details) {
    const nameDetail = details.find((d) => /name/i.test(d.label));
    return nameDetail && nameDetail.value ? nameDetail.value : uuid;
  }

  function escapeAttr(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  // data-raw-value carries the exact plain-text value (e.g. with real linefeeds, before
  // any <br> conversion) so message-tag extraction doesn't have to reverse-engineer it
  // from the rendered HTML.
  function detailsPairsHtml(details) {
    return details
      .map(
        (d) =>
          `<div class="data-label">${d.label}</div><div class="data-item" data-raw-value="${escapeAttr(d.value)}">${d.value}</div>`
      )
      .join("");
  }

  // Inserts (or replaces, if run before) a block of imported columns just before a
  // card's toolbar, alongside whatever fields already show on that card's back.
  function applyImportedFieldsToCard(card, details) {
    const dataDiv = card.querySelector(".data");
    const toolbar = dataDiv.querySelector(".card-toolbar");
    const old = dataDiv.querySelector(".imported-fields");
    if (old) old.remove();
    const wrapper = document.createElement("div");
    wrapper.className = "imported-fields";
    wrapper.innerHTML = detailsPairsHtml(details);
    dataDiv.insertBefore(wrapper, toolbar);
  }

  // Used only for a Member ID with no existing card - there's no household data for it,
  // so its back is just the imported columns.
  function buildImportedCardHtml(uuid, displayName, details) {
    return `
<div class="card" id="${uuid}" draggable="false">
    <div class="photo">
        <img class="photo-img" draggable="false" src="https://directory.churchofjesuschrist.org/api/v4/photos/members/${uuid}">
    </div>
    <div class="name-container">
      <div class="name">
        ${displayName}
      </div>
    </div>
    <div class='data' style="display:none">
      <div class="imported-fields">${detailsPairsHtml(details)}</div>
      ${cardActionsHTML(uuid)}
    </div>
</div>`;
  }

  function applyImportedValues(clearExistingFirst, createForUnmatched) {
    if (!importedRows.length) {
      alert("There's no imported data to apply yet. Paste, upload, or load example data first.");
      return false;
    }
    ungroupByAddress();
    const directory = tag("directory");
    if (clearExistingFirst) {
      for (const card of directory.querySelectorAll(".card")) card.remove();
    }
    for (const row of importedRows) {
      const uuid = (row[importedMemberIdIndex] || "").trim();
      if (!uuid) continue;
      const details = importedHeaders
        .map((label, i) => ({ label, value: row[i] || "" }))
        .filter((_, i) => i !== importedMemberIdIndex);
      const addressDetail = details.find((d) => /address/i.test(d.label));
      const existing = Array.from(directory.querySelectorAll(".card")).find(
        (c) => c.id.toLowerCase() === uuid.toLowerCase()
      );
      if (existing) {
        applyImportedFieldsToCard(existing, details);
        if (addressDetail) existing.dataset.address = normalizeAddress(addressDetail.value);
      } else if (createForUnmatched) {
        const displayName = inferDisplayName(uuid, details);
        const wrapper = document.createElement("div");
        wrapper.innerHTML = buildImportedCardHtml(uuid, displayName, details);
        const newCard = wrapper.firstElementChild;
        if (addressDetail) newCard.dataset.address = normalizeAddress(addressDetail.value);
        directory.appendChild(newCard);
        const img = newCard.querySelector(".photo-img");
        if (img) wireImageFallback(img);
      }
    }
    return true;
  }

  function getMenu() {
    return `
    <div id="burger" style="cursor: pointer">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 35px; height: 35px;" id="hamburger-icon"><path d="M4 7.75c0-.414.334-.75.75-.75h14.5a.749.749 0 1 1 0 1.5H4.75A.748.748 0 0 1 4 7.75zm0 4c0-.414.334-.75.75-.75h14.5a.749.749 0 1 1 0 1.5H4.75a.748.748 0 0 1-.75-.75zm0 4c0-.414.334-.75.75-.75h14.5a.749.749 0 1 1 0 1.5H4.75a.748.748 0 0 1-.75-.75z" fill="currentColor"></path></svg>
    </div>
    <div id="menu" class="slide" style="left: -210px;">
        <div id="menu-close" class="menu-item">
        <svg id="closeIcon" fill="inherit" style="width: 35px; height: 35px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11.4 13.06l4.596 4.597a.749.749 0 101.06-1.06L12.461 12l4.596-4.596a.749.749 0 10-1.06-1.06L11.4 10.939 6.804 6.343a.749.749 0 10-1.06 1.06L10.339 12l-4.596 4.596a.749.749 0 101.06 1.06l4.597-4.595z"></path></svg>
        </div>
        <div id="menu-show-instructions" class="menu-item">Show Instructions &amp; Tools</div>
        <div id="menu-download-csv" class="menu-item">Download CSV</div>
        <div id="menu-hide-names" class="menu-item">Hide Names</div>
        <div id="menu-show-names" class="menu-item">Show Names</div>
        <div id="menu-hide-missing" class="menu-item">Hide Missing Photos</div>
        <div id="menu-hide-unflipped" class="menu-item">Hide Members not Flipped</div>
        <div id="menu-group-address" class="menu-item">Group By Address</div>
        <div id="menu-ungroup-address" class="menu-item" style="display:none">Ungroup By Address</div>
        <div id="menu-shuffle" class="menu-item">Shuffle</div>
        <div id="menu-paste-card" class="menu-item">Paste Copied Card</div>
    </div>
    `;
  }

  function getStyle() {
    return `
    html, body {
      overflow-y: auto !important;
      height: auto !important;
    }
    body {
      font-family: sans-serif;
      margin: 0;
      background-color: rgb(221, 221, 221);
    }
    h1 { color: #333; }
    #header{
      font-size:30px;
      padding:20px;
      text-align:center;
      cursor: default;
    }
    #directory{
      display: flex;
      flex-wrap: wrap;
      padding: 5px;
      gap: 5px;
      place-content: flex-start center;
      box-sizing: border-box;
    }
    .card{
      height: 250px;
      margin: 2px;
      background-color: white;
      box-sizing: border-box;
      flex: 0 0 200px;
      border-radius: 8px;
      text-align: center;
      cursor:pointer;
      overflow:auto
    }
    .card.dragging{
      opacity: 0.4;
    }
    .address-group{
      display: flex;
      flex-direction: column;
      align-items: stretch;
      margin: 2px;
      padding: 8px 8px 0 8px;
      background-color: darkslategray;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .address-group-cards{
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: center;
    }
    .address-bar-container{
      display: table;
      width: 100%;
      margin-top: 8px;
      padding: 3px 0;
      box-sizing: border-box;
    }
    .address-bar{
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      font-weight: bold;
      font-size: 13px;
      padding: 0 10px;
      color: #fff;
    }
    .photo{
      height: 200px;
      overflow: hidden;
    }
    .photo img{
      width: 200px;
      border-radius: 7px 7px 0 0;
    }
    .name-container{
      display: table;
      height:49px;
      width:100%;
    }
    .name{
      display: table-cell;
      vertical-align: middle;
      text-align:center;
    }
    .data-label{
      margin-top:10px;
      font-weight:bold;
      font-size:12px;
    }
    .data-item{
      color:#333;
      max-with:200px;
      font-size:12px;
    }
    .card-toolbar{
      margin-top:10px;
      display:flex;
      background:darkslategray;
      color:#fff;
    }
    .card-icon-btn{
      flex:1;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      height:32px;
      padding:0;
      border:none;
      background:transparent;
      color:#fff;
      cursor:pointer;
      text-decoration:none;
    }
    .card-icon-btn:hover{
      background:rgba(255,255,255,0.15);
    }
    .card-icon-btn:visited{
      color:#fff;
    }
    .card-icon-btn svg{
      pointer-events:none;
    }
    .imported-fields{
      margin-top:8px;
      padding-top:6px;
      border-top:1px dashed #ccc;
    }
    .roommate-fields{
      margin-top:8px;
      padding-top:6px;
      border-top:1px dashed #ccc;
    }
    #burger{
      height:20px;
      padding: 5px;
      position: fixed;
      left: 0;
      top: 0;
    }
    #wpd-close-grid{
      position: fixed;
      top: 0;
      right: 0;
      padding: 8px 14px;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      color: #333;
      z-index: 11;
      user-select: none;
    }
    #wpd-close-grid:hover{
      color: #000;
    }
    #menu{
      color:#333;
      background-color:#eee;
      max-height:100vh;
      position:fixed;
      width: 200px;
      top: 0;
      padding: 5px;
      z-index:10;
      overflow:auto;
    }
    .selected{
      background-color:lightblue;
      color:darkblue;
    }
    .menu-item{
      cursor:pointer;
      color:#333;
      padding:6px 10px;
    }
    .menu-item:hover{
      background-color:lightblue;
      color:darkblue;
    }
    .menu-item a{
      text-decoration:none;
      color:#333;
    }
    .slide {
      transition: .5s;
      left: 0;
    }
    .hang {
      text-indent: -1em;
      margin-left: 1em;
    }
    @media print {
      #burger, #menu, .card-toolbar, .wpd-instructions-overlay, #wpd-close-grid { display: none !important; }
      body, .card, .address-group {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .card {
        border: 1px solid #000;
        height: auto;
        overflow: visible;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .address-group {
        border: 1px solid #000;
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
    `;
  }

  // ---- Interactive behavior, wired up with addEventListener instead of
  // inline <script>/onclick/onerror markup so it isn't blocked by the
  // directory site's Content-Security-Policy (no 'unsafe-inline'). ----

  function tag(id) {
    return document.getElementById(id);
  }

  function flipCard(card) {
    card.querySelector(".name").style.display = "";
    const photo = card.querySelector(".photo");
    const data = card.querySelector(".data");
    if (data.style.display === "none") {
      photo.style.display = "none";
      data.style.display = "";
    } else {
      photo.style.display = "";
      data.style.display = "none";
    }
  }

  function handleCardClick(evt) {
    const actionBtn = evt.target.closest("[data-card-action]");
    if (actionBtn) {
      const card = actionBtn.closest(".card");
      if (!card) return;
      if (actionBtn.dataset.cardAction === "copy") {
        copyCardToClipboard(card, actionBtn);
      } else if (actionBtn.dataset.cardAction === "copy-message") {
        copyMessageForCard(card, actionBtn, evt);
      } else if (actionBtn.dataset.cardAction === "paste-before") {
        pasteCardBefore(card);
      } else if (actionBtn.dataset.cardAction === "delete") {
        card.remove();
      }
      return;
    }

    const card = evt.target.closest(".card");
    if (!card) return;

    if (evt.ctrlKey) {
      card.remove();
      return;
    }
    if (evt.altKey) {
      tag("directory").appendChild(card);
      return;
    }

    const selection = window.getSelection();
    const currentSelectionLength = selection.toString().length;
    // A selection already present when the mouse went down (and unchanged
    // since) is leftover from an earlier interaction, not something the
    // user is selecting right now - a click should flip the card and clear
    // it. A selection that grew or changed during this click (a
    // click-and-drag to highlight text) should not flip the card.
    const selectionWasJustMade =
      currentSelectionLength > 0 && currentSelectionLength !== selectionLengthOnMouseDown;
    if (!selectionWasJustMade) {
      if (currentSelectionLength > 0) {
        selection.removeAllRanges();
      }
      flipCard(card);
    }
  }

  let draggedCard = null;
  let selectionLengthOnMouseDown = 0;

  // Cards are only made draggable on mousedown when the press started on
  // the photo (or its "Image not available" fallback) - this keeps clicks,
  // text selection, and toolbar buttons on the flipped-over back of a card
  // from accidentally starting a drag.
  function handleCardMouseDown(evt) {
    const card = evt.target.closest(".card");
    if (!card) return;
    card.draggable = Boolean(evt.target.closest(".photo"));
    selectionLengthOnMouseDown = window.getSelection().toString().length;
  }

  function handleDragStart(evt) {
    const card = evt.target.closest(".card");
    if (!card) return;
    draggedCard = card;
    evt.dataTransfer.effectAllowed = "move";
    evt.dataTransfer.setData("text/plain", card.id);
    card.classList.add("dragging");
  }

  function handleDragOver(evt) {
    if (!draggedCard) return;
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";

    const target = evt.target.closest(".card");
    if (target && target !== draggedCard) {
      const rect = target.getBoundingClientRect();
      const isAfter = evt.clientX - rect.left > rect.width / 2;
      if (isAfter) {
        target.after(draggedCard);
      } else {
        target.before(draggedCard);
      }
    } else if (evt.target === tag("directory")) {
      tag("directory").appendChild(draggedCard);
    }
  }

  function handleDrop(evt) {
    evt.preventDefault();
  }

  function handleDragEnd() {
    if (draggedCard) draggedCard.classList.remove("dragging");
    draggedCard = null;
  }

  function handleImageError(imgElement) {
    const container = imgElement.parentElement;
    container.style.backgroundColor = "#bbb";
    container.innerHTML = "<div class='no-image'><br><br><br><br>Image<br>not<br>Available</div>";
  }

  function wireImageFallback(img) {
    img.addEventListener("error", function () { handleImageError(this); }, { once: true });
  }

  function wireImageFallbacks() {
    for (const img of document.querySelectorAll(".photo-img")) {
      wireImageFallback(img);
    }
  }

  function flashCopiedFeedback(button) {
    if (!button) return;
    const originalTitle = button.getAttribute("title");
    const originalHTML = button.innerHTML;
    button.setAttribute("title", "Copied!");
    button.setAttribute("aria-label", "Copied!");
    button.innerHTML = CARD_ICONS.check;
    setTimeout(() => {
      button.setAttribute("title", originalTitle);
      button.setAttribute("aria-label", originalTitle);
      button.innerHTML = originalHTML;
    }, 1200);
  }

  function copyCardToClipboard(card, button) {
    navigator.clipboard.writeText(card.outerHTML).then(
      () => flashCopiedFeedback(button),
      () => alert("Couldn't copy the card to the clipboard.")
    );
  }

  // Reduces a form question's placeholder answer (e.g. "Individual Phone",
  // possibly URL-encoded) and a card field's label to the same normalized form
  // so they can be matched regardless of casing/spacing differences.
  function normalizeFieldKey(text) {
    let value = String(text || "");
    try {
      value = decodeURIComponent(value.replace(/\+/g, " "));
    } catch (e) {
      // already decoded, or not validly encoded - use as-is
    }
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  // Reads a Google Forms prefilled link (from "Get pre-filled link") and returns
  // the formResponse submission URL plus each entry's id and placeholder answer
  // text (the thing to match against card fields), or null if it's not one.
  function parseGoogleFormLink(link) {
    let url;
    try {
      url = new URL(link.trim());
    } catch (e) {
      return null;
    }
    if (!/(^|\.)docs\.google\.com$/.test(url.hostname)) return null;

    const entries = [];
    for (const [key, value] of url.searchParams) {
      const m = key.match(/^entry\.(\d+)$/);
      if (m) entries.push({ entryId: m[1], placeholder: value });
    }
    if (!entries.length) return null;

    let pathname = url.pathname;
    if (pathname.endsWith("/viewform")) {
      pathname = pathname.slice(0, -"/viewform".length) + "/formResponse";
    } else if (!pathname.endsWith("/formResponse")) {
      pathname = pathname.replace(/\/[^/]*$/, "/formResponse");
    }

    return { actionUrl: url.origin + pathname, entries };
  }

  // Submits a Google Form response as a GET request opened in a small,
  // auto-closed window (see submitToGoogleForm callers) using a prefilled
  // link only to learn which entry id goes with which card field - the
  // actual values come from this member's card. A question that isn't one
  // of the special keys or a card field just resubmits its own prefilled
  // placeholder text verbatim, so it can carry a fixed default answer.
  function submitToGoogleForm(formLink, member, card, messageText, messageName) {
    const parsed = parseGoogleFormLink(formLink);
    if (!parsed) {
      console.warn(
        "Ward Directory: Google Form link didn't parse, so nothing was submitted. " +
          "Make sure it's the full prefilled link (starts with https://docs.google.com/forms/..." +
          "/viewform and has at least one entry.<number>=... parameter) - a shortened forms.gle link won't work.",
        formLink
      );
      return;
    }

    const params = getMessageParams(member, card);
    const normalizedParams = {};
    for (const key of Object.keys(params)) {
      normalizedParams[normalizeFieldKey(key)] = params[key];
    }

    // A POST via a hidden iframe would need frame-src permission to load
    // docs.google.com, which churchofjesuschrist.org's CSP doesn't grant
    // (and we have no host permission to change that). A GET submitted as
    // a normal top-level navigation isn't subject to that restriction, so
    // we open it in a reused named window instead of a hidden iframe.
    const query = new URLSearchParams();
    for (const entry of parsed.entries) {
      const key = normalizeFieldKey(entry.placeholder);
      let value;
      if (key === "name") {
        value = member.displayName || "";
      } else if (key === "message") {
        value = messageText || "";
      } else if (key === "memberid") {
        value = member.uuid || "";
      } else if (key === "messagetitle") {
        value = messageName || "";
      } else if (Object.prototype.hasOwnProperty.call(normalizedParams, key)) {
        value = normalizedParams[key];
      } else {
        value = entry.placeholder;
      }
      query.append("entry." + entry.entryId, value);
    }

    const submitUrl = parsed.actionUrl + "?" + query.toString();
    const submitWindow = window.open(submitUrl, "wpd-form-submit-target", "width=300,height=300");
    if (!submitWindow) {
      console.warn(
        "Ward Directory: couldn't open the Google Form submission window - " +
          "the browser's popup blocker may have stopped it. Allow popups for this site to use Copy Message with a form link."
      );
      return;
    }
    // Give the navigation time to reach Google's server before closing it -
    // there's no load event we can trust across origins to signal "done".
    setTimeout(() => {
      try {
        submitWindow.close();
      } catch (e) {
        // ignore - window may already be closed
      }
    }, 1500);
  }

  function performCopyMessage(message, card, button) {
    const members = JSON.parse(sessionStorage.getItem("members") || "[]");
    const member = members.find((m) => m.uuid === card.id);
    if (!member) {
      alert("Couldn't find this member's data to build the message.");
      return;
    }
    const filled = fillTemplate(message.messageText, getMessageParams(member, card));
    if (message.formLink && message.formLink.trim()) {
      submitToGoogleForm(message.formLink.trim(), member, card, filled, message.messageName);
    }
    navigator.clipboard.writeText(filled).then(
      () => flashCopiedFeedback(button),
      () => alert("Couldn't copy the message to the clipboard.")
    );
  }

  function copyMessageForCard(card, button, evt) {
    if (!messagesHaveContent()) return;
    if (evt && evt.ctrlKey) {
      showMessagePicker(card, button);
      return;
    }
    closeMessagePicker();
    const active = getActiveMessage();
    if (!active.messageText.trim()) return;
    performCopyMessage(active, card, button);
  }

  let messagePickerEl = null;
  let messagePickerButton = null;

  function closeMessagePicker() {
    if (messagePickerEl) {
      messagePickerEl.remove();
      messagePickerEl = null;
    }
    messagePickerButton = null;
  }

  function showMessagePicker(card, button) {
    closeMessagePicker();
    const candidates = messages.filter((m) => m.messageText.trim());
    if (!candidates.length) return;

    const rect = button.getBoundingClientRect();
    const picker = document.createElement("div");
    picker.style.cssText =
      "position:fixed;background:#fff;border:1px solid #ccc;border-radius:6px;" +
      "box-shadow:0 4px 12px rgba(0,0,0,0.25);z-index:2147483647;min-width:160px;" +
      "max-height:240px;overflow:auto;font-family:sans-serif;font-size:13px;padding:4px;";
    picker.style.top = rect.bottom + 4 + "px";
    picker.style.left = rect.left + "px";

    for (const message of candidates) {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = message.messageName || "(untitled)";
      item.style.cssText =
        "display:block;width:100%;text-align:left;padding:6px 10px;border:none;" +
        "background:none;cursor:pointer;color:#222;border-radius:4px;";
      item.addEventListener("mouseenter", () => {
        item.style.background = "#eef";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "none";
      });
      item.addEventListener("click", (clickEvt) => {
        clickEvt.stopPropagation();
        closeMessagePicker();
        performCopyMessage(message, card, button);
      });
      picker.appendChild(item);
    }

    document.body.appendChild(picker);
    messagePickerEl = picker;
    messagePickerButton = button;
  }

  function handleOutsideMessagePickerClick(evt) {
    if (!messagePickerEl) return;
    if (messagePickerEl.contains(evt.target)) return;
    if (messagePickerButton && messagePickerButton.contains(evt.target)) return;
    closeMessagePicker();
  }

  async function readPastedCardFromClipboard() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      text = "";
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = text;
    const pastedCard = wrapper.querySelector(".card");

    const looksLikeCard =
      pastedCard &&
      pastedCard.querySelector(".photo") &&
      pastedCard.querySelector(".name-container") &&
      pastedCard.querySelector(".data");

    if (!looksLikeCard) {
      alert('That doesn\'t look like a copied member card. Flip a card over and choose "Copy Card" first, then try pasting again.');
      return null;
    }

    const photo = pastedCard.querySelector(".photo");
    const data = pastedCard.querySelector(".data");
    if (photo) photo.style.display = "";
    if (data) data.style.display = "none";

    const img = pastedCard.querySelector(".photo-img");
    if (img) wireImageFallback(img);

    return pastedCard;
  }

  async function pasteCardFromClipboard() {
    showMenu(false);
    const pastedCard = await readPastedCardFromClipboard();
    if (!pastedCard) return;
    tag("directory").appendChild(pastedCard);
    pastedCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function pasteCardBefore(targetCard) {
    const pastedCard = await readPastedCardFromClipboard();
    if (!pastedCard) return;
    targetCard.before(pastedCard);
    pastedCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  let menuIsOpen = false;

  function showMenu(show = true) {
    menuIsOpen = show;
    tag("menu").style.left = show ? "0" : "-210px";
  }

  const INSTRUCTIONS_HTML = `
    <h3>What this does</h3>
    <p>Turns the member list at <code>directory.churchofjesuschrist.org</code>
    (or a member table on lcr.churchofjesuschrist.org) into a photo
    grid you can browse, flip through, reorder, and export.</p>

    <h3>Adding photos to tables on Leader and Clerk Tools (LCR)</h3>
    <p>Click the toolbar icon while viewing a member list on
    <code>lcr.churchofjesuschrist.org</code> (or any other
    churchofjesuschrist.org page with a table whose rows include a member
    id) and you'll be asked to choose:</p>
    <ul>
      <li><strong>Show Image Cards</strong> — rewrites the current page as a
        photo grid built from that table, just like this one.</li>
      <li><strong>Insert Images</strong> — instead adds a "Photo" column as
        the first column of every table on the page, right where you
        already are. Choose Small, Medium, or Large for the photo size.
        Running it again replaces any Photo column from a previous run
        instead of adding a duplicate.</li>
    </ul>

    <h3>Using the grid</h3>
    <ul>
      <li><strong>Click</strong> a card to flip it between photo and details.</li>
      <li><strong>Drag</strong> a card to reorder it anywhere in the grid.</li>
      <li><kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click a card to remove it.</li>
      <li><kbd>Alt</kbd>/<kbd>Option</kbd>+click a card to move it to the end.</li>
      <li>Flip a card over to find a toolbar of icon buttons: <strong>Copy
        Card</strong> (copies that card's data to the clipboard),
        <strong>Copy Message</strong> (only shown once you've written a
        message in the <strong>Messages</strong> tab of this dialog — copies
        that member's filled-in version of whichever message tab is active
        to the clipboard; <kbd>Ctrl</kbd>+click it to pick a different
        message from a list instead),
        <strong>Paste Card Before</strong> (inserts a card you copied
        earlier just before this one), <strong>Delete Card</strong>, and
        <strong>Open in LCR</strong> (opens that member's profile on Leader
        and Clerk Resources in a new tab). Hover an icon to see what it
        does.</li>
    </ul>

    <h3>The menu (hamburger icon, top left)</h3>
    <ul>
      <li><strong>Download CSV</strong> — exports the current member list.</li>
      <li><strong>Show/Hide Names</strong> — toggles the name label under each photo.</li>
      <li><strong>Hide Missing Photos</strong> — removes cards without a usable photo.</li>
      <li><strong>Hide Members not Flipped</strong> — keeps only cards you've
        flipped (turning them back to the photo side), removing the rest.</li>
      <li><strong>Group By Address</strong> — groups cards that share the
        same address into a larger box with an address bar along the
        bottom.</li>
      <li><strong>Ungroup By Address</strong> — undoes grouping, returning
        cards to the regular grid.</li>
      <li><strong>Shuffle</strong> — randomizes the card order.</li>
      <li><strong>Paste Copied Card</strong> — appends a card you copied
        earlier (with Copy Card) to the end of the grid. If the clipboard
        doesn't hold a copied card, it tells you to flip one over and copy it
        first.</li>
    </ul>
    <p>Click anywhere outside the menu to close it.</p>
    <p>Click the <strong>✕</strong> in the top right corner of the page to
    close the grid and restore the original page underneath it.</p>

    <h3>Printing</h3>
    <p>Use your browser's normal print shortcut (<kbd>Ctrl</kbd>+<kbd>P</kbd>
    or <kbd>Cmd</kbd>+<kbd>P</kbd>) to print the grid, or save it as a PDF
    from the print dialog. The menu, hamburger icon, and Copy/Delete buttons
    are hidden automatically in the printed output, and each card gets a thin
    border. Use the Zoom and Spacing tools above beforehand to control how
    many cards fit per printed page.</p>

    <h3>Good to know</h3>
    <ul>
      <li>All data stays in your browser tab — the extension only talks to
        <code>directory.churchofjesuschrist.org</code>'s own API, using your
        existing login session.</li>
      <li>The original page is hidden underneath the grid, not destroyed —
        click the ✕ in the top right corner to close the grid and get it
        back. Refreshing or navigating away, though, does lose the grid;
        click the toolbar icon again from the unit page to rebuild it.</li>
    </ul>
  `;

  function buildToolsSection() {
    const section = document.createElement("div");

    const description = document.createElement("p");
    description.style.cssText = "margin-top:0;";
    description.textContent = "Adjust how the grid looks — on screen and when printed:";
    section.appendChild(description);

    function makeToolButton(label, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.cssText =
        "margin:4px 8px 4px 0;padding:8px 14px;border-radius:4px;border:1px solid #00008B;" +
        "background:#fff;color:#00008B;cursor:pointer;font-size:14px;";
      btn.addEventListener("click", onClick);
      return btn;
    }

    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;";
    row.appendChild(makeToolButton("Zoom In", zoomIn));
    row.appendChild(makeToolButton("Zoom Out", zoomOut));
    row.appendChild(makeToolButton("Increase Spacing", increaseSpacing));
    row.appendChild(makeToolButton("Decrease Spacing", decreaseSpacing));
    section.appendChild(row);

    return section;
  }

  function flashTextButtonFeedback(button, tempText) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = tempText;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1200);
  }

  function buildMessagesSection() {
    const section = document.createElement("div");

    const description = document.createElement("p");
    description.style.cssText = "margin-top:0;";
    description.textContent =
      "Write one or more messages — each gets its own tab below — then copy " +
      "a filled-in version for each member from their card's toolbar. The " +
      "Copy Message button copies whichever tab is active; Ctrl+click it to " +
      "pick a different message from a list instead.";
    section.appendChild(description);

    const tabStrip = document.createElement("div");
    tabStrip.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:flex-end;gap:4px;margin-bottom:10px;" +
      "border-bottom:1px solid #ddd;padding-bottom:0;";

    const howTo = document.createElement("p");
    howTo.innerHTML =
      "Insert a member's data by typing its name in capital letters inside " +
      "angle brackets, e.g. <code>&lt;PHONE&gt;</code> or " +
      "<code>&lt;FULL NAME&gt;</code> — or just click a tag below to insert " +
      "it at the cursor. Available tags for this grid:";
    section.appendChild(howTo);

    const textarea = document.createElement("textarea");
    textarea.rows = 6;
    textarea.placeholder = "Hi <FIRST NAME>, ...";
    textarea.style.cssText =
      "width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;" +
      "border-radius:4px;font-size:14px;font-family:inherit;resize:vertical;";

    function syncActiveTextFromTextarea() {
      getActiveMessage().messageText = textarea.value;
      saveMessages();
      refreshMessageButtons();
    }

    textarea.addEventListener("input", syncActiveTextFromTextarea);

    function insertTagAtCursor(tagName) {
      const insertText = `<${tagName}>`;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, start) + insertText + textarea.value.slice(end);
      const cursorPos = start + insertText.length;
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
      syncActiveTextFromTextarea();
    }

    const tagList = document.createElement("div");
    tagList.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;";

    function renderTagList() {
      tagList.innerHTML = "";
      for (const tagName of getAvailableMessageTags()) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = `<${tagName}>`;
        chip.title = `Insert <${tagName}> at the cursor`;
        chip.style.cssText =
          "font-family:monospace;font-size:12px;padding:4px 8px;border-radius:4px;" +
          "border:1px solid #00008B;background:#fff;color:#00008B;cursor:pointer;";
        chip.addEventListener("click", () => insertTagAtCursor(tagName));
        tagList.appendChild(chip);
      }
    }
    renderTagList();
    section.appendChild(tagList);

    section.appendChild(tabStrip);
    section.appendChild(textarea);

    const formLinkLabel = document.createElement("p");
    formLinkLabel.style.cssText = "margin:16px 0 4px;font-weight:bold;color:#222;";
    formLinkLabel.textContent = "Google Form Prefilled Link (optional)";
    section.appendChild(formLinkLabel);

    const formLinkHelp = document.createElement("p");
    formLinkHelp.style.cssText = "margin-top:0;color:#555;";
    formLinkHelp.innerHTML =
      "When set, Copy Message also submits a response to this Google Form. " +
      "Get a prefilled link from the form's ⋮ menu → <strong>Get " +
      "pre-filled link</strong>, answering each question with the name of " +
      "the card field it should receive (e.g. <code>phone</code>, " +
      "<code>email</code>, or <code>address</code>) — matching ignores " +
      "case and spaces. Use <code>name</code> for the member's name, " +
      "<code>message</code> for the filled-in message, <code>memberid</code> " +
      "for the member's directory ID, and <code>messagetitle</code> for the " +
      "name of this message (as set in the tab above) - none of these are " +
      "labeled card fields. Any other question keeps whatever " +
      "answer you prefilled it with when you got the link. " +
      "Submitting briefly opens (and reuses) a " +
      "background browser tab, since this site's security policy blocks a " +
      "fully silent submission.";
    section.appendChild(formLinkHelp);

    const formLinkInput = document.createElement("input");
    formLinkInput.type = "text";
    formLinkInput.placeholder = "https://docs.google.com/forms/d/e/.../viewform?usp=pp_url&entry.123=...";
    formLinkInput.style.cssText =
      "width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;" +
      "border-radius:4px;font-size:14px;font-family:inherit;";
    formLinkInput.addEventListener("input", () => {
      getActiveMessage().formLink = formLinkInput.value;
      saveMessages();
    });
    section.appendChild(formLinkInput);

    function refreshEditorForActive() {
      const active = getActiveMessage();
      textarea.value = active.messageText;
      formLinkInput.value = active.formLink || "";
    }

    function updateTabStripHighlighting() {
      for (const wrapper of tabStrip.querySelectorAll("[data-message-id]")) {
        const isActive = wrapper.dataset.messageId === activeMessageId;
        wrapper.style.borderColor = isActive ? "#00008B" : "#ccc";
        wrapper.style.background = isActive ? "#e6e6fa" : "#f7f7f7";
      }
    }

    function setActiveMessage(id) {
      if (activeMessageId === id) return;
      activeMessageId = id;
      saveMessages();
      updateTabStripHighlighting();
      refreshEditorForActive();
    }

    function buildMessageTab(message) {
      const wrapper = document.createElement("div");
      wrapper.dataset.messageId = message.id;
      const isActive = message.id === activeMessageId;
      wrapper.style.cssText =
        "display:flex;align-items:center;gap:2px;padding:2px 2px 2px 8px;" +
        "border:1px solid;border-bottom:none;border-radius:4px 4px 0 0;" +
        `border-color:${isActive ? "#00008B" : "#ccc"};background:${isActive ? "#e6e6fa" : "#f7f7f7"};`;

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = message.messageName;
      nameInput.title = "Rename this message";
      nameInput.style.cssText =
        "border:none;background:transparent;font-size:13px;color:#222;padding:6px 2px;" +
        "width:110px;";
      nameInput.addEventListener("focus", () => setActiveMessage(message.id));
      nameInput.addEventListener("input", () => {
        message.messageName = nameInput.value;
        saveMessages();
      });
      wrapper.appendChild(nameInput);

      if (messages.length > 1) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "✕";
        deleteBtn.title = "Delete this message";
        deleteBtn.style.cssText =
          "border:none;background:none;color:#888;cursor:pointer;font-size:12px;padding:4px 6px;";
        deleteBtn.addEventListener("click", () => {
          const idx = messages.findIndex((m) => m.id === message.id);
          if (idx === -1) return;
          messages.splice(idx, 1);
          if (activeMessageId === message.id) {
            activeMessageId = messages[Math.max(0, idx - 1)].id;
          }
          saveMessages();
          renderTabStrip();
          refreshEditorForActive();
          refreshMessageButtons();
        });
        wrapper.appendChild(deleteBtn);
      }

      return wrapper;
    }

    function renderTabStrip() {
      tabStrip.innerHTML = "";
      for (const message of messages) {
        tabStrip.appendChild(buildMessageTab(message));
      }
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "+";
      addBtn.title = "Add a new message";
      addBtn.style.cssText =
        "margin-left:4px;margin-bottom:4px;padding:4px 10px;border-radius:4px;" +
        "border:1px solid #00008B;background:#fff;color:#00008B;cursor:pointer;font-size:14px;";
      addBtn.addEventListener("click", () => {
        const message = {
          id: makeMessageId(),
          messageName: `Message ${messages.length + 1}`,
          messageText: "",
          formLink: ""
        };
        messages.push(message);
        activeMessageId = message.id;
        saveMessages();
        renderTabStrip();
        refreshEditorForActive();
        refreshMessageButtons();
      });
      tabStrip.appendChild(addBtn);
    }

    renderTabStrip();
    refreshEditorForActive();

    const help = document.createElement("p");
    help.style.cssText = "margin-top:12px;color:#555;";
    help.textContent =
      "Once you've entered a message, flip any card over and click the " +
      "message icon in its toolbar to copy that member's filled-in message " +
      "to your clipboard, ready to paste into a text or email.";
    section.appendChild(help);

    const limitation = document.createElement("p");
    limitation.style.cssText = "margin-top:12px;color:#555;font-style:italic;";
    limitation.textContent =
      "These messages are remembered only on this site. Messages saved here " +
      "won't show up on a grid built from a table on another " +
      "churchofjesuschrist.org page (like LCR), and vice versa — each site " +
      "keeps its own set. Use Copy Messages / Paste Messages below to move " +
      "them to another site or computer.";
    section.appendChild(limitation);

    const transferRow = document.createElement("div");
    transferRow.style.cssText =
      "margin-top:16px;padding-top:12px;border-top:1px solid #ddd;" +
      "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";

    const transferLabel = document.createElement("span");
    transferLabel.style.cssText = "color:#555;font-size:13px;margin-right:4px;";
    transferLabel.textContent = "Move these messages to another site or computer:";
    transferRow.appendChild(transferLabel);

    function makeTransferButton(label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.cssText =
        "padding:8px 14px;border-radius:4px;border:1px solid #00008B;" +
        "background:#fff;color:#00008B;cursor:pointer;font-size:14px;";
      return btn;
    }

    const copyMessagesBtn = makeTransferButton("Copy Messages");
    copyMessagesBtn.title = "Copy all messages on this tab strip to the clipboard";
    copyMessagesBtn.addEventListener("click", () => {
      const payload = JSON.stringify(
        messages.map(({ messageName, messageText, formLink }) => ({ messageName, messageText, formLink })),
        null,
        2
      );
      navigator.clipboard.writeText(payload).then(
        () => flashTextButtonFeedback(copyMessagesBtn, "Copied!"),
        () => alert("Couldn't copy messages to the clipboard.")
      );
    });
    transferRow.appendChild(copyMessagesBtn);

    const pasteMessagesBtn = makeTransferButton("Paste Messages");
    pasteMessagesBtn.title = "Add messages copied from another instance's clipboard";
    pasteMessagesBtn.addEventListener("click", async () => {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        alert("Couldn't read the clipboard.");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        alert(
          "Clipboard doesn't contain valid message data. Use Copy Messages on " +
          "another instance first, then try pasting again."
        );
        return;
      }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const imported = entries
        .filter((e) => e && typeof e === "object")
        .map((e) => ({
          id: makeMessageId(),
          messageName: String(e.messageName ?? e.name ?? "Imported Message"),
          messageText: String(e.messageText ?? e.text ?? ""),
          formLink: String(e.formLink ?? "")
        }));
      if (!imported.length) {
        alert(
          "Clipboard doesn't contain valid message data. Use Copy Messages on " +
          "another instance first, then try pasting again."
        );
        return;
      }
      messages.push(...imported);
      activeMessageId = imported[0].id;
      saveMessages();
      renderTabStrip();
      refreshEditorForActive();
      refreshMessageButtons();
      flashTextButtonFeedback(pasteMessagesBtn, `Added ${imported.length}!`);
    });
    transferRow.appendChild(pasteMessagesBtn);

    section.appendChild(transferRow);

    section.appendChild(buildImportValuesSection(renderTagList));

    return section;
  }

  function buildImportValuesSection(refreshTagList) {
    const section = document.createElement("div");

    const heading = document.createElement("h4");
    heading.style.cssText = "margin:20px 0 4px;padding-top:16px;border-top:1px solid #ddd;";
    heading.textContent = "Import Values";
    section.appendChild(heading);

    const description = document.createElement("p");
    description.style.cssText = "margin-top:0;";
    description.textContent =
      "Paste cells copied from a spreadsheet, or upload a CSV file, to bulk-update card " +
      "data — handy for round-tripping through a spreadsheet where someone else filled in " +
      "extra columns next to a Member Id.";
    section.appendChild(description);

    function makeActionButton(label, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.cssText =
        "margin:4px 8px 4px 0;padding:8px 14px;border-radius:4px;border:1px solid #00008B;" +
        "background:#fff;color:#00008B;cursor:pointer;font-size:14px;";
      btn.addEventListener("click", onClick);
      return btn;
    }

    const previewContainer = document.createElement("div");

    function renderImportedTable() {
      previewContainer.innerHTML = "";
      if (!importedRows.length) return;

      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "overflow:auto;max-height:240px;margin:8px 0;border:1px solid #ddd;border-radius:4px;";

      const table = document.createElement("table");
      table.style.cssText = "border-collapse:collapse;width:100%;font-size:12px;";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const h of importedHeaders) {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.cssText =
          "text-align:left;padding:4px 8px;background:#f0f0f0;font-weight:bold;" +
          "border-bottom:1px solid #ccc;position:sticky;top:0;";
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const row of importedRows) {
        const tr = document.createElement("tr");
        for (const cell of row) {
          const td = document.createElement("td");
          td.textContent = cell;
          td.style.cssText = "padding:4px 8px;border-bottom:1px solid #eee;";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      wrapper.appendChild(table);
      previewContainer.appendChild(wrapper);
    }

    function setImportedData(headers, memberIdIndex, rows) {
      importedHeaders = headers;
      importedMemberIdIndex = memberIdIndex;
      importedRows = rows;
      renderImportedTable();
    }

    async function pasteSpreadsheetValues() {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        text = "";
      }
      const parsed = parseImportTable(text, "\t");
      if (!parsed) {
        alert(
          "That doesn't look like tab-separated data with a \"Member ID\" column. Copy a " +
          "range of cells (including the header row) from a spreadsheet and try again."
        );
        return;
      }
      setImportedData(parsed.headers, parsed.memberIdIndex, parsed.rows);
    }

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv,text/csv";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      const text = await file.text();
      const parsed = parseImportTable(text, ",");
      if (!parsed) {
        alert(
          "That file doesn't look like a usable CSV - it needs a header row with a " +
          "column named \"Member ID\" (any capitalization/spacing) plus at least one " +
          "data row."
        );
        return;
      }
      setImportedData(parsed.headers, parsed.memberIdIndex, parsed.rows);
    });

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;";
    buttonRow.appendChild(makeActionButton("Paste from Spreadsheet", () => pasteSpreadsheetValues()));
    buttonRow.appendChild(makeActionButton("Upload CSV", () => fileInput.click()));
    buttonRow.appendChild(fileInput);
    buttonRow.appendChild(
      makeActionButton("Show Example", () => {
        const { headerCells, rows } = buildCsvRows();
        setImportedData(headerCells, 0, rows);
      })
    );
    buttonRow.appendChild(makeActionButton("Download Example", () => DownloadCSV()));
    section.appendChild(buttonRow);

    section.appendChild(previewContainer);
    renderImportedTable();

    const instructions = document.createElement("p");
    instructions.innerHTML =
      "One column's header must reduce to <code>memberid</code> when lowercased with " +
      "spaces removed (e.g. \"Member ID\", \"member id\") — its value is used to place " +
      "the other columns onto the matching card. Other column names can be anything.";
    section.appendChild(instructions);

    const unmatchedRow = document.createElement("div");
    unmatchedRow.style.cssText = "margin:8px 0;font-size:14px;";

    const unmatchedLabel = document.createElement("div");
    unmatchedLabel.style.cssText = "margin-bottom:4px;";
    unmatchedLabel.textContent = "For a Member ID that doesn't match any existing card:";
    unmatchedRow.appendChild(unmatchedLabel);

    function makeRadioOption(name, value, labelText, checked) {
      const label = document.createElement("label");
      label.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;margin-right:16px;cursor:pointer;";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = name;
      radio.value = value;
      radio.checked = checked;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(labelText));
      return { label, radio };
    }

    const createOption = makeRadioOption("wpd-unmatched", "create", "Create a new card for it", false);
    const ignoreOption = makeRadioOption("wpd-unmatched", "ignore", "Ignore it", true);
    unmatchedRow.appendChild(createOption.label);
    unmatchedRow.appendChild(ignoreOption.label);
    section.appendChild(unmatchedRow);

    const clearRow = document.createElement("label");
    clearRow.style.cssText =
      "display:flex;align-items:center;gap:6px;margin:8px 0;cursor:pointer;font-size:14px;";
    const clearCheckbox = document.createElement("input");
    clearCheckbox.type = "checkbox";
    clearRow.appendChild(clearCheckbox);
    clearRow.appendChild(document.createTextNode("Clear all cards before applying values"));
    section.appendChild(clearRow);

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply Values";
    applyBtn.style.cssText =
      "margin:8px 0;padding:8px 14px;border-radius:4px;border:none;" +
      "background:#00008B;color:#fff;cursor:pointer;font-size:14px;";
    applyBtn.addEventListener("click", () => {
      const applied = applyImportedValues(clearCheckbox.checked, createOption.radio.checked);
      refreshTagList();
      if (applied) {
        const originalText = applyBtn.textContent;
        applyBtn.textContent = "Values Applied!";
        applyBtn.disabled = true;
        setTimeout(() => {
          applyBtn.textContent = originalText;
          applyBtn.disabled = false;
        }, 1500);
      }
    });
    section.appendChild(applyBtn);

    return section;
  }

  function buildKofiFooter() {
    const footer = document.createElement("div");
    footer.style.cssText = "margin-top:20px;padding-top:16px;border-top:1px solid #ddd;text-align:center;";

    const link = document.createElement("a");
    link.href = "https://ko-fi.com/K2P6270SCA";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "☕ Buy me an herbal tea";
    link.style.cssText =
      "display:inline-block;padding:10px 20px;border-radius:6px;background:#72a4f2;" +
      "color:#fff;font-weight:bold;font-size:14px;text-decoration:none;";

    footer.appendChild(link);
    return footer;
  }

  function showInstructionsModal() {
    showMenu(false);

    const overlay = document.createElement("div");
    overlay.className = "wpd-instructions-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;" +
      "display:flex;align-items:center;justify-content:center;font-family:sans-serif;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:#fff;border-radius:8px;width:70vw;max-height:70vh;" +
      "box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;flex-direction:column;overflow:hidden;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;" +
      "padding:12px 20px;border-bottom:1px solid #ddd;flex:0 0 auto;";

    const title = document.createElement("div");
    title.style.cssText = "font-size:18px;font-weight:bold;color:#00008B;";
    title.textContent = "Ward Photo Directory";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "border:none;background:none;font-size:20px;cursor:pointer;color:#333;";
    closeBtn.addEventListener("click", () => overlay.remove());
    header.appendChild(closeBtn);

    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex;gap:4px;padding:0 20px;border-bottom:1px solid #ddd;flex:0 0 auto;";

    function makeTabButton(label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.cssText =
        "padding:10px 16px;margin-bottom:-1px;border:none;border-bottom:2px solid transparent;" +
        "background:none;color:#666;cursor:pointer;font-size:14px;";
      return btn;
    }

    const instructionsTabBtn = makeTabButton("Instructions");
    const appearanceTabBtn = makeTabButton("Appearance");
    const messagesTabBtn = makeTabButton("Messages");
    tabBar.appendChild(instructionsTabBtn);
    tabBar.appendChild(appearanceTabBtn);
    tabBar.appendChild(messagesTabBtn);

    const body = document.createElement("div");
    body.style.cssText =
      "padding:20px;overflow-y:auto;flex:1 1 auto;color:#222;font-size:14px;line-height:1.5;";

    const instructionsPanel = document.createElement("div");
    instructionsPanel.innerHTML = INSTRUCTIONS_HTML;
    body.appendChild(instructionsPanel);

    const appearancePanel = document.createElement("div");
    appearancePanel.appendChild(buildToolsSection());
    body.appendChild(appearancePanel);

    const messagesPanel = document.createElement("div");
    messagesPanel.appendChild(buildMessagesSection());
    body.appendChild(messagesPanel);

    body.appendChild(buildKofiFooter());

    const tabs = [
      { key: "instructions", btn: instructionsTabBtn, panel: instructionsPanel },
      { key: "appearance", btn: appearanceTabBtn, panel: appearancePanel },
      { key: "messages", btn: messagesTabBtn, panel: messagesPanel }
    ];

    function selectTab(activeKey) {
      for (const t of tabs) {
        const active = t.key === activeKey;
        t.panel.style.display = active ? "" : "none";
        t.btn.style.color = active ? "#00008B" : "#666";
        t.btn.style.borderBottomColor = active ? "#00008B" : "transparent";
      }
    }

    for (const t of tabs) {
      t.btn.addEventListener("click", () => selectTab(t.key));
    }
    selectTab("instructions");

    box.appendChild(header);
    box.appendChild(tabBar);
    box.appendChild(body);
    overlay.appendChild(box);

    overlay.addEventListener("click", (evt) => {
      if (evt.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  function showNames(show = true) {
    showMenu(false);
    for (const div of document.querySelectorAll(".name")) {
      div.style.display = show ? "" : "none";
    }
  }

  function hideMissing() {
    showMenu(false);
    const menuItem = tag("menu-hide-missing");
    if (menuItem) menuItem.remove();
    for (const div of document.querySelectorAll(".no-image")) {
      let elem = div;
      while (elem.className !== "card") {
        elem = elem.parentElement;
      }
      elem.remove();
    }
  }

  function hideUnflipped() {
    showMenu(false);
    const menuItem = tag("menu-hide-unflipped");
    if (menuItem) menuItem.remove();
    for (const div of document.querySelectorAll(".card")) {
      const photo = div.querySelector(".photo");
      if (photo.style.display === "none") {
        photo.style.display = "";
        div.querySelector(".data").style.display = "none";
      } else {
        div.remove();
      }
    }
  }

  function removeRoommateFields(card) {
    const dataDiv = card.querySelector(".data");
    const old = dataDiv.querySelector(".roommate-fields");
    if (old) old.remove();
  }

  // Adds a "Roommate Count" (always - the total number of members at the address,
  // including this card) and, if there are any other people there, a "Roommates" list
  // (names separated by a linefeed, same convention as the Address field's line breaks)
  // just before the card's toolbar. Removes any previous roommate fields first, so
  // toggling Group By Address repeatedly doesn't pile up duplicates.
  function addRoommateFields(card, roommateNames, totalCount) {
    removeRoommateFields(card);
    const dataDiv = card.querySelector(".data");
    const toolbar = dataDiv.querySelector(".card-toolbar");
    const wrapper = document.createElement("div");
    wrapper.className = "roommate-fields";
    let html = `<div class="data-label">Roommate Count</div><div class="data-item" data-raw-value="${totalCount}">${totalCount}</div>`;
    if (roommateNames.length > 0) {
      const roommatesText = roommateNames.join("\n");
      const roommatesHtml = roommatesText.replace(/\n/g, "<br>");
      html += `<div class="data-label">Roommates</div><div class="data-item" data-raw-value="${escapeAttr(roommatesText)}">${roommatesHtml}</div>`;
    }
    wrapper.innerHTML = html;
    dataDiv.insertBefore(wrapper, toolbar);
  }

  function ungroupByAddress() {
    showMenu(false);
    for (const group of document.querySelectorAll(".address-group")) {
      const cardsContainer = group.querySelector(".address-group-cards");
      const groupCards = cardsContainer ? Array.from(cardsContainer.children) : [];
      for (const card of groupCards) {
        group.before(card);
      }
      group.remove();
    }
    tag("menu-ungroup-address").style.display = "none";
  }

  function groupByAddress() {
    showMenu(false);
    ungroupByAddress();

    const directory = tag("directory");
    const cards = Array.from(directory.querySelectorAll(".card"));
    const hasAnyAddress = cards.some((card) => card.dataset.address);
    if (!hasAnyAddress) {
      alert("No address information is available to group by.");
      return;
    }

    const groups = new Map();
    for (const card of cards) {
      const address = card.dataset.address || "";
      if (!groups.has(address)) {
        groups.set(address, []);
      }
      groups.get(address).push(card);
    }

    // A blank address just means "no address data" for that card, not a real shared
    // address, so those cards always get a Roommate Count of 0 and no Roommates list.
    for (const [address, groupCards] of groups) {
      const isRealAddress = address !== "";
      const totalCount = isRealAddress ? groupCards.length : 0;
      for (const card of groupCards) {
        const roommateNames = isRealAddress
          ? groupCards.filter((c) => c !== card).map((c) => c.querySelector(".name").textContent.trim())
          : [];
        addRoommateFields(card, roommateNames, totalCount);
      }
    }

    const addressOrder = Array.from(groups.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    for (const address of addressOrder) {
      const groupCards = groups.get(address);
      const wrapper = document.createElement("div");
      wrapper.className = "address-group";

      const cardsContainer = document.createElement("div");
      cardsContainer.className = "address-group-cards";
      for (const card of groupCards) {
        cardsContainer.appendChild(card);
      }
      wrapper.appendChild(cardsContainer);

      const barContainer = document.createElement("div");
      barContainer.className = "address-bar-container";
      const bar = document.createElement("div");
      bar.className = "address-bar";
      bar.textContent = address || "No Address";
      barContainer.appendChild(bar);
      wrapper.appendChild(barContainer);

      directory.appendChild(wrapper);
    }

    tag("menu-ungroup-address").style.display = "";
  }

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffleCards() {
    showMenu(false);
    let cardCount = 0;
    for (const div of document.querySelectorAll(".card")) {
      div.querySelector(".photo").id = "card-" + cardCount++;
    }
    for (let x = 0; x < cardCount; x++) {
      const randomPosition = getRandomInt(0, cardCount - 1);
      tag("card-" + randomPosition).parentElement.before(tag("card-" + x).parentElement);
    }
  }

  // CSS zoom scales each card (and everything inside it) as a whole, so
  // nothing inside reflows out of proportion or grows scrollbars the way
  // resizing width alone did.
  const ZOOM_LEVELS = [0.5, 0.65, 0.8, 1, 1.2, 1.4, 1.6];
  let zoomIndex = ZOOM_LEVELS.indexOf(1);

  function applyZoom() {
    tag("directory").style.zoom = ZOOM_LEVELS[zoomIndex];
  }

  function zoomIn() {
    zoomIndex = Math.min(zoomIndex + 1, ZOOM_LEVELS.length - 1);
    applyZoom();
  }

  function zoomOut() {
    zoomIndex = Math.max(zoomIndex - 1, 0);
    applyZoom();
  }

  const GAP_LEVELS = [0, 5, 10, 20, 30, 40, 60];
  let gapIndex = GAP_LEVELS.indexOf(5);

  function applyGap() {
    tag("directory").style.gap = GAP_LEVELS[gapIndex] + "px";
  }

  function increaseSpacing() {
    gapIndex = Math.min(gapIndex + 1, GAP_LEVELS.length - 1);
    applyGap();
  }

  function decreaseSpacing() {
    gapIndex = Math.max(gapIndex - 1, 0);
    applyGap();
  }

  function downloadOneImage(card) {
    const imageElement = card.querySelector("img");
    const name = card.querySelector(".name").innerHTML;
    const imageUrl = imageElement.src;

    const downloadLink = document.createElement("a");
    downloadLink.href = imageUrl;
    downloadLink.download = name.trim() + ".jfif";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  function downloadAllImages() {
    hideMissing();
    for (const card of document.querySelectorAll(".card")) {
      downloadOneImage(card);
    }
  }
  window.downloadAllImages = downloadAllImages;

  function buildCsvRows() {
    const members = JSON.parse(sessionStorage.getItem("members"));

    let maxCallings = 0;
    for (const m of members) {
      if (m.positions && m.positions.length > maxCallings) {
        maxCallings = m.positions.length;
      }
    }

    const headerCells = ["Member Id", "Given", "Surname", "phone", "email"];
    for (let i = 1; i <= maxCallings; i++) {
      headerCells.push("Calling " + i);
    }

    const rows = members.map((m) => {
      let phone = "";
      let email = "";
      if (m.phone) { phone = m.phone.number; }
      if (m.email) { email = m.email.email; }

      const row = [m.uuid, m.givenName, m.surname, phone, email];
      const callings = m.positions ? m.positions.map(p => p.positionTypeName) : [];
      for (let i = 0; i < maxCallings; i++) {
        row.push(callings[i] || "");
      }
      return row;
    });

    return { headerCells, rows };
  }

  function csvEscape(value) {
    const str = String(value ?? "");
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  function DownloadCSV() {
    const { headerCells, rows } = buildCsvRows();
    const data = [headerCells, ...rows].map((r) => r.map(csvEscape).join(","));

    const hiddenElement = document.createElement("a");
    hiddenElement.href = "data:text/csv;charset=utf-8," + encodeURI(data.join("\n"));
    hiddenElement.target = "_blank";
    hiddenElement.download = "directory.csv";
    hiddenElement.click();
  }

  function wireUpInteractivity() {
    tag("burger").addEventListener("click", () => showMenu(true));
    tag("menu-close").addEventListener("click", () => showMenu(false));
    tag("menu-show-instructions").addEventListener("click", showInstructionsModal);
    tag("menu-download-csv").addEventListener("click", DownloadCSV);
    tag("menu-hide-names").addEventListener("click", () => showNames(false));
    tag("menu-show-names").addEventListener("click", () => showNames(true));
    tag("menu-hide-missing").addEventListener("click", hideMissing);
    tag("menu-hide-unflipped").addEventListener("click", hideUnflipped);
    tag("menu-group-address").addEventListener("click", groupByAddress);
    tag("menu-ungroup-address").addEventListener("click", ungroupByAddress);
    tag("menu-shuffle").addEventListener("click", shuffleCards);
    tag("menu-paste-card").addEventListener("click", pasteCardFromClipboard);
    tag("directory").addEventListener("click", handleCardClick);
    tag("directory").addEventListener("mousedown", handleCardMouseDown);
    tag("directory").addEventListener("dragstart", handleDragStart);
    tag("directory").addEventListener("dragover", handleDragOver);
    tag("directory").addEventListener("drop", handleDrop);
    tag("directory").addEventListener("dragend", handleDragEnd);
    document.addEventListener("click", handleOutsideMenuClick);
    document.addEventListener("click", handleOutsideMessagePickerClick);
    wireImageFallbacks();
  }

  function handleOutsideMenuClick(evt) {
    if (!menuIsOpen) return;
    if (tag("menu").contains(evt.target) || tag("burger").contains(evt.target)) return;
    showMenu(false);
  }

  // Hides (rather than destroys) the page's existing content in a wrapper
  // div, then builds the grid alongside it, so closing the grid (the X,
  // top right) can restore the original page instead of requiring a reload.
  function buildGrid(title, members) {
    if (tag("wpd-grid-root")) {
      closeGrid();
    }

    document.title = title;

    const hiddenOriginal = document.createElement("div");
    hiddenOriginal.id = "wpd-original-content";
    hiddenOriginal.style.display = "none";
    while (document.body.firstChild) {
      hiddenOriginal.appendChild(document.body.firstChild);
    }
    document.body.appendChild(hiddenOriginal);

    const styleEl = document.createElement("style");
    styleEl.id = "wpd-grid-style";
    styleEl.textContent = getStyle();
    document.head.appendChild(styleEl);

    const gridRoot = document.createElement("div");
    gridRoot.id = "wpd-grid-root";
    gridRoot.innerHTML =
      getMenu() +
      `<div id="wpd-close-grid" title="Close photo grid">&#10005;</div>` +
      `<div id="header">${title}</div>` +
      `<div id="directory">${members.map(makeCard).join("")}</div>`;
    document.body.appendChild(gridRoot);

    wireUpInteractivity();
    tag("wpd-close-grid").addEventListener("click", closeGrid);
  }

  // Shown while loadMembers()/buildGrid() run, since fetching + rendering
  // the whole ward's households can take a few seconds and the page
  // otherwise looks unchanged/frozen during that time.
  function showLoadingOverlay() {
    const spinnerStyle = document.createElement("style");
    spinnerStyle.id = "wpd-loading-style";
    spinnerStyle.textContent = "@keyframes wpd-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(spinnerStyle);

    const spinner = document.createElement("div");
    spinner.style.cssText =
      "width:40px;height:40px;margin:0 auto 16px;border:4px solid #ccc;" +
      "border-top-color:#00008B;border-radius:50%;animation:wpd-spin 0.8s linear infinite;";

    const label = document.createElement("div");
    label.style.cssText = "font-size:18px;font-weight:600;color:#222;";
    label.textContent = "Building member cards…";

    const box = document.createElement("div");
    box.style.cssText = "text-align:center;";
    box.appendChild(spinner);
    box.appendChild(label);

    const overlay = document.createElement("div");
    overlay.id = "wpd-loading-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;" +
      "justify-content:center;background:rgba(255,255,255,0.9);font-family:sans-serif;";
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function hideLoadingOverlay() {
    const overlay = tag("wpd-loading-overlay");
    if (overlay) overlay.remove();
    const spinnerStyle = tag("wpd-loading-style");
    if (spinnerStyle) spinnerStyle.remove();
  }

  function closeGrid() {
    const gridRoot = tag("wpd-grid-root");
    if (gridRoot) gridRoot.remove();

    const styleEl = tag("wpd-grid-style");
    if (styleEl) styleEl.remove();

    const hiddenOriginal = tag("wpd-original-content");
    if (hiddenOriginal) {
      while (hiddenOriginal.firstChild) {
        document.body.insertBefore(hiddenOriginal.firstChild, hiddenOriginal);
      }
      hiddenOriginal.remove();
    }
  }

  try {
    const unitInfo = getUnitInfo();
    if (!unitInfo) {
      alert("Couldn't find a unit selected on this page. Make sure you've picked a ward/branch in the directory before clicking the extension icon, then try again.");
      return;
    }

    showLoadingOverlay();
    const members = await loadMembers(unitInfo.number);
    sessionStorage.members = JSON.stringify(members);

    buildGrid(unitInfo.name + " Photo Directory", members);
    hideLoadingOverlay();
  } catch (e) {
    hideLoadingOverlay();
    console.error("Ward Photo Directory error:", e);
    alert("Something went wrong building the photo directory: " + e.message);
  }
})();
