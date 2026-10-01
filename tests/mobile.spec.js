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
  // An open collection: its cover, whose back button goes back.
  await page.locator("#grid-collections .collection-card").first().tap();
  await expect(page.locator("#col-banner-name")).toHaveText("Sci-fi night");
  await expectNoSidewaysScroll(page);
  await page.locator('#col-banner [data-col-action="back"]').tap();
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

// Sort and Filters rise from the bottom of the screen, whole, however far
// down a long list is scrolled. Safari traps a fixed sheet in ancestors
// Chromium doesn't (a container-query container, a view transition's
// layer): the sheets were cut off and the list scrolled under them. So
// besides where they land, nothing around them may be such an ancestor.
test("on a phone, Sort and Filters are whole sheets on screen in a long list", async ({ page, backend }) => {
  backend.seed(
    "movies",
    Array.from({ length: 40 }, (_, i) => ({ tmdb_id: 900000 + i, title: `Film ${i}`, release_year: 1960 + i, duration: 80 + i * 3, genres: ["Drama", "Comedy", "Horror", "Action", "Animation", "Romance", "Crime", "Documentary", "Family", "Fantasy", "Thriller", "Mystery"][i % 12], watched_date: `${2014 + (i % 12)}-01-02`, rating: 1 + (i % 10) })),
    backend.user.id
  );
  await page.emulateMedia({ reducedMotion: "reduce" }); // measured where they stop, not as they rise
  await page.goto("/");
  await logIn(page);
  await page.locator("#app .content").evaluate((el) => el.scrollTo(0, 600));

  const onScreen = async (locator) => {
    const box = await locator.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844 + 1);
  };
  // Safari also clips a fixed sheet at the edges of any ancestor that's a
  // layer of its own, and scrolls that instead: nothing around an open
  // sheet may be one.
  const nothingTraps = async (locator) => {
    const traps = await locator.evaluate((sheet) => {
      const found = [];
      for (let el = sheet.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        const why = [
          cs.transform !== "none" && "transform",
          cs.filter !== "none" && "filter",
          cs.backdropFilter && cs.backdropFilter !== "none" && "backdrop-filter",
          cs.perspective !== "none" && "perspective",
          cs.contain !== "none" && "contain",
          cs.containerType !== "normal" && "container",
          cs.viewTransitionName && cs.viewTransitionName !== "none" && "view-transition-name",
          /transform|filter|perspective/.test(cs.willChange) && "will-change",
        ].filter(Boolean);
        if (why.length) found.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")}: ${why.join(", ")}`);
      }
      return found;
    });
    expect(traps, "ancestors that would trap a fixed sheet in Safari").toEqual([]);
    // And the list under it can't be scrolled (an iPhone passed a drag on
    // the sheet on to it).
    expect(await page.locator("#app .content").evaluate((el) => getComputedStyle(el).overflowY)).toBe("hidden");
  };
  await page.locator('[data-phone-action="sort"]').tap();
  await onScreen(page.locator("#movies-sort-menu"));
  await nothingTraps(page.locator("#movies-sort-menu"));
  // A drag on it, or on the dimmed page, can't move anything behind (an
  // iPhone bounced the page under it): the browser is told not to scroll.
  const dragCancelled = (selector, dy) =>
    page.evaluate(([selector, dy]) => {
      const el = document.querySelector(selector);
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const touch = (y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch(y)] }));
      const move = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [touch(y + dy)] });
      el.dispatchEvent(move);
      return move.defaultPrevented;
    }, [selector, dy]);
  expect(await dragCancelled("#movies-sort-menu .sort-option", -40)).toBe(true);
  expect(await dragCancelled(".phone-sheet-backdrop", -40)).toBe(true);
  await page.locator(".phone-sheet-backdrop").tap({ position: { x: 200, y: 60 } });
  await expect(page.locator("#movies-sort-menu")).toBeHidden();

  await page.locator('[data-phone-action="filter"]').tap();
  const panel = page.locator('[data-lib-section="movies-watched"] .lib-filter-panel');
  await onScreen(panel);
  await nothingTraps(panel);
  // Filters scrolls itself, down from its top; not up past it.
  expect(await dragCancelled('[data-lib-section="movies-watched"] .lf-chip', -40)).toBe(false);
  expect(await dragCancelled('[data-lib-section="movies-watched"] .lf-chip', 40)).toBe(true);
  await panel.locator(".lf-done").scrollIntoViewIfNeeded();
  await onScreen(panel.locator(".lf-done"));
  await panel.locator(".lf-done").tap();
  await expect(panel).toBeHidden();
});

// Reordering collections by hold-and-drag: the copy under the finger is
// the row it came from, not the computer's booklet (it lives in <body>,
// outside the list, so it can't take its looks from there).
test("on a phone, a collection being dragged looks like its row", async ({ page, backend, context }) => {
  backend.seed("collections", [{ name: "Terror", icon: "👻", position: 2 }], backend.user.id);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await logIn(page);
  await page.locator('.tab-bar-btn[data-tab="collections"]').tap();
  const row = await page.locator("#grid-collections .collection-card").first().boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: row.x + 100, y }] });
  const y = row.y + row.height / 2;
  await touch("touchStart", y);
  await page.waitForTimeout(700); // the hold that starts a drag
  for (let i = 1; i <= 5; i++) await touch("touchMove", y + i * 12);
  // Its posters stay the small fan at the row's end (the booklet's cover
  // spilled far out of it, over the page).
  const cover = await page.locator("body > .drag-ghost .booklet-stamp").boundingBox();
  expect(cover.height).toBeLessThan(row.height);
  await touch("touchEnd");
});

// Settings: the profile card and the pages as tiles, each saying what's set
// there; a page opens in the menu's place under its name, and only that
// page shows (Appearance once showed under every other).
test("on a phone, Settings is tiles saying what's set, and one page at a time", async ({ page }) => {
  await page.goto("/");
  await logIn(page);
  await page.locator('.tab-bar-btn[data-tab="settings"]').tap();
  await expect(page.locator("#profile-preview .pp-bio")).toBeVisible();
  await expect(page.locator('[data-settings-glance="profile"]')).toHaveText("@tester");
  await expect(page.locator('[data-settings-glance="account"]')).toHaveText("tester@slate.test");
  await expect(page.locator('[data-settings-glance="look"]')).toHaveText("Midnight");
  await expectNoSidewaysScroll(page);

  await page.locator('[data-settings-page="account"]').tap();
  await expect(page.locator("#settings-page-name")).toHaveText("Account");
  await expect(page.locator("#settings-logout-btn")).toBeVisible();
  await expect(page.locator("#theme-swatches")).toBeHidden();
  await expect(page.locator('[data-settings-page="look"]')).toBeHidden();

  await page.locator("#settings-back").tap();
  await page.locator('[data-settings-page="look"]').tap();
  await expect(page.locator("#settings-page-name")).toHaveText("Appearance");
  await expect(page.locator("#settings-logout-btn")).toBeHidden();
  await page.locator('[data-theme-key="ocean"]').tap();
  // The card size is a word over its own list.
  await page.locator("#density-select").selectOption("compact");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator(".density-select-wrap")).toHaveAttribute("data-label", "Compact");
  await expectNoZoomingFields(page);
  // "Can't quite see it?" opens inside its tile: what follows moves down
  // rather than showing through it.
  await page.locator("#bg-loupe-open").tap();
  await expect(page.locator("#bg-loupe")).toBeVisible();
  // Measured together: the page scrolls to show it meanwhile.
  const gap = await page.evaluate(
    () => document.querySelector(".tile-motion").getBoundingClientRect().top - document.getElementById("bg-loupe").getBoundingClientRect().bottom
  );
  expect(gap).toBeGreaterThan(0);
  await page.locator("#settings-back").tap();
  await expect(page.locator('[data-settings-glance="look"]')).toHaveText("Ocean");
});

// The bottom bar doesn't scroll: a drag on it must not move the page (an
// iPhone bounced the whole app), and a tap still changes the place.
test("on a phone, dragging on the bottom bar doesn't move the page", async ({ page }) => {
  await page.goto("/");
  await logIn(page);
  const moved = await page.evaluate(() => {
    const el = document.querySelector('.tab-bar-btn[data-tab="shows"]');
    const r = el.getBoundingClientRect();
    const touch = (y) => new Touch({ identifier: 1, target: el, clientX: r.left + 10, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch(r.top + 10)] }));
    const move = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [touch(r.top - 40)] });
    el.dispatchEvent(move);
    return !move.defaultPrevented;
  });
  expect(moved, "the drag reached the page").toBe(false);
  await page.locator('.tab-bar-btn[data-tab="shows"]').tap();
  await expect(page.locator('.tab-bar-btn[data-tab="shows"]')).toHaveAttribute("aria-current", "page");
});
