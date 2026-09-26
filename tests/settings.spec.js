// Settings and profile: what's picked there is kept by the account, not
// just by this browser, and applies the next time Slate opens.
const { test, expect, logIn } = require("./support/fixtures");

// Everything this browser remembers on its own — except the session.
async function forgetThisDevice(page) {
  await page.evaluate(() => {
    localStorage.removeItem("slate_settings_cache");
    localStorage.removeItem("slate_last_section");
  });
}

test("settings are saved to the account and apply when Slate opens again", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="settings"]');

  await page.click('[data-theme-key="ocean"]');
  await page.click("#reduce-motion-toggle");
  await page.click('[data-density-value="compact"]');
  await page.selectOption("#setting-open-to", "movies-towatch");
  await page.click("#confirm-deletes-toggle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");

  await expect
    .poll(() => backend.db.user_settings[0]?.settings)
    .toMatchObject({ theme: "ocean", reduceMotion: true, density: "compact", openTo: "movies-towatch", confirmDeletes: false });

  // As on another device: nothing cached here, only the account's settings.
  await forgetThisDevice(page);
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "ocean");
  await expect(html).toHaveAttribute("data-reduce-motion", "true");
  await expect(html).toHaveAttribute("data-density", "compact");
  await expect(page.locator("#movies-towatch")).toHaveClass(/\bactive\b/);

  // Confirm before deleting: off, so a delete happens right away.
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await page.locator('#detail-modal [data-action="delete"]').click();
  await expect(page.locator("#confirm-modal")).toBeHidden();
  await expect(page.locator("#grid-movies-towatch .card")).toHaveCount(0);
  await expect.poll(() => backend.db.movies.some((m) => m.tmdb_id === 603)).toBe(false);
});

test("the profile checks the username, saves only on Save profile, and comes back the same", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="settings"]');
  // An account without a username is given one from its email.
  await expect(page.locator("#profile-username")).toHaveValue("tester");
  await expect(page.locator("#profile-save")).toBeDisabled();
  const profile = () => backend.db.profiles.find((p) => p.user_id === backend.user.id);

  // A username that breaks the rules is refused before anything is sent.
  await page.fill("#profile-username", "no spaces here");
  await page.click("#profile-save");
  await expect(page.locator("#profile-username-error")).toHaveText("Use 3–20 letters, numbers, _ or . (no spaces).");
  expect(profile().username).toBe("tester");

  // Drafts: username, bio and both favorites, none of it saved yet.
  await page.fill("#profile-username", "cine.fan_2");
  await page.fill("#profile-bio", "Sci-fi first, everything else after.");
  await expect(page.locator("#profile-bio-count")).toHaveText("36/160");
  await expect(page.locator("#profile-bio")).toHaveAttribute("maxlength", "160");

  await page.click('[data-fav-slot="movie"] [data-fav-action="pick"]');
  await page.fill("#favorite-input", "inception");
  await page.click("#favorite-search-btn");
  await page.locator('#favorite-results [data-pick-id="27205"]').click();
  await page.click('[data-fav-slot="tv"] [data-fav-action="pick"]');
  await page.fill("#favorite-input", "dark");
  await page.click("#favorite-search-btn");
  await page.locator('#favorite-results [data-pick-id="70523"]').click();

  await expect(page.locator("#profile-preview .pp-username")).toHaveText("@cine.fan_2");
  await expect(page.locator("#profile-preview .pp-fav-title")).toHaveText(["Inception", "Dark"]);
  await expect(page.locator("#profile-dirty")).toBeVisible();
  expect(profile().username).toBe("tester");
  expect(profile().bio ?? null).toBeNull();
  expect(profile().favorite_movie ?? null).toBeNull();

  // Saved, all at once.
  await page.click("#profile-save");
  await expect(page.locator(".toast").last()).toHaveText("Profile saved.");
  await expect(page.locator("#profile-save")).toBeDisabled();
  expect(profile()).toMatchObject({
    username: "cine.fan_2",
    bio: "Sci-fi first, everything else after.",
    favorite_movie: { tmdb_id: 27205, title: "Inception" },
    favorite_show: { tmdb_id: 70523, title: "Dark" },
  });

  await page.reload();
  await page.click('.nav-btn[data-section="settings"]');
  await expect(page.locator("#profile-username")).toHaveValue("cine.fan_2");
  await expect(page.locator("#profile-bio")).toHaveValue("Sci-fi first, everything else after.");
  await expect(page.locator('[data-fav-slot="movie"] .favorite-title')).toHaveText("Inception");
  await expect(page.locator('[data-fav-slot="tv"] .favorite-title')).toHaveText("Dark");
});
