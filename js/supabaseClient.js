// The one Supabase client the whole app shares (project settings: js/config.js).
// Session is persisted and refreshed by the SDK (defaults). No manual storage.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Supabase answers at most 1,000 rows per request (Settings → API → Max
// rows) — silently: a table read in one go past that loses the rest, in no
// particular order. So whole tables are always read through this: pages in
// a fixed order until the exact count is reached (not merely until a short
// page, which a lower server-side cap would fake). If no count comes back,
// it keeps going while pages come back full. A table under a page costs
// one request, as before.
const PAGE_SIZE = 1000;

async function fetchAllRows(table) {
  const rows = [];
  for (;;) {
    const { data, error, count } = await db
      .from(table)
      .select("*", { count: "exact" })
      .order("created_at")
      .order("id")
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    const total = count ?? (data.length < PAGE_SIZE ? rows.length : Infinity);
    if (!data.length || rows.length >= total) return rows;
  }
}
