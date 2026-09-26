// The basics, end to end: landing → login → library → TMDB → logout.
const { test, expect, logIn, USER } = require("./support/fixtures");

test("a signed-out visitor sees the landing page and can open the login card", async ({ page, backend }) => {
  await page.goto("/");
  await expect(page.locator("#landing-screen")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();

  await page.locator('#lp-nav a[href="#login"]').click();
  await expect(page.locator("#auth-screen")).toBeVisible();
  await expect(page.locator("#auth-title")).toHaveText("Log In");
  await expect(page).toHaveURL(/#login$/);
  expect(backend.blocked).toEqual([]);
});

test("a wrong password is refused; the right one opens the library", async ({ page }) => {
  await page.goto("/#login");
  await page.fill("#auth-email", USER.email);
  await page.fill("#auth-password", "not-the-password");
  await page.click("#auth-submit");
  await expect(page.locator("#auth-message")).toHaveText("Incorrect email or password");
  await expect(page.locator("#app")).toBeHidden();

  await page.fill("#auth-password", USER.password);
  await page.click("#auth-submit");
  await expect(page.locator("#app")).toBeVisible();
  await page.click('.nav-btn[data-section="movies-watched"]');
  await expect(page.locator("#grid-movies-watched .card-title")).toHaveText(["Alien"]);
});

test("searching TMDB and adding a title puts it on the watchlist", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await expect(page.locator("#grid-movies-towatch .card-title")).toHaveText(["The Matrix"]);

  await page.click("#movies-towatch .add-btn");
  await page.fill("#modal-input", "paddington");
  await page.click("#modal-search-btn");
  await expect(page.locator("#modal-results .tmdb-row-title")).toHaveText(["Paddington 2"]);
  // The To Watch list's search adds in batches: tick it, then add.
  await page.locator("#modal-results .row-check").check();
  await page.locator("#batch-add-btn").click();

  await expect(page.locator("#grid-movies-towatch .card-title")).toContainText(["Paddington 2"]);
  const saved = backend.db.movies.find((m) => m.tmdb_id === 346648);
  expect(saved).toMatchObject({ title: "Paddington 2", release_year: 2017, duration: 104, genres: "Adventure, Comedy, Family", watched_date: null, user_id: backend.user.id });
});

test("logging out returns to the landing page", async ({ page }) => {
  await logIn(page);
  await page.click("#logout-btn");
  await expect(page.locator("#landing-screen")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
  // …and a reload doesn't bring the session back.
  await page.reload();
  await expect(page.locator("#landing-screen")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
});
