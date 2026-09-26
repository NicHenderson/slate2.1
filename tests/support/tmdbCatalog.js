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

module.exports = { TMDB_CATALOG };
