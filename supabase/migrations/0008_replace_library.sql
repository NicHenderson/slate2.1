-- Replacing a whole library in one step: Settings → Your Data → Import →
-- "Replace everything" calls replace_my_library() (js/yourData.js).
--
-- Before this, the app replaced a library with many requests of its own,
-- and a tab closed halfway left it half replaced. A function call is one
-- transaction: the library is either all the file's or still exactly as
-- it was, never a mix, whatever happens to the tab or the connection.
--
-- It runs as the user who calls it (security invoker), so row-level
-- security still applies to every row it deletes or writes: it can only
-- ever reach the caller's own library.
--
-- `library` is what the app read from the .slate file, already checked and
-- cleaned there, with an id for every row so the items and viewings can
-- point at their titles:
--
--   { "movies":      [{ id, tmdb_id, title, poster, synopsis, release_year,
--                       duration, genres, created_at, review, rating,
--                       position }],
--     "shows":       [{ id, tmdb_id, title, poster, synopsis, release_year,
--                       total_seasons, total_episodes, genres, created_at,
--                       started_watching_date, finished_watching_date,
--                       review, rating, is_dropped, position }],
--     "viewings":    [{ movie_id, watched_on, created_at }],
--     "collections": [{ id, name, icon, position, created_at }],
--     "items":       [{ collection_id, item_type, item_id, position,
--                       created_at }] }
--
-- Movies go in without a date; their viewings set it (0007's rule 1), so a
-- movie is watched exactly when the file gives it viewings. Anything the
-- tables refuse (a title twice, a missing name) fails the whole call and
-- changes nothing.
--
-- Returns how many titles the account had that the file doesn't, for the
-- app's "N titles that weren't in the file were removed".
--
-- Adding this function changes nothing by itself: the published app keeps
-- working as before until its new code calls it.

create or replace function public.replace_my_library(library jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = '' -- nothing resolved through a schema the caller could shadow
as $$
declare
  me uuid := auth.uid();
  removed integer;
begin
  if me is null then
    raise exception 'Sign in to replace your library.' using errcode = '42501';
  end if;

  -- The titles that won't be back, counted before they go.
  select
    (select count(*) from public.movies m
      where m.user_id = me
        and (m.tmdb_id is null or m.tmdb_id not in (
          select (x->>'tmdb_id')::integer from jsonb_array_elements(coalesce(library->'movies', '[]')) x)))
    + (select count(*) from public.shows s
      where s.user_id = me
        and (s.tmdb_id is null or s.tmdb_id not in (
          select (x->>'tmdb_id')::integer from jsonb_array_elements(coalesce(library->'shows', '[]')) x)))
  into removed;

  -- Out with the old: collections take their items along, movies their
  -- viewings (on delete cascade).
  delete from public.collections where user_id = me;
  delete from public.movies where user_id = me;
  delete from public.shows where user_id = me;

  -- In with the file's.
  insert into public.movies (id, user_id, tmdb_id, title, poster, synopsis, release_year, duration,
                             genres, created_at, review, rating, position)
  select x.id, me, x.tmdb_id, x.title, x.poster, x.synopsis, x.release_year, x.duration,
         x.genres, coalesce(x.created_at, now()), x.review, x.rating, x.position
  from jsonb_to_recordset(coalesce(library->'movies', '[]')) as x(
    id uuid, tmdb_id integer, title text, poster text, synopsis text, release_year integer,
    duration integer, genres text, created_at timestamptz, review text, rating real, position integer);

  insert into public.shows (id, user_id, tmdb_id, title, poster, synopsis, release_year, total_seasons,
                            total_episodes, genres, created_at, started_watching_date,
                            finished_watching_date, review, rating, is_dropped, position)
  select x.id, me, x.tmdb_id, x.title, x.poster, x.synopsis, x.release_year, x.total_seasons,
         x.total_episodes, x.genres, coalesce(x.created_at, now()), x.started_watching_date,
         x.finished_watching_date, x.review, x.rating, coalesce(x.is_dropped, false), x.position
  from jsonb_to_recordset(coalesce(library->'shows', '[]')) as x(
    id uuid, tmdb_id integer, title text, poster text, synopsis text, release_year integer,
    total_seasons integer, total_episodes integer, genres text, created_at timestamptz,
    started_watching_date date, finished_watching_date date, review text, rating real,
    is_dropped boolean, position integer);

  insert into public.viewings (user_id, movie_id, watched_on, created_at)
  select me, x.movie_id, x.watched_on, coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(library->'viewings', '[]')) as x(
    movie_id uuid, watched_on date, created_at timestamptz);

  insert into public.collections (id, user_id, name, icon, position, created_at)
  select x.id, me, x.name, x.icon, x.position, coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(library->'collections', '[]')) as x(
    id uuid, name text, icon text, position integer, created_at timestamptz);

  insert into public.collection_items (collection_id, item_type, item_id, position, created_at)
  select x.collection_id, x.item_type, x.item_id, x.position, coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(library->'items', '[]')) as x(
    collection_id uuid, item_type text, item_id uuid, position integer, created_at timestamptz);

  return jsonb_build_object('removed', removed);
end;
$$;

-- Functions are callable by everyone by default: signed-in users only.
revoke all on function public.replace_my_library(jsonb) from public, anon;
grant execute on function public.replace_my_library(jsonb) to authenticated;
