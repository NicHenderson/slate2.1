// Which Supabase project this copy of Slate talks to. To run Slate on
// another project (see supabase/README.md), this is the only file to edit.
//
// Both values are public by design and safe to commit: every browser that
// opens Slate receives them anyway. The publishable key only lets a visitor
// knock on the door; what each account can read or change is decided by
// the database's row-level security (supabase/migrations/). Secrets never
// go here or anywhere else in js/ — anything sent to the browser is public.
// Those live on the server instead, like the TMDB key, which is a secret of
// the tmdb Edge Function (supabase/functions/tmdb/).

const SUPABASE_URL = "https://vzmxvogjycyybvmkvadh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WKjEnesVJrGnSzq-LXQ4Ug_ZSZwBWHQ";
