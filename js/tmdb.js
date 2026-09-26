// TMDB, through Slate's own Edge Function (supabase/functions/tmdb): the
// API key lives there as a server secret, never in the browser. The
// function takes a TMDB path (plus a query for searches) from a signed-in
// user and returns TMDB's answer unchanged; supabase-js sends the session
// along by itself.
//
// Posters load straight from TMDB's image server, which needs no key.

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";
const TMDB_IMG_LG = "https://image.tmdb.org/t/p/w342";

async function tmdbRequest(path, query) {
  const { data, error } = await db.functions.invoke("tmdb", {
    body: query === undefined ? { path } : { path, query },
  });
  if (error) {
    // A TMDB error (a wrong id: 404) or the function's own (401 signed out).
    const status = error.context?.status;
    throw new Error(status ? `TMDB responded ${status}` : `TMDB request failed: ${error.message}`);
  }
  return data;
}

async function tmdbSearch(type, query) {
  const data = await tmdbRequest(`search/${type}`, query);
  return data.results ?? [];
}

async function tmdbDetails(type, id) {
  return tmdbRequest(`${type}/${id}`);
}

async function tmdbVideos(type, id) {
  const data = await tmdbRequest(`${type}/${id}/videos`);
  return data.results ?? [];
}
