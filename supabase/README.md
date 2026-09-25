# Database

Slate's database is a Supabase (Postgres) project. `migrations/` holds its
whole structure — tables, row-level security, grants and realtime — as SQL
files, numbered in the order they apply:

| File | What it sets up |
| --- | --- |
| `0001_user_settings.sql` | Per-account settings (theme, reduced motion, defaults) |
| `0002_profiles.sql` | Profile: username, bio, favorite movie and show |
| `0003_library.sql` | The library: movies, shows, collections and their items |

The data itself isn't here: that's what **Settings → Your Data → Export
data** is for (a `.slate` file per account).

## Edge Functions

`functions/` holds code that runs on Supabase's servers instead of in the
browser — for anything that needs a secret:

| Function | What it does |
| --- | --- |
| [`tmdb`](functions/tmdb/README.md) | Proxies the app's TMDB requests, keeping the TMDB API key server-side |

## Rebuilding the database from scratch

1. Create a new project at [supabase.com](https://supabase.com).
2. In its **SQL Editor**, run each file in `migrations/` in order
   (`0001`, `0002`, `0003`, …), one at a time.
3. Point the app at the new project: update the URL and anon key in
   `js/supabaseClient.js`.
4. Under **Authentication → URL Configuration**, add the address the app is
   served from to the Site URL / Redirect URLs.
5. Deploy the Edge Functions in `functions/` and set their secrets (each
   one's README says how).
6. Sign up, then bring your library back with **Settings → Your Data →
   Import data**.

## Changing the database

Never change the structure only in the dashboard. Write the change as the
next numbered file (`0004_….sql`), run it in the SQL Editor, and commit it
with the code that needs it — so this folder always describes the live
database.
