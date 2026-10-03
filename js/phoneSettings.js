/* ---------- Settings on a phone ----------

   The owner's pick of three mockups ("B"): each page of the menu is a
   paper tile saying what's set there ("@nicholas", "Midnight",
   "Español · Chile"), and a page opens under "‹ Its name". The layout is
   css/responsive.css's; this only fills in those words, from what the
   computer's pages already hold. */

const settingsGlance = {
  profile: () => {
    const username = savedProfile.username || accountInfo.defaultUsername;
    return username ? `@${username}` : "";
  },
  account: () => accountInfo.email,
  look: () => THEME_META[currentSettings.theme]?.label ?? "",
  lang: () => {
    const region = currentSettings.watchRegion || browserRegion();
    return [SLATE_LANGUAGES[LANGUAGE]?.name, region && regionName(region)].filter(Boolean).join(" · ");
  },
  lists: () => defaultSortSelect.selectedOptions[0]?.textContent ?? "",
};

const settingsPageName = document.getElementById("settings-page-name");

// Only what changed is written: the menu is watched for changes, and an
// unchanged write would still count as one.
function setSettingsText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function renderPhoneSettings() {
  settingsLayout.querySelectorAll("[data-settings-glance]").forEach((el) => {
    setSettingsText(el, settingsGlance[el.dataset.settingsGlance]());
  });
  const current = settingsLayout.querySelector('[data-settings-page][aria-current="page"] .settings-menu-label');
  setSettingsText(settingsPageName, current?.textContent ?? "");
}

// The menu changes from many places (a page opened, the profile typed,
// a theme picked, the settings arriving from the account): a frame later,
// the words follow.
let phoneSettingsFrame = 0;
new MutationObserver(() => {
  if (!phoneSettingsFrame) phoneSettingsFrame = requestAnimationFrame(() => ((phoneSettingsFrame = 0), renderPhoneSettings()));
}).observe(settingsLayout, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-current", "hidden"] });
renderPhoneSettings();
