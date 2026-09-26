/* ---------- Screen transitions ----------

   The landing page, the login card and the app all live in this one
   document, so moving between them is a same-document View Transition: the
   browser snapshots the screen before and after the change and animates
   from one to the other. css/transitions.css holds the choreography, keyed
   by the `kind` set on <html data-vt> for the duration.

   No animation, just the change: on the very first render (restoring a
   session or landing on a shared #login link isn't a transition from
   anything), in browsers without the API, in a background tab, and for
   anyone who prefers reduced motion — the OS setting or the app's own. */

let viewsRendered = false;
let viewTransitionId = 0;

function viewTransitionsAllowed() {
  return (
    typeof document.startViewTransition === "function" &&
    document.visibilityState === "visible" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.getAttribute("data-reduce-motion") !== "true"
  );
}

// kind: null for a change that shouldn't animate (it still counts as the
// first render, so whatever comes next can). Resolves once `update` has run. With a transition that's a frame later
// (after the "before" snapshot), not synchronously — anything that must
// happen after the change, or must not show in the "before" picture,
// chains on this instead of assuming the swap already happened.
function swapView(kind, update) {
  if (!kind || !viewsRendered || !viewTransitionsAllowed()) {
    viewsRendered = true;
    update();
    return Promise.resolve();
  }
  const root = document.documentElement;
  const id = ++viewTransitionId;
  root.dataset.vt = kind;
  const transition = document.startViewTransition(update);
  // A newer transition may have started (and re-set data-vt) before this
  // one finished; only the latest one clears it.
  transition.finished.finally(() => {
    if (id === viewTransitionId) delete root.dataset.vt;
  });
  return transition.updateCallbackDone.catch((err) => console.error("View update failed:", err));
}
