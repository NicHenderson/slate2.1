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

// Windows are sheets of paper from the bottom: Edit fits an iPhone with
// its buttons on screen, without scrolling; dragging its head down a
// little springs back, further closes it; the question has its own ×.
test("on a phone, a window is a sheet that fits, and closes by dragging it down", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await logIn(page);
  await page.locator('.tab-bar-btn[data-tab="movies"]').tap();
  await page.locator("#grid-movies-watched .card[data-id]").first().click();
  await page.locator('#detail-modal [data-action="edit"]').first().click();
  const sheet = page.locator("#update-modal .update-layout");
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(Math.round(box.y + box.height)).toBe(844);
  await expectOnScreen(page.locator("#update-save"));
  const scrolls = await page.locator("#update-form").evaluate((f) => f.scrollHeight > f.clientHeight + 1);
  expect(scrolls, "the form scrolls").toBe(false);

  const head = await page.locator("#update-modal .update-ticket").boundingBox();
  const drag = async (dy) => {
    await page.mouse.move(head.x + 40, head.y + 30);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(head.x + 40, head.y + 30 + (dy * i) / 8);
    await page.mouse.up();
  };
  await drag(20);
  await expect(page.locator("#update-modal")).toBeVisible();
  await drag(300);
  await expect(page.locator("#update-modal")).toBeHidden();

  await page.locator('#detail-modal [data-action="edit"]').first().click();
  await page.locator("#update-delete").click();
  await expect(page.locator("#confirm-close")).toBeVisible();
  await page.locator("#confirm-close").tap();
  await expect(page.locator("#confirm-modal")).toBeHidden();
  await expect(page.locator("#update-modal")).toBeVisible();
});

// A title's window fits one screen with nothing to scroll (the owner's
// call): a long review is cut to three lines, and tapping it shows it
// whole on a note over the window. Its buttons sit at the bottom.
test("on a phone, a title's window fits one screen; a long review opens whole on a note", async ({ page, backend }) => {
  const alien = backend.db.movies.find((m) => m.title === "Alien");
  // Long enough not to fit the screen even on the note.
  const review = Array.from({ length: 12 }, (_, i) => `${i + 1}. Still terrifying, forty years later.\nRipley is the best of them all, and the dinner scene still leaves me breathless.`).join("\n");
  alien.review = review;
  backend.seed("viewings", [{ movie_id: alien.id, watched_on: "2024-03-03" }], backend.user.id);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await logIn(page);
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).tap();
  const sheet = page.locator("#detail-modal .detail-layout");
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(Math.round(box.y + box.height)).toBe(844);
  const scrolls = await page.locator("#detail-modal .detail-panel").evaluate((p) => p.scrollHeight > p.clientHeight + 1);
  expect(scrolls, "the window scrolls").toBe(false);
  await expectOnScreen(page.locator('#detail-modal [data-action="edit"]'));
  await expectNoSidewaysScroll(page);

  const cut = page.locator("#detail-modal .detail-review");
  await expect(cut).toHaveClass(/\bis-cut\b/);
  await cut.tap();
  await expect(page.locator("#detail-note")).toBeVisible();
  await expect(page.locator("#detail-note-text")).toHaveText(review);
  // Too long for the screen: the note stays on it, and its text scrolls.
  const paper = await page.locator(".detail-note-paper").boundingBox();
  expect(paper.y + paper.height, "the note runs off the screen").toBeLessThanOrEqual(844);
  await expect(page.locator("#detail-note")).toHaveClass(/\bcan-scroll\b/);
  await page.locator("#detail-note-text").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator("#detail-note")).toHaveClass(/\bat-end\b/);
  await expectOnScreen(page.locator("#detail-note-close"));
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail-note")).toBeHidden();
  await expect(page.locator("#detail-modal")).toBeVisible();

  // A show being watched, its "Up next" note included, fits too.
  await page.locator("#detail-close").tap();
  const dark = backend.db.shows.find((s) => s.title === "Dark");
  Object.assign(dark, { finished_watching_date: null, rating: null });
  backend.seed("watched_episodes", [{ show_id: dark.id, season: 1, episode: 3 }], backend.user.id);
  await page.reload();
  await page.locator('.tab-bar-btn[data-tab="shows"]').tap();
  await page.locator("#grid-shows-watching .card", { hasText: "Dark" }).tap();
  await expect(page.locator("#detail-modal .up-next-head")).toHaveText("Up next S1 · E4");
  const showScrolls = await page.locator("#detail-modal .detail-panel").evaluate((p) => p.scrollHeight > p.clientHeight + 1);
  expect(showScrolls, "the window scrolls").toBe(false);
  await expectOnScreen(page.locator('#detail-modal [data-action="drop-series"]'));
});

// Searching TMDB: one list in the sheet, a result opening in its place
// with its button pinned at the bottom, and back to the list.
test("on a phone, a search result opens in the list's place, its button at the bottom", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await logIn(page);
  await page.locator('.view-tab[data-view="movies-towatch"]').tap();
  await page.locator("#phone-add").tap();
  await expect(page.locator("#search-modal")).toBeVisible();
  // Not focused as it rises (an iPhone would shift the page): a tap types.
  expect(await page.evaluate(() => document.activeElement?.id)).not.toBe("modal-input");
  await page.locator("#modal-input").tap();
  await page.keyboard.type("i");
  const row = page.locator(".tmdb-hit", { hasText: "Paddington" });
  await row.locator(".tmdb-pick").tap();
  await expectOnScreen(page.locator("#batch-add-btn"));

  await row.locator(".tmdb-hit-main").tap();
  // Its details are a sheet over the results, which stay beneath it.
  const layer = page.locator("#modal-preview");
  await expect(layer).toBeVisible();
  const sheetBox = await page.locator("#search-modal .modal").boundingBox();
  const layerBox = await layer.boundingBox();
  expect(Math.round(layerBox.y)).toBe(Math.round(sheetBox.y));
  await expect(page.locator("#modal-results")).toBeAttached();
  const action = page.locator(".tmdb-preview-action");
  await expect(action).toHaveText("✓ Picked");
  const box = await action.boundingBox();
  expect(844 - (box.y + box.height), "pinned at the bottom").toBeLessThan(30);
  await expectNoSidewaysScroll(page);
  // Dragged down, it steps back to the results (the pick kept), not out
  // of the search.
  const head = layerBox;
  await page.mouse.move(head.x + 200, head.y + 30);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(head.x + 200, head.y + 30 + i * 40);
  await page.mouse.up();
  await expect(page.locator("#search-modal")).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row.locator(".tmdb-pick")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#batch-add-btn").tap();
  await expect(page.locator("#search-modal")).toBeHidden();
  await expect(page.locator("#grid-movies-towatch .card", { hasText: "Paddington" })).toBeVisible();
});

// Episodes on a phone: a season is a card of boxes. Tapping one only
// picks it (a stray tap must not tick anything); its card's button ticks
// it, and the card moves on to the next one.
test("on a phone, an episode's box picks it, and its card's button ticks it", async ({ page, backend }) => {
  const dark = backend.db.shows.find((s) => s.title === "Dark");
  Object.assign(dark, { finished_watching_date: null, rating: null });
  backend.seed("watched_episodes", [1, 2, 3].map((episode) => ({ show_id: dark.id, season: 1, episode })), backend.user.id);
  const ticked = () => backend.db.watched_episodes.filter((e) => e.show_id === dark.id).map((e) => `${e.season}x${e.episode}`).sort();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await logIn(page);
  await page.locator('.tab-bar-btn[data-tab="shows"]').tap();
  await page.locator("#grid-shows-watching .card", { hasText: "Dark" }).tap();
  await page.locator('#detail-modal .up-next [data-action="open-episodes"]').tap();
  const box = (n) => page.locator(`#episodes-modal .ep-row[data-episode="${n}"]`);
  const card = page.locator("#episodes-modal .ep-card");
  // It opens on the next one.
  await expect(box(4)).toHaveClass(/\bis-picked\b/);
  await expect(card.locator(".ep-card-name")).toHaveText("E4 · Double Lives");
  await box(7).tap();
  await expect(box(7)).toHaveClass(/\bis-picked\b/);
  await expect(card.locator(".ep-card-name")).toHaveText("E7 · Crossroads");
  expect(ticked()).toEqual(["1x1", "1x2", "1x3"]);
  await card.locator(".ep-card-tick").tap();
  await expect.poll(ticked).toEqual(["1x1", "1x2", "1x3", "1x7"]);
  await expect(card.locator(".ep-card-name")).toHaveText("E8 · As You Sow, so You Shall Reap");
  await expectNoSidewaysScroll(page);
  await expectOnScreen(page.locator("#episodes-close"));
});

// The login sheet doesn't scroll, so a request just sent can't push its
// button off the screen: the form makes way for the message (an iPhone
// SE, the shortest), and the button brings it back.
test("on a phone, a request sent leaves its message and button on screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#request-access");
  await page.fill("#auth-name", "Ana");
  await page.fill("#auth-email", "ana@slate.test");
  await page.check("#auth-consent");
  await page.locator("#auth-submit").tap();
  await expect(page.locator("#auth-message")).toContainText("Request sent!");
  await expect(page.locator("#auth-name")).toBeHidden();
  const box = await page.locator("#auth-submit").boundingBox();
  expect(box.y + box.height, "the button runs off the screen").toBeLessThanOrEqual(667);
  await page.evaluate(() => { resendReadyAt.request = 0; syncSubmit(); });
  await expect(page.locator("#auth-submit")).toHaveText("Send another request");
  await page.locator("#auth-submit").tap();
  await expect(page.locator("#auth-name")).toBeVisible();
  await expect(page.locator("#auth-message")).toBeHidden();
});

// Adding titles to a collection, as rows: tapping one ticks it, and the
// stamp adds it. Picking a favorite: a tap anywhere on its row picks it.
test("on a phone, titles are added to a collection by tapping their rows; a favorite by tapping its row", async ({ page, backend }) => {
  backend.seed("movies", [{ tmdb_id: 27205, title: "Inception", release_year: 2010, duration: 148, watched_date: null }], backend.user.id);
  await page.goto("/");
  await logIn(page);
  await page.locator('.tab-bar-btn[data-tab="collections"]').tap();
  await page.locator("#grid-collections .collection-card").first().click();
  await page.locator('#col-banner [data-col-action="add"]').tap();
  // No field is focused as the window rises: on an iPhone that brings the
  // keyboard up mid-rise and leaves the whole page shifted.
  const focused = () => page.evaluate(() => document.activeElement?.tagName ?? "");
  await expect(page.locator("#library-modal")).toBeVisible();
  expect(await focused()).not.toBe("INPUT");
  const row = page.locator("#library-results .add-card", { hasText: "Inception" });
  await expect(row.locator(".card-glance")).toHaveText("2010 · 2h 28m");
  await expectOnScreen(row.locator(".add-check"));
  await row.tap();
  await expect(row).toHaveClass(/selected/);
  await page.locator("#library-add-btn").tap();
  await expect(page.locator("#library-modal")).toBeHidden();
  await expect.poll(() => backend.db.collection_items.length).toBe(3);
  await page.locator('#col-banner [data-col-action="back"]').tap();
  await page.locator("#phone-add").tap();
  await expect(page.locator("#collection-modal")).toBeVisible();
  expect(await focused()).not.toBe("INPUT");
  await page.locator("#collection-close").tap();

  await page.locator('.tab-bar-btn[data-tab="settings"]').tap();
  await page.locator('[data-settings-page="profile"]').tap();
  await page.locator('[data-fav-slot="movie"] button').first().click();
  await page.locator("#favorite-input").fill("alien");
  const fav = page.locator("#favorite-results .tmdb-row").first();
  const box = await fav.boundingBox();
  await page.touchscreen.tap(box.x + 120, box.y + box.height / 2); // the title, not the button
  await expect(page.locator("#favorite-modal")).toBeHidden();
  await expect(page.locator('[data-fav-slot="movie"] .favorite-title')).not.toHaveText("");
});
