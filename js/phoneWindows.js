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
];

const phoneWindowLayout = matchMedia("(max-width: 640px)");

PHONE_WINDOWS.forEach(({ backdrop, sheet: sheetSel, head: headSel, close }) => {
  const sheet = document.getElementById(backdrop).querySelector(sheetSel);
  const head = sheet.querySelector(headSel);
  let drag = null;

  head.addEventListener("pointerdown", (e) => {
    if (!phoneWindowLayout.matches || e.target.closest("button, a, input")) return;
    drag = { startY: e.clientY, startT: e.timeStamp, dy: 0 };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.startY);
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${drag.dy}px)`;
  });
  const end = (e) => {
    if (!drag) return;
    const { dy, startT } = drag;
    drag = null;
    sheet.style.transition = "";
    sheet.style.transform = "";
    // A long drag, or a quick flick that went somewhere.
    if (dy > sheet.offsetHeight * 0.25 || (dy > 30 && dy / Math.max(1, e.timeStamp - startT) > 0.5)) {
      document.getElementById(close).click();
    }
  };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);
});

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
