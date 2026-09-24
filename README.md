# Ward Photo Directory

A Chrome extension that turns the unit page at
`https://directory.churchofjesuschrist.org/` into a photo-grid directory,
in place (no new tab/window).

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Use

1. Log in to `https://directory.churchofjesuschrist.org/` and select your
   ward/branch so the member list is showing on screen.
2. Click the extension's toolbar icon.
   - If you are on the directory site, it fetches all household/member
     data for the selected unit and rewrites the page as a photo grid.
   - If you're on some other `churchofjesuschrist.org` page that has a
     table (any row containing a member id, e.g. from a
     "data-member-card-person-uuid" attribute or similar), it asks you to
     choose:
     - **Show Image Cards** — rewrites the current page in place as a
       photo grid built from that table's data — the back of each
       card shows that table's columns rather than phone/email/address/
       callings.
     - **Insert Images** — instead adds a "Photo" column as the first
       column of every table on the page, with each row's member photo,
       right where you already are.
   - Otherwise (any page that isn't a churchofjesuschrist.org page, or one
     without a usable table), it shows a message explaining that the
     extension only works on the directory or LCR, with links you can click
     to go to either one yourself. The extension doesn't have permission to
     navigate you there automatically, so log in there and click the
     toolbar icon again once you've arrived.

## In the photo grid

- Click a card to flip it between photo and details (phone/email/address/callings).
- Drag a card to reorder it anywhere in the grid.
- Ctrl+click a card to hide it (bring it back later with **Restore Hidden
  Cards** in the **Adjust Cards** menu).
- Alt+click a card to move it to the end of the grid.
- Flip a card to its back to find a toolbar of icon buttons (hover one to see
  what it does): **Copy Card** (copies that card's HTML to the clipboard),
  **Copy Message** (only shown once you've written a message template in the
  instructions modal's **Messages** tab — opens that member's filled-in
  message in a dialog where you can edit it (a dropdown at the top defaults to
  the Messages tab's active message and lets you switch to another); **Copy Message** copies it to
  the clipboard, **Log Message** submits it to the message's Google Form,
  **Copy and Log** does both (those two only appear when the message has a
  form link), and **Cancel** does nothing — every button closes the dialog), **Paste Card Before** (inserts a card you
  copied earlier just before this one), **Hide Card** (same as Ctrl+click),
  and **Open in LCR** (opens that member's profile on Leader and Clerk
  Resources in a new tab).
- Click the **✕** in the top right corner to close the grid — this hides the
  grid and restores the original page underneath it, without a reload.
- Click the hamburger icon (top left) to open the menu:
  Instructions & Tools (opens a modal, sized to 70% of the viewport,
  with **Instructions**, **Appearance**, and **Messages** tabs —
  Instructions is shown by default), Download CSV, **Download Images**
  (opens a pop-out submenu: **Member ID** or **Member Name** — downloads
  every visible card's photo in one .zip, each file named by that choice;
  Member Directory grids only — not on LCR/table grids),
  and **Adjust Cards**
  (opens a pop-out submenu with Show/Hide Names, Hide Missing Photos, Hide
  Members not Flipped, Restore Hidden Cards (only shown once Hide Missing
  Photos or Hide Members not Flipped has hidden something — brings those
  cards back), Group/Ungroup By Address, Shuffle, Flip All Cards (toggles
  every card between photo and details), and Reset Cards (shows the photo
  side on every card).
- **Group By Address** groups all cards that share the same address into a
  single larger box with an address bar along the bottom (styled like the
  name bar on a card). On the main directory, addresses come from the
  household data; on a table-imported grid, it looks for a source column
  whose header contains "Address". It also adds a **Roommate Count** to the
  back of every card — the total number of members at that address,
  including that card itself — and, for anyone who does share their address
  with someone else, a **Roommates** field listing the other people at that
  address (one per line). **Ungroup By Address** only undoes the visual
  grouping; the Roommate Count and Roommates fields stay on the cards.
- The instructions modal's **Appearance** tab has Zoom In / Zoom Out (makes
  the cards bigger or smaller, so you can control how many fit per row — and
  per printed sheet, when you print the page normally with Ctrl/Cmd+P) and
  Increase Spacing / Decrease Spacing (widens or narrows the gap between
  cards) buttons.
- The instructions modal's **Messages** tab lets you write a message
  template once (e.g. for a text or email you want to send to many members
  in a similar form), using `<TAG>` placeholders in all caps — `<PHONE>`,
  `<ADDRESS>`, `<FIRST NAME>`, `<LAST NAME>`, `<FULL NAME>`, and so on — that
  get filled in per member when you click a card's **Copy Message** icon.
  The available tags for the current grid are listed as clickable buttons
  right there in the tab — click one to insert it into the message at your
  cursor position instead of typing it out. The template is remembered on
  that site via `localStorage`, but only on that site — a template saved on
  the Directory won't show up on an LCR (or other table) page's grid, and
  vice versa.
- Below that, the **Messages** tab's **Import Values** section lets you
  bulk-update cards from a spreadsheet: **Paste from Spreadsheet** (reads
  tab-separated cells from the clipboard) or **Upload CSV** (a file you
  pick) — either way, the data previews as a table. One column's header
  must reduce to "memberid" once lowercased with spaces removed (e.g.
  "Member ID"); the rest can be named anything. **Show Example** previews
  the same data **Download CSV** would export, and **Download Example**
  triggers that same download — handy for getting a starting spreadsheet
  with everyone's Member Id already filled in. Pasting or uploading new
  data always replaces whatever was previously previewed. **Apply Values**
  writes the previewed columns onto the matching cards (added alongside
  whatever the card already showed), using radio buttons to choose whether
  a Member Id with no matching card creates a new card or is ignored, plus
  a **Clear all cards before applying values** checkbox to start the grid
  from just the imported data.

## Notes

- All data stays in the browser tab; the extension only talks to
  `directory.churchofjesuschrist.org`'s own API using your existing login
  session.
- The original page's content is hidden underneath the grid (not replaced),
  so closing the grid with the ✕ restores it instantly. Refreshing or
  navigating away still loses the grid, though — just click the toolbar
  icon again from the unit page to rebuild it.
- The table-import path builds the grid in place on the same page — card
  photos are absolute URLs back to `directory.churchofjesuschrist.org` (the
  same way the "Insert Images" column does it), so you should already be
  logged in to `directory.churchofjesuschrist.org` in your browser,
  otherwise those photos won't load.
- The extension requests no host permissions at all — only `activeTab`,
  which covers whatever tab you click the toolbar icon from. That's why it
  can't navigate you to the directory or LCR automatically from an
  unrelated site; it can only show you a message with links to follow
  yourself.
