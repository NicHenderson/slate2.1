// The fake TMDB the tests search: a handful of real titles, shaped like
// TMDB's own answers (search results and details share one object here —
// the app only reads fields both have, or the details' extra ones).

// TMDB's own genre ids (js/detailModal.js saves genres by them).
const GENRE_IDS = { Action: 28, Adventure: 12, Comedy: 35, Crime: 80, Drama: 18, Family: 10751, Horror: 27, Mystery: 9648, "Science Fiction": 878, "Sci-Fi & Fantasy": 10765 };
const genresOf = (names) => names.map((name) => ({ id: GENRE_IDS[name], name }));

const movie = (id, title, date, runtime, genres, overview, extra = {}) => ({
  id,
  title,
  original_title: title,
  original_language: "en",
  release_date: date,
  runtime,
  genres: genresOf(genres),
  overview,
  poster_path: `/poster-${id}.jpg`,
  ...extra,
});

const show = (id, name, date, seasons, episodes, genres, overview, language = "en", extra = {}) => ({
  id,
  name,
  original_name: name,
  original_language: language,
  first_air_date: date,
  number_of_seasons: seasons,
  number_of_episodes: episodes,
  genres: genresOf(genres),
  overview,
  poster_path: `/poster-tv-${id}.jpg`,
  ...extra,
});

// A show's seasons as its details list them: [number, episodes, first air
// date], season 0 being its specials (which Slate leaves out).
const seasonsOf = (list) => list.map(([season_number, episode_count, air_date]) => ({ season_number, episode_count, air_date, name: `Season ${season_number}` }));

const TMDB_CATALOG = {
  movie: [
    movie(348, "Alien", "1979-05-25", 117, ["Horror", "Science Fiction"], "The crew of a commercial spacecraft encounters a deadly lifeform.", {
      videos: [{ site: "YouTube", type: "Trailer", official: true, key: "fake-alien-trailer" }],
    }),
    movie(603, "The Matrix", "1999-03-31", 136, ["Action", "Science Fiction"], "A hacker learns the truth about his reality."),
    movie(346648, "Paddington 2", "2017-11-09", 104, ["Adventure", "Comedy", "Family"], "Paddington picks up a series of odd jobs to buy the perfect present."),
    movie(27205, "Inception", "2010-07-15", 148, ["Action", "Science Fiction", "Adventure"], "A thief who steals corporate secrets through dreams."),
  ],
  tv: [
    show(1399, "Game of Thrones", "2011-04-17", 8, 73, ["Sci-Fi & Fantasy", "Drama"], "Seven noble families fight for control of Westeros.", "en", {
      status: "Ended",
      seasons: seasonsOf([[1, 10, "2011-04-17"], [2, 10, "2012-04-01"], [3, 10, "2013-03-31"], [4, 10, "2014-04-06"], [5, 10, "2015-04-12"], [6, 10, "2016-04-24"], [7, 7, "2017-07-16"], [8, 6, "2019-04-14"]]),
      next_episode_to_air: null,
    }),
    show(70523, "Dark", "2017-12-01", 3, 26, ["Crime", "Drama", "Mystery"], "A missing child sets four families on a frantic hunt for answers.", "de", {
      status: "Ended",
      seasons: seasonsOf([[0, 1, "2017-11-20"], [1, 10, "2017-12-01"], [2, 8, "2019-06-21"], [3, 8, "2020-06-27"]]),
      next_episode_to_air: null,
    }),
    // Still airing: its third season is announced, not out.
    show(95396, "Severance", "2022-02-18", 3, 29, ["Drama", "Mystery"], "Office workers whose memories are split between work and home.", "en", {
      status: "Returning Series",
      seasons: seasonsOf([[1, 9, "2022-02-18"], [2, 10, "2025-01-17"], [3, 10, "2099-01-15"]]),
      next_episode_to_air: { season_number: 3, episode_number: 1, air_date: "2099-01-15" },
    }),
  ],
};

// What TMDB answers in Latin American Spanish ("es-MX"): these names and
// synopses over the English ones (Inception has no Spanish synopsis: TMDB
// leaves it empty), and the genres by their Spanish names.
const TMDB_SPANISH = {
  "movie/348": { title: "Alien: el octavo pasajero", overview: "La tripulación de una nave comercial se topa con una forma de vida mortal." },
  "movie/603": { title: "Matrix", overview: "Un hacker descubre la verdad sobre su realidad." },
  "movie/27205": { title: "El origen", overview: "" },
  "tv/1399": { name: "Juego de tronos", overview: "Siete familias nobles luchan por el control de Westeros." },
};
const SPANISH_GENRES = { Action: "Acción", Adventure: "Aventura", Comedy: "Comedia", Crime: "Crimen", Family: "Familia", Horror: "Terror", Mystery: "Misterio", "Science Fiction": "Ciencia ficción" };

// A title as TMDB answers it in `language`.
function inLanguage(type, title, language) {
  if (language !== "es-MX") return title;
  return {
    ...title,
    ...TMDB_SPANISH[`${type}/${title.id}`],
    genres: title.genres.map((g) => ({ id: g.id, name: SPANISH_GENRES[g.name] ?? g.name })),
  };
}

// Where to watch, as TMDB's watch/providers answers it: every country at
// once, each with the services by kind. A title missing here has none.
const provider = (provider_id, provider_name) => ({ provider_id, provider_name, logo_path: `/logo-${provider_id}.jpg`, display_priority: 1 });
const watchPage = (type, id, region) => `https://www.themoviedb.org/${type}/${id}/watch?locale=${region}`;

const TMDB_WATCH_PROVIDERS = {
  "movie/603": {
    CL: { link: watchPage("movie", 603, "CL"), flatrate: [provider(8, "Netflix")], rent: [provider(2, "Apple TV")], buy: [provider(2, "Apple TV"), provider(3, "Google Play Movies")] },
    US: { link: watchPage("movie", 603, "US"), flatrate: [provider(1899, "Max")] },
  },
  "tv/1399": {
    US: { link: watchPage("tv", 1399, "US"), flatrate: [provider(1899, "Max")], ads: [provider(300, "Pluto TV")] },
  },
};

const TMDB_WATCH_REGIONS = [
  { iso_3166_1: "CL", english_name: "Chile", native_name: "Chile" },
  { iso_3166_1: "DE", english_name: "Germany", native_name: "Germany" },
  { iso_3166_1: "US", english_name: "United States of America", native_name: "United States" },
];

// A season's episodes, as tv/<id>/season/<n> answers them. Dark's first
// season has its real titles; the rest are "Episode N". In Spanish, only
// Dark's first three episodes have a synopsis (TMDB leaves the others
// empty) and an untranslated name comes back as "Episodio N", as TMDB
// does. Dark 1x5 has no image.
const DARK_S1 = ["Secrets", "Lies", "Past and Present", "Double Lives", "Truths", "Sic Mundus Creatus Est", "Crossroads", "As You Sow, so You Shall Reap", "Everything Is Now", "Alpha and Omega"];
const DARK_S1_ES = ["Secretos", "Mentiras", "Pasado y presente", "Vidas dobles", "Verdades"];

function tmdbSeason(tvId, number, language) {
  const title = TMDB_CATALOG.tv.find((t) => t.id === tvId);
  const season = title?.seasons?.find((s) => s.season_number === number);
  if (!season) return null;
  const spanish = language === "es-MX";
  const episodes = Array.from({ length: season.episode_count }, (_, i) => {
    const e = i + 1;
    const dark1 = tvId === 70523 && number === 1;
    const english = dark1 ? DARK_S1[i] : `Episode ${e}`;
    const name = spanish ? (dark1 && DARK_S1_ES[i]) || `Episodio ${e}` : english;
    const overview = spanish ? (dark1 && e <= 3 ? `Resumen de ${name}.` : "") : `What happens in ${english}.`;
    // A week apart from the season's first air date.
    const air = new Date(Date.parse(season.air_date) + i * 7 * 86400000).toISOString().slice(0, 10);
    return { season_number: number, episode_number: e, name, overview, air_date: air, still_path: tvId === 70523 && number === 1 && e === 5 ? null : `/still-${tvId}-${number}-${e}.jpg` };
  });
  return { id: tvId * 100 + number, season_number: number, episodes };
}

module.exports = { TMDB_CATALOG, TMDB_WATCH_PROVIDERS, TMDB_WATCH_REGIONS, inLanguage, tmdbSeason };
