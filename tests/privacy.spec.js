// The privacy policy (privacy.html): the law asks for it to be reachable
// at all times, so it's checked that it opens from the landing page and
// names who's responsible, in the language picked for Slate.
const { test, expect } = require("./support/fixtures");

test("the privacy policy opens from the landing page, in the language picked for Slate", async ({ page, backend }) => {
  await page.goto("/");
  await page.locator('.lp-footer a[href="privacy.html"]').click();
  await expect(page).toHaveURL(/privacy\.html$/);
  await expect(page.locator("h1")).toContainText("Your privacy");
  await expect(page.locator("#s1")).toContainText("Manuel Pinto Devia");
  await expect(page.locator("#s1 .mail")).toHaveText("slateappmail@gmail.com");

  // It has no picker of its own: Spanish, picked in Slate, carries over.
  await page.locator("#back").click();
  await page.locator(".lp-footer [data-language-picker]").selectOption("es");
  await expect(page.locator(".lp-footer a[href='privacy.html']")).toHaveText("Privacidad");
  await page.locator('.lp-footer a[href="privacy.html"]').click();
  await expect(page.locator("h1")).toContainText("Tu privacidad");
  expect(backend.blocked).toEqual([]);
});
