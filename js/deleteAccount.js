/* ---------- Settings > Delete account ----------

   Deletes the signed-in account and everything in it, through
   delete_my_account() in the database (supabase/migrations/0005): it can
   only ever delete the caller's own account, and the library, settings and
   profile go with it by cascade.

   Asked for twice over, in the import window's danger view (js/yourData.js
   supplies the window): the password again — so a session left open on
   someone else's computer can't be used for this — and the words "Delete my
   account" typed out. Both boxes stay locked for a few seconds first. A
   backup of the library is downloaded before anything is deleted, unless
   unticked. Nothing is deleted unless every step before it succeeded. */

const DELETE_PHRASE = "Delete my account";
const DELETE_WAIT_SECONDS = 3;

const deleteAccountBtn = document.getElementById("delete-account-btn");
let deleteCountdown = null;
let deleteEmail = "";

const normalizePhrase = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();

function deleteReady() {
  const password = document.getElementById("delete-password");
  const phrase = document.getElementById("delete-confirm-input");
  if (!password || !phrase || password.disabled) return false;
  return password.value.length > 0 && normalizePhrase(phrase.value) === normalizePhrase(DELETE_PHRASE);
}

function syncDeleteReady() {
  const btn = importBody.querySelector('[data-account-action="delete"]');
  if (btn) btn.disabled = !deleteReady();
}

// The danger view. `error`: why the last attempt stopped (the boxes then
// open at once — the wait already happened).
function showDeleteAccount(error = null) {
  setImportHeader("Your account · Delete", "This deletes your account", deleteEmail);
  setImportView(
    "danger",
    `<div class="import-danger">
      <p class="import-danger-text">
        Your account — <strong>${plural(STORE.movies.size, "movie")}, ${plural(STORE.shows.size, "show")} and ${plural(STORE.collections.size, "collection")}</strong>, your profile, your settings and the login itself — will be deleted.
        <strong>This can't be undone.</strong>
      </p>

      <label class="import-check">
        <input type="checkbox" id="delete-backup-first" checked />
        <span class="import-check-box" aria-hidden="true"></span>
        <span class="import-check-text">
          <span class="import-check-title">Download a backup of my library first</span>
          <span class="import-check-hint">A .slate file you can import into any Slate account later.</span>
        </span>
      </label>

      <label class="import-confirm-label" for="delete-password">Your password</label>
      <input type="password" class="field-input import-confirm-input" id="delete-password" autocomplete="current-password" disabled placeholder="Wait ${DELETE_WAIT_SECONDS}…" />

      <label class="import-confirm-label" for="delete-confirm-input">To confirm, type <strong>${DELETE_PHRASE}</strong></label>
      <div class="import-confirm-wrap">
        <input type="text" class="field-input import-confirm-input" id="delete-confirm-input" autocomplete="off" autocapitalize="off" spellcheck="false" disabled placeholder="Wait ${DELETE_WAIT_SECONDS}…" />
        <span class="import-confirm-timer" aria-hidden="true"></span>
      </div>
      ${error ? `<p class="delete-error" role="alert">${escapeHtml(error)}</p>` : ""}
    </div>
    <div class="update-actions import-actions">
      <button type="button" class="cancel-btn" data-account-action="cancel">Cancel</button>
      <div class="update-actions-right">
        <button type="button" class="delete-btn import-replace-btn" data-account-action="delete" disabled>Delete my account</button>
      </div>
    </div>`
  );

  const password = document.getElementById("delete-password");
  const phrase = document.getElementById("delete-confirm-input");
  const unlock = () => {
    password.disabled = false;
    phrase.disabled = false;
    password.placeholder = "";
    phrase.placeholder = DELETE_PHRASE;
    phrase.closest(".import-confirm-wrap").classList.add("is-open");
    password.focus();
  };
  clearInterval(deleteCountdown);
  if (error) {
    unlock();
    return;
  }
  let left = DELETE_WAIT_SECONDS;
  deleteCountdown = setInterval(() => {
    left -= 1;
    if (!password.isConnected) {
      clearInterval(deleteCountdown);
      return;
    }
    if (left > 0) {
      password.placeholder = phrase.placeholder = `Wait ${left}…`;
      return;
    }
    clearInterval(deleteCountdown);
    unlock();
  }, 1000);
  importBody.querySelector('[data-account-action="cancel"]').focus();
}

function showDeleting(step) {
  setImportHeader("Your account · Delete", "Deleting your account", deleteEmail);
  setImportView(
    "working",
    `<div class="import-reading" role="status">
      <p class="import-reading-title">${escapeHtml(step)}</p>
      <p class="import-reading-hint">Keep this page open.</p>
      <div class="import-progress" aria-hidden="true"><span></span></div>
    </div>`
  );
}

class DeleteStopped extends Error {}

async function runDeleteAccount() {
  if (importBusy || !deleteReady()) return;
  const password = document.getElementById("delete-password").value;
  const backupFirst = document.getElementById("delete-backup-first").checked;
  clearInterval(deleteCountdown);
  importBusy = true;
  window.addEventListener("beforeunload", warnBeforeLeaving);

  let stopped = null;
  try {
    // 1. It's really you: the password again (a fresh sign-in, same account).
    showDeleting("Checking your password…");
    const { error: signInError } = await db.auth.signInWithPassword({ email: deleteEmail, password });
    if (signInError) throw new DeleteStopped("That password isn't right. Nothing was deleted.");

    // 2. The backup, before anything goes.
    if (backupFirst) {
      showDeleting("Saving a backup of your library…");
      try {
        const file = await buildSlateBackup();
        downloadFile(file.name.replace("slate-backup-", "slate-backup-before-deleting-"), file.text);
      } catch (err) {
        console.error("Backup before deleting failed:", err);
        throw new DeleteStopped("Your backup couldn't be downloaded, so nothing was deleted.");
      }
    }

    // 3. The account, and everything in it with it.
    showDeleting("Deleting your account…");
    const { error } = await db.rpc("delete_my_account");
    if (error) {
      console.error("Account delete failed:", error.message);
      throw new DeleteStopped("Your account couldn't be deleted. Nothing was deleted — try again.");
    }
  } catch (err) {
    stopped = err instanceof DeleteStopped ? err.message : "Something went wrong. Nothing was deleted — try again.";
    if (!(err instanceof DeleteStopped)) console.error("Account delete failed:", err);
  }

  importBusy = false;
  window.removeEventListener("beforeunload", warnBeforeLeaving);
  if (stopped) {
    showDeleteAccount(stopped);
    return;
  }
  // Gone: sign out on this device (the session belongs to no one now) and
  // land on the landing page.
  closeImportModal();
  await db.auth.signOut({ scope: "local" });
  showToast("Your account and everything in it were deleted.");
}

async function openDeleteAccount() {
  const { data } = await db.auth.getSession();
  deleteEmail = data.session?.user?.email ?? "";
  showDeleteAccount();
  openImportModal();
}

deleteAccountBtn?.addEventListener("click", openDeleteAccount);

importBody?.addEventListener("click", (e) => {
  const action = e.target.closest("[data-account-action]")?.dataset.accountAction;
  if (action === "cancel") closeImportModal();
  if (action === "delete") runDeleteAccount();
});

importBody?.addEventListener("input", (e) => {
  if (e.target.id === "delete-password" || e.target.id === "delete-confirm-input") syncDeleteReady();
});

// Enter in either box confirms, once everything is in place.
importBody?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id !== "delete-password" && e.target.id !== "delete-confirm-input") return;
  e.preventDefault();
  if (deleteReady()) runDeleteAccount();
});
