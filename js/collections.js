const collectionModal = document.getElementById("collection-modal");
const collectionModalTitle = document.getElementById("collection-modal-title");
const collectionForm = document.getElementById("collection-form");
const collectionName = document.getElementById("collection-name");
const collectionIcon = document.getElementById("collection-icon");
const collectionError = document.getElementById("collection-error");
const collectionSave = document.getElementById("collection-save");
const collectionCancel = document.getElementById("collection-cancel");
const collectionClose = document.getElementById("collection-close");

const collectionView = document.getElementById("collection-view");
const colDetailIcon = document.getElementById("col-detail-icon");
const colDetailName = document.getElementById("col-detail-name");
const colDetailCount = document.getElementById("col-detail-count");
const colDetailGrid = document.getElementById("col-detail-grid");
const colCrumbBack = document.getElementById("col-crumb-back");
const colEditBtn = document.getElementById("col-edit-btn");
const colDeleteBtn = document.getElementById("col-delete-btn");
const colSurpriseBtn = document.getElementById("col-surprise-btn");


let openCollectionId = null;
let editingCollectionId = null;

let dragActive = false;
let pendingRender = false;

const byPosition = (a, b) =>
  (a.position ?? 0) - (b.position ?? 0) ||
  (a.created_at ?? "").localeCompare(b.created_at ?? "");

function nextPos(rows) {
  return rows.reduce((max, r) => Math.max(max, r.position ?? 0), 0) + 1;
}

/* ---------- collections grid ---------- */

function collectionItemsFor(colId) {
  return [...STORE.collectionItems.values()]
    .filter((i) => i.collection_id === colId)
    .sort(byPosition);
}

// Cover: a poster collage (1 / 2 / 3 titles get a 1 / 2 / 3-panel layout,
// 4+ a 2x2) with the collection's emoji stamped over its corner as a seal.
// An empty collection shows the emoji large on a dashed placeholder instead.
function collectionCoverHtml(col, posters) {
  const icon = iconHtml(col.icon || "🎬");
  if (!posters.length) {
    return `<div class="booklet-cover is-empty"><span class="booklet-empty-icon" aria-hidden="true">${icon}</span></div>`;
  }
  const slots = posters
    .map((p) =>
      p
        ? `<img src="${p}" alt="" loading="lazy" />`
        : `<div class="stamp-slot-empty"></div>`
    )
    .join("");
  return `
    <div class="booklet-cover">
      <div class="booklet-stamp stamp-n${posters.length}">${slots}</div>
      <span class="booklet-icon" aria-hidden="true">${icon}</span>
    </div>`;
}

function collectionProgressHtml(watched, total) {
  // An empty collection keeps the (empty) bar so every footer lines up.
  const complete = total > 0 && watched === total;
  const pct = total ? Math.round((watched / total) * 100) : 0;
  const label = total ? `${watched}/${total} watched` : "Empty";
  return `
    <div class="booklet-progress${complete ? " is-complete" : ""}">
      <div class="booklet-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${watched}" aria-label="${total ? `${watched} of ${total} watched` : "No titles yet"}">
        <span style="width: ${pct}%"></span>
      </div>
      <p class="booklet-progress-text">
        <span>${label}</span>
        ${complete ? `<span class="booklet-done" aria-hidden="true">✓</span>` : ""}
      </p>
    </div>`;
}

function collectionCardHtml(col, items) {
  // Only titles that still exist count: a link whose movie/show was deleted
  // has nothing to show (or to have watched).
  const resolved = items.map(resolveItem).filter(Boolean);
  const watched = resolved.filter(({ table, row }) => isItemWatched(table, row)).length;
  const posters = resolved.slice(0, 4).map(({ row }) => row.poster ?? null);
  return `
    <article class="collection-card booklet-card" data-col-id="${col.id}">
      <div class="booklet-spine"></div>
      <div class="booklet-body">
        <div class="booklet-ribbon" aria-hidden="true"></div>
        ${collectionCoverHtml(col, posters)}
        <p class="booklet-title">${escapeHtml(col.name ?? "Untitled")}</p>
        <div class="booklet-footer">${collectionProgressHtml(watched, resolved.length)}</div>
      </div>
    </article>`;
}

// Every realtime echo and save re-runs these renders, and rebuilding a grid
// destroys its cards: the one under a stationary cursor restarts its hover
// lift each time, which reads as the card "jumping" (a reorder alone caused
// four rebuilds in a row). So a grid is only rebuilt when its HTML actually
// differs from what it already shows.
function paintGrid(grid, html) {
  if (grid._html === html) return;
  grid.innerHTML = html;
  grid._html = html;
}

function collectionsGridHtml() {
  const cols = [...STORE.collections.values()].sort(byPosition);
  return (
    cols.map((c) => collectionCardHtml(c, collectionItemsFor(c.id))).join("") +
    `<button class="ghost-card booklet-ghost" type="button" data-type="collection">
      <span class="booklet-ghost-spine"></span>
      <span class="booklet-ghost-body">
        <span class="booklet-ghost-slot"><span class="booklet-ghost-plus">+</span></span>
        <span class="booklet-ghost-label">Add Collection</span>
      </span>
    </button>`
  );
}

function renderCollections() {
  if (dragActive) {
    pendingRender = true;
    return;
  }
  document.getElementById("collections-drag-hint").hidden = STORE.collections.size < 2;
  paintGrid(document.getElementById("grid-collections"), collectionsGridHtml());
}

/* ---------- collection detail modal ---------- */

function resolveItem(item) {
  if (STORE.movies.has(item.item_id)) {
    return { row: STORE.movies.get(item.item_id), table: "movies" };
  }
  if (STORE.shows.has(item.item_id)) {
    return { row: STORE.shows.get(item.item_id), table: "shows" };
  }
  return null;
}

// Where a title stands, matching how the Movies / Shows pages file it:
// "watched" | "watching" | "dropped" | "towatch" (movies: watched / towatch).
// A dropped show is dropped even if it has a finish date.
function itemStatus(table, row) {
  if (table === "movies") return row.watched_date !== null ? "watched" : "towatch";
  if (row.is_dropped) return "dropped";
  if (row.finished_watching_date !== null) return "watched";
  if (row.started_watching_date !== null) return "watching";
  return "towatch";
}

function isItemWatched(table, row) {
  return itemStatus(table, row) === "watched";
}

// The grid (Movies / Shows page section) a title belongs to; the detail
// modal uses it to pick the right buttons.
function gridIdFor(table, row) {
  const status = itemStatus(table, row);
  return table === "movies" ? `grid-movies-${status}` : `grid-shows-${status}`;
}

// The badge in the corner of a collection card: one circle, four states.
const STATUS_BADGES = {
  watched: { label: "Watched", inner: "✓" },
  watching: {
    label: "Watching",
    inner: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>`,
  },
  dropped: {
    label: "Dropped",
    inner: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>`,
  },
  towatch: { label: "To watch", inner: "" }, // an empty dashed circle
};

function colItemCardHtml(item) {
  const resolved = resolveItem(item);
  if (!resolved) return "";
  const { row, table } = resolved;
  const poster = row.poster
    ? `<img class="card-poster" src="${row.poster}" alt="" loading="lazy" />`
    : `<div class="card-poster card-poster-empty"></div>`;
  const status = itemStatus(table, row);
  const badge = STATUS_BADGES[status];
  const rating =
    status === "watched" ? `<div class="card-rating">${starsHtml(row.rating)}</div>` : "";
  return `
    <article class="card col-item-card item-${status}" data-binding-id="${item.id}" data-item-id="${row.id}" data-table="${table}">
      <button class="col-item-remove" type="button" data-binding-id="${item.id}" aria-label="Remove from collection">✕</button>
      <span class="status-badge is-${status}" title="${badge.label}" role="img" aria-label="${badge.label}">${badge.inner}</span>
      ${poster}
      <p class="card-title">${escapeHtml(row.title ?? "Untitled")}</p>
      ${rating}
    </article>`;
}

/* ---------- Movies | Shows tabs inside an open collection ----------

   A collection can hold both, but the page shows one type at a time, each
   with its own order (drag & drop only reorders the tab you're on). The
   stats strip above the tabs still covers the whole collection. */

let colTab = "movie"; // "movie" | "tv": the type the open collection's grid shows

const colTabKey = (colId) => `slate_col_tab_${colId}`;
const colTabsEl = document.getElementById("col-type-tabs");

// "movie" / "tv" for a collection link whose title still exists, else null.
function itemType(item) {
  const resolved = resolveItem(item);
  if (!resolved) return null;
  return resolved.table === "movies" ? "movie" : "tv";
}

function collectionTypeCounts(colId) {
  const counts = { movie: 0, tv: 0 };
  collectionItemsFor(colId).forEach((item) => {
    const type = itemType(item);
    if (type) counts[type]++;
  });
  return counts;
}

// The tab used last time in this collection; otherwise Movies, unless the
// collection only has shows.
function initialColTab(colId) {
  let saved = null;
  try {
    saved = localStorage.getItem(colTabKey(colId));
  } catch {}
  if (saved === "movie" || saved === "tv") return saved;
  const counts = collectionTypeCounts(colId);
  return counts.movie === 0 && counts.tv > 0 ? "tv" : "movie";
}

function setColTab(type) {
  colTab = type;
  try {
    localStorage.setItem(colTabKey(openCollectionId), type);
  } catch {}
}

colTabsEl.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-ctype]");
  if (!tab || tab.dataset.ctype === colTab) return;
  setColTab(tab.dataset.ctype);
  renderCollectionDetail();
});

function collectionDetailGridHtml(colId) {
  const items = collectionItemsFor(colId).filter((item) => itemType(item) === colTab);
  const empty = items.length
    ? ""
    : `<p class="grid-empty">No ${colTab === "movie" ? "movies" : "shows"} in this collection yet.</p>`;
  return (
    items.map(colItemCardHtml).join("") +
    empty +
    `<button class="ghost-card" type="button" data-type="collection-titles">
      <span class="ghost-slot"><span class="ghost-plus">+</span></span>
      <span class="ghost-label">+ Add Titles</span>
    </button>`
  );
}

// One compact strip under the header of the open collection: watched
// progress, average rating and the best / worst rated titles, computed from
// the library rows it links to.
function collectionStatsHtml(colId) {
  const resolved = collectionItemsFor(colId).map(resolveItem).filter(Boolean);
  const total = resolved.length;
  if (!total) return "";

  const watched = resolved.filter(({ table, row }) => isItemWatched(table, row)).length;
  const pct = Math.round((watched / total) * 100);
  const complete = watched === total;

  const rated = resolved.filter((r) => r.row.rating != null);
  const avg = rated.length
    ? rated.reduce((sum, r) => sum + r.row.rating, 0) / rated.length
    : null;

  return `
    <span class="cs-scope" title="Progress and ratings count every title in this collection, movies and shows together.">Whole collection</span>
    <div class="cs-item cs-progress">
      <span class="cs-value">${watched}/${total}</span>
      <div class="cs-meta">
        <div class="stat-bar${complete ? " is-complete" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${watched}" aria-label="${watched} of ${total} watched"><span style="width: ${pct}%"></span></div>
        <span class="cs-label">${complete ? "Watched · complete ✓" : `Watched · ${pct}%`}</span>
      </div>
    </div>
    <div class="cs-item">
      <span class="cs-value">${avg == null ? "–" : `${avg.toFixed(1)}<small>/10</small>`}</span>
      <span class="cs-label">${avg == null ? "No ratings" : `Avg rating · ${rated.length} rated`}</span>
    </div>
    <div class="cs-item cs-extremes">${collectionExtremesHtml(rated)}</div>`;
}

// Highest- and lowest-rated titles, each a button that opens its details.
// Ties keep the first one in collection order and note how many others share
// the rating; when every rated title has the same score there's no best or
// worst to name, so it says so instead of picking one arbitrarily.
function collectionExtremesHtml(rated) {
  if (!rated.length) return `<span class="cs-label">Best &amp; worst · no ratings yet</span>`;

  const top = Math.max(...rated.map((r) => r.row.rating));
  const bottom = Math.min(...rated.map((r) => r.row.rating));
  if (top === bottom) {
    return `<span class="cs-label">${
      rated.length === 1 ? "Only rated title" : `All ${rated.length} rated titles tie`
    } · ${top}/10</span>`;
  }

  const row = (tag, arrow, score) => {
    const ties = rated.filter((r) => r.row.rating === score);
    const pick = ties[0];
    const others = ties.slice(1).map((r) => escapeHtml(r.row.title ?? "Untitled"));
    const tieNote = others.length
      ? `<span class="extreme-ties" title="Also ${score}/10: ${others.join(", ")}">+${others.length}</span>`
      : "";
    return `
      <button class="extreme-row" type="button" data-item-id="${pick.row.id}" data-table="${pick.table}" title="${tag}">
        <span class="extreme-arrow" aria-hidden="true">${arrow}</span>
        <span class="extreme-title">${escapeHtml(pick.row.title ?? "Untitled")}</span>
        <span class="extreme-rating">${score}/10</span>
        ${tieNote}
      </button>`;
  };
  return `${row("Highest rated", "▲", top)}${row("Lowest rated", "▼", bottom)}`;
}

function renderCollectionDetail() {
  if (dragActive) {
    pendingRender = true;
    return;
  }
  const col = STORE.collections.get(openCollectionId);
  if (!col) return;
  const statsEl = document.getElementById("col-stats");
  const statsHtml = collectionStatsHtml(col.id);
  statsEl.hidden = !statsHtml;
  paintGrid(statsEl, statsHtml);
  const counts = collectionTypeCounts(col.id);
  colTabsEl.querySelectorAll("[data-ctype]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.ctype === colTab);
    tab.querySelector(".status-tab-count").textContent = counts[tab.dataset.ctype];
  });
  document.getElementById("col-detail-drag-hint").hidden = counts[colTab] < 2;
  colDetailIcon.innerHTML = iconHtml(col.icon);
  colDetailName.textContent = col.name ?? "Untitled";
  const parts = [];
  if (counts.movie) parts.push(`${counts.movie} movie${counts.movie === 1 ? "" : "s"}`);
  if (counts.tv) parts.push(`${counts.tv} show${counts.tv === 1 ? "" : "s"}`);
  colDetailCount.textContent = parts.length ? parts.join(" · ") : "No titles yet";
  paintGrid(colDetailGrid, collectionDetailGridHtml(col.id));
}

// A collection opens as its own page inside .content (a sub-view of the
// Collections section, so the sidebar keeps "Collections" highlighted)
// instead of a modal. `sections` / `navButtons` come from navigation.js.
function openCollectionView(colId) {
  openCollectionId = colId;
  colTab = initialColTab(colId);
  renderCollectionDetail();
  sections.forEach((s) => s.classList.toggle("active", s.id === "collection-view"));
  navButtons.forEach((b) =>
    b.classList.toggle("active", b.dataset.section === "collections")
  );
  document.querySelector(".content").scrollTop = 0;
}

function closeCollectionView() {
  openCollectionId = null;
  if (!collectionView.classList.contains("active")) return;
  sections.forEach((s) => s.classList.toggle("active", s.id === "collections"));
  renderCollections();
}

// Any sidebar navigation leaves the collection: forget which one was open so
// realtime refreshes stop rendering into the hidden view.
navButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    openCollectionId = null;
  })
);

colCrumbBack.addEventListener("click", closeCollectionView);

/* ---------- drag & drop reordering ----------

   Pointer Events instead of the HTML5 Drag and Drop API, so the same code
   drives mouse, pen and touch. On mouse/pen a small movement threshold tells
   a drag apart from a click; on touch a short hold does the same job without
   fighting the page's normal scroll (a quick swipe past the slop cancels the
   hold and scrolls as usual; touch-action only turns off once a hold has
   actually won, so it never blocks an ordinary scroll gesture).

   Once active, the real card becomes an invisible placeholder that keeps its
   grid slot (so the grid keeps reflowing around it), while a floating clone
   tracks the pointer. Every card whose slot shifts as a result is animated
   into its new spot with FLIP (measure rect, mutate the DOM, measure rect
   again, animate the delta away) instead of snapping — that slide is the
   "fluid" behaviour being restored here. */

const DRAG_MOVE_THRESHOLD = 6; // px of mouse/pen movement before it counts as a drag
const TOUCH_HOLD_MS = 180; // how long a touch has to stay still to start a drag
const TOUCH_HOLD_SLOP = 8; // px of movement during the hold that cancels it (= a scroll)
const AUTOSCROLL_ZONE = 72; // px from the scroller's top/bottom edge where auto-scroll kicks in
const AUTOSCROLL_MAX = 18; // px scrolled per frame at the very edge

// The nearest element (itself included) that actually scrolls: the
// collections grid lives in .content, the detail grid scrolls on its own.
// Falls back to the page.
function scrollParent(el) {
  for (let p = el; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement;
}

function flipReorder(cards, mutate) {
  const before = new Map(cards.map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  cards.forEach((el) => {
    const from = before.get(el);
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (!dx && !dy) return;
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
    });
    // Only the transform slide counts: another property finishing first
    // (a shadow, say) must not strip the inline transition mid-slide.
    const clear = (e) => {
      if (e.propertyName !== "transform") return;
      el.style.transition = "";
      el.removeEventListener("transitionend", clear);
    };
    el.addEventListener("transitionend", clear);
  });
}

// canDrag: checked when a press starts, for a grid that's only sortable
// some of the time (the watchlists, in "Custom order").
function setupDragReorder(grid, cardSelector, onReorder, canDrag = () => true) {
  let pointerId = null;
  let card = null;
  let ghost = null;
  let startX = 0;
  let startY = 0;
  let grabDX = 0;
  let grabDY = 0;
  let dragging = false;
  let holdTimer = null;
  let rafPending = false;
  let swapCooldown = false;
  let pointerType = "mouse";
  let lastX = 0;
  let lastY = 0;
  let scroller = null;
  let scrollRaf = null;

  const siblings = () => [...grid.querySelectorAll(cardSelector)];

  // A completed drag must not also register as the click that opens the
  // detail modal (or removes an item). Rather than a flag that only resets
  // when a matching click actually shows up — which left it stuck "on"
  // forever the moment a drag ended without a compensating click event,
  // silently swallowing the next unrelated tap — this arms a one-shot
  // capturing listener that expires on its own shortly after.
  function suppressNextClick() {
    const swallow = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    grid.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => grid.removeEventListener("click", swallow, true), 400);
  }

  function makeGhost(rect) {
    // Clone before the source card gets "dragging" (which hides it) — a
    // clone taken after would inherit that class and be invisible too,
    // leaving nothing visible tracking the pointer.
    const g = card.cloneNode(true);
    g.classList.remove("dragging");
    g.classList.add("drag-ghost");
    g.style.width = `${rect.width}px`;
    g.style.height = `${rect.height}px`;
    // `translate` (not `transform`): the individual translate/rotate/scale
    // properties compose in that order, so the lift's scale and tilt pivot
    // on the ghost's own centre. Inside a `transform: translate()` they'd
    // pivot on the viewport's top-left and drag the ghost off the cursor,
    // more the farther from that corner.
    g.style.translate = `${rect.left}px ${rect.top}px`;
    document.body.appendChild(g);
    // Flush the resting style first so adding .lifted animates the pick-up
    // (scale + tilt + deeper shadow) instead of starting already lifted.
    void g.offsetWidth;
    g.classList.add("lifted");
    return g;
  }

  // While the pointer sits near the top/bottom edge of the scrolling
  // container, keep scrolling it; re-run the swap hit-test after every
  // scroll step since the cards moved under a stationary pointer.
  function autoScrollTick() {
    scrollRaf = null;
    if (!dragging || !scroller) return;
    const isDoc = scroller === document.scrollingElement;
    const rect = isDoc ? null : scroller.getBoundingClientRect();
    const top = rect ? rect.top : 0;
    const bottom = rect ? rect.bottom : window.innerHeight;
    let step = 0;
    if (lastY < top + AUTOSCROLL_ZONE) {
      step = -Math.min(1, (top + AUTOSCROLL_ZONE - lastY) / AUTOSCROLL_ZONE) * AUTOSCROLL_MAX;
    } else if (lastY > bottom - AUTOSCROLL_ZONE) {
      step = Math.min(1, (lastY - (bottom - AUTOSCROLL_ZONE)) / AUTOSCROLL_ZONE) * AUTOSCROLL_MAX;
    }
    if (step) {
      step = Math.sign(step) * Math.max(1, Math.round(Math.abs(step)));
      const before = scroller.scrollTop;
      scroller.scrollTop += step;
      if (scroller.scrollTop !== before) reorderIfNeeded(lastX, lastY);
    }
    scrollRaf = requestAnimationFrame(autoScrollTick);
  }

  function activate() {
    dragging = true;
    dragActive = true;
    document.body.classList.add("is-dragging", "no-hover");
    if (pointerType === "touch") navigator.vibrate?.(10);
    scroller = scrollParent(grid);
    scrollRaf = requestAnimationFrame(autoScrollTick);
    // Captured only now, not on every pointerdown: while captured, the
    // browser retargets the eventual click's `target` to the capturing
    // element, which broke `e.target.closest(cardSelector)` for a plain
    // click (nothing ever opened) when this ran unconditionally. A real
    // drag doesn't need that click to resolve normally — it gets swallowed
    // by suppressNextClick() anyway — so capture is safe to enable here.
    try { grid.setPointerCapture(pointerId); } catch {}
    // Cards are tilted (and lifted on hover), so their bounding rect is
    // bigger than the card itself: sizing the clone from it made the ghost
    // wider/taller than the card and shoved its contents down. Take the
    // true layout size instead, and centre it where the card is visibly
    // sitting (rotation/scale pivot on the centre, so the centre is exact).
    const visual = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const width = parseFloat(cs.width);
    const height = parseFloat(cs.height);
    const rect = {
      left: visual.left + visual.width / 2 - width / 2,
      top: visual.top + visual.height / 2 - height / 2,
      width,
      height,
    };
    grabDX = startX - rect.left;
    grabDY = startY - rect.top;
    ghost = makeGhost(rect);
    card.classList.add("dragging");
  }

  function moveGhost(x, y) {
    ghost.style.translate = `${x - grabDX}px ${y - grabDY}px`;
  }

  function reorderIfNeeded(x, y) {
    // While siblings are still sliding into place, elementsFromPoint hit-
    // tests their in-transit (transformed) position, not their settled one —
    // so it can still find the card the pointer just "left", trigger a swap
    // back, and repeat every frame. Locking out new swaps until the FLIP
    // transition below has visually settled breaks that feedback loop.
    if (swapCooldown) return;
    let target = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === ghost || ghost.contains(el)) continue;
      const c = el.closest(cardSelector);
      if (c && grid.contains(c)) { target = c; break; }
    }
    if (!target || target === card) return;
    const cards = siblings();
    const from = cards.indexOf(card);
    const to = cards.indexOf(target);
    swapCooldown = true;
    setTimeout(() => { swapCooldown = false; }, 300);
    flipReorder(cards.filter((c) => c !== card), () => {
      if (from < to) target.after(card);
      else target.before(card);
    });
  }

  function onPointerMove(e) {
    if (e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (holdTimer) {
        if (Math.abs(dx) > TOUCH_HOLD_SLOP || Math.abs(dy) > TOUCH_HOLD_SLOP) {
          clearTimeout(holdTimer);
          holdTimer = null;
          teardown();
        }
        return;
      }
      if (Math.abs(dx) > DRAG_MOVE_THRESHOLD || Math.abs(dy) > DRAG_MOVE_THRESHOLD) {
        activate();
      } else {
        return;
      }
    }

    e.preventDefault();
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!dragging) return;
        moveGhost(e.clientX, e.clientY);
        reorderIfNeeded(e.clientX, e.clientY);
      });
    }
  }

  function settle() {
    // Capture fixed references: teardown() nulls out the closure's `card`
    // and a new gesture can overwrite `ghost` before this fires.
    const el = card;
    const g = ghost;
    const rect = el.getBoundingClientRect();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      g.remove();
      el.classList.remove("dragging");
    };
    const ease = "0.22s cubic-bezier(0.22, 1, 0.36, 1)";
    g.style.transition = `translate ${ease}, scale ${ease}, rotate ${ease}, box-shadow ${ease}`;
    g.classList.remove("lifted"); // set the card back down as it flies home
    g.style.translate = `${rect.left}px ${rect.top}px`;
    g.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 260);
  }

  function teardown() {
    // A touch released before the hold fired must not activate afterwards
    // (card is null by then, and dragActive would stay stuck on).
    clearTimeout(holdTimer);
    holdTimer = null;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
    document.body.classList.remove("is-dragging", "no-hover");
    grid.removeEventListener("pointermove", onPointerMove);
    grid.removeEventListener("pointerup", onPointerUp);
    grid.removeEventListener("pointercancel", onPointerUp);
    try { grid.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
    card = null;
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    const wasDragging = dragging;
    if (wasDragging) settle();
    dragging = false;
    dragActive = false;
    teardown();
    if (wasDragging) {
      suppressNextClick();
      onReorder(siblings());
      if (pendingRender) {
        pendingRender = false;
        renderCollections();
        if (openCollectionId) renderCollectionDetail();
        Object.keys(GRID_CONFIG).forEach((id) =>
          renderGrid(id, [...STORE[GRID_CONFIG[id].table].values()])
        );
      }
    }
  }

  // touch-action is only read when a touch starts, so it can't stop the page
  // from scrolling once a hold has already won; cancel the scroll directly.
  grid.addEventListener(
    "touchmove",
    (e) => {
      if (dragging) e.preventDefault();
    },
    { passive: false }
  );

  grid.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (card) return; // a gesture is already being tracked
    if (!canDrag()) return;
    if (e.target.closest("button, a, input")) return;
    const target = e.target.closest(cardSelector);
    if (!target) return;

    pointerId = e.pointerId;
    card = target;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    pointerType = e.pointerType;
    dragging = false;

    grid.addEventListener("pointermove", onPointerMove);
    grid.addEventListener("pointerup", onPointerUp);
    grid.addEventListener("pointercancel", onPointerUp);

    if (e.pointerType === "touch") {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        activate();
      }, TOUCH_HOLD_MS);
    }
  });
}

async function persistOrder(table, storeKey, orderedIds) {
  // Positions to write, one per id in the new order. Collections are simply
  // numbered 1..n. Inside a collection only the open tab's titles are being
  // reordered, so they take back the positions they already held (sorted):
  // the other type's positions stay untouched and nothing collides.
  let targets = orderedIds.map((_, i) => i + 1);
  if (table === "collection_items") {
    const held = orderedIds
      .map((id) => STORE[storeKey].get(id)?.position ?? 0)
      .sort((a, b) => a - b);
    if (new Set(held).size === held.length) targets = held;
  }
  const changed = [];
  orderedIds.forEach((id, i) => {
    const row = STORE[storeKey].get(id);
    if (!row) return;
    if (row.position !== targets[i]) changed.push([id, targets[i]]);
    row.position = targets[i];
  });
  // The drag already left the DOM in this order, so mark the grid as showing
  // it instead of rebuilding it (see paintGrid). Done before the awaits so
  // the realtime echoes of these very updates find nothing to repaint.
  const gridEl =
    table === "collections" ? document.getElementById("grid-collections") : colDetailGrid;
  gridEl._html =
    table === "collections"
      ? collectionsGridHtml()
      : collectionDetailGridHtml(openCollectionId);
  if (table !== "collections") renderCollections(); // stamp posters follow the new order

  if (!changed.length) return;

  // One upsert instead of one UPDATE per moved row. Upsert needs the full row
  // (not just id + position) since its INSERT-path validation still runs even
  // when the conflict resolves to an UPDATE — STORE already holds the full
  // rows, just re-send them with the new position. .select() so we get back
  // the rows that were really written: with row-level security an update the
  // policy doesn't allow succeeds with ZERO rows and no error, which would
  // look saved here and then revert on the next reload.
  const rows = changed.map(([id]) => STORE[storeKey].get(id));
  const { data, error } = await db.from(table).upsert(rows).select("id");
  if (error || (data?.length ?? 0) !== changed.length) {
    console.error(
      "Reorder not saved:",
      error?.message ?? "the upsert wrote fewer rows than expected (missing INSERT/UPDATE policy?)"
    );
    showToast("Could not save the new order.", true);
    // Show what the database really holds, not the order we optimistically drew.
    const { data: fresh } = await db.from(table).select("*");
    if (fresh) fresh.forEach((row) => STORE[storeKey].set(row.id, row));
    gridEl._html = null; // force a rebuild
    renderCollections();
    if (openCollectionId) renderCollectionDetail();
  }
}

setupDragReorder(
  document.getElementById("grid-collections"),
  ".collection-card",
  (cards) =>
    persistOrder("collections", "collections", cards.map((c) => c.dataset.colId))
);

setupDragReorder(colDetailGrid, ".col-item-card", (cards) =>
  persistOrder(
    "collection_items",
    "collectionItems",
    cards.map((c) => c.dataset.bindingId)
  )
);

function refreshOpenCollection() {
  if (!openCollectionId) return;
  if (!STORE.collections.get(openCollectionId)) {
    closeCollectionView();
    return;
  }
  renderCollectionDetail();
  if (collectionAddMode && !libraryModal.classList.contains("hidden")) renderLibraryList();
}

colDetailGrid.addEventListener("click", async (e) => {
  const removeBtn = e.target.closest(".col-item-remove");
  if (removeBtn) {
    const { error } = await db
      .from("collection_items")
      .delete()
      .eq("id", removeBtn.dataset.bindingId);
    if (error) {
      console.error("Remove item error:", error.message);
      showToast("Could not remove title — try again.", true);
      return;
    }
    STORE.collectionItems.delete(removeBtn.dataset.bindingId);
    renderCollections();
    renderCollectionDetail();
    return;
  }

  // "+ Add Titles" (data-type="collection-titles") is handled by the
  // .content-level ghost-card listener in searchModal.js.
  const card = e.target.closest(".col-item-card");
  if (card) {
    const row = STORE[card.dataset.table].get(card.dataset.itemId);
    openDetailModal(
      gridIdFor(card.dataset.table, row),
      card.dataset.itemId,
      // The tab-filtered, position-ordered list this card is actually
      // sitting in — not the movie/show's own library grid.
      () =>
        collectionItemsFor(openCollectionId)
          .filter((item) => itemType(item) === colTab)
          .map(resolveItem)
          .filter(Boolean)
    );
  }
});

document.getElementById("col-stats").addEventListener("click", (e) => {
  const btn = e.target.closest(".extreme-row");
  if (!btn) return;
  const row = STORE[btn.dataset.table]?.get(btn.dataset.itemId);
  if (!row) return;
  openDetailModal(
    gridIdFor(btn.dataset.table, row),
    row.id,
    // The stats strip covers the whole collection regardless of which tab is
    // open (it's labeled "whole collection"), so paging from here should too.
    () => collectionItemsFor(openCollectionId).map(resolveItem).filter(Boolean)
  );
});

colEditBtn.addEventListener("click", () => {
  const col = STORE.collections.get(openCollectionId);
  if (col) openCollectionEditor(col);
});

colDeleteBtn.addEventListener("click", () => {
  const col = STORE.collections.get(openCollectionId);
  if (col) openDeleteConfirm("collections", col);
});

// "Surprise Me": picks a random not-yet-watched title from whichever tab
// (Movies / Shows) is currently open in this collection — same "to watch"
// pool the dashboard's own Surprise Me draws from, just scoped to this
// collection instead of the whole library.
function surprisePoolForOpenCollection() {
  return collectionItemsFor(openCollectionId)
    .filter((item) => itemType(item) === colTab)
    .map(resolveItem)
    .filter(Boolean)
    .filter(({ table, row }) => itemStatus(table, row) === "towatch");
}

colSurpriseBtn.addEventListener("click", () => {
  const pool = surprisePoolForOpenCollection();
  if (!pool.length) {
    showToast(
      colTab === "movie"
        ? "No movies to watch in this collection yet."
        : "No shows to watch in this collection yet."
    );
    return;
  }

  // A quick dice-roll flourish before the reveal — same easing family as the
  // rest of the app's "sticker" buttons, just a playful spin instead of a lift.
  colSurpriseBtn.classList.remove("is-rolling");
  void colSurpriseBtn.offsetWidth; // restart the animation if clicked again mid-roll
  colSurpriseBtn.classList.add("is-rolling");

  const pick = pool[Math.floor(Math.random() * pool.length)];
  // With just one candidate there's nothing to actually shuffle between —
  // say so, instead of pretending a "random" draw happened when it didn't.
  const onlyOption = pool.length === 1;
  setTimeout(() => {
    colSurpriseBtn.classList.remove("is-rolling");
    if (onlyOption) showToast("Only one pick in the queue — this is it!");
    openDetailModal(
      gridIdFor(pick.table, pick.row),
      pick.row.id,
      () =>
        collectionItemsFor(openCollectionId)
          .filter((item) => itemType(item) === colTab)
          .map(resolveItem)
          .filter(Boolean)
    );
  }, 280);
});

// Escape steps back out of the collection, unless a modal is open on top
// of it (that modal's own Escape handler takes precedence).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !collectionView.classList.contains("active")) return;
  if (document.querySelector(".modal-backdrop:not(.hidden)")) return;
  closeCollectionView();
});

/* ---------- adding titles to the open collection ----------

   The "+ Add" button in a collection reuses the same modals as the Movies /
   Shows pages (libraryModal.js for your To Watch lists, searchModal.js for
   TMDB) with `collectionAddMode` on; these are the collection-specific
   actions they call. */

function localRowForTmdb(table, tmdbId) {
  return [...STORE[table].values()].find((r) => r.tmdb_id === Number(tmdbId));
}

function isInOpenCollection(itemId) {
  return collectionItemsFor(openCollectionId).some((i) => i.item_id === itemId);
}

// Links one library row to the open collection. False if it was already there.
async function bindToOpenCollection(table, row) {
  if (isInOpenCollection(row.id)) return false;
  const { data, error } = await db
    .from("collection_items")
    .insert({
      collection_id: openCollectionId,
      item_id: row.id,
      item_type: table === "movies" ? "movie" : "show",
      position: nextPos(collectionItemsFor(openCollectionId)),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  STORE.collectionItems.set(data.id, data);
  return true;
}

// A title picked from TMDB: create it in the library first if it isn't
// there yet, then link it. Returns "added" or "skipped" (already linked).
async function addTmdbTitleToCollection(type, tmdbId) {
  const table = type === "movie" ? "movies" : "shows";
  let local = localRowForTmdb(table, tmdbId);
  if (!local) {
    const details = await tmdbDetails(type, tmdbId);
    const { data, error } = await db
      .from(table)
      .insert(buildRecord(type, details))
      .select()
      .single();
    if (error) throw new Error(error.message);
    STORE[table].set(data.id, data);
    local = data;
  }
  return (await bindToOpenCollection(table, local)) ? "added" : "skipped";
}

// Titles already in the library (picked from the To Watch lists), in one insert.
async function addLibraryTitlesToCollection(ids) {
  const basePos = nextPos(collectionItemsFor(openCollectionId));
  const rows = ids.map((itemId, i) => ({
    collection_id: openCollectionId,
    item_id: itemId,
    item_type: STORE.movies.has(itemId) ? "movie" : "show",
    position: basePos + i,
  }));
  const { data, error } = await db.from("collection_items").insert(rows).select();
  if (error) throw new Error(error.message);
  data.forEach((row) => STORE.collectionItems.set(row.id, row));
  return data.length;
}

// After titles were added: repaint, and if they were all of the other type,
// jump to that tab so the user actually sees what they just added.
function refreshCollectionAfterAdd(type) {
  if (type && type !== colTab) setColTab(type);
  renderCollections();
  renderCollectionDetail();
}

// "movie" / "tv" when every id is of that type, otherwise null.
function collectionTypeOfIds(ids) {
  const types = new Set(ids.map((id) => (STORE.movies.has(id) ? "movie" : "tv")));
  return types.size === 1 ? [...types][0] : null;
}

/* ---------- create / edit collection modal ---------- */

// The icon (emoji or Phosphor icon) is chosen in the picker from
// iconPicker.js, which keeps the hidden #collection-icon input up to date.
function openCreateCollectionModal() {
  editingCollectionId = null;
  collectionModalTitle.textContent = "New Collection";
  collectionSave.textContent = "Create";
  collectionName.value = "";
  collectionError.classList.add("hidden");
  iconPickerSet("", true); // an icon is required, so start with the picker open
  collectionModal.classList.remove("hidden");
  collectionName.focus();
}

function openCollectionEditor(col) {
  editingCollectionId = col.id;
  collectionModalTitle.textContent = "Edit Collection";
  collectionSave.textContent = "Save Changes";
  collectionName.value = col.name ?? "";
  collectionError.classList.add("hidden");
  iconPickerSet(col.icon ?? "", false);
  collectionModal.classList.remove("hidden");
  collectionName.focus();
}

function closeCollectionModal() {
  collectionModal.classList.add("hidden");
}

collectionForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!collectionIcon.value) {
    collectionError.textContent = "Pick an icon for the collection.";
    collectionError.classList.remove("hidden");
    return;
  }

  collectionSave.disabled = true;
  const savingLabel = collectionSave.textContent;
  collectionSave.textContent = "Saving…";

  let result;
  if (editingCollectionId) {
    result = await db
      .from("collections")
      .update({ name: collectionName.value.trim(), icon: collectionIcon.value })
      .eq("id", editingCollectionId)
      .select()
      .single();
  } else {
    const { data: userData, error: userError } = await db.auth.getUser();
    result = userError
      ? { error: userError }
      : await db
          .from("collections")
          .insert({
            name: collectionName.value.trim(),
            icon: collectionIcon.value,
            user_id: userData.user.id,
            position: nextPos([...STORE.collections.values()]),
          })
          .select()
          .single();
  }

  collectionSave.disabled = false;
  collectionSave.textContent = savingLabel;

  if (result.error) {
    console.error("Collection error:", result.error.message);
    collectionError.textContent = "Could not save collection — try again.";
    collectionError.classList.remove("hidden");
    return;
  }

  STORE.collections.set(result.data.id, result.data);
  renderCollections();
  refreshOpenCollection();
  closeCollectionModal();
  collectionForm.reset();
  iconPickerSet("", false);
  showToast(editingCollectionId ? "Collection updated." : "Collection created.");
  editingCollectionId = null;
});

document.getElementById("grid-collections").addEventListener("click", (e) => {
  if (e.target.closest(".ghost-card")) return;
  const card = e.target.closest(".collection-card");
  if (card) openCollectionView(card.dataset.colId);
});

collectionCancel.addEventListener("click", closeCollectionModal);
collectionClose.addEventListener("click", closeCollectionModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !collectionModal.classList.contains("hidden")) {
    closeCollectionModal();
  }
});

collectionModal.addEventListener("click", (e) => {
  if (e.target === collectionModal) closeCollectionModal();
});
