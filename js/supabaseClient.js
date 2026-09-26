// The one Supabase client the whole app shares (project settings: js/config.js).
// Session is persisted and refreshed by the SDK (defaults). No manual storage.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
