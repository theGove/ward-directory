const DIRECTORY_ORIGIN = "https://directory.churchofjesuschrist.org";

function isChurchDomain(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return host === "churchofjesuschrist.org" || host.endsWith(".churchofjesuschrist.org");
  } catch (e) {
    return false;
  }
}

// Runs inside the page being scanned (via chrome.scripting.executeScript "func").
// Must be fully self-contained - no references to anything outside this function.
async function promptTableAction() {
  const UUID_STRICT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const UUID_LOOSE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const PHOTO_BASE_URL = "https://directory.churchofjesuschrist.org/api/v4/photos/members/";

  function findUuid(row) {
    // Include the row itself, not just its descendants - some tables (e.g.
    // Eden) put the member id directly on the <tr id="..."> rather than on
    // a descendant element.
    const elements = [row, ...row.querySelectorAll("*")];

    for (const el of elements) {
      for (const attr of el.attributes) {
        if (UUID_STRICT.test(attr.value.trim())) return attr.value.trim();
      }
    }

    // No attribute is *exactly* a UUID - fall back to a substring match, which
    // catches ids embedded in a larger attribute value, like an href such as
    // "/mlt/records/finding-lost-members/details?id=<uuid>".
    for (const el of elements) {
      for (const attr of el.attributes) {
        const match = attr.value.match(UUID_LOOSE);
        if (match) return match[0];
      }
    }

    const textMatch = (row.textContent || "").match(UUID_LOOSE);
    return textMatch ? textMatch[0] : null;
  }

  // Some table libraries (e.g. Eden) duplicate each header's text into a
  // hidden aria-hidden clone inside every cell for responsive card views.
  // Strip those out so we don't pick up duplicated label/value text.
  function visibleText(el) {
    const clone = el.cloneNode(true);
    for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
      hidden.remove();
    }
    return clone.textContent.trim();
  }

  // "Last, First Middle" -> "First Middle Last"
  function reorderName(name) {
    const commaIdx = name.indexOf(",");
    if (commaIdx === -1) return name;
    const last = name.slice(0, commaIdx).trim();
    const first = name.slice(commaIdx + 1).trim();
    return (first + " " + last).trim();
  }

  // LCR reports spell the same field differently depending on the report ("E-Mail" vs.
  // "Individual E-mail", "Phone Number" vs. "Individual Phone") - standardize to a single
  // label so downstream matching (Copy Message's contact-field detection, message <TAG>
  // names) doesn't have to special-case every variant. Only LCR reports are inconsistent
  // this way, so this is scoped to that host.
  function normalizeLcrFieldLabel(label) {
    if (location.hostname !== "lcr.churchofjesuschrist.org") return label;
    const reduced = (label || "").toLowerCase().replace(/\s+/g, "");
    if (reduced === "e-mail" || reduced === "individuale-mail") return "Email";
    if (reduced === "individualphone" || reduced === "phonenumber") return "Phone";
    return label;
  }

  function findPageTitle() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();

    const editableTitle = document.querySelector(".editable__title-text");
    if (editableTitle && editableTitle.textContent.trim()) return editableTitle.textContent.trim();

    return document.title || "Directory";
  }

  // If the page has a tablist (e.g. "With Callings" / "Without Callings"),
  // only look at the table belonging to the currently selected tab, and use
  // that tab's label as the title instead of a page heading.
  function extractForCards() {
    let searchRoot = document;
    let tabTitle = null;

    const tablist = document.querySelector('[role="tablist"]');
    if (tablist) {
      const selectedTab =
        tablist.querySelector('[role="tab"][aria-selected="true"]') ||
        tablist.querySelector('[role="tab"]');

      if (selectedTab) {
        tabTitle = visibleText(selectedTab);

        const panelId = selectedTab.getAttribute("aria-controls");
        const panel =
          (panelId && document.getElementById(panelId)) ||
          document.querySelector('[role="tabpanel"]:not([hidden])');

        if (panel) searchRoot = panel;
      }
    }

    const tables = searchRoot.querySelectorAll("table");
    for (const table of tables) {
      const headerCells = Array.from(table.querySelectorAll("thead th")).map(visibleText);
      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      if (bodyRows.length === 0) continue;

      const members = [];
      let everyRowHasId = true;

      for (const row of bodyRows) {
        const uuid = findUuid(row);
        if (!uuid) {
          everyRowHasId = false;
          break;
        }

        const cells = Array.from(row.querySelectorAll(":scope > td"));
        const details = cells.map((td, i) => ({
          label: normalizeLcrFieldLabel(headerCells[i] || ("Column " + (i + 1))),
          value: visibleText(td)
        }));

        let nameIdx = headerCells.findIndex((h) => /preferred\s*name/i.test(h));
        if (nameIdx === -1) {
          nameIdx = headerCells.findIndex((h) => /^name$/i.test(h.trim()));
        }

        let displayName = "";
        if (nameIdx >= 0 && cells[nameIdx]) {
          displayName = reorderName(visibleText(cells[nameIdx]));
        } else if (cells.length) {
          displayName = visibleText(cells[0]);
        }

        members.push({ uuid, displayName, details });
      }

      if (everyRowHasId && members.length > 0) {
        return { title: tabTitle || findPageTitle(), members };
      }
    }

    return null;
  }

  // Adds a "Photo" column as the first column of every table on the page,
  // filling in a member photo wherever a row's member id can be found. If a
  // Photo column from a previous run is already there, it's replaced rather
  // than duplicated.
  const PHOTO_COLUMN_CLASS = "wpd-photo-column";

  function removeExistingPhotoColumn(table) {
    const th = table.querySelector("thead tr > th." + PHOTO_COLUMN_CLASS);
    if (th) th.remove();
    for (const td of table.querySelectorAll("tbody tr > td." + PHOTO_COLUMN_CLASS)) {
      td.remove();
    }
  }

  function insertPhotoColumns(widthPx) {
    for (const table of document.querySelectorAll("table")) {
      removeExistingPhotoColumn(table);

      const headerRow = table.querySelector("thead tr");
      if (headerRow) {
        const th = document.createElement("th");
        th.className = PHOTO_COLUMN_CLASS;
        th.textContent = "Photo";
        headerRow.insertBefore(th, headerRow.firstChild);
      }

      for (const row of table.querySelectorAll("tbody tr")) {
        const uuid = findUuid(row);
        const td = document.createElement("td");
        td.className = PHOTO_COLUMN_CLASS;
        if (uuid) {
          const img = document.createElement("img");
          img.src = PHOTO_BASE_URL + uuid;
          img.style.width = widthPx + "px";
          img.style.borderRadius = "4px";
          td.appendChild(img);
        }
        row.insertBefore(td, row.firstChild);
      }
    }
  }

  function showChoicePrompt() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;" +
        "display:flex;align-items:center;justify-content:center;font-family:sans-serif;";

      const box = document.createElement("div");
      box.style.cssText =
        "background:#fff;border-radius:8px;padding:24px;max-width:320px;" +
        "text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.3);";

      const message = document.createElement("div");
      message.style.cssText = "margin-bottom:16px;font-size:15px;color:#222;";
      message.textContent =
        "Show a photo grid on this page, or insert a Photo column into this page's table(s)?";
      box.appendChild(message);

      function finish(choice) {
        overlay.remove();
        resolve(choice);
      }

      const cardsBtn = document.createElement("button");
      cardsBtn.type = "button";
      cardsBtn.textContent = "Show Image Cards";
      cardsBtn.style.cssText =
        "margin:4px;padding:8px 14px;border-radius:4px;border:none;" +
        "background:#00008B;color:#fff;cursor:pointer;font-size:14px;";
      cardsBtn.addEventListener("click", () => finish("cards"));
      box.appendChild(cardsBtn);

      const insertLabel = document.createElement("div");
      insertLabel.style.cssText = "margin:16px 0 6px;font-size:14px;color:#222;";
      insertLabel.textContent = "Insert Images";
      box.appendChild(insertLabel);

      const sizeRow = document.createElement("div");
      [
        { label: "Small", choice: "small" },
        { label: "Medium", choice: "medium" },
        { label: "Large", choice: "large" }
      ].forEach(({ label, choice }) => {
        const sizeBtn = document.createElement("button");
        sizeBtn.type = "button";
        sizeBtn.textContent = label;
        sizeBtn.style.cssText =
          "margin:4px;padding:8px 14px;border-radius:4px;border:1px solid #00008B;" +
          "background:#fff;color:#00008B;cursor:pointer;font-size:14px;";
        sizeBtn.addEventListener("click", () => finish(choice));
        sizeRow.appendChild(sizeBtn);
      });
      box.appendChild(sizeRow);

      overlay.addEventListener("click", (evt) => {
        if (evt.target === overlay) finish(null);
      });

      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  if (document.querySelectorAll("table").length === 0) {
    return { action: "none" };
  }

  const choice = await showChoicePrompt();

  const SIZE_PX = { small: 50, medium: 100, large: 200 };
  if (SIZE_PX[choice]) {
    insertPhotoColumns(SIZE_PX[choice]);
    return { action: "inserted" };
  }

  if (choice === "cards") {
    const extracted = extractForCards();
    if (extracted) {
      return { action: "cards", title: extracted.title, members: extracted.members };
    }
    alert("Couldn't find a table on this page with a member id on every row, so a photo grid can't be built from it.");
    return { action: "cards-none" };
  }

  return { action: "cancelled" };
}

// Runs inside the page being scanned (via chrome.scripting.executeScript "func").
// Must be fully self-contained - no references to anything outside this function.
function showWrongSiteMessage() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2147483647;" +
    "display:flex;align-items:center;justify-content:center;font-family:sans-serif;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:#fff;border-radius:8px;padding:24px;max-width:340px;" +
    "text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.3);";

  const message = document.createElement("div");
  message.style.cssText = "margin-bottom:16px;font-size:15px;color:#222;";
  message.textContent =
    "You should be logged in to the unit directory at " +
    "directory.churchofjesuschrist.org, or on a table of member data at " +
    "lcr.churchofjesuschrist.org. Navigate to one of those sites, then " +
    "click the toolbar icon again.";
  box.appendChild(message);

  const linkRow = document.createElement("div");
  linkRow.style.cssText = "display:flex;flex-direction:column;gap:8px;";

  [
    { label: "Go to the Directory", url: "https://directory.churchofjesuschrist.org/" },
    { label: "Go to Leader and Clerk Resources (LCR)", url: "https://lcr.churchofjesuschrist.org/" }
  ].forEach(({ label, url }) => {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = label;
    link.style.cssText =
      "display:inline-block;padding:8px 14px;border-radius:4px;" +
      "background:#00008B;color:#fff;text-decoration:none;font-size:14px;";
    linkRow.appendChild(link);
  });
  box.appendChild(linkRow);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  closeBtn.style.cssText =
    "margin-top:16px;padding:6px 14px;border-radius:4px;border:1px solid #999;" +
    "background:#f5f5f5;color:#333;cursor:pointer;font-size:13px;";
  closeBtn.addEventListener("click", () => overlay.remove());
  box.appendChild(closeBtn);

  overlay.addEventListener("click", (evt) => {
    if (evt.target === overlay) overlay.remove();
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function buildTableDirectoryInTab(tabId, members, title) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["table-directory.js"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (members, title) => window.__buildTableDirectory(members, title),
    args: [members, title]
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  if (tab.url.startsWith(DIRECTORY_ORIGIN)) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["photo-directory.js"]
    });
    return;
  }

  if (isChurchDomain(tab.url)) {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: promptTableAction
    });
    const result = injectionResults && injectionResults[0] && injectionResults[0].result;

    if (result && result.action === "cards" && result.members && result.members.length > 0) {
      // Build the grid in place on the same tab - card photos are absolute
      // URLs back to directory.churchofjesuschrist.org (the same way the
      // "Insert Images" column does it), so no navigation or new tab is
      // needed to load them.
      await buildTableDirectoryInTab(tab.id, result.members, result.title);
    }
    // "inserted", "cards-none", "cancelled", or "none" (no table found) are
    // either already handled on the page or need no further action.
    return;
  }

  // Not on a supported site - the extension has no host permission to
  // navigate the user there automatically, so just let them know and offer
  // links to follow themselves.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: showWrongSiteMessage
  });
});
