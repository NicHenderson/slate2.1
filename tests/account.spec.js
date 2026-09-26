// Settings → Delete account (js/deleteAccount.js, migration 0005).
const { test, expect, logIn, USER } = require("./support/fixtures");

async function openDelete(page) {
  await logIn(page);
  await page.click('.nav-btn[data-section="settings"]');
  await page.locator(".tile-danger").scrollIntoViewIfNeeded();
  await page.click("#delete-account-btn");
  await expect(page.locator("#import-title")).toHaveText("This deletes your account");
}

async function fillAndConfirm(page, password) {
  await expect(page.locator("#delete-password")).toBeEnabled({ timeout: 4000 });
  await page.fill("#delete-password", password);
  await page.fill("#delete-confirm-input", "Delete my account");
  await page.click('[data-account-action="delete"]');
}

test("locked for 3 seconds, then needs the password and “Delete my account”", async ({ page }) => {
  await openDelete(page);
  await expect(page.locator(".import-danger-text")).toContainText("2 movies, 1 show and 1 collection");
  const password = page.locator("#delete-password");
  const phrase = page.locator("#delete-confirm-input");
  const go = page.locator('[data-account-action="delete"]');
  await expect(password).toBeDisabled();
  await expect(phrase).toBeDisabled();
  await expect(phrase).toHaveAttribute("placeholder", "Wait 3…");
  await expect(page.locator("#delete-backup-first")).toBeChecked();

  await expect(password).toBeEnabled({ timeout: 4000 });
  await phrase.fill("  delete   MY account ");
  await expect(go).toBeDisabled(); // no password yet
  await password.fill("anything");
  await expect(go).toBeEnabled();
  await phrase.fill("delete my acount");
  await expect(go).toBeDisabled();
});

test("a wrong password deletes nothing and says so", async ({ page, backend }) => {
  await openDelete(page);
  const before = backend.snapshot();
  let downloaded = false;
  page.on("download", () => (downloaded = true));
  await fillAndConfirm(page, "not-my-password");
  await expect(page.locator(".delete-error")).toHaveText("That password isn't right. Nothing was deleted.");
  await expect(page.locator("#delete-password")).toBeEnabled(); // no second wait
  expect(backend.snapshot()).toEqual(before);
  expect(backend.users.size).toBe(1);
  expect(downloaded).toBe(false); // the password is checked before the backup
});

test("if the server fails, nothing is deleted", async ({ page, backend }) => {
  await openDelete(page);
  backend.hooks.failWhen = (method, table) => table === "rpc/delete_my_account" && "simulated outage";
  await page.locator("#delete-backup-first").uncheck({ force: true });
  await fillAndConfirm(page, USER.password);
  await expect(page.locator(".delete-error")).toContainText("couldn't be deleted. Nothing was deleted");
  expect(backend.users.size).toBe(1);
  expect(backend.db.movies).toHaveLength(2);
});

test("with the right password: backup first, then the account and everything in it are gone", async ({ page, backend }) => {
  // Someone else's library, which must survive.
  const other = backend.addUser("other@slate.test", "other-password-1");
  backend.seed("movies", [{ tmdb_id: 348, title: "Alien", watched_date: null }], other.id);
  backend.seed("collections", [{ name: "Theirs", icon: "🎬" }], other.id);

  await openDelete(page);
  const [backup] = await Promise.all([page.waitForEvent("download"), fillAndConfirm(page, USER.password)]);
  expect(backup.suggestedFilename()).toMatch(/^slate-backup-before-deleting-\d{4}-\d{2}-\d{2}\.slate$/);

  await expect(page.locator("#landing-screen")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
  await expect(page.locator(".toast")).toHaveText("Your account and everything in it were deleted.");

  expect([...backend.users.values()].map((u) => u.email)).toEqual(["other@slate.test"]);
  expect(backend.db.movies.map((m) => m.user_id)).toEqual([other.id]);
  expect(backend.db.shows).toEqual([]);
  expect(backend.db.collections.map((c) => c.name)).toEqual(["Theirs"]);
  expect(backend.db.collection_items).toEqual([]);

  // The old login no longer works.
  await page.goto("/#login");
  await page.fill("#auth-email", USER.email);
  await page.fill("#auth-password", USER.password);
  await page.click("#auth-submit");
  await expect(page.locator("#auth-message")).toHaveText("Incorrect email or password");
});
