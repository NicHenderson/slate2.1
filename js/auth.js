const authScreen = document.getElementById("auth-screen");
const landingScreen = document.getElementById("landing-screen");
const appRoot = document.getElementById("app");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authConfirm = document.getElementById("auth-confirm");
const authConfirmField = document.getElementById("auth-confirm-field");
const authSubtitle = document.getElementById("auth-subtitle");
const authTitle = document.getElementById("auth-title");
const authSubmit = document.getElementById("auth-submit");
const authMessage = document.getElementById("auth-message");
const authToggleBtn = document.getElementById("auth-toggle-btn");
const authToggleText = document.getElementById("auth-toggle-text");
const logoutBtn = document.getElementById("logout-btn");
const authHint = document.getElementById("auth-hint");
const authEmailField = document.getElementById("auth-email-field");
const authPasswordField = document.getElementById("auth-password-field");
const authPasswordLabel = document.getElementById("auth-password-label");
const authConfirmLabel = document.getElementById("auth-confirm-label");
const authForgotBtn = document.getElementById("auth-forgot-btn");
const authNameField = document.getElementById("auth-name-field");
const authName = document.getElementById("auth-name");
const authNoteField = document.getElementById("auth-note-field");
const authConsentField = document.getElementById("auth-consent-field");
const authConsent = document.getElementById("auth-consent");
const authNote = document.getElementById("auth-note");
const authNoteCount = document.getElementById("auth-note-count");
const authTrap = document.getElementById("auth-website");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let authMode = "login"; // "login" | "request" | "forgot" | "reset" | "choose" | "privacy"
let authBusy = false;

/* ---------- the card's four modes ----------

   login     email + password, "Forgot password?" under it
   request   name + email + an optional message: asks for an account.
             Slate is invite-only — nobody signs themselves up. The request
             is emailed to Slate's inbox (Web3Forms); accounts are made by
             hand in Supabase, and the new member gets a temporary password.
   forgot    email only: sends a reset link (#forgot)
   reset     new password + confirm, reached from that link (signed in by
             it, but kept out of the app until the new password is saved)
   choose    the same, the first time someone logs in with the temporary
             password their account was made with: they pick their own
             before the app opens.
   privacy   only the Privacy Policy box, for an account made before the
             policy (or before its current version): once, then the app. */

const AUTH_MODES = {
  login: {
    eyebrow: t("Welcome back"),
    title: t("Log In"),
    submit: t("Log In"),
    busy: t("Logging in…"),
    toggleText: t("Don't have an account?"),
    toggleBtn: t("Request access"),
  },
  request: {
    eyebrow: t("Invite-only for now"),
    title: t("Request Access"),
    hint: t("Slate is private for now. Tell us who you are, and once your account is ready we'll email you a temporary password to log in with."),
    submit: t("Send request"),
    busy: t("Sending…"),
    toggleText: t("Already have an account?"),
    toggleBtn: t("Log In"),
  },
  forgot: {
    eyebrow: t("Happens to everyone"),
    title: t("Reset Password"),
    hint: t("Enter the email you signed up with and we'll send you a link to choose a new password."),
    submit: t("Send reset link"),
    busy: t("Sending…"),
    toggleText: t("Remembered it?"),
    toggleBtn: t("Log In"),
  },
  reset: {
    eyebrow: t("Almost there"),
    title: t("New Password"),
    hint: t("Choose a new password for your Slate account."),
    submit: t("Save password"),
    busy: t("Saving…"),
    toggleText: t("Not you?"),
    toggleBtn: t("Log out"),
  },
  choose: {
    eyebrow: t("Welcome to Slate"),
    title: t("Choose Your Password"),
    hint: t("You logged in with a temporary password. Choose your own to finish setting up your account — it's the one you'll use from now on."),
    submit: t("Save password"),
    busy: t("Saving…"),
    toggleText: t("Not you?"),
    toggleBtn: t("Log out"),
  },
  privacy: {
    eyebrow: t("One more thing"),
    title: t("Our Privacy Policy"),
    hint: t("Before you go on, take a look at Slate's Privacy Policy: what it keeps about you, what for, and your rights over it. Then tick the box."),
    submit: t("Continue"),
    busy: t("Saving…"),
    toggleText: t("Not now?"),
    toggleBtn: t("Log out"),
  },
};

// The two cards that set a password for someone already signed in: they
// hide the email and the way back, and "Log out" is the only way out.
const settingPassword = (mode) => mode === "reset" || mode === "choose";
// Every card for someone already signed in, the policy's included.
const signedInCard = (mode) => settingPassword(mode) || mode === "privacy";
// The cards with the Privacy Policy box.
const asksConsent = (mode) => mode === "request" || mode === "choose" || mode === "privacy";

/* ---------- the Privacy Policy ----------

   Accepting it is kept in the user's metadata, like password_chosen: the
   version read and when (the policy says a box is ticked; this is the
   record). A new version of privacy.html bumps PRIVACY_VERSION, and
   everyone is asked once more at their next login. Like password_chosen,
   it only records what the owner of the account did. */

const PRIVACY_VERSION = "1.2"; // privacy.html's "Version 1.2"

const acceptedPrivacy = (user) => user?.user_metadata?.privacy_version === PRIVACY_VERSION;

function privacyAcceptance() {
  return { privacy_version: PRIVACY_VERSION, privacy_accepted_at: new Date().toISOString() };
}

/* ---------- a password of their own ----------

   Accounts are made by hand in Supabase with a temporary password. The
   user metadata flag password_chosen marks the ones whose owner has since
   picked their own (set when they do; every account made before this —
   supabase/migrations/0006 — was marked at once). Without it, Slate asks
   for a new password before opening. It only ever guards the account's
   owner from keeping a password that was sent by email, so a user setting
   the flag themselves gains nothing. */

const hasOwnPassword = (user) => user?.user_metadata?.password_chosen === true;

// A reset link was followed in this tab and the new password isn't saved
// yet (set by the inline script in index.html, or by Supabase's
// PASSWORD_RECOVERY event). sessionStorage: survives a reload, not the tab.
const RECOVERY_KEY = "slate-recovery";

function recoveryPending() {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === "1";
  } catch {
    return false;
  }
}

function setRecoveryPending(on) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, "1");
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {}
}

// "Send again in 42s" after a reset email or an access request, so one
// impatient click doesn't burn through Supabase's hourly email allowance
// or fill Slate's inbox with copies. Kept per mode.
const RESEND_COOLDOWN_S = 60;
const resendReadyAt = { forgot: 0, request: 0 };
let resendTimer = null;

/* ---------- show/hide password ---------- */

// One toggle per password field (Password, Confirm password) — each reveals
// only its own input, independent of the other.
function initPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(`${inputId}-toggle`);
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle("is-visible", show);
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? t("Hide password") : t("Show password"));
  });
}

initPasswordToggle("auth-password");
initPasswordToggle("auth-confirm");

// Back to hidden — form.reset() clears the fields' values but not an input's
// `type`, so without this a toggle left "shown" would survive a switch
// between Login/Register (or a fresh visit to the screen) with nothing
// left in the field to actually show.
function hidePasswordFields() {
  [authPassword, authConfirm].forEach((input) => {
    input.type = "password";
    const btn = document.getElementById(`${input.id}-toggle`);
    btn.classList.remove("is-visible");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", t("Show password"));
  });
}

/* ---------- view toggling (driven only by session state) ----------

   Signed in: the app. Signed out: the landing page, with the login card
   laid over it while the URL is #login, #request-access or #forgot. The hash is the route
   so the browser's back button steps from the card back to the page (at
   the same scroll position — the page stays rendered underneath) and a
   "log in" link can be shared or bookmarked. */

// #signup is the old address of Create Account: it now asks for access.
const AUTH_ROUTES = { login: "login", "request-access": "request", signup: "request", forgot: "forgot" };
const ROUTE_FOR_MODE = { login: "#login", request: "#request-access", forgot: "#forgot" };

function authRouteFromHash() {
  return AUTH_ROUTES[location.hash.slice(1)] ?? null;
}

function clearAuthRoute() {
  if (authRouteFromHash()) history.replaceState(null, "", location.pathname + location.search);
}

// Every change of screen goes through swapView (js/viewTransitions.js),
// named for the choreography it gets in css/transitions.css.

function showAppView() {
  return swapView("enter-app", () => {
    landingScreen.classList.add("hidden");
    authScreen.classList.add("hidden");
    document.documentElement.classList.remove("auth-open");
    appRoot.classList.remove("hidden");
    logoutBtn.disabled = false;
    clearAuthRoute(); // a later logout should land on the page, not the card
  });
}

function showGuestView() {
  const mode = authRouteFromHash();
  const cardShown = !authScreen.classList.contains("hidden");
  let kind = null;
  if (!appRoot.classList.contains("hidden")) kind = "logout";
  else if (mode && !cardShown) kind = "open-auth";
  else if (!mode && cardShown) kind = "close-auth";
  else if (mode && authMode !== mode) kind = "auth-swap";

  const update = () => {
    appRoot.classList.add("hidden");
    landingScreen.classList.remove("hidden");
    logoutBtn.disabled = false;
    document.documentElement.classList.toggle("auth-open", Boolean(mode));
    if (!mode) {
      authScreen.classList.add("hidden");
      return;
    }
    if (authScreen.classList.contains("hidden") || authMode !== mode) {
      authForm.reset();
      setAuthMode(mode);
    }
    authScreen.classList.remove("hidden");
    // Straight to typing on a desktop; on a phone that would pop the
    // keyboard over the card before it's even been seen.
    if (matchMedia("(pointer: fine)").matches) authEmail.focus();
  };

  return swapView(kind, update);
}

// Login ⇄ Request Access inside the card: same card, new route (replaced, not
// pushed — back still leads out to the page, not through every toggle).
function setAuthRoute(mode) {
  history.replaceState(null, "", ROUTE_FOR_MODE[mode]);
  lastAuthRoute = mode;
  return swapView("auth-swap", () => setAuthMode(mode));
}

// The "new password" card, over the landing page, for a visitor signed in
// by a reset link ("reset") or with a temporary password ("choose"). Not a
// route: it lasts until the password is saved or they log out.
function showPasswordView(mode) {
  const cardShown = !authScreen.classList.contains("hidden");
  let kind = "open-auth";
  if (!appRoot.classList.contains("hidden")) kind = "logout";
  else if (cardShown) kind = authMode === mode ? null : "auth-swap";

  return swapView(kind, () => {
    appRoot.classList.add("hidden");
    landingScreen.classList.remove("hidden");
    document.documentElement.classList.add("auth-open");
    if (authMode !== mode || authScreen.classList.contains("hidden")) {
      authForm.reset();
      setAuthMode(mode);
    }
    // Not a route: logging out from here leaves for the page, not the card.
    clearAuthRoute();
    lastAuthRoute = null;
    authScreen.classList.remove("hidden");
    if (matchMedia("(pointer: fine)").matches) (mode === "privacy" ? authConsent : authPassword).focus();
  });
}

// Whether the card was opened from the page (so "back" is a real history
// step) or reached directly through a shared #login link.
let openedFromLanding = false;
let lastAuthRoute = authRouteFromHash();

window.addEventListener("hashchange", () => {
  const route = authRouteFromHash();
  if (route && !lastAuthRoute) openedFromLanding = true;
  if (!route) openedFromLanding = false;
  lastAuthRoute = route;
  if (authInitialized && !currentUserId) showGuestView();
});

function leaveAuthCard() {
  if (openedFromLanding) {
    history.back();
  } else {
    clearAuthRoute();
    lastAuthRoute = null;
    showGuestView();
  }
}

document.getElementById("auth-back").addEventListener("click", (e) => {
  e.preventDefault();
  if (signedInCard(authMode)) return; // hidden then: the way out is "Log out"
  leaveAuthCard();
});

// The phone's sheet: its × is "Back to Slate", and its tabs switch
// between logging in and asking for access, as the link under the form
// does on a computer.
document.getElementById("auth-sheet-close").addEventListener("click", () => {
  if (!signedInCard(authMode)) leaveAuthCard();
});

// As a phone's own sheets do, it also closes with a tap on the dimmed page
// above it, or dragged down by its grip (let go too soon and it springs
// back). Neither on the cards a signed-in visitor must finish, and only
// while it's a sheet: on a computer the card fills its own screen.
const authSheetLayout = matchMedia("(max-width: 640px)");
const authPanel = document.querySelector(".auth-panel");
const authGrip = document.querySelector(".auth-sheet-grip");
let sheetDrag = null;

authScreen.addEventListener("click", (e) => {
  if (e.target === authScreen && authSheetLayout.matches && !signedInCard(authMode)) leaveAuthCard();
});

authGrip.addEventListener("pointerdown", (e) => {
  if (signedInCard(authMode)) return;
  sheetDrag = { startY: e.clientY, startTime: e.timeStamp, dy: 0 };
  authGrip.setPointerCapture(e.pointerId);
  authPanel.style.transition = "none";
  // A layer of its own before it moves: an iPhone otherwise repaints the
  // whole sheet each frame of the drag (Android works it out by itself).
  authPanel.style.willChange = "transform";
});

authGrip.addEventListener("pointermove", (e) => {
  if (!sheetDrag) return;
  sheetDrag.dy = Math.max(0, e.clientY - sheetDrag.startY);
  authPanel.style.transform = `translate3d(0, ${sheetDrag.dy}px, 0)`;
});

function endSheetDrag(e) {
  if (!sheetDrag) return;
  const { dy, startTime } = sheetDrag;
  sheetDrag = null;
  setTimeout(() => (authPanel.style.willChange = ""), 300);
  const flicked = dy > 30 && dy / Math.max(1, e.timeStamp - startTime) > 0.5;
  authPanel.style.transition = "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)";
  if (dy > authPanel.offsetHeight * 0.25 || flicked) {
    authPanel.style.transform = "translateY(100%)";
    setTimeout(() => {
      leaveAuthCard();
      // Back in place, unseen, for the next time it opens.
      setTimeout(() => {
        authPanel.style.transition = "";
        authPanel.style.transform = "";
      }, 600);
    }, 200);
  } else {
    authPanel.style.transform = "";
  }
}

authGrip.addEventListener("pointerup", endSheetDrag);
authGrip.addEventListener("pointercancel", endSheetDrag);

const authTabs = document.querySelectorAll("[data-auth-tab]");
authTabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    if (tab.dataset.authTab !== authMode) setAuthRoute(tab.dataset.authTab);
  })
);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !currentUserId && !authScreen.classList.contains("hidden")) {
    leaveAuthCard();
  }
});

/* ---------- form helpers ---------- */

function setFieldError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

function clearFieldErrors() {
  setFieldError("auth-name-error", "");
  setFieldError("auth-email-error", "");
  setFieldError("auth-password-error", "");
  setFieldError("auth-confirm-error", "");
  setFieldError("auth-consent-error", "");
}

function showMessage(message, isError = true) {
  authMessage.textContent = message;
  authMessage.classList.toggle("auth-message-ok", !isError);
  authMessage.classList.remove("hidden");
}

function clearMessage() {
  authMessage.classList.add("hidden");
  authMessage.classList.remove("auth-message-ok");
}

function setAuthMode(mode) {
  authMode = mode;
  const text = AUTH_MODES[mode];
  authScreen.dataset.mode = mode;
  authNameField.classList.toggle("hidden", mode !== "request");
  authEmailField.classList.toggle("hidden", signedInCard(mode));
  authPasswordField.classList.toggle("hidden", mode === "forgot" || mode === "request" || mode === "privacy");
  authConfirmField.classList.toggle("hidden", !settingPassword(mode));
  authNoteField.classList.toggle("hidden", mode !== "request");
  authConsentField.classList.toggle("hidden", !asksConsent(mode));
  authForgotBtn.classList.toggle("hidden", mode !== "login");
  authPasswordLabel.textContent = settingPassword(mode) ? t("New password") : t("Password");
  authConfirmLabel.textContent = settingPassword(mode) ? t("Confirm new password") : t("Confirm password");
  authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
  authSubtitle.textContent = text.eyebrow;
  authTitle.textContent = text.title;
  authHint.textContent = text.hint ?? "";
  authHint.classList.toggle("hidden", !text.hint);
  authToggleText.textContent = text.toggleText;
  authToggleBtn.textContent = text.toggleBtn;
  authTabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.authTab === mode)));
  clearFieldErrors();
  clearMessage();
  hidePasswordFields();
  syncNoteCount();
  syncSubmit();
}

function syncNoteCount() {
  authNoteCount.textContent = `${authNote.value.length}/${authNote.maxLength}`;
}

authNote.addEventListener("input", syncNoteCount);

function setBusy(busy) {
  authBusy = busy;
  syncSubmit();
}

// The submit button's label and state: busy, cooling down after a reset
// email or a request, or ready.
function syncSubmit() {
  const text = AUTH_MODES[authMode];
  const readyAt = resendReadyAt[authMode] ?? 0;
  const wait = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
  authSubmit.disabled = authBusy || wait > 0;
  authSubmit.textContent = authBusy ? text.busy : wait > 0 ? t("Send again in {n}s", { n: wait }) : text.submit;
}

function startResendCooldown(mode) {
  resendReadyAt[mode] = Date.now() + RESEND_COOLDOWN_S * 1000;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    if (Object.values(resendReadyAt).every((at) => Date.now() >= at)) clearInterval(resendTimer);
    syncSubmit();
  }, 1000);
  syncSubmit();
}

/* ---------- client-side validation ---------- */

function validate() {
  clearFieldErrors();
  let ok = true;
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (authMode === "request" && !authName.value.trim()) {
    setFieldError("auth-name-error", t("Tell us your name."));
    ok = false;
  }
  if (!signedInCard(authMode) && !EMAIL_RE.test(email)) {
    setFieldError("auth-email-error", t("Enter a valid email address."));
    ok = false;
  }
  if (asksConsent(authMode) && !authConsent.checked) {
    setFieldError("auth-consent-error", t("Tick the box to go on."));
    ok = false;
  }
  if (authMode === "forgot" || authMode === "request" || authMode === "privacy") return ok;
  if (password.length < 8) {
    setFieldError(
      "auth-password-error",
      t("Password must be at least 8 characters.")
    );
    ok = false;
  }
  if (settingPassword(authMode) && authConfirm.value !== password) {
    setFieldError("auth-confirm-error", t("Passwords do not match."));
    ok = false;
  }
  return ok;
}

/* ---------- submit ---------- */

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (authBusy) return;
  clearMessage();
  if (!validate()) return;

  const email = authEmail.value.trim();
  const password = authPassword.value;

  setBusy(true);
  try {
    if (authMode === "forgot") {
      await sendResetLink(email);
    } else if (authMode === "request") {
      await sendAccessRequest(email);
    } else if (authMode === "reset") {
      await saveNewPassword(password);
    } else if (authMode === "choose") {
      await saveChosenPassword(password);
    } else if (authMode === "privacy") {
      await savePrivacyAcceptance();
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        // Never disclose which field was wrong.
        showMessage(t("Incorrect email or password"));
        return;
      }
      // onAuthStateChange handles the transition into the app.
    }
  } catch (err) {
    console.error("Auth error:", err.message);
    showMessage(t("Something went wrong. Please try again."));
  } finally {
    setBusy(false);
  }
});

// Always the same answer whether or not the email has an account, so the
// form can't be used to find out who uses Slate.
async function sendResetLink(email) {
  const { error } = await db.auth.resetPasswordForEmail(email, {
    // Back to this very page; Supabase must list it under Redirect URLs.
    redirectTo: location.origin + location.pathname,
  });
  if (error) {
    const limited = error.status === 429 || /rate limit/i.test(error.message);
    showMessage(
      limited
        ? t("Too many emails were sent in a short while. Wait a few minutes and try again.")
        : t("Couldn't send the email. Please try again.")
    );
    if (!limited) console.error("Reset email error:", error.message);
    return;
  }
  startResendCooldown("forgot");
  showMessage(
    t("If there's a Slate account for that email, a link to choose a new password is on its way. Check your inbox — and the spam folder."),
    false
  );
}

const ACCESS_REQUEST_URL = "https://api.web3forms.com/submit";

// Emailed to Slate's inbox, where accounts are handed out by hand. Nothing
// is stored in Slate's database until then. The email is for the owner, so
// it stays in English whatever language the page is in.
async function sendAccessRequest(email) {
  const name = authName.value.trim();
  const note = authNote.value.trim();
  // A bot filled the hidden field: thank it and send nothing.
  if (!authTrap.value) {
    const res = await fetch(ACCESS_REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // From `name` on, every field shows up in the email, in this order.
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: `Slate access request: ${name}`,
        from_name: "Slate",
        replyto: email, // "Reply" in the inbox writes to them
        name,
        email,
        message: note || "(no message)",
        "Privacy Policy": `Ticked "I've read the Privacy Policy and I'm 14 or older" (version ${PRIVACY_VERSION}).`,
        "Requested on": new Date().toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }),
        "Next step": "To let them in: Supabase → Authentication → Users → Add user, with this email and a temporary password. Then send the welcome email (tools/welcome-email.html).",
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      console.error("Access request error:", res.status, result.message);
      showMessage(t("Couldn't send your request. Please try again in a moment."));
      return;
    }
  }
  authForm.reset();
  syncNoteCount();
  startResendCooldown("request");
  showMessage(
    t(
      "Request sent! Every request is read by a person, so the answer isn't instant — it usually takes anywhere from a few hours to a day. We'll write to {email} once your account is ready. Don't forget to check your spam folder if you can't find it.",
      { email }
    ),
    false
  );
}

// Saves the password and marks it as their own. False (and says why on
// the card) if it wasn't saved.
async function updatePassword(password, sessionGoneMessage, moreData = {}) {
  const { error } = await db.auth.updateUser({ password, data: { password_chosen: true, ...moreData } });
  if (!error) return true;
  if (error.code === "same_password") {
    setFieldError("auth-password-error", t("That's already your password — choose a different one."));
  } else if (error.code === "weak_password") {
    setFieldError("auth-password-error", error.message);
  } else if (error.status === 401 || error.code === "session_not_found" || error.code === "session_expired") {
    showMessage(sessionGoneMessage);
  } else {
    console.error("Password update error:", error.message);
    showMessage(t("Couldn't save your new password. Please try again."));
  }
  return false;
}

// First login: their own password replaces the temporary one, and the app
// opens straight away — no need to log in again.
async function saveChosenPassword(password) {
  const saved = await updatePassword(password, t("You've been signed out. Log out and log in again with your temporary password."), privacyAcceptance());
  if (!saved) return;
  authForm.reset();
  enterApp().then(() => showToast(t("Password saved. Welcome to Slate!")));
}

// An account from before the policy: the box ticked, then into the app.
async function savePrivacyAcceptance() {
  const { error } = await db.auth.updateUser({ data: privacyAcceptance() });
  if (error) {
    console.error("Privacy acceptance error:", error.message);
    const gone = error.status === 401 || error.code === "session_not_found" || error.code === "session_expired";
    showMessage(gone ? t("You've been signed out. Log out and log in again.") : t("Couldn't save that. Please try again."));
    return;
  }
  authForm.reset();
  enterApp();
}

async function saveNewPassword(password) {
  const saved = await updatePassword(password, t("This reset link has run out. Log out and ask for a new one."));
  if (!saved) return;
  // Done: sign out everywhere (anyone else who was in the account is out
  // too — often the reason for a reset) and log in again with the new one.
  const { data } = await db.auth.getSession();
  setRecoveryPending(false);
  authNotice = {
    email: data.session?.user?.email ?? "",
    message: t("Password updated. Log in with your new password."),
  };
  history.replaceState(null, "", ROUTE_FOR_MODE.login);
  lastAuthRoute = "login";
  const { error: signOutError } = await db.auth.signOut({ scope: "global" });
  if (signOutError) console.error("Sign out after reset error:", signOutError.message);
}

// Something to say on the login card once the signed-out view is up (after
// a password change): shown by onAuthStateChange's SIGNED_OUT branch.
let authNotice = null;

authToggleBtn.addEventListener("click", () => {
  if (signedInCard(authMode)) {
    // Not saving a new password (or not accepting) after all: leave signed out.
    setRecoveryPending(false);
    db.auth.signOut();
    return;
  }
  setAuthRoute(authMode === "login" ? "request" : "login");
});

authForgotBtn.addEventListener("click", () => setAuthRoute("forgot"));

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  const { error } = await db.auth.signOut();
  if (error) {
    console.error("Sign out error:", error.message);
    logoutBtn.disabled = false;
  }
  // onAuthStateChange (SIGNED_OUT) returns to the auth screen.
});

/* ---------- session is the single source of truth ----------

   onAuthStateChange owns the entire data lifecycle, not just which screen is
   shown. It fires INITIAL_SESSION on load (restored session or none), plus
   SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / USER_UPDATED thereafter.        */

let currentUserId = null;
let authInitialized = false;

// Tear down everything tied to the previous session: close every realtime
// channel first (so no late event mutates the DOM), then clear in-memory data
// and rendered cards.
function teardownSession() {
  db.removeAllChannels();
  clearAppData();
}

// Into the app, with this account's data. Supabase calls are deferred out
// of the auth callback to avoid SDK re-entrancy deadlocks.
function enterApp() {
  return showAppView().then(() =>
    setTimeout(() => {
      teardownSession(); // clear anything left from a previous account
      loadData(); // fetch all tables + open realtime for this user
    }, 0)
  );
}

// An expired or already-used reset link: Supabase sends the visitor back
// with an error in the URL instead of a session. Taken once, on the first
// render. Signed out, the card opens on Reset Password to ask for a new
// one; already signed in (this browser still had a session), the app opens
// as usual and says so. Either way the error leaves the address bar.
function takeLinkError(signedIn) {
  const failed = Boolean(window.slateAuthLink?.error);
  if (window.slateAuthLink) window.slateAuthLink.error = null;
  if (failed) {
    history.replaceState(null, "", location.pathname + (signedIn ? "" : ROUTE_FOR_MODE.forgot));
    lastAuthRoute = signedIn ? null : "forgot";
  }
  return failed;
}

const LINK_EXPIRED = t("That reset link has expired or was already used.");

db.auth.onAuthStateChange((event, session) => {
  const nextUserId = session?.user?.id ?? null;
  if (event === "PASSWORD_RECOVERY") setRecoveryPending(true);
  if (!nextUserId) setRecoveryPending(false);
  const recovering = Boolean(nextUserId) && recoveryPending();

  // Ignore no-op events for the same user (e.g. TOKEN_REFRESHED, USER_UPDATED)
  // once we've reacted at least once — they must not wipe or reload data.
  // The exception: a reset link announcing itself after the app opened.
  const lateRecovery = recovering && authMode !== "reset";
  if (authInitialized && nextUserId === currentUserId && !lateRecovery) return;
  authInitialized = true;

  if (recovering) {
    // Signed in by a reset link: the new password comes first.
    currentUserId = nextUserId;
    showPasswordView("reset");
  } else if (nextUserId) {
    // A session exists: login, restored session, or a switch to a different
    // account. Into the app — unless it's still on its temporary password.
    currentUserId = nextUserId;
    const linkFailed = takeLinkError(true);
    const open = () =>
      enterApp().then(() => {
        if (linkFailed) showToast(LINK_EXPIRED, true);
      });
    if (hasOwnPassword(session.user) && acceptedPrivacy(session.user)) {
      open();
    } else {
      // A session saved on this device before the flags were set carries
      // old metadata: ask the server before asking for anything. Deferred
      // out of the callback, like every Supabase call from here. If the
      // server can't answer, the app opens: never locked out over this.
      setTimeout(async () => {
        const { data, error } = await db.auth.getUser();
        if (currentUserId !== nextUserId) return; // logged out meanwhile
        if (error) console.error("User check error:", error.message);
        if (error) open();
        else if (!hasOwnPassword(data.user)) showPasswordView("choose");
        else if (!acceptedPrivacy(data.user)) showPasswordView("privacy");
        else open();
      }, 0);
    }
  } else {
    // Session ended (logout) or none to begin with. Cleared only once the
    // app is off screen, so its exit animation shows it as it was.
    currentUserId = null;
    const linkFailed = takeLinkError(false);
    const notice = authNotice;
    authNotice = null;
    showGuestView().then(() => {
      setTimeout(teardownSession, 0);
      if (linkFailed) showMessage(t("That reset link has expired or was already used. Enter your email to get a new one."));
      if (notice) {
        authEmail.value = notice.email;
        showMessage(notice.message, false);
        if (matchMedia("(pointer: fine)").matches) authPassword.focus();
      }
    });
  }
});
