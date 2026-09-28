-- Episode tracking: every episode of a show someone has ticked as watched,
-- one row each, so any episode can be ticked or unticked on its own. Only
-- which episodes, never when: the show keeps its own started / finished
-- dates, as before.
--
-- Episodes are kept by their season and episode numbers (as TMDB numbers
-- them), not by TMDB's own episode ids, so a .slate backup reads on its
-- own. Specials (season 0) are left out of episode tracking, so seasons
-- start at 1.
--
-- The one rule the database keeps itself, so it holds whatever writes the
-- show (the published app included, which knows nothing of episodes):
--
--   A show sent back to To Watch (its started date cleared) is started
--   over from scratch: its ticked episodes go too, like its dates, rating
--   and review.
--
-- replace_my_library() (0008) learns to bring a file's episodes in too.
-- Called without them, as the published app does, it works exactly as
-- before.
--
-- Nothing else changes: until the app's new code uses this table, the
-- published app works exactly as it does today.
--
-- All or nothing: if any step fails, none of it is applied.

begin;

-- ---------- the table ----------

create table public.watched_episodes (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  show_id uuid not null references public.shows (id) on delete cascade,
  season integer not null check (season between 1 and 999),
  episode integer not null check (episode between 0 and 99999),
  created_at timestamptz not null default now(),
  -- Ticking one twice is refused rather than stored twice.
  unique (show_id, season, episode)
);

-- A show's episodes are found through the unique index above (it starts
-- with show_id); an account's, when the library loads, through this one.
create index watched_episodes_user_id_idx on public.watched_episodes (user_id);

-- ---------- row-level security ----------

-- Each account's own episodes, of its own shows only. There's nothing to
-- edit in a row: an episode is ticked (insert) or unticked (delete).
alter table public.watched_episodes enable row level security;

create policy select_own_watched_episodes on public.watched_episodes
  for select using (auth.uid() = user_id);

create policy insert_own_watched_episodes on public.watched_episodes
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.shows where shows.id = show_id and shows.user_id = auth.uid())
  );

create policy delete_own_watched_episodes on public.watched_episodes
  for delete using (auth.uid() = user_id);

-- Same access as the other library tables (0003, 0004, 0007), minus
-- update, which no policy allows anyway.
grant select, insert, delete on public.watched_episodes to authenticated;
revoke all on public.watched_episodes from anon;
revoke update, truncate, trigger, references on public.watched_episodes from authenticated;

-- ---------- the rule: back to To Watch starts it over ----------

-- Runs as the user who made the change (security invoker), so it can only
-- ever touch their own episodes.
create function public.shows_restart_clears_episodes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.watched_episodes where show_id = new.id;
  return null;
end;
$$;

create trigger shows_restart_clears_episodes
  after update of started_watching_date on public.shows
  for each row
  when (old.started_watching_date is not null and new.started_watching_date is null)
  execute function public.shows_restart_clears_episodes();

-- ---------- Replace everything carries episodes ----------

-- 0008's function, unchanged but for the episodes: `library` may now also
-- hold
--
--   "episodes": [{ show_id, season, episode, created_at }]
--
-- (show_id being one of the file's shows' ids). Old shows' episodes go
-- with their shows (on delete cascade), as their viewings go with movies.
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
  -- viewings, shows their episodes (on delete cascade).
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

  insert into public.watched_episodes (user_id, show_id, season, episode, created_at)
  select me, x.show_id, x.season, x.episode, coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(library->'episodes', '[]')) as x(
    show_id uuid, season integer, episode integer, created_at timestamptz);

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

-- create or replace keeps 0008's grants; restated so this file reads whole.
revoke all on function public.replace_my_library(jsonb) from public, anon;
grant execute on function public.replace_my_library(jsonb) to authenticated;

-- ---------- realtime ----------

-- js/realtime.js keeps every open tab in sync from this table too.
alter publication supabase_realtime add table public.watched_episodes;

commit;
