/* ---------- The lists' header on a phone ----------

   The owner's pick of three mockups ("A"): above Movies' and Shows' tabs,
   one row with the view's name, how many titles the list holds, and round
   buttons: Surprise Me (lists to watch), search, sort and filters. "+" to
   add floats over the bottom right. Sort and Filters open as sheets from
   the bottom, and the numbers fold into one strip (css/responsive.css).

   Nothing here is a second copy of those controls: each button works the
   section's own (the same search box, sort menu, filters panel and add
   button the computer uses), which stay in the page, out of sight. So the
   search, the sort and the filters a list has are the same on both.
   Collections' list gets the same row, with its name, count and "+". */

const phoneHeadName = document.getElementById("phone-head-name");
const phoneHeadCount = document.getElementById("phone-head-count");
const phoneHeadBadge = document.getElementById("phone-head-badge");
const phoneSearch = document.getElementById("phone-search");
const phoneSearchInput = document.getElementById("phone-search-input");
const phoneAddBtn = document.getElementById("phone-add");
const PHONE_LIST_SECTIONS = ["movies-watched", "movies-towatch", "shows-watched", "shows-towatch"];

// The section on screen, if it's one of the lists, and its grid.
function phoneList() {
  const section = document.querySelector(".section.active");
  if (!section || !PHONE_LIST_SECTIONS.includes(section.id)) return null;
  const grid = [...section.querySelectorAll(".card-grid")].find((g) => !g.classList.contains("subtab-hidden"));
  return { section, grid, tools: section.querySelector(".lib-tools") };
}

// A control of the section's that's there to be used: not missing, and not
// put away for another of the Shows Queue's tabs.
function usable(el) {
  return el && !el.classList.contains("subtab-hidden") ? el : null;
}

function phoneControls(list) {
  return {
    surprise: usable(list.section.querySelector(".surprise-btn")),
    sort: list.section.querySelector(".sort-wrap > .sort-btn"),
    filter: list.tools.querySelector(".lib-filter-btn"),
    search: list.tools.querySelector(".lib-search-input"),
    add: usable(list.section.querySelector(".header-actions .add-btn")),
  };
}

function syncPhoneHead() {
  const list = phoneList();
  phoneAppEl.classList.toggle("has-phone-list", Boolean(list));
  // Collections' list has the same row, with only its name, its count and
  // "+" (it has no search, sort or filters).
  const onCollections = document.getElementById("collections").classList.contains("active");
  phoneAppEl.classList.toggle("has-phone-collections", onCollections);
  if (onCollections) {
    phoneHeadName.textContent = t("Collections");
    phoneHeadCount.textContent = STORE.collections.size;
    phoneAddBtn.hidden = false;
    return;
  }
  if (!list) {
    phoneAddBtn.hidden = true;
    return;
  }
  const controls = phoneControls(list);
  const tab = phoneAppEl.dataset.phoneTab;
  phoneHeadName.textContent = tab === "shows" ? t("Shows") : t("Movies");
  phoneHeadCount.textContent = list.grid && GRID_CONFIG[list.grid.id] ? getOrderedList(list.grid.id, { searched: false }).length : "";
  document.querySelector('[data-phone-action="surprise"]').hidden = !controls.surprise;
  const badge = list.tools.querySelector(".lib-filter-badge");
  phoneHeadBadge.hidden = badge.hidden;
  phoneHeadBadge.textContent = badge.textContent.replace(/\D/g, ""); // " · 2" on the computer's button
  phoneAddBtn.hidden = !controls.add;
  // The search box is the section's: a list left searched comes back so.
  const searching = Boolean(controls.search.value) || (!phoneSearch.hidden && document.activeElement === phoneSearchInput);
  if (phoneSearchInput.value !== controls.search.value) phoneSearchInput.value = controls.search.value;
  phoneSearchInput.placeholder = controls.search.placeholder;
  phoneSearch.hidden = !searching;
  phoneSearch.previousElementSibling.hidden = searching;
}

// Grids redraw often; the header catches up once a frame at most.
let phoneHeadFrame = 0;
function queuePhoneHead() {
  if (!phoneHeadFrame) phoneHeadFrame = requestAnimationFrame(() => ((phoneHeadFrame = 0), syncPhoneHead()));
}

document.querySelectorAll("[data-phone-action]").forEach((btn) =>
  btn.addEventListener("click", (e) => {
    const list = phoneList();
    if (!list) return;
    // The click must not reach the page's own "a click elsewhere closes the
    // menu" listeners, which would shut what it's about to open.
    e.stopPropagation();
    const controls = phoneControls(list);
    const action = btn.dataset.phoneAction;
    if (action === "search") {
      phoneSearch.hidden = false;
      phoneSearch.previousElementSibling.hidden = true;
      phoneSearchInput.focus();
    } else {
      controls[action]?.click();
    }
  })
);

phoneSearchInput.addEventListener("input", () => {
  const list = phoneList();
  if (!list) return;
  const input = phoneControls(list).search;
  input.value = phoneSearchInput.value;
  input.dispatchEvent(new Event("input"));
});

phoneSearchInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const list = phoneList();
  if (list) phoneControls(list).search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  phoneSearchInput.blur();
});

document.getElementById("phone-search-cancel").addEventListener("click", () => {
  phoneSearchInput.value = "";
  phoneSearchInput.dispatchEvent(new Event("input"));
  phoneSearchInput.blur();
  phoneSearch.hidden = true;
  phoneSearch.previousElementSibling.hidden = false;
});

phoneAddBtn.addEventListener("click", () => {
  if (document.getElementById("collections").classList.contains("active")) {
    // The "Add Collection" card, which is how the computer adds one.
    document.querySelector("#grid-collections .ghost-card")?.click();
    return;
  }
  const list = phoneList();
  if (list) phoneControls(list).add?.click();
});

/* ---------- the numbers, folded ----------
   Each strip of numbers shows its first three until "More" opens it. The
   strips are redrawn often (js/sectionHeaders.js), so the button lives
   beside them, not inside. */

[...PHONE_LIST_SECTIONS, "collections"].forEach((id) =>
  document.querySelectorAll(`#${id} .hstats`).forEach((stats) => {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "hstats-more";
    more.setAttribute("aria-expanded", "false");
    more.textContent = t("More");
    more.addEventListener("click", () => {
      const open = stats.classList.toggle("is-open");
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? t("Less") : t("More");
    });
    stats.after(more);
  })
);

/* ---------- sheets ----------
   On a phone, the sort menu and the filters panel rise from the bottom
   over a dimmed page. Tapping the dimmed page closes them (as any click
   outside them always has), and so does dragging the grip down. */

const phoneSheets = document.querySelectorAll(".sort-menu, .lib-filter-panel");
phoneSheets.forEach((sheet) =>
  sheet.setAttribute("data-sheet-title", sheet.classList.contains("sort-menu") ? t("Sort") : t("Filters"))
);

function closePhoneSheet(sheet) {
  if (sheet.classList.contains("sort-menu")) sheet.classList.add("hidden");
  else closeFilterPanels();
}

const phoneSheetLayout = matchMedia("(max-width: 640px)");
let phoneSheetDrag = null;
phoneSheets.forEach((sheet) => {
  sheet.addEventListener("pointerdown", (e) => {
    // Only the grip's band, so the options and chips still scroll and tap.
    if (!phoneSheetLayout.matches || e.clientY - sheet.getBoundingClientRect().top > 40) return;
    phoneSheetDrag = { sheet, startY: e.clientY, startT: e.timeStamp, dy: 0 };
    sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener("pointermove", (e) => {
    if (phoneSheetDrag?.sheet !== sheet) return;
    phoneSheetDrag.dy = Math.max(0, e.clientY - phoneSheetDrag.startY);
    sheet.style.transform = `translateY(${phoneSheetDrag.dy}px)`;
    sheet.style.transition = "none";
  });
  const end = (e) => {
    if (phoneSheetDrag?.sheet !== sheet) return;
    const { dy, startT } = phoneSheetDrag;
    phoneSheetDrag = null;
    sheet.style.transition = "";
    sheet.style.transform = "";
    // A long drag, or a quick flick that went somewhere.
    if (dy > sheet.offsetHeight * 0.25 || (dy > 30 && dy / Math.max(1, e.timeStamp - startT) > 0.5)) closePhoneSheet(sheet);
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
});

// The grip: its own element, as only one that says touch-action: none can
// be dragged on a phone (the sheet scrolls, so a drag on it is a scroll).
// The sheets redraw their insides, so it's put back whenever it's gone.
function addSheetGrip(sheet) {
  if (sheet.querySelector(":scope > .sheet-grip")) return;
  const grip = document.createElement("div");
  grip.className = "sheet-grip";
  grip.setAttribute("aria-hidden", "true");
  sheet.append(grip); // last: the menus style their first child
}
const phoneGripObserver = new MutationObserver((changes) => changes.forEach((c) => addSheetGrip(c.target)));
phoneSheets.forEach((sheet) => {
  addSheetGrip(sheet);
  phoneGripObserver.observe(sheet, { childList: true });
});

// The page dims while one is open.
const phoneSheetObserver = new MutationObserver(() =>
  phoneAppEl.classList.toggle("has-sheet", [...phoneSheets].some((s) => !s.classList.contains("hidden")))
);
phoneSheets.forEach((sheet) => phoneSheetObserver.observe(sheet, { attributes: true, attributeFilter: ["class"] }));

// Nothing behind a sheet moves. An iPhone hands a drag that has nowhere
// to go (on Sort, on the dimmed page, on Filters at either end) to the
// page, which then scrolls or bounces under the sheet; CSS can't stop it
// there, so the drag is cancelled unless it scrolls a sheet.
let phoneSheetTouchY = 0;
document.addEventListener(
  "touchstart",
  (e) => {
    phoneSheetTouchY = e.touches[0]?.clientY ?? 0;
  },
  { passive: true }
);
document.addEventListener(
  "touchmove",
  (e) => {
    if (!phoneAppEl.classList.contains("has-sheet") || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const down = y > phoneSheetTouchY; // the finger moves down: the content moves up to its top
    phoneSheetTouchY = y;
    const sheet = e.target.closest?.(".sort-menu, .lib-filter-panel");
    const canScroll =
      sheet &&
      sheet.scrollHeight > sheet.clientHeight + 1 &&
      (down ? sheet.scrollTop > 0 : sheet.scrollTop + sheet.clientHeight < sheet.scrollHeight - 1);
    if (!canScroll && e.cancelable) e.preventDefault();
  },
  { passive: false }
);

/* ---------- keeping up ---------- */

const phoneHeadObserver = new MutationObserver(queuePhoneHead);
phoneHeadObserver.observe(phoneAppEl, { attributes: true, attributeFilter: ["data-phone-tab"] });
[...PHONE_LIST_SECTIONS, "collections"].forEach((id) =>
  phoneHeadObserver.observe(document.getElementById(id), { attributes: true, childList: true, subtree: true })
);
syncPhoneHead();
