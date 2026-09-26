// The fake TMDB the tests search: a handful of real titles, shaped like
// TMDB's own answers (search results and details share one object here —
// the app only reads fields both have, or the details' extra ones).

const movie = (id, title, date, runtime, genres, overview, extra = {}) => ({
  id,
  title,
  release_date: date,
  runtime,
  genres: genres.map((name, i) => ({ id: i + 1, name })),
  overview,
  poster_path: `/poster-${id}.jpg`,
  ...extra,
});

const show = (id, name, date, seasons, episodes, genres, overview) => ({
  id,
  name,
  first_air_date: date,
  number_of_seasons: seasons,
  number_of_episodes: episodes,
  genres: genres.map((g, i) => ({ id: i + 1, name: g })),
  overview,
  poster_path: `/poster-tv-${id}.jpg`,
});

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
    show(1399, "Game of Thrones", "2011-04-17", 8, 73, ["Sci-Fi & Fantasy", "Drama"], "Seven noble families fight for control of Westeros."),
    show(70523, "Dark", "2017-12-01", 3, 26, ["Crime", "Drama", "Mystery"], "A missing child sets four families on a frantic hunt for answers."),
  ],
};

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

module.exports = { TMDB_CATALOG, TMDB_WATCH_PROVIDERS, TMDB_WATCH_REGIONS };
