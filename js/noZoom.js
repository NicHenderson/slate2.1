/* ---------- No pinch zoom on a phone ----------

   As in an app (the owner's call). Android honours the viewport tag's
   user-scalable=no; Safari has ignored it since iOS 10, so here its
   pinch gestures are cancelled, and a two-finger move with them.
   responsive.css's touch-action does the same from CSS. Only on a touch
   screen (or a phone-sized window): Safari on a Mac sends the same
   gesture events for a trackpad pinch, and a computer keeps its zoom.
   The system's own accessibility zoom isn't a page gesture and still
   works. Loaded in <head>, so it's in place before the first touch. */

const noZoomHere = matchMedia("(hover: none) and (pointer: coarse), (max-width: 640px)");

["gesturestart", "gesturechange", "gestureend"].forEach((type) =>
  document.addEventListener(type, (e) => {
    if (noZoomHere.matches) e.preventDefault();
  })
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (noZoomHere.matches && e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
