-- Rewatches: every time a movie was watched, as its own row — a date and
-- an optional short note ("at the cinema with Ana"). The rating and the
-- review stay one per movie (the owner's current opinion of it).
--
-- movies.watched_date is kept, now as the date of the movie's latest
-- viewing, maintained by the database itself: every sort, stat and filter
-- that reads it keeps working unchanged. The rules, all enforced here so
-- they hold whatever writes them:
--
--   1. A viewing added, changed or removed resets its movie's watched_date
--      to the latest viewing left.
--   2. A watched movie always keeps at least one viewing: removing the last
--      one is refused (deleting the movie itself still removes them all).
--   3. Writing movies.watched_date directly, as Slate did before viewings
--      (marking a movie watched, changing its date, or a .slate import),
--      still works: the viewing is created or moved to match. Clearing it
--      is refused, like rule 2 — a watched movie can't go back to having
--      no date.
--
-- Every movie watched today gets one viewing, on its current date, so
-- nothing looks different until a second one is added.
--
-- All or nothing: if any step fails, none of it is applied.

begin;

-- ---------- the table ----------

create table public.viewings (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  watched_on date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- A movie's viewings (the detail window, rule 1); an account's (loading).
create index viewings_movie_id_idx on public.viewings (movie_id);
create index viewings_user_id_idx on public.viewings (user_id);

-- ---------- one viewing for every movie watched today ----------

-- Before the rules below exist, so they don't react to it.
insert into public.viewings (user_id, movie_id, watched_on)
select user_id, id, watched_date
from public.movies
where watched_date is not null;

-- ---------- row-level security ----------

-- Each account's own viewings, of its own movies only.
alter table public.viewings enable row level security;

create policy select_own_viewings on public.viewings
  for select using (auth.uid() = user_id);

create policy insert_own_viewings on public.viewings
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.movies where movies.id = movie_id and movies.user_id = auth.uid())
  );

create policy update_own_viewings on public.viewings
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.movies where movies.id = movie_id and movies.user_id = auth.uid())
  );

create policy delete_own_viewings on public.viewings
  for delete using (auth.uid() = user_id);

-- Same access as the other library tables (0003, 0004).
grant select, insert, update, delete on public.viewings to authenticated;
revoke all on public.viewings from anon;
revoke truncate, trigger, references on public.viewings from authenticated;

-- ---------- rule 1: watched_date follows the latest viewing ----------

-- Runs as the user who made the change (security invoker), so it can only
-- ever touch their own movies. pg_trigger_depth() tells rule 3's trigger
-- that this update comes from here, not from the app.
create function public.viewings_sync_watched_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.movies
    set watched_date = (select max(v.watched_on) from public.viewings v where v.movie_id = old.movie_id)
    where id = old.movie_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.movies
    set watched_date = (select max(v.watched_on) from public.viewings v where v.movie_id = new.movie_id)
    where id = new.movie_id;
  end if;
  return null;
end;
$$;

create trigger viewings_sync_watched_date
  after insert or update or delete on public.viewings
  for each row execute function public.viewings_sync_watched_date();

-- ---------- rule 2: never the last viewing ----------

-- Only a delete asked for directly (depth 1). One cascading from the
-- movie's own deletion comes from inside another trigger and goes through.
create function public.viewings_keep_one()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and not exists (select 1 from public.viewings v where v.movie_id = old.movie_id and v.id <> old.id) then
    raise exception 'A watched movie keeps at least one viewing: change its date instead.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger viewings_keep_one
  before delete on public.viewings
  for each row execute function public.viewings_keep_one();

-- ---------- rule 3: watched_date written directly ----------

-- A movie added or updated with a watched_date, by anything but rule 1:
-- its viewings are made to match. Clearing the date is refused.
create function public.movies_watched_date_to_viewings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  latest uuid;
begin
  if pg_trigger_depth() > 1 then
    return new; -- rule 1 keeping watched_date in step: nothing to do
  end if;

  if tg_op = 'UPDATE' and old.watched_date is not null and new.watched_date is null then
    raise exception 'A watched movie keeps its date: change it instead.'
      using errcode = 'P0001';
  end if;

  if new.watched_date is null
     or (tg_op = 'UPDATE' and new.watched_date is not distinct from old.watched_date) then
    return new;
  end if;

  select v.id into latest
  from public.viewings v
  where v.movie_id = new.id
  order by v.watched_on desc, v.created_at desc
  limit 1;

  if latest is null then
    insert into public.viewings (user_id, movie_id, watched_on)
    values (new.user_id, new.id, new.watched_date);
  else
    update public.viewings set watched_on = new.watched_date where id = latest;
  end if;
  return new;
end;
$$;

create trigger movies_watched_date_to_viewings
  after insert or update of watched_date on public.movies
  for each row execute function public.movies_watched_date_to_viewings();

-- ---------- realtime ----------

-- js/realtime.js keeps every open tab in sync from this table too.
alter publication supabase_realtime add table public.viewings;

commit;
