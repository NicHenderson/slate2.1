/* ---------- The real screen height of an installed iPhone app ----------

   On iOS 26, a web app opened from the home screen with a see-through
   status bar is told the screen is shorter than it is, by exactly the
   status bar's height (WebKit bug 301108): innerHeight, 100vh and 100dvh
   all come up short, and whatever is pinned to the bottom floats that
   far above it over an empty band. The screen's own size is the truth
   there, as the page covers all of it. This sets --ios-gap to the
   shortfall (used in responsive.css) and html.ios-gap while there is
   one. Only in an installed iPhone app (navigator.standalone is Apple's
   alone): in Safari, on Android and on computers it stays 0. iOS can
   correct its figures late, so it measures again a few times after
   loading and whenever the app comes back. */

function fitScreen() {
  let gap = 0;
  if (navigator.standalone === true) {
    // iOS gives screen.width / height upright whatever the orientation.
    const landscape = matchMedia("(orientation: landscape)").matches;
    const screenHeight = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const measured = Math.max(innerHeight, window.visualViewport ? visualViewport.height : 0);
    gap = Math.round(screenHeight - measured);
    // Only a status bar's worth: anything else (the keyboard, a split
    // view) is a real change of size, not this bug.
    if (gap < 0 || gap > 80) gap = 0;
  }
  document.documentElement.style.setProperty("--ios-gap", `${gap}px`);
  document.documentElement.classList.toggle("ios-gap", gap > 0);
}

fitScreen();
addEventListener("resize", fitScreen);
addEventListener("orientationchange", fitScreen);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") fitScreen();
});
[300, 1000, 2500].forEach((ms) => setTimeout(fitScreen, ms));
