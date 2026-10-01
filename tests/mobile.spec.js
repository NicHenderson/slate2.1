// Slate on a phone: a narrow, touch screen. Nothing may be wider than the
// screen, and the everyday path — landing, login, the bottom bar, adding a title —
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

test("on a phone: landing, login, the bottom bar and adding a title all fit and work", async ({ page, backend }) => {
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

  // No sidebar: a bar at the bottom, and Movies' lists as tabs.
  await expect(page.locator("#menu-toggle")).toBeHidden();
  await expect(page.locator("#sidebar")).toBeHidden();
  const bar = (tab) => page.locator(`.tab-bar-btn[data-tab="${tab}"]`);
  const tab = (view) => page.locator(`.view-tab[data-view="${view}"]`);
  await expect(bar("movies")).toHaveAttribute("aria-current", "page");
  await expect(tab("movies-watched")).toHaveAttribute("aria-pressed", "true");
  // Cards are small polaroids, three across: a watched one's rating is one
  // heart and its number, in place of the ten hearts.
  const alien = page.locator("#grid-movies-watched .card", { hasText: "Alien" });
  await expect(alien.locator(".card-glance-rating")).toHaveText("9");
  await expect(alien.locator(".card-rating")).toBeHidden();
  expect(await page.$eval("#grid-movies-watched", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length)).toBe(3);
  await tab("movies-towatch").tap();
  await expect(page.locator("#movies-towatch")).toHaveClass(/\bactive\b/);
  await expect(tab("movies-towatch")).toHaveAttribute("aria-pressed", "true");
  await expectNoSidewaysScroll(page);

  // The header is one row of round buttons: search narrows the list…
  await page.locator('[data-phone-action="search"]').tap();
  await page.keyboard.type("alien");
  await expect(page.locator("#grid-movies-towatch .card")).toHaveCount(0);
  await page.locator("#phone-search-cancel").tap();
  await expect(page.locator("#grid-movies-towatch .card")).toHaveCount(1);
  // …and Sort is a sheet from the bottom, its options on screen.
  await page.locator('[data-phone-action="sort"]').tap();
  await expectOnScreen(page.locator('#movies-towatch-sort-menu [data-sort="alpha-asc"]'));
  await page.locator('#movies-towatch-sort-menu [data-sort="alpha-asc"]').tap();
  await expect(page.locator("#movies-towatch-sort-menu")).toBeHidden();

  // Adding a title, start to finish, from the floating "+".
  await page.locator("#phone-add").tap();
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

  // Shows opens on Watching; its other lists are tabs too.
  await bar("shows").tap();
  await expect(bar("shows")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#shows-towatch")).toHaveClass(/\bactive\b/);
  await expect(page.locator("#grid-shows-watching")).not.toHaveClass(/subtab-hidden/);
  await expect(tab("shows-watching")).toHaveAttribute("aria-pressed", "true");
  await tab("shows-watched").tap();
  await expect(page.locator("#grid-shows-watched .card-title")).toContainText(["Dark"]);
  await tab("shows-dropped").tap();
  await expect(page.locator("#grid-shows-dropped")).not.toHaveClass(/subtab-hidden/);
  await expectNoSidewaysScroll(page);

  // Each view comes back on the tab it was left on.
  await bar("movies").tap();
  await expect(tab("movies-towatch")).toHaveAttribute("aria-pressed", "true");
  await bar("shows").tap();
  await expect(tab("shows-dropped")).toHaveAttribute("aria-pressed", "true");

  await bar("collections").tap();
  await expect(page.locator("#collections")).toHaveClass(/\bactive\b/);

  // Settings, the longest page.
  await bar("settings").tap();
  await expect(page.locator("#settings")).toHaveClass(/\bactive\b/);
  await expect(bar("settings")).toHaveAttribute("aria-current", "page");
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

// Logging in and asking for access on a phone: a sheet over the landing
// page, whose forms fit the screen without scrolling (the owner asked).
test("on a phone the login card is a sheet: its tabs, its fit and its ×", async ({ page }) => {
  await page.goto("/");
  await page.locator('.lp-story-cta a[href="#login"]').tap();
  await expect(page.locator("#auth-screen")).toHaveAttribute("data-mode", "login");
  const fits = () =>
    page.evaluate(() => {
      const sheet = document.querySelector(".auth-panel");
      return sheet.scrollHeight <= sheet.clientHeight;
    });
  expect(await fits(), "the login form fits").toBe(true);

  await page.locator('[data-auth-tab="request"]').tap();
  await expect(page.locator("#auth-screen")).toHaveAttribute("data-mode", "request");
  await expect(page.locator("#auth-name")).toBeVisible();
  await expect(page).toHaveURL(/#request-access$/);
  expect(await fits(), "the request form fits").toBe(true);
  await expectNoZoomingFields(page);

  await page.locator("#auth-sheet-close").tap();
  await expect(page.locator("#auth-screen")).toBeHidden();
  await expect(page.locator("#lp-top")).toBeVisible();

  // A tap on the dimmed page above it closes it too…
  await page.locator('.lp-story-cta a[href="#login"]').tap();
  await expect(page.locator("#auth-screen")).toBeVisible();
  await page.locator("#auth-screen").tap({ position: { x: 195, y: 40 } });
  await expect(page.locator("#auth-screen")).toBeHidden();

  // …and so does dragging its grip down; a short drag springs back.
  await page.locator('.lp-story-cta a[href="#login"]').tap();
  await expect(page.locator(".auth-sheet-grip")).toBeVisible();
  const grip = await page.locator(".auth-sheet-grip").boundingBox();
  const drag = async (distance) => {
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 20);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 20 + distance, { steps: 8 });
    await page.mouse.up();
  };
  await drag(20);
  await page.waitForTimeout(400);
  await expect(page.locator("#auth-screen")).toBeVisible();
  await drag(320);
  await expect(page.locator("#auth-screen")).toBeHidden();
});

test("installable: the manifest and every icon it names are there", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(`/${href}`)).json();
  expect(manifest).toMatchObject({ name: "Slate", start_url: "/", display: "standalone" });
  const icons = [...manifest.icons.map((icon) => icon.src), await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")];
  for (const src of icons) expect((await request.get(`/${src}`)).status(), src).toBe(200);
});
