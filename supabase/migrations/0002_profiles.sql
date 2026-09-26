-- Public-facing identity for an account: username, bio and two favorite
-- titles (plus, later, an avatar). Kept apart from user_settings (private
-- app preferences) so it can get its own rules — and its own visibility —
-- without exposing settings.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  bio text,
  -- TMDB snapshots: { tmdb_id, title, year, poster_path }. Independent of
  -- the user's library, so a favorite never has to be added to it first.
  favorite_movie jsonb,
  favorite_show jsonb,
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_.]{3,20}$'),
  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 160)
);

-- One account per username, case-insensitively ("Nick" and "nick" clash).
-- NULLs don't count, so any number of accounts can have no username yet.
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tables made in the SQL editor start with no privileges for the API roles
-- (see 0001): without this every request is "permission denied".
grant select, insert, update on public.profiles to authenticated;
