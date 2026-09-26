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
  const preview = page.locator("#preview");
  await expect(preview).toContainText("Your account is ready, Ana <b>!"); // shown as text, not markup
  await expect(preview).toContainText(await password.inputValue());
  await expect(preview.locator('a[href="https://slate.example"]')).toHaveCount(2);

  const gmail = new URL(await page.locator("#open-gmail").getAttribute("href"));
  expect(gmail.searchParams.get("authuser")).toBe("slateappmail@gmail.com");
  expect(gmail.searchParams.get("to")).toBe("ana@example.com");
  expect(gmail.searchParams.get("su")).toBe("Your Slate account is ready");

  await page.click("#copy-email");
  await expect(page.locator("#status")).toHaveText("Copied! Paste it into the Gmail message with Ctrl+V.");
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType("text/html")).text();
  });
  expect(copied).toContain("Ana &lt;b&gt;");
  expect(copied).toContain(await password.inputValue());

  // The address is remembered for next time.
  await page.reload();
  await expect(page.locator("#link")).toHaveValue("https://slate.example");
});
