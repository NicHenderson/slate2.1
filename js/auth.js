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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let authMode = "login"; // "login" | "register" | "forgot" | "reset"
let authBusy = false;

/* ---------- the card's four modes ----------

   login     email + password, "Forgot password?" under it
   register  email + password + confirm
   forgot    email only: sends a reset link (#forgot)
   reset     new password + confirm, reached from that link (signed in by
             it, but kept out of the app until the new password is saved) */

const AUTH_MODES = {
  login: {
    eyebrow: "Welcome back",
    title: "Log In",
    submit: "Log In",
    busy: "Logging in…",
    toggleText: "Don't have an account?",
    toggleBtn: "Register",
  },
  register: {
    eyebrow: "New here?",
    title: "Create Account",
    submit: "Create Account",
    busy: "Creating account…",
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
};

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

// "Send again in 42s" after a reset email, so one impatient click doesn't
// burn through Supabase's hourly email allowance.
const RESEND_COOLDOWN_S = 60;
let resendReadyAt = 0;
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
   laid over it while the URL is #login or #signup. The hash is the route
   so the browser's back button steps from the card back to the page (at
   the same scroll position — the page stays rendered underneath) and a
   "log in" link can be shared or bookmarked. */

const AUTH_ROUTES = { login: "login", signup: "register", forgot: "forgot" };
const ROUTE_FOR_MODE = { login: "#login", register: "#signup", forgot: "#forgot" };

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

// Login ⇄ Register inside the card: same card, new route (replaced, not
// pushed — back still leads out to the page, not through every toggle).
function setAuthRoute(mode) {
  history.replaceState(null, "", ROUTE_FOR_MODE[mode]);
  lastAuthRoute = mode;
  return swapView("auth-swap", () => setAuthMode(mode));
}

// The "new password" card, over the landing page, for a visitor signed in
// by a reset link. Not a route: it lasts until the password is saved or
// they log out.
function showRecoveryView() {
  const cardShown = !authScreen.classList.contains("hidden");
  let kind = "open-auth";
  if (!appRoot.classList.contains("hidden")) kind = "logout";
  else if (cardShown) kind = authMode === "reset" ? null : "auth-swap";

  return swapView(kind, () => {
    appRoot.classList.add("hidden");
    landingScreen.classList.remove("hidden");
    document.documentElement.classList.add("auth-open");
    if (authMode !== "reset" || authScreen.classList.contains("hidden")) {
      authForm.reset();
      setAuthMode("reset");
    }
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
  if (authMode === "reset") return; // hidden then: the way out is "Log out"
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
  authEmailField.classList.toggle("hidden", mode === "reset");
  authPasswordField.classList.toggle("hidden", mode === "forgot");
  authConfirmField.classList.toggle("hidden", mode !== "register" && mode !== "reset");
  authForgotBtn.classList.toggle("hidden", mode !== "login");
  authPasswordLabel.textContent = mode === "reset" ? "New password" : "Password";
  authConfirmLabel.textContent = mode === "reset" ? "Confirm new password" : "Confirm password";
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
  syncSubmit();
}

function setBusy(busy) {
  authBusy = busy;
  syncSubmit();
}

// The submit button's label and state: busy, cooling down after a reset
// email, or ready.
function syncSubmit() {
  const text = AUTH_MODES[authMode];
  const wait = authMode === "forgot" ? Math.ceil((resendReadyAt - Date.now()) / 1000) : 0;
  authSubmit.disabled = authBusy || wait > 0;
  authSubmit.textContent = authBusy ? text.busy : wait > 0 ? `Send again in ${wait}s` : text.submit;
}

function startResendCooldown() {
  resendReadyAt = Date.now() + RESEND_COOLDOWN_S * 1000;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    if (Date.now() >= resendReadyAt) clearInterval(resendTimer);
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

  if (authMode !== "reset" && !EMAIL_RE.test(email)) {
    setFieldError("auth-email-error", "Enter a valid email address.");
    ok = false;
  }
  if (authMode === "forgot") return ok;
  if (password.length < 8) {
    setFieldError(
      "auth-password-error",
      "Password must be at least 8 characters."
    );
    ok = false;
  }
  if ((authMode === "register" || authMode === "reset") && authConfirm.value !== password) {
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
    } else if (authMode === "reset") {
      await saveNewPassword(password);
    } else if (authMode === "login") {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        // Never disclose which field was wrong.
        showMessage("Incorrect email or password");
        return;
      }
      // onAuthStateChange handles the transition into the app.
    } else {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) {
        showMessage(error.message);
        return;
      }
      // signUp with email confirmation enabled returns no active session.
      if (!data.session) {
        // After the swap: switching modes clears the card's messages.
        setAuthRoute("login").then(() =>
          showMessage("Check your email to confirm your account before logging in.", false)
        );
      }
      // If a session was returned, onAuthStateChange takes over.
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
  startResendCooldown();
  showMessage(
    "If there's a Slate account for that email, a link to choose a new password is on its way. Check your inbox — and the spam folder.",
    false
  );
}

async function saveNewPassword(password) {
  const { error } = await db.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      setFieldError("auth-password-error", "That's already your password — choose a different one.");
    } else if (error.code === "weak_password") {
      setFieldError("auth-password-error", error.message);
    } else if (error.status === 401 || error.code === "session_not_found" || error.code === "session_expired") {
      showMessage("This reset link has run out. Log out and ask for a new one.");
    } else {
      console.error("Password update error:", error.message);
      showMessage("Couldn't save your new password. Please try again.");
    }
    return;
  }
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
  if (authMode === "reset") {
    // Not saving a new password after all: leave signed out.
    setRecoveryPending(false);
    db.auth.signOut();
    return;
  }
  setAuthRoute(authMode === "login" ? "register" : "login");
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
    showRecoveryView();
  } else if (nextUserId) {
    // A session exists: login, registration, restored session, or a switch to
    // a different account. Toggle the view synchronously.
    currentUserId = nextUserId;
    const linkFailed = takeLinkError(true);
    enterApp().then(() => {
      if (linkFailed) showToast(LINK_EXPIRED, true);
    });
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
