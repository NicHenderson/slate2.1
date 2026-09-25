// Grids now page instead of rendering the full list, so a realtime change
// always re-runs renderGrid (filter + sort + slice to the current page)
// rather than patching a single card in place — with a bounded page size
// this is cheap, and it's the only way an insert/delete lands on the right
// page and updates the pagination bar's page count.
function rerenderGrids(gridIds) {
  gridIds.forEach((gridId) => {
    renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
  });
}

function handleChange(storeKey, gridIds, payload) {
  switch (payload.eventType) {
    case "INSERT":
    case "UPDATE":
      STORE[storeKey].set(payload.new.id, payload.new);
      break;
    case "DELETE":
      STORE[storeKey].delete(payload.old.id);
      break;
  }
  rerenderGrids(gridIds);
  // Collection covers and cards show watched progress / state, so they need
  // to follow a title changing (renders skip themselves when nothing changed).
  if (typeof renderCollections === "function") renderCollections();
  if (typeof renderCollectionDetail === "function" && openCollectionId) {
    renderCollectionDetail();
  }
  if (typeof renderDashboard === "function") renderDashboard();
}

function handleCollectionChange(storeKey, payload) {
  if (payload.eventType === "DELETE") {
    STORE[storeKey].delete(payload.old.id);
  } else {
    STORE[storeKey].set(payload.new.id, payload.new);
  }
  renderCollections();
  refreshOpenCollection();
  if (typeof renderDashboard === "function") renderDashboard();
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
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") console.log("Realtime connected");
      if (err) console.error("Realtime error:", err.message);
    });
}
