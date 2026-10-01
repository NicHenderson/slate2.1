/* ---------- The phone's navigation ----------

   On a phone (≤640px wide, css/responsive.css) the sidebar gives way to a
   bar at the bottom with four places: Movies, Shows, Collections and
   Settings. Movies and Shows are one view each, their lists as tabs across
   the top (the owner's design):

     Movies: Watched · To Watch
     Shows:  Watching · To Watch · Finished · Dropped

   Each tab is one of the computer's sections (or, for three of the Shows
   tabs, a section plus its status tab), so this only steers those: it
   clicks the sidebar's buttons and the Shows Queue's status tabs, and
   everything that listens to them (sort labels, search, "Open to: last
   page") keeps working. The computer's layout doesn't change.

   Each view remembers its last tab on this device. */

const PHONE_VIEWS = {
  "movies-watched": { tab: "movies", section: "movies-watched" },
  "movies-towatch": { tab: "movies", section: "movies-towatch" },
  "shows-watching": { tab: "shows", section: "shows-towatch", subtab: "grid-shows-watching" },
  "shows-towatch": { tab: "shows", section: "shows-towatch", subtab: "grid-shows-towatch" },
  "shows-watched": { tab: "shows", section: "shows-watched" },
  "shows-dropped": { tab: "shows", section: "shows-towatch", subtab: "grid-shows-dropped" },
};

// Where each bar button goes when its view has no tab remembered yet.
const PHONE_TAB_HOME = {
  movies: "movies-watched",
  shows: "shows-watching",
  collections: "collections",
  settings: "settings",
};

const PHONE_VIEWS_KEY = "slate_phone_views";

const phoneAppEl = document.getElementById("app");
const phoneContentEl = document.querySelector("#app .content");
const tabBarButtons = document.querySelectorAll(".tab-bar-btn");
const viewTabButtons = document.querySelectorAll(".view-tab");

function rememberedViews() {
  try {
    const saved = JSON.parse(localStorage.getItem(PHONE_VIEWS_KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

// The view on screen, from the active section (and, in the Shows Queue,
// its active status tab).
function currentPhoneView() {
  const section = document.querySelector(".section.active")?.id;
  if (section === "shows-towatch") {
    const subtab = document.querySelector("#shows-towatch .status-tab.active")?.dataset.subtab;
    return Object.keys(PHONE_VIEWS).find((v) => PHONE_VIEWS[v].subtab === subtab) ?? "shows-towatch";
  }
  if (PHONE_VIEWS[section]) return section;
  if (section === "collection-view") return "collections";
  return section;
}

function phoneTabOf(view) {
  return PHONE_VIEWS[view]?.tab ?? view;
}

function syncPhoneNav() {
  const view = currentPhoneView();
  const tab = phoneTabOf(view);
  phoneAppEl.dataset.phoneTab = tab;
  tabBarButtons.forEach((btn) => {
    if (btn.dataset.tab === tab) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  viewTabButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.view === view)));
  // However it was reached (the bar, a tab, "Open to", a link in Settings),
  // the view is its tab's last one.
  if (PHONE_VIEWS[view]) {
    const views = rememberedViews();
    if (views[tab] !== view) {
      try {
        localStorage.setItem(PHONE_VIEWS_KEY, JSON.stringify({ ...views, [tab]: view }));
      } catch {}
    }
  }
}

function goToPhoneView(view) {
  const target = PHONE_VIEWS[view] ?? { section: view };
  if (!document.getElementById(target.section)?.classList.contains("active")) {
    document.querySelector(`.nav-btn[data-section="${target.section}"]`)?.click();
  }
  if (target.subtab) document.querySelector(`#${target.section} [data-subtab="${target.subtab}"]`)?.click();
  // A click from here isn't the user's to settings.js, which only keeps
  // real clicks for "Open to: Last page you viewed"; this one was.
  if (START_SECTIONS.includes(target.section)) {
    try {
      localStorage.setItem(LAST_SECTION_KEY, target.section);
    } catch {}
  }
  phoneContentEl.scrollTo(0, 0);
}

tabBarButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    // The place already on screen: back to its top, as phone apps do (an
    // open collection goes back to the list).
    if (phoneTabOf(currentPhoneView()) === tab && document.querySelector(".section.active")?.id !== "collection-view") {
      phoneContentEl.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const remembered = rememberedViews()[tab];
    goToPhoneView(PHONE_VIEWS[remembered]?.tab === tab ? remembered : PHONE_TAB_HOME[tab]);
  })
);

viewTabButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    if (btn.dataset.view !== currentPhoneView()) goToPhoneView(btn.dataset.view);
  })
);

// Sections change from many places (the sidebar, collections, Settings'
// links, "Open to"); watching their classes keeps the bar and the tabs in
// step with all of them.
const phoneNavObserver = new MutationObserver(syncPhoneNav);
document
  .querySelectorAll(".section, #shows-towatch .status-tab")
  .forEach((el) => phoneNavObserver.observe(el, { attributes: true, attributeFilter: ["class"] }));
syncPhoneNav();
