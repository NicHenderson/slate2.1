// TMDB, through Slate's own Edge Function (supabase/functions/tmdb): the
// API key lives there as a server secret, never in the browser. The
// function takes a TMDB path (plus a query for searches, and a language)
// from a signed-in user and returns TMDB's answer unchanged; supabase-js
// sends the session along by itself.
//
// Searches and details come in the page's language, so a title is saved
// with the name and synopsis it had there when it was added (the owner's
// choice: what's saved stays as it was). Trailers and where to watch stay
// as they were: in English, TMDB lists the most trailers.
//
// Posters load straight from TMDB's image server, which needs no key.

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";
const TMDB_IMG_LG = "https://image.tmdb.org/t/p/w342";

async function tmdbRequest(path, query, language) {
  const body = { path };
  if (query !== undefined) body.query = query;
  if (language) body.language = language;
  const { data, error } = await db.functions.invoke("tmdb", { body });
  if (error) {
    // A TMDB error (a wrong id: 404) or the function's own (401 signed out).
    const status = error.context?.status;
    throw new Error(status ? `TMDB responded ${status}` : `TMDB request failed: ${error.message}`);
  }
  return data;
}

async function tmdbSearch(type, query) {
  const data = await tmdbRequest(`search/${type}`, query, TMDB_LANGUAGE);
  return data.results ?? [];
}

// A title's details in the page's language. What TMDB hasn't translated
// comes from its English details instead: a missing synopsis (TMDB leaves
// it empty) and a name it leaves as the original, when that's in neither
// language (a Korean title's, say, rather than its English one).
async function tmdbDetails(type, id) {
  const details = await tmdbRequest(`${type}/${id}`, undefined, TMDB_LANGUAGE);
  if (TMDB_LANGUAGE === "en-US") return details;
  const name = details.title ?? details.name;
  const original = details.original_title ?? details.original_name;
  const untranslatedName = name === original && !["en", TMDB_LANGUAGE.slice(0, 2)].includes(details.original_language);
  if (details.overview && !untranslatedName) return details;
  try {
    const english = await tmdbRequest(`${type}/${id}`, undefined, "en-US");
    return {
      ...details,
      overview: details.overview || english.overview,
      ...(untranslatedName ? { title: english.title, name: english.name } : {}),
    };
  } catch {
    return details; // the translated details still do
  }
}

async function tmdbVideos(type, id) {
  const data = await tmdbRequest(`${type}/${id}/videos`);
  return data.results ?? [];
}

// Where to watch a title: TMDB answers for every country at once, as
// { "CL": { link, flatrate: [...], rent: [...], ... }, ... }.
async function tmdbWatchProviders(type, id) {
  const data = await tmdbRequest(`${type}/${id}/watch/providers`);
  return data.results ?? {};
}

// The countries TMDB has that for.
async function tmdbWatchRegions() {
  const data = await tmdbRequest("watch/providers/regions");
  return data.results ?? [];
}
