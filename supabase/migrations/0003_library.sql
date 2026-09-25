-- The library: movies, shows, collections and what's in each collection.
--
-- These four tables were first created by hand in the Supabase dashboard;
-- this file writes them down exactly as they stand in production (read from
-- information_schema / pg_catalog on 2026-09-25), so a new project can be
-- rebuilt from the repo. Nothing here was changed on the way: running it on
-- an empty project gives the same columns, constraints, policies, grants
-- and realtime setup as the live one.
--
-- Every row belongs to one user. Row-level security keeps each account to
-- its own rows: auth.uid() must match user_id (collection_items has no
-- user_id; it goes through the collection it belongs to).

-- ---------- movies ----------

create table if not exists public.movies (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  tmdb_id integer,
  poster text,
  title text not null,
  synopsis text,
  release_year integer,
  duration integer,                -- minutes
  genres text,                     -- comma-separated names, as TMDB gives them
  created_at timestamptz not null default now(),
  watched_date date,               -- null = still on the watchlist
  review text,
  rating real,                     -- out of 10
  position integer                 -- custom order on the watchlist (js/watchlistOrder.js)
);

alter table public.movies enable row level security;

create policy select_own_movies on public.movies
  for select using (auth.uid() = user_id);

create policy insert_own_movies on public.movies
  for insert with check (auth.uid() = user_id);

create policy update_own_movies on public.movies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy delete_own_movies on public.movies
  for delete using (auth.uid() = user_id);

-- ---------- shows ----------

create table if not exists public.shows (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  tmdb_id integer,
  poster text,
  title text not null,
  synopsis text,
  release_year integer,
  total_seasons integer,
  total_episodes integer,
  genres text,
  created_at timestamptz not null default now(),
  started_watching_date date,      -- set = watching (or finished)
  finished_watching_date date,     -- set = finished
  review text,
  rating real,
  is_dropped boolean not null default false,
  position integer                 -- custom order on the queue
);

alter table public.shows enable row level security;

create policy select_own_shows on public.shows
  for select using (auth.uid() = user_id);

create policy insert_own_shows on public.shows
  for insert with check (auth.uid() = user_id);

-- No WITH CHECK: for UPDATE, Postgres then applies the USING expression to
-- the new row as well, so a row still can't be handed to another user.
create policy update_own_shows on public.shows
  for update using (auth.uid() = user_id);

create policy delete_own_shows on public.shows
  for delete using (auth.uid() = user_id);

-- ---------- collections ----------

create table if not exists public.collections (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  icon text not null,              -- an emoji, or "icon:<name>:<color>" (js/icons.js)
  created_at timestamptz not null default now(),
  position integer
);

alter table public.collections enable row level security;

create policy select_own_collections on public.collections
  for select using (auth.uid() = user_id);

create policy insert_own_collections on public.collections
  for insert with check (auth.uid() = user_id);

create policy update_own_collections on public.collections
  for update using (auth.uid() = user_id);

create policy delete_own_collections on public.collections
  for delete using (auth.uid() = user_id);

-- ---------- collection_items ----------

-- item_id points at a movie or a show (item_type says which), so it can't
-- have a foreign key: js/confirmModal.js deletes a title's items itself.
create table if not exists public.collection_items (
  id uuid not null default gen_random_uuid() primary key,
  collection_id uuid not null references public.collections(id) on delete cascade,
  item_type text not null check (item_type = any (array['movie'::text, 'show'::text])),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  position integer
);

alter table public.collection_items enable row level security;

create policy select_own_collection_items on public.collection_items
  for select using (
    exists (
      select 1 from public.collections
      where collections.id = collection_items.collection_id
        and collections.user_id = auth.uid()
    )
  );

create policy insert_own_collection_items on public.collection_items
  for insert with check (
    exists (
      select 1 from public.collections
      where collections.id = collection_items.collection_id
        and collections.user_id = auth.uid()
    )
  );

create policy "update own collection items" on public.collection_items
  for update
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and c.user_id = auth.uid()
    )
  );

create policy delete_own_collection_items on public.collection_items
  for delete using (
    exists (
      select 1 from public.collections
      where collections.id = collection_items.collection_id
        and collections.user_id = auth.uid()
    )
  );

-- ---------- access ----------

-- Signed-in users read and write through the policies above. Signed-out
-- visitors (anon) get none of it: a new Supabase project grants them
-- everything on new tables by default, so it's taken back here. (What anon
-- keeps after this, as in production, is REFERENCES, TRIGGER and TRUNCATE,
-- none of which the API exposes.)
grant select, insert, update, delete
  on public.movies, public.shows, public.collections, public.collection_items
  to authenticated;

revoke select, insert, update, delete
  on public.movies, public.shows, public.collections, public.collection_items
  from anon;

-- ---------- realtime ----------

-- js/realtime.js keeps every open tab in sync from these tables' changes.
alter publication supabase_realtime
  add table public.movies, public.shows, public.collections, public.collection_items;
