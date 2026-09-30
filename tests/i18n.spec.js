// Languages (js/i18n.js): every string of Slate's, in every language.
const { test, expect, logIn } = require("./support/fixtures");
const { allStrings, usePseudoLanguage, untranslated } = require("./support/i18n");

const placeholders = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
const tags = (s) => [...s.matchAll(/<\/?[a-z][^>]*>/gi)].map((m) => m[0]).sort();

test("every language has every string, with the same {placeholders} and markup", async ({ page }) => {
  const { strings, plurals, unreadable } = await allStrings(page);
  expect(unreadable, "t() / tn() calls whose strings aren't written out").toEqual([]);
  expect(strings.size).toBeGreaterThan(300); // the collection works

  const languages = await page.evaluate(() =>
    Object.fromEntries(Object.entries(SLATE_LANGUAGES).map(([code, lang]) => [code, lang.strings]))
  );
  for (const [code, dict] of Object.entries(languages)) {
    if (code === "en") continue;
    const missing = [...strings].filter((s) => typeof dict[s] !== "string");
    missing.push(...[...plurals].filter((key) => typeof dict[key]?.other !== "string"));
    expect(missing, `${code}: strings without a translation`).toEqual([]);
    const known = new Set([...strings, ...plurals]);
    expect(Object.keys(dict).filter((key) => !known.has(key)), `${code}: translations nothing uses any more`).toEqual([]);
    const broken = [...strings].filter(
      (s) => placeholders(s).join() !== placeholders(dict[s]).join() || tags(s).join() !== tags(dict[s]).join()
    );
    [...plurals].forEach((key) => {
      const [one] = key.split("|");
      Object.values(dict[key]).forEach((form) => {
        if (placeholders(form).filter((p) => p !== "{n}").join() !== placeholders(one).filter((p) => p !== "{n}").join()) broken.push(key);
      });
    });
    expect(broken, `${code}: translations whose {placeholders} or markup differ`).toEqual([]);
  }
});

// In a made-up language that wraps every string in ⟦ ⟧, the main screens
// show nothing unwrapped but the library's own data: a string written
// without t() would show up here.
test("nothing on the main screens escapes translation", async ({ page }) => {
  const data = ["Alien", "The Matrix", "Dark", "Sci-fi night", "Still terrifying.", "tester", "@tester", "T",
    "Aug 1, 2026", "Max"];
  const screens = {};
  const look = async (name) => (screens[name] = await untranslated(page, data));
  await usePseudoLanguage(page);

  await page.goto("/");
  await look("landing");
  await page.goto("/#request-access");
  await look("request access");
  await page.goto("/");
  await logIn(page);
  await look("movies");
  await page.locator("#grid-movies-watched .card").first().click();
  await look("details");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await look("edit");
  await page.click("#update-cancel");
  await page.keyboard.press("Escape");
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator('[data-lib-section="movies-towatch"] .lib-filter-btn').click();
  await look("watchlist and filters");
  await page.click('.nav-btn[data-section="collections"]');
  await page.locator("#grid-collections .collection-card").first().click();
  await look("collection");
  await page.click('.nav-btn[data-section="settings"]');
  await look("settings");

  expect(Object.fromEntries(Object.entries(screens).filter(([, found]) => found.length))).toEqual({});
});

test.describe("in a Spanish browser", () => {
  test.use({ locale: "es-CL" });

  test("Slate starts in Spanish; English picked in Settings sticks on this device", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator(".lp-nav-actions")).toContainText("Iniciar sesión");
    await logIn(page);
    await page.click('.nav-btn[data-section="settings"]');
    await page.click('[data-settings-page="lang"]');
    await expect(page.locator("#setting-language")).toHaveValue("es");
    await Promise.all([page.waitForEvent("load"), page.selectOption("#setting-language", "en")]);
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator('.nav-btn[data-section="settings"]')).toHaveText("Settings");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  // What's saved stays as it was added: a title added in Spanish keeps
  // TMDB's Spanish name (and, TMDB having no Spanish synopsis, its English
  // one); genres are saved in English, one filter option per genre, and
  // shown in the page's language. Titles added before stay as they were.
  test("a title added in Spanish is saved as TMDB names it in Spanish; genres saved in English, shown in Spanish", async ({ page, backend }) => {
    await logIn(page);
    await page.click('.nav-btn[data-section="movies-towatch"]');
    await page.locator("#movies-towatch .add-btn").click();
    await page.fill("#modal-input", "origen");
    await page.press("#modal-input", "Enter");
    await expect(page.locator("#modal-results .tmdb-row-title")).toHaveText(["El origen"]);
    await page.locator("#modal-results .tmdb-pick").click();
    await page.click("#batch-add-btn");
    await expect.poll(() => backend.db.movies.find((m) => m.tmdb_id === 27205)).toMatchObject({
      title: "El origen",
      synopsis: "A thief who steals corporate secrets through dreams.",
      genres: "Action, Science Fiction, Adventure",
    });

    await page.locator("#grid-movies-towatch .card", { hasText: "El origen" }).click();
    await expect(page.locator("#detail-modal .detail-genre-line")).toHaveText("Acción · Ciencia ficción · Aventura");
    await page.keyboard.press("Escape");
    await page.click('.nav-btn[data-section="movies-watched"]');
    await expect(page.locator("#grid-movies-watched .card-title")).toHaveText(["Alien"]);
  });
});

// Spanish is Slate's main language: a browser in a language Slate doesn't
// have gets Spanish, not English (a browser in English still gets English).
test.describe("a browser in French", () => {
  test.use({ locale: "fr-FR" });

  test("gets Slate in Spanish", async ({ page }) => {
    await page.goto("/#login");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#auth-title")).toHaveText("Iniciar sesión");
  });
});
