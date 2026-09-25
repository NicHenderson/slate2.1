// Movies/Shows To Watch in "Custom order": cards can be dragged into any
// order (same gesture as Collections, via setupDragReorder in
// collections.js). The order is each row's `position`; see the "custom"
// entry of WATCHLIST_SORTS in data.js for how rows without one sort.

// Numbers the given rows 1..n in STORE and saves the ones that changed.
async function saveCustomOrder(gridId, orderedIds) {
  const { table } = GRID_CONFIG[gridId];
  const changed = [];
  orderedIds.forEach((id, i) => {
    const row = STORE[table].get(id);
    if (!row || row.position === i + 1) return;
    row.position = i + 1;
    changed.push(row);
  });
  if (!changed.length) return;

  // One upsert of the full rows (see persistOrder in collections.js for why
  // full rows, and why .select() checks how many were really written).
  const { data, error } = await db.from(table).upsert(changed).select("id");
  if (error || (data?.length ?? 0) !== changed.length) {
    console.error(
      "Custom order not saved:",
      error?.message ?? "the upsert wrote fewer rows than expected"
    );
    showToast("Could not save the new order.", true);
    // Show what the database really holds, not the order we optimistically drew.
    const { data: fresh } = await db.from(table).select("*");
    if (fresh) fresh.forEach((row) => STORE[table].set(row.id, row));
    rerenderGrids(Object.keys(GRID_CONFIG).filter((id) => GRID_CONFIG[id].table === table));
  }
}

// The first time a list switches to "Custom order" none of its titles has a
// position yet: freeze the order currently on screen (the sort being
// switched away from) so nothing jumps. Must run before activeSorts changes.
function seedCustomOrder(gridId) {
  const rows = getOrderedList(gridId);
  if (rows.some((row) => row.position != null)) return;
  saveCustomOrder(gridId, rows.map((row) => row.id));
}

Object.keys(CUSTOM_SORT_HINTS).forEach((gridId) => {
  const grid = document.getElementById(gridId);
  setupDragReorder(
    grid,
    ".card",
    (cards) => {
      const ids = cards.map((c) => c.dataset.id);
      saveCustomOrder(gridId, ids);
      // The drag already left the DOM in this order: record it as painted
      // so neither the next render nor the realtime echoes of this save
      // rebuild the grid (and yank the card that's still settling).
      grid._html = gridHtml(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
    },
    () => isCustomSorted(gridId)
  );
});
