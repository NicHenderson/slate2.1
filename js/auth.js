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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let authMode = "login"; // "login" | "register"
let authBusy = false;

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

const AUTH_ROUTES = { login: "login", signup: "register" };

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
  history.replaceState(null, "", mode === "register" ? "#signup" : "#login");
  return swapView("auth-swap", () => setAuthMode(mode));
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
  const register = mode === "register";
  authConfirmField.classList.toggle("hidden", !register);
  authSubtitle.textContent = register ? "New here?" : "Welcome back";
  authTitle.textContent = register ? "Create Account" : "Log In";
  authSubmit.textContent = register ? "Create Account" : "Log In";
  authToggleText.textContent = register
    ? "Already have an account?"
    : "Don't have an account?";
  authToggleBtn.textContent = register ? "Log In" : "Register";
  clearFieldErrors();
  clearMessage();
  hidePasswordFields();
}

function setBusy(busy) {
  authBusy = busy;
  authSubmit.disabled = busy;
  if (busy) {
    authSubmit.textContent =
      authMode === "register" ? "Creating account…" : "Logging in…";
  } else {
    authSubmit.textContent =
      authMode === "register" ? "Create Account" : "Log In";
  }
}

/* ---------- client-side validation ---------- */

function validate() {
  clearFieldErrors();
  let ok = true;
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!EMAIL_RE.test(email)) {
    setFieldError("auth-email-error", "Enter a valid email address.");
    ok = false;
  }
  if (password.length < 8) {
    setFieldError(
      "auth-password-error",
      "Password must be at least 8 characters."
    );
    ok = false;
  }
  if (authMode === "register" && authConfirm.value !== password) {
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
    if (authMode === "login") {
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

authToggleBtn.addEventListener("click", () => {
  setAuthRoute(authMode === "login" ? "register" : "login");
});

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

db.auth.onAuthStateChange((_event, session) => {
  const nextUserId = session?.user?.id ?? null;

  // Ignore no-op events for the same user (e.g. TOKEN_REFRESHED, USER_UPDATED)
  // once we've reacted at least once — they must not wipe or reload data.
  if (authInitialized && nextUserId === currentUserId) return;
  authInitialized = true;

  if (nextUserId) {
    // A session exists: login, registration, restored session, or a switch to
    // a different account. Toggle the view synchronously; defer Supabase calls
    // out of the auth callback to avoid SDK re-entrancy deadlocks.
    currentUserId = nextUserId;
    showAppView().then(() =>
      setTimeout(() => {
        teardownSession(); // clear anything left from a previous account
        loadData(); // fetch all tables + open realtime for this user
      }, 0)
    );
  } else {
    // Session ended (logout) or none to begin with. Cleared only once the
    // app is off screen, so its exit animation shows it as it was.
    currentUserId = null;
    showGuestView().then(() => setTimeout(teardownSession, 0));
  }
});
