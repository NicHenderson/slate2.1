// Supabase Edge Function "tmdb": the app's only way to TMDB.
//
// TMDB's API key is a secret, and anything sent to the browser is public,
// so the key lives here instead, as the function secret TMDB_API_KEY
// (Dashboard → Edge Functions → Secrets). The app asks this function; this
// function asks TMDB with the key and hands the answer back unchanged.
//
//   POST { "path": "search/movie", "query": "alien" }   → TMDB's search JSON
//   POST { "path": "movie/348" }                          → the title's details
//   POST { "path": "tv/1399/videos" }                     → its trailers
//
// Only those three kinds of request, and only for a signed-in user: the
// caller's session token is checked with Supabase Auth, so the function
// can't be used as a free TMDB key by anyone who finds its address.
// Posters don't come through here: image.tmdb.org needs no key.
//
// Deploy with JWT verification off (it's done below instead, which works
// with both the legacy and the new Supabase API keys). See the README next
// to this file.

const TMDB_BASE = "https://api.themoviedb.org/3";

// The only TMDB requests Slate makes (js/tmdb.js).
const ALLOWED_PATHS = [
  /^search\/(movie|tv)$/,
  /^(movie|tv)\/\d{1,10}$/,
  /^(movie|tv)\/\d{1,10}\/videos$/,
];

const MAX_QUERY_LENGTH = 200;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface Deps {
  tmdbKey: string | undefined;
  // True when the token belongs to a signed-in user. `apiKey` is the
  // project key the caller sent along, which Supabase Auth wants too.
  isSignedIn(token: string, apiKey: string | null): Promise<boolean>;
  fetch: typeof fetch;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !(await deps.isSignedIn(token, req.headers.get("apikey")))) {
    return json(401, { error: "Sign in to use TMDB." });
  }
  if (!deps.tmdbKey) return json(500, { error: "The TMDB key isn't set up on the server." });

  let body: { path?: unknown; query?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Expected a JSON body." });
  }
  const path = typeof body?.path === "string" ? body.path : "";
  if (!ALLOWED_PATHS.some((allowed) => allowed.test(path))) {
    return json(400, { error: "Not a TMDB request Slate makes." });
  }

  const params = new URLSearchParams({ api_key: deps.tmdbKey, language: "en-US" });
  if (path.startsWith("search/")) {
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > MAX_QUERY_LENGTH) {
      return json(400, { error: `A search needs a query of 1 to ${MAX_QUERY_LENGTH} characters.` });
    }
    params.set("query", query);
  }

  let answer: Response;
  try {
    answer = await deps.fetch(`${TMDB_BASE}/${path}?${params}`);
  } catch {
    return json(502, { error: "TMDB couldn't be reached." });
  }
  // TMDB's own status and body, as they are (its errors never repeat the key).
  return new Response(await answer.text(), {
    status: answer.status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Asks Supabase Auth who the token belongs to: 200 means a real,
// unexpired session of this project.
async function isSignedIn(token: string, apiKey: string | null): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = apiKey ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Tests import handle() without starting a server.
if (Deno.env.get("TMDB_PROXY_TEST") !== "1") {
  Deno.serve((req) =>
    handle(req, { tmdbKey: Deno.env.get("TMDB_API_KEY"), isSignedIn, fetch })
  );
}
