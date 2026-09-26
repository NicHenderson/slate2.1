// Accounts: registering, logging in, and getting back in with a reset link.
const { test, expect, logIn, USER } = require("./support/fixtures");

test.describe("registering", () => {
  test("creates the account and asks to confirm the email before logging in", async ({ page, backend }) => {
    await page.goto("/#signup");
    await expect(page.locator("#auth-title")).toHaveText("Create Account");
    await page.fill("#auth-email", "new@slate.test");
    await page.fill("#auth-password", "a-fine-password");
    await page.fill("#auth-confirm", "a-fine-password");
    await page.click("#auth-submit");

    await expect(page.locator("#auth-title")).toHaveText("Log In");
    await expect(page.locator("#auth-message")).toHaveText("Check your email to confirm your account before logging in.");
    expect([...backend.users.values()].some((u) => u.email === "new@slate.test")).toBe(true);
  });

  test("checks the fields before sending anything", async ({ page, backend }) => {
    await page.goto("/#signup");
    await page.fill("#auth-email", "not-an-email");
    await page.fill("#auth-password", "short");
    await page.fill("#auth-confirm", "different");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-email-error")).toHaveText("Enter a valid email address.");
    await expect(page.locator("#auth-password-error")).toHaveText("Password must be at least 8 characters.");
    await expect(page.locator("#auth-confirm-error")).toHaveText("Passwords do not match.");
    expect(backend.users.size).toBe(1);
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
