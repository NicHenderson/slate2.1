// Settings → Your Data: exporting to a .slate file and importing one back.
const { test, expect, logIn } = require("./support/fixtures");

async function openYourData(page) {
  await logIn(page);
  await page.click('.nav-btn[data-section="settings"]');
  await page.locator(".tile-data").scrollIntoViewIfNeeded();
}

// A .slate file built in the test, as Settings → Export writes them
// (version 1 unless the content says otherwise: before viewings).
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

const viewingDates = (backend, movie) =>
  backend.db.viewings.filter((v) => v.movie_id === movie.id).map((v) => v.watched_on).sort();

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
  expect(file).toMatchObject({ slate: "backup", version: 2, counts: { movies: 2, shows: 1, collections: 1, collection_items: 2, viewings: 1 } });
  expect(file.movies.map((m) => m.title).sort()).toEqual(["Alien", "The Matrix"]);
  expect(file.movies.find((m) => m.title === "Alien")).toMatchObject({ rating: 9, review: "Still terrifying.", watched_date: "2026-08-01" });
  expect(file.movies.find((m) => m.title === "Alien").viewings.map((v) => v.watched_on)).toEqual(["2026-08-01"]);
  expect(file.movies.find((m) => m.title === "The Matrix").viewings).toEqual([]);
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
        { id: "f-inception", tmdb_id: 27205, title: "Inception", rating: 9, review: "Dreams.", watched_date: "2026-09-12", release_year: 2010,
          poster: 'https://image.tmdb.org/t/p/w500/a.jpg" onload="alert(1)' },
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
  expect(inception.poster).toBeNull(); // not a plain TMDB image address: left out
  // A version 1 file: one viewing per watched movie, on its date.
  expect(viewingDates(backend, inception)).toEqual(["2026-09-12"]);
  expect(backend.db.collections).toHaveLength(1);
  const col = backend.db.collections[0];
  expect(backend.db.collection_items.filter((i) => i.collection_id === col.id).map((i) => i.item_id)).toContain(inception.id);
  expect(backend.db.collection_items).toHaveLength(3);
});

test("a version 2 file brings every viewing: exported rewatches come back as they were", async ({ page, backend }) => {
  const alien = backend.db.movies.find((m) => m.tmdb_id === 348);
  backend.seed("viewings", [{ movie_id: alien.id, watched_on: "2024-10-31" }], backend.user.id);
  await openYourData(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#data-export-btn")]);
  const file = await readDownload(download);
  expect(file.counts.viewings).toBe(2);
  expect(file.movies.find((m) => m.title === "Alien").viewings.map((v) => v.watched_on)).toEqual(["2024-10-31", "2026-08-01"]);

  // Into an empty library (this one, emptied): Alien comes back watched twice.
  backend.db.movies = [];
  backend.db.viewings = [];
  backend.db.collection_items = [];
  await page.reload();
  await page.click('.nav-btn[data-section="settings"]');
  await pickFile(page, { name: "back.slate", mimeType: "application/octet-stream", buffer: Buffer.from(JSON.stringify(file)) });
  await page.click('[data-import-action="continue"]');
  await page.click('[data-import-mode="add"]');
  await page.click('[data-import-action="run"]');
  await expect(page.locator("#import-title")).toHaveText("Import complete", { timeout: 10000 });
  const back = backend.db.movies.find((m) => m.tmdb_id === 348);
  expect(back.watched_date).toBe("2026-08-01");
  expect(viewingDates(backend, back)).toEqual(["2024-10-31", "2026-08-01"]);
  expect(viewingDates(backend, backend.db.movies.find((m) => m.tmdb_id === 603))).toEqual([]);

  // The app shows it at once, without a reload.
  await page.click('[data-import-action="close"]');
  await page.click('.nav-btn[data-section="movies-watched"]');
  await expect(page.locator("#grid-movies-watched .card", { hasText: "Alien" }).locator(".card-rewatch")).toHaveText("×2");
});

// A library where Replace meets every case: Alien watched twice (the file
// has it watched on other days), Heat watched (to watch in the file), The
// Matrix to watch (watched in the file) and Inception new.
function seedRewatchLibrary(backend) {
  const alien = backend.db.movies.find((m) => m.tmdb_id === 348);
  backend.seed("viewings", [{ movie_id: alien.id, watched_on: "2024-10-31" }], backend.user.id);
  backend.seed("movies", [{ tmdb_id: 949, title: "Heat", duration: 170, watched_date: "2025-01-01" }], backend.user.id);
}

const REWATCH_REPLACEMENT = {
  version: 2,
  movies: [
    { id: "f-alien", tmdb_id: 348, title: "Alien", rating: 10, watched_date: "2026-09-01", viewings: [{ watched_on: "2020-05-01" }, { watched_on: "2026-09-01" }] },
    { id: "f-heat", tmdb_id: 949, title: "Heat", watched_date: null, viewings: [] },
    { id: "f-matrix", tmdb_id: 603, title: "The Matrix", watched_date: "2026-01-02", viewings: [{ watched_on: "2026-01-02" }] },
    { id: "f-inception", tmdb_id: 27205, title: "Inception", watched_date: "2026-09-12", viewings: [{ watched_on: "2019-01-01" }, { watched_on: "2026-09-12" }, { watched_on: "2026-09-12" }] },
  ],
  shows: [],
  collections: [{ name: "New shelf", icon: "📚", position: 1, items: [{ item_type: "movie", item_id: "f-heat", position: 1 }] }],
};

async function confirmReplace(page, content, { backupFirst = false } = {}) {
  await pickFile(page, slateFile(content));
  await page.click('[data-import-action="continue"]');
  await page.click('[data-import-mode="replace"]');
  await page.click('[data-import-action="run"]');
  if (!backupFirst) await page.locator("#import-backup-first").uncheck({ force: true });
  await expect(page.locator("#import-confirm-input")).toBeEnabled({ timeout: 4000 });
  await page.fill("#import-confirm-input", "Delete Data");
  await page.click('[data-import-action="confirm-replace"]');
}

test("Replace with viewings: one request, and every movie ends with exactly the file's viewings", async ({ page, backend }) => {
  seedRewatchLibrary(backend);
  await openYourData(page);
  const writesBefore = backend.log.length;
  await confirmReplace(page, REWATCH_REPLACEMENT);
  await expect(page.locator("#import-title")).toHaveText("Library replaced", { timeout: 10000 });
  await expect(page.locator("#import-body")).toContainText("1 title that wasn't in the file was removed.");
  // The whole swap is one call (one transaction): a tab closed or a
  // connection lost halfway can't leave the library half replaced.
  expect(backend.log.slice(writesBefore)).toEqual(["RPC replace_my_library"]);

  const movie = (tmdbId) => backend.db.movies.find((m) => m.tmdb_id === tmdbId);
  expect(backend.db.movies.map((m) => m.title).sort()).toEqual(["Alien", "Heat", "Inception", "The Matrix"]);
  expect(movie(348)).toMatchObject({ rating: 10, watched_date: "2026-09-01" });
  expect(viewingDates(backend, movie(348))).toEqual(["2020-05-01", "2026-09-01"]);
  expect(movie(949).watched_date).toBeNull();
  expect(viewingDates(backend, movie(949))).toEqual([]);
  expect(movie(603).watched_date).toBe("2026-01-02");
  expect(viewingDates(backend, movie(603))).toEqual(["2026-01-02"]);
  expect(movie(27205).watched_date).toBe("2026-09-12");
  expect(viewingDates(backend, movie(27205))).toEqual(["2019-01-01", "2026-09-12", "2026-09-12"]);
  expect(backend.db.viewings).toHaveLength(6); // nothing left over from before
  expect(backend.db.collection_items.map((i) => i.item_id)).toEqual([movie(949).id]);
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
  await input.fill("delete data"); // exactly as it reads, capitals included
  await expect(go).toBeDisabled();
  await input.fill(" Delete Data ");
  await expect(go).toBeEnabled();

  const writesBefore = backend.log.length;
  const [backup] = await Promise.all([page.waitForEvent("download"), go.click()]);
  expect(backup.suggestedFilename()).toMatch(/^slate-backup-before-import-\d{4}-\d{2}-\d{2}\.slate$/);
  const saved = await readDownload(backup);
  expect(saved.counts).toEqual({ movies: 2, shows: 1, collections: 1, collection_items: 2, viewings: 1 });

  await expect(page.locator("#import-title")).toHaveText("Library replaced", { timeout: 10000 });
  expect(backend.log.length).toBeGreaterThan(writesBefore);
  expect(backend.db.movies.map((m) => m.title)).toEqual(["Inception"]);
  expect(backend.db.shows).toEqual([]);
  expect(backend.db.collections.map((c) => c.name)).toEqual(["New shelf"]);
  expect(backend.db.collection_items).toHaveLength(1);
  expect(backend.db.collection_items[0].item_id).toBe(backend.db.movies[0].id);
});

// Every table's rows in one order, and without empty columns: putting a
// movie back can move it in the fake's lists, and fill in as null a column
// its seed left out, without changing a thing about it.
const sorted = (snap) =>
  Object.fromEntries(
    Object.entries(snap).map(([table, rows]) => [
      table,
      rows.map((row) => Object.fromEntries(Object.entries(row).filter(([, v]) => v != null))).sort((a, b) => a.id.localeCompare(b.id)),
    ])
  );

test("Replace: if the database refuses it, nothing changes — viewings included", async ({ page, backend }) => {
  seedRewatchLibrary(backend);
  await openYourData(page);
  const before = sorted(backend.snapshot());
  backend.hooks.failWhen = (method, table) => table === "rpc/replace_my_library" && "simulated outage";
  await confirmReplace(page, REWATCH_REPLACEMENT);

  await expect(page.locator("#import-title")).toHaveText("The import didn't finish", { timeout: 10000 });
  await expect(page.locator("#import-body")).toContainText("so nothing was changed: your library is exactly as it was");
  expect(sorted(backend.snapshot())).toEqual(before);
});

test("Replace: when the answer never comes back, it says the library is one or the other, never a mix", async ({ page, backend }) => {
  await openYourData(page);
  backend.hooks.failWhen = (method, table) => table === "rpc/replace_my_library" && "network after";
  await confirmReplace(page, REPLACEMENT);

  await expect(page.locator("#import-title")).toHaveText("The import didn't finish", { timeout: 10000 });
  await expect(page.locator("#import-body")).toContainText("either exactly as it was or exactly this file");
  expect(backend.db.movies.map((m) => m.title)).toEqual(["Inception"]);
});
