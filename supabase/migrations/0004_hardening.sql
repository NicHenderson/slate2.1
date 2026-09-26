-- Hardening the library tables of 0003, now that their shape is known:
--
--   1. one title per account: no two rows of the same TMDB title for a user
--   2. indexes on what every query filters by, so it stays fast with many users
--   3. deleting a user deletes everything that's theirs (needed to delete an account)
--   4. no privileges the app never uses (TRUNCATE, TRIGGER, REFERENCES)
--
-- All or nothing: if any step fails — most likely step 1, because an account
-- already holds a duplicate — nothing here is applied. Find duplicates first
-- with the query in supabase/README.md.

begin;

-- ---------- 1. one title per account ----------

-- The app already checks before adding; this makes the database refuse a
-- second copy even when two tabs add the same title at the same moment.
-- (tmdb_id may be null, and several nulls never clash.) Leading with
-- user_id, each also serves as the index for "this user's movies / shows".
create unique index movies_user_tmdb_unique on public.movies (user_id, tmdb_id);
create unique index shows_user_tmdb_unique on public.shows (user_id, tmdb_id);

-- ---------- 2. indexes ----------

-- Row-level security filters every read by user_id (collections) or by the
-- collection an item belongs to; deleting a title removes its items by
-- item_id (js/confirmModal.js).
create index collections_user_id_idx on public.collections (user_id);
create index collection_items_collection_id_idx on public.collection_items (collection_id);
create index collection_items_item_id_idx on public.collection_items (item_id);

-- ---------- 3. deleting a user deletes their data ----------

-- Same constraint names as before, now with ON DELETE CASCADE.
-- collection_items follow their collection (already cascading since 0003).
alter table public.movies
  drop constraint movies_user_id_fkey,
  add constraint movies_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.shows
  drop constraint shows_user_id_fkey,
  add constraint shows_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.collections
  drop constraint collections_user_id_fkey,
  add constraint collections_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

-- ---------- 4. no unused privileges ----------

-- A new Supabase project hands these to anon and authenticated on every
-- table. The API never exposes them, but TRUNCATE ignores row-level
-- security entirely, so neither role keeps it.
revoke truncate, trigger, references
  on public.movies, public.shows, public.collections, public.collection_items,
     public.user_settings, public.profiles
  from anon, authenticated;

commit;
