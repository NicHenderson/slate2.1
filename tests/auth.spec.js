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
    // The Privacy Policy box starts unticked, and nothing goes without it.
    await expect(page.locator("#auth-consent")).not.toBeChecked();
    await page.click("#auth-submit");
    await expect(page.locator("#auth-consent-error")).toHaveText("Tick the box to go on.");
    expect(backend.accessRequests).toEqual([]);
    await page.check("#auth-consent");
    await page.click("#auth-submit");

    // Not automatic, not instant — and it may land in spam.
    const sent = page.locator("#auth-message");
    await expect(sent).toContainText("Request sent!");
    await expect(sent).toContainText("isn't instant — it usually takes anywhere from a few hours to a day");
    await expect(sent).toContainText("We'll write to ana@slate.test once your account is ready.");
    await expect(sent).toContainText("check your spam folder");
    await expect(page.locator("#auth-submit")).toHaveText(/^Send again in \d+s$/);
    await expect(page.locator("#auth-name")).toHaveValue("");
    expect(backend.accessRequests).toEqual([
      expect.objectContaining({ subject: "Slate access request: Ana", replyto: "ana@slate.test", name: "Ana", email: "ana@slate.test", message: "Friend of Nico's." }),
    ]);
    expect(backend.accessRequests[0]["Requested on"]).toMatch(/\d{4}/);
    expect(backend.accessRequests[0]["Privacy Policy"]).toContain("I'm 14 or older\" (version 1.2)");
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
    await page.check("#auth-consent");
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
    await page.check("#auth-consent");
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

// Accounts are made by hand in Supabase with a temporary password, emailed
// to the new member: their first login asks for a password of their own.
test.describe("first login with a temporary password", () => {
  const NEW = { email: "ana@slate.test", password: "temporary-pass-1" };

  // Through the login card, as logIn() does — but the app doesn't open.
  async function logInWithTemporaryPassword(page) {
    await page.goto("/#login");
    await page.fill("#auth-email", NEW.email);
    await page.fill("#auth-password", NEW.password);
    await page.click("#auth-submit");
    await expect(page.locator("#auth-title")).toHaveText("Choose Your Password");
  }

  test("asks for a password of their own before the app opens, then opens it", async ({ page, backend }) => {
    const ana = backend.addUser(NEW.email, NEW.password, { temporary: true });
    await logInWithTemporaryPassword(page);
    await expect(page.locator("#app")).toBeHidden();
    await expect(page.locator("#auth-back")).toBeHidden();
    await expect(page.locator("#auth-email-field")).toBeHidden();

    // A reload doesn't get around it.
    await page.reload();
    await expect(page.locator("#auth-title")).toHaveText("Choose Your Password");
    await expect(page.locator("#app")).toBeHidden();

    // Not the temporary one again, and both boxes must match. The Privacy
    // Policy box isn't asked again here: it was ticked with the request.
    await expect(page.locator("#auth-consent-field")).toBeHidden();
    await page.fill("#auth-password", NEW.password);
    await page.fill("#auth-confirm", "something-else-1");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-confirm-error")).toHaveText("Passwords do not match.");
    await page.fill("#auth-confirm", NEW.password);
    await page.click("#auth-submit");
    await expect(page.locator("#auth-password-error")).toHaveText("That's already your password — choose a different one.");

    await page.fill("#auth-password", "anas-own-password");
    await page.fill("#auth-confirm", "anas-own-password");
    await page.click("#auth-submit");
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator(".toast").last()).toHaveText("Password saved. Welcome to Slate!");
    expect(ana.password).toBe("anas-own-password");
    expect(ana.metadata).toEqual({ password_chosen: true, privacy_version: "1.2", privacy_accepted_at: expect.any(String), privacy_accepted_with: "access request" });

    // From now on, straight in with it.
    await page.click("#logout-btn");
    await expect(page.locator("#landing-screen")).toBeVisible();
    await logIn(page, { email: NEW.email, password: "anas-own-password" });
    await expect(page.locator("#auth-screen")).toBeHidden();
  });

  test("“Log out” there leaves without changing anything", async ({ page, backend }) => {
    const ana = backend.addUser(NEW.email, NEW.password, { temporary: true });
    await logInWithTemporaryPassword(page);
    await expect(page.locator("#auth-toggle-btn")).toHaveText("Log out");
    await page.click("#auth-toggle-btn");
    await expect(page.locator("#landing-screen")).toBeVisible();
    await expect(page.locator("#auth-screen")).toBeHidden();
    expect(ana.password).toBe(NEW.password);
    expect(ana.metadata).toEqual({});
  });

  test("a session saved before the account was marked doesn't ask again", async ({ page, backend }) => {
    const ana = backend.addUser(NEW.email, NEW.password, { temporary: true });
    await logInWithTemporaryPassword(page);
    // Marked on the server meanwhile (as migration 0006 does); this tab's
    // saved session still has the old metadata.
    ana.metadata = { password_chosen: true, privacy_version: "1.2" };
    await page.reload();
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#auth-screen")).toBeHidden();
  });
});

// The Privacy Policy came after the first accounts: each is asked to
// accept it once, at their next login, before the app opens.
test.describe("an account from before the Privacy Policy", () => {
  const OLD = { email: "leo@slate.test", password: "leos-own-password" };

  async function logInAsLeo(page) {
    await page.goto("/#login");
    await page.fill("#auth-email", OLD.email);
    await page.fill("#auth-password", OLD.password);
    await page.click("#auth-submit");
    await expect(page.locator("#auth-title")).toHaveText("Our Privacy Policy");
  }

  test("is asked once, with the box, and then goes straight in", async ({ page, backend }) => {
    const leo = backend.addUser(OLD.email, OLD.password, { privacy: false });
    await logInAsLeo(page);
    await expect(page.locator("#app")).toBeHidden();
    await expect(page.locator("#auth-back")).toBeHidden();
    await expect(page.locator("#auth-email-field")).toBeHidden();
    await expect(page.locator("#auth-password-field")).toBeHidden();
    await expect(page.locator('#auth-consent-field a[href="privacy.html"]')).toBeVisible();

    // A reload doesn't get around it, and neither does an unticked box.
    await page.reload();
    await expect(page.locator("#auth-title")).toHaveText("Our Privacy Policy");
    await page.click("#auth-submit");
    await expect(page.locator("#auth-consent-error")).toHaveText("Tick the box to go on.");
    expect(leo.metadata.privacy_version).toBeUndefined();

    await page.check("#auth-consent");
    await page.click("#auth-submit");
    await expect(page.locator("#app")).toBeVisible();
    expect(leo.metadata).toEqual({ password_chosen: true, privacy_version: "1.2", privacy_accepted_at: expect.any(String) });

    await page.click("#logout-btn");
    await expect(page.locator("#landing-screen")).toBeVisible();
    await logIn(page, OLD);
    await expect(page.locator("#auth-screen")).toBeHidden();
  });

  test("“Log out” there leaves without accepting", async ({ page, backend }) => {
    const leo = backend.addUser(OLD.email, OLD.password, { privacy: false });
    await logInAsLeo(page);
    await page.click("#auth-toggle-btn");
    await expect(page.locator("#landing-screen")).toBeVisible();
    await expect(page.locator("#auth-screen")).toBeHidden();
    expect(leo.metadata).toEqual({ password_chosen: true });
  });
});
