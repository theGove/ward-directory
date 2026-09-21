# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Ward Photo Directory" — a Manifest V3 Chrome extension (no build step, no
package manager, no bundler, no tests). It turns a churchofjesuschrist.org
member list into an interactive, printable photo-card grid, built in place on
the current tab.

## Commands

There is no build/lint/test tooling in this repo. Development is: edit the
`.js` files directly, then reload the unpacked extension in Chrome.

- Load/reload: `chrome://extensions` → enable **Developer mode** → **Load
  unpacked** (select this folder) → use the reload icon on the extension
  card after each change.
- Debug the click handler / injection logic: inspect the extension's service
  worker from `chrome://extensions` ("service worker" link under the
  extension).
- Debug the injected grid: open normal DevTools on the tab the grid was
  built in.

## Architecture

Three content scripts, no shared module system — each is a self-contained
IIFE injected via `chrome.scripting.executeScript`, since MV3 service
workers can't share globals with page contexts.

- **[background.js](background.js)** — the MV3 service worker. Owns
  `chrome.action.onClicked` and decides, from `tab.url` alone (the
  extension only has the `activeTab` permission, no host permissions), which
  of three paths to take:
  1. On `directory.churchofjesuschrist.org` → inject
     [photo-directory.js](photo-directory.js) as a file (self-executing).
  2. On any other `*.churchofjesuschrist.org` page → inject the inline
     `promptTableAction` function directly (via `func:`, not a file) to scan
     the page for a `<table>` whose every row carries a member UUID, then
     show a choice modal ("Show Image Cards" vs "Insert Images", with a
     size picker). If the user picks cards, the extracted `{members,
     title}` is returned to the background script, which then injects
     [table-directory.js](table-directory.js) as a file and calls the
     `window.__buildTableDirectory(members, title)` entry point it defines.
  3. Any other site → inject `showWrongSiteMessage` (inline func) — the
     extension can't navigate the user automatically (no host permission),
     so it just links to the directory/LCR for them to click themselves.
  - Functions passed via `func:` (`promptTableAction`,
    `showWrongSiteMessage`) run inside the target page, not the service
    worker — they **must stay fully self-contained** (no closures over
    outer variables, no calls to helpers defined elsewhere in
    background.js), since `chrome.scripting.executeScript` serializes the
    function body and re-runs it in the page's isolated world.
  - UUID/member-row detection (`findUuid`, header-based column mapping,
    "Last, First" reordering) lives entirely inside `promptTableAction`
    and is what makes the "any churchofjesuschrist.org table" path work
    generically across LCR reports with different columns.

- **[photo-directory.js](photo-directory.js)** — the "real" directory path.
  Finds the selected unit's hidden `<input>` to get the unit number, calls
  the `/api/v4/households?unit=` API directly with `credentials:
  "same-origin"` (reusing the user's existing session — the extension never
  handles credentials itself), flattens households into a member list, and
  replaces the page with the grid.

- **[table-directory.js](table-directory.js)** — the "imported table" path.
  Takes the `{uuid, displayName, details}[]` array extracted by
  `promptTableAction` and renders the same grid UI, but card backs show the
  source table's own columns (`details`) instead of
  phone/email/address/callings, and CSV export/address-grouping key off
  `details` rather than the household API shape.

  **These two files are near-duplicates by design** (same grid markup,
  CSS, drag/flip/zoom/group/shuffle/menu behavior, instructions modal) —
  they diverge only in how a card's data model is built (household API
  fields vs. arbitrary table `details`) and in the CSV/DownloadCSV/
  group-by-address logic that reads that data model. When changing shared
  UI/behavior (grid layout, card interactions, menu items, zoom/spacing,
  instructions text), **mirror the change in both files** unless it's
  specific to one data source. There is currently no shared module they
  both import from — this is a real duplication, not an oversight to
  "helpfully" collapse in an unrelated change.

- Both grid scripts hide (not destroy) the original page's `<body>`
  contents in a `#wpd-original-content` wrapper before rendering the grid,
  so closing the grid (✕, top right) restores the original DOM instantly
  without a reload.

- Grid state (member data for CSV export and for the message-template
  feature's per-member lookups) is stashed in `sessionStorage.members`
  (photo-directory.js) / `sessionStorage.tableMembers` (table-directory.js)
  — there is no `chrome.storage` usage anywhere.

- The card toolbar's **Copy Message** feature (a user-authored `<TAG>`
  template filled in per member and copied to the clipboard) is the one use
  of `localStorage` in this codebase, under the key `wpd-message-template`.
  Since `localStorage` is per-origin and `directory.churchofjesuschrist.org`
  vs. wherever a table grid was built (e.g. `lcr.churchofjesuschrist.org`)
  are different origins, a template saved on one is never visible on the
  other — each site keeps its own, independent template. This is called out
  explicitly in the Messages tab's own instructions text so it doesn't look
  like a bug to users switching sites.

- All interactive behavior is wired with `addEventListener` (never inline
  `onclick=`/`<script>` in the injected HTML) because the directory site's
  CSP has no `unsafe-inline`.

- The Messages tab's **Import Values** section (both files) is a third way
  to populate cards, independent of the household API / table-extraction
  paths that normally build the grid: it parses pasted (tab-separated) or
  uploaded (CSV) spreadsheet data via a shared `parseDelimitedText`/
  `parseImportTable` pair (a small quoted-field-aware parser, not a naive
  `split(",")`), requires one column whose header reduces to "memberid",
  and on **Apply Values** matches each row's id (case-insensitive) against
  existing card `id`s — updating a match by appending an `.imported-fields`
  block of label/value pairs just before that card's toolbar (replacing any
  block from a prior apply, so re-applying doesn't pile up duplicates), or
  building a brand-new card via `buildImportedCardHtml` for an unmatched id
  when the "create" radio option is selected. This is also why
  `DownloadCSV` is split into `buildCsvRows()` (the data shape) + a thin
  download trigger in both files — `buildCsvRows()` is reused by the
  Messages tab's **Show Example** button, and its CSV serialization now
  quotes fields containing a comma/quote/newline (`csvEscape`) so a
  downloaded example round-trips correctly through **Upload CSV**.

## Constraints worth knowing before changing permissions or network calls

- **Never add or widen a permission/host permission in `manifest.json`
  (or otherwise change what scopes the extension requires) without first
  stopping and asking the user whether they actually want that.** The
  minimal `activeTab`-only footprint is a deliberate design choice (see
  below), not an oversight — treat any change that would require users to
  re-accept new permissions as something to flag and confirm before
  making, even if it would simplify the implementation.
- `manifest.json` requests only `activeTab` + `scripting` — no host
  permissions, no `<all_urls>`. This is why the background script can only
  *link* to the directory/LCR from an unsupported page instead of
  navigating there, and why it can only act on the tab the user explicitly
  clicked the toolbar icon from.
- Photo URLs (`https://directory.churchofjesuschrist.org/api/v4/photos/members/<uuid>`)
  are always absolute back to the directory origin, even when the grid is
  built on a different churchofjesuschrist.org page (LCR) — the browser
  loads them using whatever session cookies exist for that origin, so the
  user must already be logged in to the directory site for those images
  to resolve on the table-import path.
