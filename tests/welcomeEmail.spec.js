// tools/welcome-email.html: the temporary password and welcome email sent
// by hand to someone let into Slate.
const { test, expect } = require("./support/fixtures");

test("builds the welcome email from what's typed, and copies it for Gmail", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tools/welcome-email.html");

  // A fresh temporary password to start with, and another on demand.
  const password = page.locator("#password");
  await expect(password).toHaveValue(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
  const first = await password.inputValue();
  await page.click("#generate");
  await expect(password).not.toHaveValue(first);

  // Nothing is copied until every field is filled in.
  await page.click("#copy-email");
  await expect(page.locator("#status")).toHaveText("Fill in their name, their email, Slate's address.");

  await page.fill("#name", "Ana <b>");
  await page.fill("#email", "ana@example.com");
  await page.fill("#link", "https://slate.example");
  // In Spanish, Slate's main language, unless English is picked.
  const preview = page.locator("#preview");
  await expect(preview).toContainText("¡Tu cuenta está lista, Ana <b>!"); // shown as text, not markup
  await expect(page.locator("#subject")).toHaveText("Tu cuenta de Slate está lista");
  await page.click('#lang [data-lang="en"]');
  await expect(preview).toContainText("Your account is ready, Ana <b>!");
  await expect(page.locator("#subject")).toHaveText("Your Slate account is ready");
  await expect(preview).toContainText(await password.inputValue());
  await expect(preview.locator('a[href="https://slate.example"]')).toHaveCount(2);

  await page.click("#copy-email");
  await expect(page.locator("#status")).toHaveText("Copied! Paste it into a new Gmail message with Ctrl+V.");
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType("text/html")).text();
  });
  expect(copied).toContain("Ana &lt;b&gt;");
  expect(copied).toContain(await password.inputValue());

  // The address and the language are remembered for next time.
  await page.reload();
  await expect(page.locator("#link")).toHaveValue("https://slate.example");
  await expect(page.locator('#lang [data-lang="en"]')).toHaveAttribute("aria-pressed", "true");
});
