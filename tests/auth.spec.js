// Accounts: asking for one, logging in, and getting back in with a reset link.
const { test, expect, logIn, USER } = require("./support/fixtures");

test.describe("requesting access", () => {
  // Slate is invite-only: there's no way to make an account from the app.
  // The card asks for access instead, emailed to Slate's inbox (Web3Forms).
  test("the landing's button opens Request Access, which sends name, email and message — and makes no account", async ({ page, backend }) => {
    await page.goto("/");
    await page.locator('#lp-nav a[href="#request-access"]').click();
    await expect(page).toHaveURL(/#request-access$/);
    await expect(page.locator("#auth-title")).toHaveText("Request Access");
    await expect(page.locator("#auth-password-field")).toBeHidden();
    await expect(page.locator("#auth-confirm-field")).toBeHidden();

    await page.fill("#auth-name", "Ana");
    await page.fill("#auth-email", "ana@slate.test");
    await page.fill("#auth-note", "Friend of Nico's.");
    await expect(page.locator("#auth-note-count")).toHaveText("17/500");
    await page.click("#auth-submit");

    await expect(page.locator("#auth-message")).toHaveText("Request sent! We'll write to ana@slate.test once your account is ready.");
    await expect(page.locator("#auth-submit")).toHaveText(/^Send again in \d+s$/);
    await expect(page.locator("#auth-name")).toHaveValue("");
    expect(backend.accessRequests).toEqual([
      expect.objectContaining({ subject: "Slate access request: Ana", replyto: "ana@slate.test", name: "Ana", email: "ana@slate.test", message: "Friend of Nico's." }),
    ]);
    expect(backend.accessRequests[0]["Requested on"]).toMatch(/\d{4}/);
    expect(backend.accessRequests[0]["Next step"]).toContain("Add user");
    expect(backend.accessRequests[0].access_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(backend.users.size).toBe(1); // only the seeded one
  });

  test("checks the fields first, and a bot filling the hidden field sends nothing", async ({ page, backend }) => {
    await page.goto("/#signup"); // Create Account's old address asks for access now
    await expect(page.locator("#auth-title")).toHaveText("Request Access");
    await page.fill("#auth-email", "not-an-email");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-name-error")).toHaveText("Tell us your name.");
    await expect(page.locator("#auth-email-error")).toHaveText("Enter a valid email address.");
    expect(backend.accessRequests).toEqual([]);

    await page.fill("#auth-name", "Bot");
    await page.fill("#auth-email", "bot@spam.test");
    await page.locator("#auth-website").evaluate((el) => (el.value = "http://spam.test"));
    await page.click("#auth-submit");
    await expect(page.locator("#auth-message")).toContainText("Request sent!");
    expect(backend.accessRequests).toEqual([]);
  });

  test("if the request can't be sent, it says so and keeps what was typed", async ({ page, backend }) => {
    backend.hooks.failWhen = (method, target) => (target === "web3forms" ? { status: 500 } : null);
    await page.goto("/#login");
    await expect(page.locator("#auth-toggle-btn")).toHaveText("Request access");
    await page.click("#auth-toggle-btn");
    await page.fill("#auth-name", "Ana");
    await page.fill("#auth-email", "ana@slate.test");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-message")).toHaveText("Couldn't send your request. Please try again in a moment.");
    await expect(page.locator("#auth-name")).toHaveValue("Ana");
    await expect(page.locator("#auth-submit")).toBeEnabled();
  });
});

test.describe("forgot password", () => {
  test("sends a reset link back to Slate, without saying whether the account exists", async ({ page, backend }) => {
    await page.goto("/#login");
    await page.fill("#auth-email", USER.email);
    await page.click("#auth-forgot-btn");
    await expect(page).toHaveURL(/#forgot$/);
    await expect(page.locator("#auth-title")).toHaveText("Reset Password");
    await expect(page.locator("#auth-email")).toHaveValue(USER.email); // carried over
    await expect(page.locator("#auth-password-field")).toBeHidden();

    await page.click("#auth-submit");
    await expect(page.locator("#auth-message")).toContainText("If there's a Slate account for that email");
    await expect(page.locator("#auth-submit")).toBeDisabled();
    await expect(page.locator("#auth-submit")).toHaveText(/^Send again in \d+s$/);
    expect(backend.emails).toEqual([{ email: USER.email, redirectTo: "http://127.0.0.1:4173/" }]);

    // An unknown email gets the very same answer.
    await page.reload();
    await page.fill("#auth-email", "nobody@slate.test");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-message")).toContainText("If there's a Slate account for that email");
  });

  test("the link opens New Password; saving it signs out and the new password works", async ({ page, backend }) => {
    await page.goto(backend.recoveryLink(USER.email));
    await expect(page.locator("#auth-title")).toHaveText("New Password");
    await expect(page.locator("#app")).toBeHidden(); // signed in by the link, but not let in yet

    // A reload keeps it there.
    await page.reload();
    await expect(page.locator("#auth-title")).toHaveText("New Password");

    await page.fill("#auth-password", USER.password);
    await page.fill("#auth-confirm", USER.password);
    await page.click("#auth-submit");
    await expect(page.locator("#auth-password-error")).toHaveText("That's already your password — choose a different one.");

    await page.fill("#auth-password", "a-brand-new-one");
    await page.fill("#auth-confirm", "a-brand-new-one");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-title")).toHaveText("Log In");
    await expect(page.locator("#auth-message")).toHaveText("Password updated. Log in with your new password.");
    await expect(page.locator("#auth-email")).toHaveValue(USER.email);
    expect(backend.log).toContain("PASSWORD CHANGED");

    await page.fill("#auth-password", USER.password);
    await page.click("#auth-submit");
    await expect(page.locator("#auth-message")).toHaveText("Incorrect email or password");
    await page.fill("#auth-password", "a-brand-new-one");
    await page.click("#auth-submit");
    await expect(page.locator("#app")).toBeVisible();
  });

  test("“Log out” on New Password leaves without changing anything", async ({ page, backend }) => {
    await page.goto(backend.recoveryLink(USER.email));
    await expect(page.locator("#auth-title")).toHaveText("New Password");
    await page.click("#auth-toggle-btn");
    await expect(page.locator("#auth-screen")).toBeHidden();
    await expect(page.locator("#landing-screen")).toBeVisible();
    expect(backend.log).not.toContain("PASSWORD CHANGED");
  });

  const EXPIRED = "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";

  test("an expired link, signed out: Reset Password says so", async ({ page }) => {
    await page.goto(EXPIRED);
    await expect(page.locator("#auth-title")).toHaveText("Reset Password");
    await expect(page.locator("#auth-message")).toContainText("That reset link has expired or was already used.");
    await expect(page).toHaveURL(/\/#forgot$/);
  });

  test("an expired link, signed in: the app opens and says so", async ({ page }) => {
    await logIn(page);
    await page.goto("about:blank");
    await page.goto(EXPIRED);
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator(".toast")).toHaveText("That reset link has expired or was already used.");
    await expect(page).toHaveURL("http://127.0.0.1:4173/");
  });
});
