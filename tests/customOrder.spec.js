// Movies To Watch in "Custom order": drag and drop, and the bugs it had.
const { test, expect, logIn } = require("./support/fixtures");

const TITLES = ["The Matrix", "Paddington 2", "Inception", "Heat"];

test.beforeEach(async ({ page, backend }) => {
  backend.seed(
    "movies",
    [
      { tmdb_id: 346648, title: "Paddington 2", watched_date: null },
      { tmdb_id: 27205, title: "Inception", watched_date: null },
      { tmdb_id: 949, title: "Heat", watched_date: null },
    ].map((m, i) => ({ ...m, created_at: `2026-09-0${i + 2}T00:00:00Z` })),
    backend.user.id
  );
  backend.db.movies.find((m) => m.tmdb_id === 603).created_at = "2026-09-01T00:00:00Z";
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.click("#movies-towatch-sort-btn");
  await page.click('#movies-towatch-sort-menu [data-sort="oldest"]');
  await expect(titles(page)).toHaveText(TITLES);
  await page.click("#movies-towatch-sort-btn");
  await page.click('#movies-towatch-sort-menu [data-sort="custom"]');
  await expect(page.locator("#grid-movies-towatch")).toHaveClass(/is-sortable/);
});

const titles = (page) => page.locator("#grid-movies-towatch .card[data-id] .card-title");
const card = (page, title) => page.locator("#grid-movies-towatch .card[data-id]", { hasText: title });

async function centre(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Press on `from`, glide to `to` in small steps (as a hand would), hold.
async function dragTo(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(350);
}

test("switching to Custom order keeps the order on screen and saves it", async ({ backend }) => {
  const order = [...backend.db.movies].filter((m) => !m.watched_date).sort((a, b) => a.position - b.position);
  expect(order.map((m) => m.title)).toEqual(TITLES);
  expect(order.map((m) => m.position)).toEqual([1, 2, 3, 4]);
});

test("dragging a card to a new place moves it and saves the new order", async ({ page, backend }) => {
  await dragTo(page, await centre(card(page, "The Matrix")), await centre(card(page, "Inception")));
  await page.mouse.up();
  await expect(titles(page)).toHaveText(["Paddington 2", "Inception", "The Matrix", "Heat"]);
  await expect
    .poll(() => backend.db.movies.filter((m) => !m.watched_date).sort((a, b) => a.position - b.position).map((m) => m.title))
    .toEqual(["Paddington 2", "Inception", "The Matrix", "Heat"]);
  // A reload shows the saved order.
  await page.reload();
  await expect(titles(page)).toHaveText(["Paddington 2", "Inception", "The Matrix", "Heat"]);
});

// Regression: grabbing a card again while it was still flying back to its
// slot left the card showing underneath the one being dragged. The second
// grab has to come within the landing (0.22s) — faster than driving the
// mouse step by step allows — so it's played inside the page in one go.
test("a card grabbed again mid-landing still leaves an empty slot behind", async ({ page }) => {
  await dragTo(page, await centre(card(page, "The Matrix")), await centre(card(page, "Paddington 2")));
  await page.mouse.up();
  const grabbedWhileLanding = await page.evaluate(() => {
    const landing = document.querySelector("#grid-movies-towatch .card.dragging");
    if (!landing) return false;
    const r = landing.getBoundingClientRect();
    const at = (dx, dy) => ({ pointerId: 7, pointerType: "mouse", button: 0, isPrimary: true, bubbles: true, clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy });
    landing.dispatchEvent(new PointerEvent("pointerdown", at(0, 0)));
    landing.dispatchEvent(new PointerEvent("pointermove", at(20, 30)));
    return true;
  });
  expect(grabbedWhileLanding).toBe(true);
  await page.waitForTimeout(500); // well past the first landing
  await expect(page.locator("#grid-movies-towatch .card.dragging")).toHaveCount(1);
  await expect(page.locator("#grid-movies-towatch .card.dragging")).toContainText("The Matrix");
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, pointerType: "mouse", bubbles: true })));
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
});

// Regression: when the grid was rebuilt between the press and the first
// move, the drag went on with the old, detached card: a giant ghost in the
// corner, and the card put back as a duplicate.
test("a grid rebuilt under a press drops the drag instead of breaking", async ({ page }) => {
  const from = await centre(card(page, "Paddington 2"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.evaluate(() => {
    const grid = document.getElementById("grid-movies-towatch");
    grid._html = null;
    grid.innerHTML = grid.innerHTML; // every card replaced by a copy
  });
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + i * 25, from.y + i * 8);
  await page.waitForTimeout(300);
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  const ids = await page.locator("#grid-movies-towatch .card[data-id]").evaluateAll((els) => els.map((e) => e.dataset.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(titles(page)).toHaveText(TITLES);
});

// Regression: two drops in quick succession — the first one's realtime
// echoes landed after the second had been saved, and put the titles back
// where the first drop had left them.
test("echoes of an earlier drop landing late don't undo the latest one", async ({ page, backend }) => {
  backend.hooks.holdRealtime = true;
  const saves = () => backend.log.filter((line) => line.startsWith("UPSERT movies")).length;
  const before = saves();

  await dragTo(page, await centre(card(page, "The Matrix")), await centre(card(page, "Inception")));
  await page.mouse.up();
  await expect.poll(saves).toBe(before + 1);
  const firstDropEchoes = backend.heldPushes.length;
  await expect(titles(page)).toHaveText(["Paddington 2", "Inception", "The Matrix", "Heat"]);

  await page.waitForTimeout(300); // let the first card land
  await dragTo(page, await centre(card(page, "The Matrix")), await centre(card(page, "Heat")));
  await page.mouse.up();
  await expect.poll(saves).toBe(before + 2);
  const latest = ["Paddington 2", "Inception", "Heat", "The Matrix"];
  await expect(titles(page)).toHaveText(latest);

  backend.releaseRealtime(firstDropEchoes); // the first drop's echoes, now
  await page.waitForTimeout(300);
  await expect(titles(page)).toHaveText(latest);
  backend.releaseRealtime(); // and the second's
  await page.waitForTimeout(300);
  await expect(titles(page)).toHaveText(latest);
});
