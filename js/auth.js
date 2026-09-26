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
const authNote = document.getElementById("auth-note");
const authNoteCount = document.getElementById("auth-note-count");
const authTrap = document.getElementById("auth-website");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let authMode = "login"; // "login" | "request" | "forgot" | "reset" | "choose"
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
             before the app opens. */

const AUTH_MODES = {
  login: {
    eyebrow: "Welcome back",
    title: "Log In",
    submit: "Log In",
    busy: "Logging in…",
    toggleText: "Don't have an account?",
    toggleBtn: "Request access",
  },
  request: {
    eyebrow: "Invite-only for now",
    title: "Request Access",
    hint: "Slate is private for now. Tell us who you are, and once your account is ready we'll email you a temporary password to log in with.",
    submit: "Send request",
    busy: "Sending…",
    toggleText: "Already have an account?",
    toggleBtn: "Log In",
  },
  forgot: {
    eyebrow: "Happens to everyone",
    title: "Reset Password",
    hint: "Enter the email you signed up with and we'll send you a link to choose a new password.",
    submit: "Send reset link",
    busy: "Sending…",
    toggleText: "Remembered it?",
    toggleBtn: "Log In",
  },
  reset: {
    eyebrow: "Almost there",
    title: "New Password",
    hint: "Choose a new password for your Slate account.",
    submit: "Save password",
    busy: "Saving…",
    toggleText: "Not you?",
    toggleBtn: "Log out",
  },
  choose: {
    eyebrow: "Welcome to Slate",
    title: "Choose Your Password",
    hint: "You logged in with a temporary password. Choose your own to finish setting up your account — it's the one you'll use from now on.",
    submit: "Save password",
    busy: "Saving…",
    toggleText: "Not you?",
    toggleBtn: "Log out",
  },
};

// The two cards that set a password for someone already signed in: they
// hide the email and the way back, and "Log out" is the only way out.
const settingPassword = (mode) => mode === "reset" || mode === "choose";

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
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
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
    btn.setAttribute("aria-label", "Show password");
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
    if (matchMedia("(pointer: fine)").matches) authPassword.focus();
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
  if (settingPassword(authMode)) return; // hidden then: the way out is "Log out"
  leaveAuthCard();
});

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
  authEmailField.classList.toggle("hidden", settingPassword(mode));
  authPasswordField.classList.toggle("hidden", mode === "forgot" || mode === "request");
  authConfirmField.classList.toggle("hidden", !settingPassword(mode));
  authNoteField.classList.toggle("hidden", mode !== "request");
  authForgotBtn.classList.toggle("hidden", mode !== "login");
  authPasswordLabel.textContent = settingPassword(mode) ? "New password" : "Password";
  authConfirmLabel.textContent = settingPassword(mode) ? "Confirm new password" : "Confirm password";
  authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
  authSubtitle.textContent = text.eyebrow;
  authTitle.textContent = text.title;
  authHint.textContent = text.hint ?? "";
  authHint.classList.toggle("hidden", !text.hint);
  authToggleText.textContent = text.toggleText;
  authToggleBtn.textContent = text.toggleBtn;
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
  authSubmit.textContent = authBusy ? text.busy : wait > 0 ? `Send again in ${wait}s` : text.submit;
}

function startResendCooldown(mode) {
  resendReadyAt[mode] = Date.now() + RESEND_COOLDOWN_S * 1000;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    if (Object.values(resendReadyAt).every((t) => Date.now() >= t)) clearInterval(resendTimer);
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
    setFieldError("auth-name-error", "Tell us your name.");
    ok = false;
  }
  if (!settingPassword(authMode) && !EMAIL_RE.test(email)) {
    setFieldError("auth-email-error", "Enter a valid email address.");
    ok = false;
  }
  if (authMode === "forgot" || authMode === "request") return ok;
  if (password.length < 8) {
    setFieldError(
      "auth-password-error",
      "Password must be at least 8 characters."
    );
    ok = false;
  }
  if (settingPassword(authMode) && authConfirm.value !== password) {
    setFieldError("auth-confirm-error", "Passwords do not match.");
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
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        // Never disclose which field was wrong.
        showMessage("Incorrect email or password");
        return;
      }
      // onAuthStateChange handles the transition into the app.
    }
  } catch (err) {
    console.error("Auth error:", err.message);
    showMessage("Something went wrong. Please try again.");
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
        ? "Too many emails were sent in a short while. Wait a few minutes and try again."
        : "Couldn't send the email. Please try again."
    );
    if (!limited) console.error("Reset email error:", error.message);
    return;
  }
  startResendCooldown("forgot");
  showMessage(
    "If there's a Slate account for that email, a link to choose a new password is on its way. Check your inbox — and the spam folder.",
    false
  );
}

const ACCESS_REQUEST_URL = "https://api.web3forms.com/submit";

// Emailed to Slate's inbox, where accounts are handed out by hand. Nothing
// is stored in Slate's database until then.
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
      showMessage("Couldn't send your request. Please try again in a moment.");
      return;
    }
  }
  authForm.reset();
  syncNoteCount();
  startResendCooldown("request");
  showMessage(
    `Request sent! Every request is read by a person, so the answer isn't instant — it usually takes anywhere from a few hours to a day. We'll write to ${email} once your account is ready. Don't forget to check your spam folder if you can't find it.`,
    false
  );
}

// Saves the password and marks it as their own. False (and says why on
// the card) if it wasn't saved.
async function updatePassword(password, sessionGoneMessage) {
  const { error } = await db.auth.updateUser({ password, data: { password_chosen: true } });
  if (!error) return true;
  if (error.code === "same_password") {
    setFieldError("auth-password-error", "That's already your password — choose a different one.");
  } else if (error.code === "weak_password") {
    setFieldError("auth-password-error", error.message);
  } else if (error.status === 401 || error.code === "session_not_found" || error.code === "session_expired") {
    showMessage(sessionGoneMessage);
  } else {
    console.error("Password update error:", error.message);
    showMessage("Couldn't save your new password. Please try again.");
  }
  return false;
}

// First login: their own password replaces the temporary one, and the app
// opens straight away — no need to log in again.
async function saveChosenPassword(password) {
  const saved = await updatePassword(password, "You've been signed out. Log out and log in again with your temporary password.");
  if (!saved) return;
  authForm.reset();
  enterApp().then(() => showToast("Password saved. Welcome to Slate!"));
}

async function saveNewPassword(password) {
  const saved = await updatePassword(password, "This reset link has run out. Log out and ask for a new one.");
  if (!saved) return;
  // Done: sign out everywhere (anyone else who was in the account is out
  // too — often the reason for a reset) and log in again with the new one.
  const { data } = await db.auth.getSession();
  setRecoveryPending(false);
  authNotice = {
    email: data.session?.user?.email ?? "",
    message: "Password updated. Log in with your new password.",
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
  if (settingPassword(authMode)) {
    // Not saving a new password after all: leave signed out.
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

const LINK_EXPIRED = "That reset link has expired or was already used.";

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
    if (hasOwnPassword(session.user)) {
      open();
    } else {
      // A session saved on this device before the flag was set carries old
      // metadata: ask the server before asking for a password. Deferred out
      // of the callback, like every Supabase call from here.
      setTimeout(async () => {
        const { data, error } = await db.auth.getUser();
        if (currentUserId !== nextUserId) return; // logged out meanwhile
        if (error) console.error("User check error:", error.message);
        if (error || hasOwnPassword(data.user)) open();
        else showPasswordView("choose");
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
      if (linkFailed) showMessage(`${LINK_EXPIRED} Enter your email to get a new one.`);
      if (notice) {
        authEmail.value = notice.email;
        showMessage(notice.message, false);
        if (matchMedia("(pointer: fine)").matches) authPassword.focus();
      }
    });
  }
});
