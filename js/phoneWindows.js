/* ---------- Windows on a phone: dragged down to close ----------

   On a phone (css/responsive.css, "Windows on a phone") a window is a
   sheet of paper risen from the bottom. Besides its × and a tap above it,
   it closes the way a sheet does: dragging its head down. A short drag
   springs back. Only the head drags, so a form that has to scroll still
   can; it says touch-action: none, as only such an element can be
   dragged on a phone (anything else is taken for a scroll). */

const PHONE_WINDOWS = [
  { backdrop: "update-modal", sheet: ".update-layout", head: ".update-ticket", close: "update-close" },
  { backdrop: "start-modal", sheet: ".update-layout", head: ".update-ticket", close: "start-close" },
  { backdrop: "confirm-modal", sheet: ".confirm-modal", head: ".modal-head", close: "confirm-close" },
  { backdrop: "collection-modal", sheet: ".modal", head: ".modal-head", close: "collection-close" },
  { backdrop: "library-modal", sheet: ".modal", head: ".modal-head", close: "library-close" },
  { backdrop: "favorite-modal", sheet: ".modal", head: ".modal-head", close: "favorite-close" },
  { backdrop: "import-modal", sheet: ".import-panel", head: ".update-ticket", close: "import-close" },
  // A title's window: its head (the polaroid and the title) is drawn anew
  // for each title, so it's looked for when the drag starts.
  { backdrop: "detail-modal", sheet: ".detail-layout", head: ".detail-head", close: "detail-close" },
  // A search result open is a sheet of its own over the results (the
  // owner's note): its top band drags it alone, the results showing under
  // it, and letting go far enough goes back to them (what's picked stays),
  // as "← Results" does. From the results, the window closes.
  {
    backdrop: "search-modal",
    sheet: ".modal",
    head: ".modal-head",
    close: "modal-close",
    layer: ".tmdb-split.is-previewing .tmdb-preview",
    layerBack: ".tmdb-preview-back",
  },
  { backdrop: "episodes-modal", sheet: ".modal", head: ".ep-head", close: "episodes-close" },
];

const phoneWindowLayout = matchMedia("(max-width: 640px)");

// How tall a layer's top band is: where it can be dragged from.
const LAYER_BAND = 64;

PHONE_WINDOWS.forEach(({ backdrop, sheet: sheetSel, head: headSel, close, layer: layerSel, layerBack }) => {
  const sheet = document.getElementById(backdrop).querySelector(sheetSel);
  let drag = null;

  sheet.addEventListener("pointerdown", (e) => {
    if (!phoneWindowLayout.matches || e.target.closest("button, a, input")) return;
    const layer = layerSel && sheet.querySelector(layerSel);
    let el = sheet;
    if (layer) {
      if (!layer.contains(e.target) || e.clientY - layer.getBoundingClientRect().top > LAYER_BAND) return;
      el = layer;
    } else if (!e.target.closest(headSel)) {
      return;
    }
    drag = { el, layer: Boolean(layer), startY: e.clientY, startT: e.timeStamp, dy: 0 };
    sheet.setPointerCapture(e.pointerId);
    // A mouse dragging it would select the text it passes over.
    if (e.pointerType === "mouse") e.preventDefault();
    // A layer of its own before it moves: an iPhone otherwise repaints the
    // whole sheet, shadow and all, each frame (Android works it out itself).
    el.style.willChange = "transform";
  });
  sheet.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.startY);
    drag.el.style.transition = "none";
    drag.el.style.transform = `translate3d(0, ${drag.dy}px, 0)`;
  });
  const end = (e) => {
    if (!drag) return;
    const { el, layer, dy, startT } = drag;
    drag = null;
    // A long drag, or a quick flick that went somewhere.
    const away = dy > el.offsetHeight * 0.25 || (dy > 30 && dy / Math.max(1, e.timeStamp - startT) > 0.5);
    el.style.transition = "";
    el.style.willChange = "";
    // A layer goes on down from where it was let go (its way back slides
    // it away); anything else springs back, or its window closes.
    if (away && layer) {
      el.querySelector(layerBack)?.click();
      return;
    }
    el.style.transform = "";
    if (away) document.getElementById(close).click();
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
});

// A layer slid down off its window, then `done` (a search result going
// back to the results). At once without motion, or off a phone.
function slideAway(el, done) {
  const finish = () => {
    el.style.transition = "";
    el.style.transform = "";
    done();
  };
  if (!phoneWindowLayout.matches || motionReduced()) {
    finish();
    return;
  }
  el.style.transition = "transform 0.24s cubic-bezier(0.4, 0, 1, 1)";
  el.style.transform = `translate3d(0, ${el.offsetHeight}px, 0)`;
  let called = false;
  const once = () => {
    if (called) return;
    called = true;
    finish();
  };
  el.addEventListener("transitionend", once, { once: true });
  setTimeout(once, 320);
}

/* ---------- Typing in a window, on a phone ----------

   A field focused as its window opens makes an iPhone bring up the
   keyboard while the sheet is still rising from below the screen: it
   scrolls the whole page to show the field, and the page stays shifted
   (the owner's iPhone: the window jumped down, cut off at the top). On
   a phone the field waits to be tapped; on a computer it's focused as
   before. */
function focusOnOpen(field) {
  if (!phoneWindowLayout.matches) field.focus();
}

// The app never scrolls as a whole (its lists scroll inside), so a page
// an iPhone left shifted after the keyboard went away goes back.
document.addEventListener("focusout", () => {
  if (!phoneWindowLayout.matches) return;
  setTimeout(() => {
    const typing = document.activeElement?.matches?.("input, textarea, select");
    if (!typing && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
  }, 150);
});
