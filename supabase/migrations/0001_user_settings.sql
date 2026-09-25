-- Per-account app settings (theme, reduce-motion, and any future preference)
-- stored as a single jsonb blob so new settings never need a schema change,
-- only a new default in js/settings.js.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can view their own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS policies only govern which ROWS a query can touch, not whether the
-- role can query the table at all — a table created by hand via the SQL
-- editor (unlike one made in the Table Editor UI) has no grants on it by
-- default, so every request comes back "permission denied" regardless of
-- the policies above until these run.
grant select, insert, update on public.user_settings to authenticated;
