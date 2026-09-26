// Settings → Your Data: exporting to a .slate file and importing one back.
const { test, expect, logIn } = require("./support/fixtures");

async function openYourData(page) {
  await logIn(page);
  await page.click('.nav-btn[data-section="settings"]');
  await page.locator(".tile-data").scrollIntoViewIfNeeded();
}

// A .slate file built in the test, as Settings → Export writes them.
function slateFile(content) {
  const text = JSON.stringify({ slate: "backup", version: 1, exported_at: "2026-09-25T22:00:00Z", ...content });
  return { name: "slate-backup-2026-09-25.slate", mimeType: "application/octet-stream", buffer: Buffer.from(text) };
}

async function pickFile(page, file) {
  const chooser = page.waitForEvent("filechooser");
  await page.click("#data-import-btn");
  await (await chooser).setFiles(file);
  await expect(page.locator("#import-modal")).toHaveAttribute("data-view", /summary|error/, { timeout: 5000 });
}

async function readDownload(download) {
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("export downloads everything in the library as a .slate file", async ({ page }) => {
  await openYourData(page);
  await expect(page.locator("#data-export-summary")).toHaveText("2 movies, 1 show and 1 collection");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#data-export-btn")]);
  expect(download.suggestedFilename()).toMatch(/^slate-backup-\d{4}-\d{2}-\d{2}\.slate$/);

  const file = await readDownload(download);
  expect(file).toMatchObject({ slate: "backup", version: 1, counts: { movies: 2, shows: 1, collections: 1, collection_items: 2 } });
  expect(file.movies.map((m) => m.title).sort()).toEqual(["Alien", "The Matrix"]);
  expect(file.movies.find((m) => m.title === "Alien")).toMatchObject({ rating: 9, review: "Still terrifying.", watched_date: "2026-08-01" });
  expect(JSON.stringify(file)).not.toContain("user_id");
  const ids = new Set([...file.movies, ...file.shows].map((t) => t.id));
  expect(file.collections[0].items.every((item) => ids.has(item.item_id))).toBe(true);
});

test("a file that isn't a Slate backup is refused, touching nothing", async ({ page, backend }) => {
  await openYourData(page);
  const before = backend.snapshot();
  await pickFile(page, { name: "notes.slate", mimeType: "text/plain", buffer: Buffer.from("just some notes") });
  await expect(page.locator("#import-title")).toHaveText("That file won't open");
  await expect(page.locator("#import-body")).toContainText("This isn't a Slate backup");
  expect(backend.snapshot()).toEqual(before);
});

test("Add: new titles come in, ones already there are left alone, same-name collections merge", async ({ page, backend }) => {
  await openYourData(page);
  await pickFile(
    page,
    slateFile({
      movies: [
        { id: "f-alien", tmdb_id: 348, title: "Alien", rating: 2, review: "Changed my mind", watched_date: "2020-01-01" },
        { id: "f-inception", tmdb_id: 27205, title: "Inception", rating: 9, review: "Dreams.", watched_date: "2026-09-12", release_year: 2010 },
      ],
      shows: [],
      collections: [{ name: "  sci-fi NIGHT ", icon: "🚀", items: [
        { item_type: "movie", item_id: "f-inception", position: 1 },
        { item_type: "movie", item_id: "f-alien", position: 2 },
      ] }],
    })
  );
  await expect(page.locator(".import-stat")).toHaveText([/2\s*Movies/i, /0\s*Shows/i, /1\s*Collection/i]);

  await page.click('[data-import-action="continue"]');
  await expect(page.locator('[data-import-action="run"]')).toBeDisabled();
  await page.click('[data-import-mode="add"]');
  await page.click('[data-import-action="run"]');
  await expect(page.locator("#import-title")).toHaveText("Import complete", { timeout: 10000 });
  await expect(page.locator("#import-body")).toContainText("1 movie added to your library.");
  await expect(page.locator("#import-body")).toContainText("1 title was already there and stayed exactly as it was.");
  await expect(page.locator("#import-body")).toContainText("1 merged into one you had — 1 title placed in collections.");

  expect(backend.db.movies).toHaveLength(3);
  expect(backend.db.movies.find((m) => m.tmdb_id === 348)).toMatchObject({ rating: 9, review: "Still terrifying." }); // untouched
  const inception = backend.db.movies.find((m) => m.tmdb_id === 27205);
  expect(inception).toMatchObject({ rating: 9, review: "Dreams.", watched_date: "2026-09-12", release_year: 2010, user_id: backend.user.id });
  expect(backend.db.collections).toHaveLength(1);
  const col = backend.db.collections[0];
  expect(backend.db.collection_items.filter((i) => i.collection_id === col.id).map((i) => i.item_id)).toContain(inception.id);
  expect(backend.db.collection_items).toHaveLength(3);
});

const REPLACEMENT = {
  movies: [{ id: "f-inception", tmdb_id: 27205, title: "Inception", rating: 9, watched_date: "2026-09-12" }],
  shows: [],
  collections: [{ name: "New shelf", icon: "📚", position: 1, items: [{ item_type: "movie", item_id: "f-inception", position: 1 }] }],
};

async function startReplace(page) {
  await pickFile(page, slateFile(REPLACEMENT));
  await page.click('[data-import-action="continue"]');
  await page.click('[data-import-mode="replace"]');
  await page.click('[data-import-action="run"]');
  await expect(page.locator("#import-title")).toHaveText("This deletes your library");
}

test("Replace: locked for 3 seconds, needs “Delete Data”, backs up first, then the library is the file", async ({ page, backend }) => {
  await openYourData(page);
  await startReplace(page);
  await expect(page.locator(".import-danger-text")).toContainText("2 movies, 1 show and 1 collection");
  const input = page.locator("#import-confirm-input");
  const go = page.locator('[data-import-action="confirm-replace"]');
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute("placeholder", "Wait 3…");
  await expect(page.locator("#import-backup-first")).toBeChecked();
  await expect(input).toBeEnabled({ timeout: 4000 });
  await input.fill("delete dat");
  await expect(go).toBeDisabled();
  await input.fill("  delete   DATA ");
  await expect(go).toBeEnabled();

  const writesBefore = backend.log.length;
  const [backup] = await Promise.all([page.waitForEvent("download"), go.click()]);
  expect(backup.suggestedFilename()).toMatch(/^slate-backup-before-import-\d{4}-\d{2}-\d{2}\.slate$/);
  const saved = await readDownload(backup);
  expect(saved.counts).toEqual({ movies: 2, shows: 1, collections: 1, collection_items: 2 });

  await expect(page.locator("#import-title")).toHaveText("Library replaced", { timeout: 10000 });
  expect(backend.log.length).toBeGreaterThan(writesBefore);
  expect(backend.db.movies.map((m) => m.title)).toEqual(["Inception"]);
  expect(backend.db.shows).toEqual([]);
  expect(backend.db.collections.map((c) => c.name)).toEqual(["New shelf"]);
  expect(backend.db.collection_items).toHaveLength(1);
  expect(backend.db.collection_items[0].item_id).toBe(backend.db.movies[0].id);
});

test("Replace: if a write fails halfway, the library is put back exactly as it was", async ({ page, backend }) => {
  await openYourData(page);
  const before = backend.snapshot();
  backend.hooks.failWhen = (method, table) => method === "POST" && table === "collection_items" && "simulated outage";
  await startReplace(page);
  await page.locator("#import-backup-first").uncheck({ force: true });
  await expect(page.locator("#import-confirm-input")).toBeEnabled({ timeout: 4000 });
  await page.fill("#import-confirm-input", "Delete Data");
  await page.click('[data-import-action="confirm-replace"]');

  await expect(page.locator("#import-title")).toHaveText("The import didn't finish", { timeout: 10000 });
  await expect(page.locator("#import-body")).toContainText("your library is exactly as it was");
  expect(backend.snapshot()).toEqual(before);
});
