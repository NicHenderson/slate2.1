// TEMPORARY key — replace before sharing / committing
const TMDB_API_KEY = "bd75d552ede58b95a976151115b09671";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w92";
const TMDB_IMG_LG = "https://image.tmdb.org/t/p/w342";

async function tmdbSearch(type, query) {
  const url =
    `${TMDB_BASE}/search/${type}` +
    `?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

async function tmdbDetails(type, id) {
  const url = `${TMDB_BASE}/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
  return res.json();
}
