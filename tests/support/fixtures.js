// What every test gets: `backend`, the fake Supabase already installed in
// the page, with one user and a small library in it. And a guard: an
// uncaught error in the page fails the test, even if everything else passed.
const base = require("@playwright/test");
const { createBackend } = require("./fakeSupabase");

const USER = { email: "tester@slate.test", password: "correct-horse-1" };

// A small library for USER: enough to have something on every list.
function seedLibrary(backend, userId) {
  const [alien, matrix] = backend.seed(
    "movies",
    [
      { tmdb_id: 348, title: "Alien", release_year: 1979, duration: 117, genres: "Horror, Science Fiction", watched_date: "2026-08-01", rating: 9, review: "Still terrifying." },
      { tmdb_id: 603, title: "The Matrix", release_year: 1999, duration: 136, genres: "Action, Science Fiction", watched_date: null },
    ],
    userId
  );
  backend.seed(
    "shows",
    [{ tmdb_id: 70523, title: "Dark", release_year: 2017, total_seasons: 3, total_episodes: 26, genres: "Crime, Drama, Mystery", started_watching_date: "2026-01-10", finished_watching_date: "2026-02-01", rating: 10 }],
    userId
  );
  const [col] = backend.seed("collections", [{ name: "Sci-fi night", icon: "🚀", position: 1 }], userId);
  backend.seed("collection_items", [
    { collection_id: col.id, item_type: "movie", item_id: alien.id, position: 1 },
    { collection_id: col.id, item_type: "movie", item_id: matrix.id, position: 2 },
  ]);
}

const test = base.test.extend({
  // auto: installed in every test, asked for or not — no test may ever
  // reach the real backend by forgetting to mention it.
  backend: [
    async ({ page }, use) => {
      const backend = createBackend();
      const user = backend.addUser(USER.email, USER.password);
      seedLibrary(backend, user.id);
      backend.user = user;
      await backend.install(page);
      await use(backend);
      base.expect(backend.blocked, "requests to hosts outside the app").toEqual([]);
    },
    { auto: true },
  ],

  pageErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await use(errors);
      base.expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

// Logs USER in through the real login card and waits for the library.
async function logIn(page, { email = USER.email, password = USER.password } = {}) {
  await page.goto("/#login");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await page.click("#auth-submit");
  await base.expect(page.locator("#app")).toBeVisible();
}

module.exports = { test, expect: base.expect, logIn, USER };
