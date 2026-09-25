const authScreen = document.getElementById("auth-screen");
const appRoot = document.getElementById("app");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authConfirm = document.getElementById("auth-confirm");
const authConfirmField = document.getElementById("auth-confirm-field");
const authSubtitle = document.getElementById("auth-subtitle");
const authSubmit = document.getElementById("auth-submit");
const authMessage = document.getElementById("auth-message");
const authToggleBtn = document.getElementById("auth-toggle-btn");
const authToggleText = document.getElementById("auth-toggle-text");
const logoutBtn = document.getElementById("logout-btn");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let authMode = "login"; // "login" | "register"
let authBusy = false;

/* ---------- view toggling (driven only by session state) ---------- */

function showAppView() {
  authScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  logoutBtn.disabled = false;
}

function showAuthView() {
  appRoot.classList.add("hidden");
  authScreen.classList.remove("hidden");
  logoutBtn.disabled = false;
  authForm.reset();
  setAuthMode("login");
}

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
  authSubtitle.textContent = register
    ? "Create your account"
    : "Log in to your library";
  authSubmit.textContent = register ? "Create Account" : "Log In";
  authToggleText.textContent = register
    ? "Already have an account?"
    : "Don't have an account?";
  authToggleBtn.textContent = register ? "Log In" : "Register";
  clearFieldErrors();
  clearMessage();
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
        setAuthMode("login");
        showMessage(
          "Check your email to confirm your account before logging in.",
          false
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
  setAuthMode(authMode === "login" ? "register" : "login");
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
    showAppView();
    setTimeout(() => {
      teardownSession(); // clear anything left from a previous account
      loadData(); // fetch all tables + open realtime for this user
    }, 0);
  } else {
    // Session ended (logout) or none to begin with.
    currentUserId = null;
    showAuthView();
    setTimeout(teardownSession, 0);
  }
});
