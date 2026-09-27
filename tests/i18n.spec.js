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
    "Horror", "Science Fiction", "Horror · Science Fiction", "Action", "Action · Science Fiction", "Crime", "Aug 1, 2026", "Max"];
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
    await expect(page.locator("#setting-language")).toHaveValue("es");
    await Promise.all([page.waitForEvent("load"), page.selectOption("#setting-language", "en")]);
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator('.nav-btn[data-section="settings"]')).toHaveText("Settings");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
