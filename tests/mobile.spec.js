// Slate on a phone: a narrow, touch screen. Nothing may be wider than the
// screen, and the everyday path — landing, login, menu, adding a title —
// works with taps.
const { test, expect, logIn } = require("./support/fixtures");

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Nothing sticks out sideways: neither the page nor anything in it that
// scrolls (the app scrolls inside main.content, not the page) can be
// scrolled sideways.
async function expectNoSidewaysScroll(page) {
  const wide = await page.evaluate(() =>
    [document.documentElement, ...document.querySelectorAll("*")]
      .filter((el) => {
        const scrolls = el === document.documentElement || ["auto", "scroll"].includes(getComputedStyle(el).overflowX);
        return scrolls && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
      })
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].join(".")}` : ""} is ${el.scrollWidth}px wide in ${el.clientWidth}px`)
  );
  expect(wide, "scrolls sideways").toEqual([]);
}

// An iPhone zooms in on any field whose text is under 16px as it's tapped,
// and doesn't zoom back out. (The login form's hidden bot trap is never
// tapped by a person.)
async function expectNoZoomingFields(page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => !["checkbox", "radio", "hidden", "file", "range"].includes(el.type) && el.id !== "auth-website")
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].join(".")}` : ""} at ${getComputedStyle(el).fontSize}`)
  );
  expect(small, "fields an iPhone would zoom into").toEqual([]);
}

async function expectOnScreen(locator) {
  const box = await locator.boundingBox();
  expect(box, "on screen").not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
}

test("on a phone: landing, login, the menu and adding a title all fit and work", async ({ page, backend }) => {
  await page.goto("/");
  await expect(page.locator("#landing-screen")).toBeVisible();
  await expectNoSidewaysScroll(page);
  // No pinch zoom, as in an app: the viewport tag for Android, CSS for iPhones.
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /user-scalable=no/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe("pan-x pan-y");

  await logIn(page);
  await expectNoSidewaysScroll(page);
  // Every field in the page, the app's and the login card's alike.
  await expectNoZoomingFields(page);

  // The sidebar is a drawer behind the menu button.
  const menu = page.locator("#menu-toggle");
  await expect(menu).toBeVisible();
  await menu.tap();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.locator('.nav-btn[data-section="movies-towatch"]').tap();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#movies-towatch")).toHaveClass(/\bactive\b/);
  await expectNoSidewaysScroll(page);

  // Adding a title, start to finish.
  await page.locator("#movies-towatch .add-btn").tap();
  await expectOnScreen(page.locator("#modal-input"));
  await page.fill("#modal-input", "paddington");
  await page.press("#modal-input", "Enter");
  await page.locator("#modal-results .tmdb-pick").tap();
  await expectOnScreen(page.locator("#batch-add-btn"));
  await page.locator("#batch-add-btn").tap();
  await expect(page.locator("#grid-movies-towatch .card-title")).toContainText(["Paddington 2"]);
  expect(backend.db.movies.some((m) => m.tmdb_id === 346648)).toBe(true);

  // Its detail window fits too.
  await page.locator("#grid-movies-towatch .card", { hasText: "Paddington 2" }).tap();
  await expectOnScreen(page.locator('#detail-modal [data-action="mark-watched"]'));
  await expectNoSidewaysScroll(page);
  await page.keyboard.press("Escape");

  // Settings, the longest page.
  await menu.tap();
  await page.locator('.nav-btn[data-section="settings"]').tap();
  await expect(page.locator("#settings")).toHaveClass(/\bactive\b/);
  await expectNoSidewaysScroll(page);
});

// The landing page on a phone: five screens, stepped like stories. Every
// one of them, the letter and the way in must be reachable by tapping.
test("on a phone the landing page is stories, stepped with the arrows and the bars", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#lp-top")).toBeVisible();
  await expect(page.locator("#lp-problem")).toBeHidden();
  await expect(page.locator("#lp-story-prev")).toBeDisabled();

  await page.locator("#lp-story-next").tap();
  await expect(page.locator("#lp-problem")).toBeVisible();
  await expect(page.locator("#lp-top")).toBeHidden();

  await page.locator('.lp-story-bar[data-story-go="5"]').tap();
  await expect(page.locator(".lp-letter")).toBeVisible();
  await expect(page.locator(".lp-footer")).toBeVisible();
  await expect(page.locator("#lp-story-next")).toBeDisabled();
  await expectNoSidewaysScroll(page);

  await page.locator("#lp-story-prev").tap();
  await expect(page.locator(".lp-final")).toBeVisible();
  await page.locator(".lp-story-letter").tap();
  await expect(page.locator(".lp-letter")).toBeVisible();

  await page.locator('.lp-story-bar[data-story-go="1"]').tap();
  await page.locator('.lp-story-cta a[href="#request-access"]').tap();
  await expect(page).toHaveURL(/#request-access$/);
  await expect(page.locator("#auth-screen")).toBeVisible();
});

test("installable: the manifest and every icon it names are there", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(`/${href}`)).json();
  expect(manifest).toMatchObject({ name: "Slate", start_url: "/", display: "standalone" });
  const icons = [...manifest.icons.map((icon) => icon.src), await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")];
  for (const src of icons) expect((await request.get(`/${src}`)).status(), src).toBe(200);
});
