/* ---------- Where to watch ----------

   For a title not watched yet — in the detail window (to watch, watching,
   dropped) and in the search's info window — the streaming services that
   have it, from TMDB's watch providers, for one country: the one picked in
   Settings > Defaults, or else the browser's own. TMDB gets this from
   JustWatch and requires crediting them, as the section does.

   It goes below the window's buttons, so nothing already on screen moves
   when the answer arrives. Asked once per title and kept: TMDB answers for
   every country at once, so changing the country needs no new request. */

// TMDB's kinds, as shown; "free" and "ads" (free with ads) read as one.
const WTW_GROUPS = [
  { label: t("Stream"), kinds: ["flatrate"] },
  { label: t("Free"), kinds: ["free", "ads"] },
  { label: t("Rent"), kinds: ["rent"] },
  { label: t("Buy"), kinds: ["buy"] },
];

const WTW_LOGO_RE = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|svg)$/;
const WTW_LINK_PREFIX = "https://www.themoviedb.org/";
const REGION_RE = /^[A-Z]{2}$/;

// The country the browser says it's in ("es-CL" → CL); a language with no
// country ("es") is guessed from the language (Intl.Locale.maximize), and
// failing everything, the US.
function browserRegion() {
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const tag of tags) {
    try {
      const region = new Intl.Locale(tag).region;
      if (REGION_RE.test(region ?? "")) return region;
    } catch {}
  }
  for (const tag of tags) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (REGION_RE.test(region ?? "")) return region;
    } catch {}
  }
  return "US";
}

function watchRegion() {
  const picked = typeof currentSettings === "undefined" ? "" : currentSettings.watchRegion;
  return REGION_RE.test(picked ?? "") ? picked : browserRegion();
}

function regionName(code) {
  try {
    return new Intl.DisplayNames([LOCALE], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// Keyed by type + TMDB id; holds the promise, so a title reopened
// mid-lookup doesn't ask twice. A failed lookup is forgotten, to retry.
const watchProvidersCache = new Map();

function fetchWatchProviders(type, tmdbId) {
  const key = `${type}:${tmdbId}`;
  if (!watchProvidersCache.has(key)) {
    const request = tmdbWatchProviders(type, tmdbId).catch((err) => {
      watchProvidersCache.delete(key);
      throw err;
    });
    watchProvidersCache.set(key, request);
  }
  return watchProvidersCache.get(key);
}

function whereToWatchSlotHtml() {
  return `
    <section class="where-to-watch" aria-live="polite">
      <p class="wtw-title">${t("Where to watch · {country}", { country: escapeHtml(regionName(watchRegion())) })}</p>
      <p class="wtw-loading">${t("Looking for where to watch…")}</p>
    </section>`;
}

function providerLogoHtml(provider, link) {
  const name = escapeHtml(provider.provider_name ?? "");
  const logo = WTW_LOGO_RE.test(provider.logo_path ?? "")
    ? `<img src="${TMDB_IMG}${provider.logo_path}" alt="" loading="lazy" />`
    : `<span class="wtw-logo-empty">${name.slice(0, 1)}</span>`;
  return link
    ? `<a class="wtw-provider" href="${escapeHtml(link)}" target="_blank" rel="noopener" title="${name}" aria-label="${name}">${logo}</a>`
    : `<span class="wtw-provider" title="${name}" aria-label="${name}">${logo}</span>`;
}

function whereToWatchHtml(results, region) {
  const here = results?.[region];
  const name = escapeHtml(regionName(region));
  const link = typeof here?.link === "string" && here.link.startsWith(WTW_LINK_PREFIX) ? here.link : null;
  const groups = WTW_GROUPS.map(({ label, kinds }) => {
    const seen = new Set();
    const providers = kinds
      .flatMap((kind) => (Array.isArray(here?.[kind]) ? here[kind] : []))
      .filter((p) => p && !seen.has(p.provider_id) && seen.add(p.provider_id));
    if (!providers.length) return "";
    return `<div class="wtw-group"><p class="wtw-kind">${label}</p><div class="wtw-logos">${providers.map((p) => providerLogoHtml(p, link)).join("")}</div></div>`;
  }).join("");

  const title = `<p class="wtw-title">${t("Where to watch · {country}", { country: name })}</p>`;
  if (!groups) {
    return `${title}<p class="wtw-none">${t("We couldn't find where to watch this in {country} — sorry. You can pick another country in Settings.", { country: name })}</p>`;
  }
  return `${title}<div class="wtw-groups">${groups}</div><p class="wtw-credit">${t("Availability by {justwatch}.", { justwatch: '<a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a>' })}</p>`;
}

// Fills a slot from whereToWatchSlotHtml(). `stillShowing` says whether the
// window still shows that title when TMDB answers (it may have moved on).
async function loadWhereToWatch(slot, type, tmdbId, stillShowing) {
  if (!slot || !tmdbId) return;
  const region = watchRegion();
  let html;
  try {
    html = whereToWatchHtml(await fetchWatchProviders(type, tmdbId), region);
  } catch (err) {
    console.error("Where to watch error:", err.message);
    html = `<p class="wtw-title">${t("Where to watch · {country}", { country: escapeHtml(regionName(region)) })}</p><p class="wtw-none">${t("Couldn't check where to watch right now.")}</p>`;
  }
  if (slot.isConnected && stillShowing()) slot.innerHTML = html;
}

/* ---------- Settings > Defaults: the country ---------- */

const watchRegionSelect = document.getElementById("setting-watch-region");
let watchRegionList = []; // TMDB's countries, once asked
let watchRegionsLoaded = false;

// "Automatic (Chile)" and then every country TMDB covers, by name. Until
// that list arrives, just the automatic choice and the one saved. Also
// run by settings.js whenever the Settings page is drawn.
function renderWatchRegionOptions() {
  if (!watchRegionSelect) return;
  const saved = typeof currentSettings === "undefined" ? "" : currentSettings.watchRegion;
  // TMDB's own English names, or the browser's in any other language.
  const nameOf = (r) => (LANGUAGE === "en" && r.english_name) || regionName(r.iso_3166_1);
  const codes = new Map(watchRegionList.filter((r) => REGION_RE.test(r.iso_3166_1 ?? "")).map((r) => [r.iso_3166_1, nameOf(r)]));
  if (REGION_RE.test(saved ?? "") && !codes.has(saved)) codes.set(saved, regionName(saved));
  const options = [...codes].sort((a, b) => a[1].localeCompare(b[1], LOCALE));
  watchRegionSelect.innerHTML =
    `<option value="">${t("Automatic ({country})", { country: escapeHtml(regionName(browserRegion())) })}</option>` +
    options.map(([code, name]) => `<option value="${code}">${escapeHtml(name)}</option>`).join("");
  watchRegionSelect.value = REGION_RE.test(saved ?? "") ? saved : "";
}

// Asked the first time Settings opens (it needs the session).
async function loadWatchRegions() {
  if (watchRegionsLoaded) return;
  watchRegionsLoaded = true;
  try {
    watchRegionList = await tmdbWatchRegions();
    renderWatchRegionOptions();
  } catch (err) {
    watchRegionsLoaded = false; // try again next time
    console.error("Watch regions error:", err.message);
  }
}

watchRegionSelect?.addEventListener("change", () => saveSetting("watchRegion", watchRegionSelect.value));
document.querySelector('.nav-btn[data-section="settings"]')?.addEventListener("click", loadWatchRegions);
renderWatchRegionOptions();
