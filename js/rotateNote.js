/* ---------- A phone turned sideways ----------

   Sideways, a phone is wide enough for the computer's layout but far too
   short for it, and everything comes out tiny. Slate is made upright, so
   it says so (the owner's call: a note, not a lock, which iOS doesn't
   allow a web app anyway). "Keep it sideways" lets it be until the app is
   closed, and so does turning it a fourth time: three notes per launch at
   most. sessionStorage is the launch: it goes when the app is closed.
   Never over a trailer, the one thing worth turning the phone for. */

const rotateNote = document.getElementById("rotate-note");
const rotateNoteKeep = document.getElementById("rotate-note-keep");
const sideways = matchMedia("(hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 500px)");
const ROTATE_SHOWN_KEY = "slate_rotate_shown";
const ROTATE_KEPT_KEY = "slate_rotate_kept";
const ROTATE_MAX = 3;

function rotateSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setRotateSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

function trailerPlaying() {
  return Boolean(document.querySelector(".detail-trailer-frame") || document.fullscreenElement || document.webkitFullscreenElement);
}

function syncRotateNote() {
  if (!sideways.matches) {
    rotateNote.hidden = true;
    return;
  }
  const shown = Number(rotateSession(ROTATE_SHOWN_KEY)) || 0;
  if (rotateSession(ROTATE_KEPT_KEY) || shown >= ROTATE_MAX || trailerPlaying()) return;
  setRotateSession(ROTATE_SHOWN_KEY, String(shown + 1));
  rotateNote.hidden = false;
}

rotateNoteKeep.addEventListener("click", () => {
  setRotateSession(ROTATE_KEPT_KEY, "1");
  rotateNote.hidden = true;
});

sideways.addEventListener("change", syncRotateNote);
syncRotateNote();
