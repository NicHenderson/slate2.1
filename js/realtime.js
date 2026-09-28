// A realtime change re-runs renderGrid (filter + sort) for every grid of that
// table rather than patching one card in place, so a title that changed
// status lands in the right grid, at its sorted position.
function rerenderGrids(gridIds) {
  gridIds.forEach((gridId) => {
    renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
  });
}

function handleChange(storeKey, gridIds, payload) {
  const id = payload.eventType === "DELETE" ? payload.old.id : payload.new.id;
  const before = STORE[storeKey].get(id);
  switch (payload.eventType) {
    case "INSERT":
    case "UPDATE":
      keepLocalPosition(storeKey, payload.new);
      STORE[storeKey].set(payload.new.id, payload.new);
      break;
    case "DELETE":
      STORE[storeKey].delete(payload.old.id);
      break;
  }
  rerenderGrids(gridIds);
  // An open window showing this title follows it (js/detailModal.js).
  if (typeof followLiveChange === "function") followLiveChange(storeKey, payload, before);
  // Collection covers and cards show watched progress / state, so they need
  // to follow a title changing (renders skip themselves when nothing changed).
  if (typeof renderCollections === "function") renderCollections();
  if (typeof renderCollectionDetail === "function" && openCollectionId) {
    renderCollectionDetail();
  }
}

// A write of this tab's own, shown the moment it succeeds rather than when
// its realtime echo comes back: the echo can be late, or lost (once, a
// title added from a collection never showed on To Watch until a reload).
// The echo still arrives and changes nothing. `row` is what the database
// answered with (or, for a delete, at least the row's id).
function applyLocalChange(storeKey, eventType, row) {
  const gridIds = storeKey === "movies" ? MOVIE_GRIDS : SHOW_GRIDS;
  handleChange(storeKey, gridIds, eventType === "DELETE" ? { eventType, old: row } : { eventType, new: row });
}

function handleCollectionChange(storeKey, payload) {
  if (payload.eventType === "DELETE") {
    STORE[storeKey].delete(payload.old.id);
  } else {
    keepLocalPosition(storeKey, payload.new);
    STORE[storeKey].set(payload.new.id, payload.new);
  }
  renderCollections();
  refreshOpenCollection();
}

function subscribeRealtime() {
  db.channel("slate-db-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "movies" },
      (payload) => handleChange("movies", MOVIE_GRIDS, payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shows" },
      (payload) => handleChange("shows", SHOW_GRIDS, payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "collections" },
      (payload) => handleCollectionChange("collections", payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "collection_items" },
      (payload) => handleCollectionChange("collectionItems", payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "viewings" },
      handleViewingChange
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") console.log("Realtime connected");
      if (err) console.error("Realtime error:", err.message);
    });
}
