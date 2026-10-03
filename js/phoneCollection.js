/* ---------- An open collection on a phone ----------

   The owner's pick of three mockups ("B"): the collection opens under a
   cover of its own posters, with its seal, its name, what it holds and how
   much of it has been seen, and its buttons (back, edit, delete, Surprise
   Me, add). css/responsive.css shows the cover and puts away the
   computer's header, whose buttons these work: nothing is done twice. */

const colBanner = document.getElementById("col-banner");
const colBannerPosters = document.getElementById("col-banner-posters");
const colBannerSeal = document.getElementById("col-banner-seal");
const colBannerName = document.getElementById("col-banner-name");
const colBannerMeta = document.getElementById("col-banner-meta");
const colBannerProgress = document.getElementById("col-banner-progress");

// Sets an element's HTML only when it changes: the cover is redrawn
// whenever the open collection's page changes, itself included.
function setBannerHtml(el, html) {
  if (el._html !== html) {
    el.innerHTML = html;
    el._html = html;
  }
}

function renderColBanner() {
  const col = openCollectionId && STORE.collections.get(openCollectionId);
  if (!col) return;
  const resolved = collectionItemsFor(col.id).map(resolveItem).filter(Boolean);
  const posters = resolved.map(({ row }) => row.poster).filter(Boolean).slice(0, 4);
  setBannerHtml(colBannerPosters, posters.map((p) => `<img src="${escapeHtml(p)}" alt="" />`).join(""));
  setBannerHtml(colBannerSeal, iconHtml(col.icon || "🎬"));
  setBannerHtml(colBannerName, escapeHtml(col.name ?? t("Untitled")));

  const watched = resolved.filter(({ table, row }) => isItemWatched(table, row)).length;
  const rated = resolved.filter(({ row }) => row.rating != null);
  const avg = rated.length ? rated.reduce((sum, { row }) => sum + row.rating, 0) / rated.length : null;
  // What it holds ("9 movies · 3 shows", as the computer's header says) and
  // the average rating, if any.
  const meta = [escapeHtml(colDetailCount.textContent), avg == null ? "" : `♥ ${formatDecimal(avg)}`].filter(Boolean).join(" · ");
  setBannerHtml(colBannerMeta, meta);
  setBannerHtml(colBannerProgress, resolved.length ? collectionProgressHtml(watched, resolved.length) : "");
}

const colBannerActions = {
  back: () => colCrumbBack.click(),
  edit: () => colEditBtn.click(),
  delete: () => colDeleteBtn.click(),
  surprise: () => colSurpriseBtn.click(),
  add: () => document.querySelector('#collection-view .header-actions .add-btn')?.click(),
};

colBanner.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-col-action]");
  if (!btn) return;
  // As the header's buttons would: nothing else hears this click.
  e.stopPropagation();
  colBannerActions[btn.dataset.colAction]();
});

// The open collection's page redraws on every change (its titles, a rename,
// realtime): the cover follows, a frame later at most.
let colBannerFrame = 0;
new MutationObserver(() => {
  if (!colBannerFrame) colBannerFrame = requestAnimationFrame(() => ((colBannerFrame = 0), renderColBanner()));
}).observe(document.getElementById("collection-view"), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
