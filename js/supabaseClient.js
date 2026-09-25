// TEMPORARY credentials — replace before sharing / committing
const SUPABASE_URL = "https://vzmxvogjycyybvmkvadh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WKjEnesVJrGnSzq-LXQ4Ug_ZSZwBWHQ";

// Session is persisted and refreshed by the SDK (defaults). No manual storage.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
