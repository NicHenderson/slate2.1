// A stand-in for Slate's whole backend, installed into a Playwright page so
// the tests never touch a real account, the real database or the internet.
//
//   Auth       /auth/v1/…      users with passwords and metadata, sessions,
//                              reset emails (recorded), password changes;
//                              sign-up is off, as in production
//   Database   /rest/v1/…      the tables of supabase/migrations/, in memory,
//                              with the same ownership rules as the real
//                              row-level security (each user sees only theirs),
//                              and 0007's rules keeping movies and viewings
//                              in step
//   Functions  /functions/v1/tmdb   a small fake TMDB catalog (./tmdbCatalog.js),
//                              with where to watch a few of its titles
//   Realtime   the websocket   channels join as on the real server, and every
//                              write is pushed to its owner's open tabs as a
//                              postgres_changes event, like the real one
//
//   Web3Forms  api.web3forms.com/submit   access requests, recorded in
//                              `accessRequests` instead of emailed
//
// Anything else outside the app is answered locally too: supabase-js from
// node_modules instead of the CDN, an empty stylesheet for Google Fonts, a
// blank image for TMDB posters, a blank page for the YouTube player. Other
// hosts are refused and listed in `blocked`, so a test can check the app
// didn't reach out anywhere else.

const fs = require("fs");
const crypto = require("crypto");
const { TMDB_CATALOG, TMDB_WATCH_PROVIDERS, TMDB_WATCH_REGIONS, inLanguage } = require("./tmdbCatalog");

const SUPABASE_JS = fs.readFileSync(require.resolve("@supabase/supabase-js/dist/umd/supabase.js"), "utf8");
// Supabase's default cap on the rows one request returns.
const MAX_ROWS = 1000;

const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// Columns the database fills in when an insert leaves them out, the ones
// it refuses to leave empty (supabase/migrations/0003_library.sql), and
// one row per TMDB title per account (0004_hardening.sql).
const TABLES = {
  movies: { owner: "user_id", required: ["title"], uniqueTitle: true, defaults: () => ({}) },
  shows: { owner: "user_id", required: ["title"], uniqueTitle: true, defaults: () => ({ is_dropped: false }) },
  collections: { owner: "user_id", required: ["name", "icon"], defaults: () => ({}) },
  collection_items: { owner: null, required: ["collection_id", "item_type", "item_id"], defaults: () => ({}) },
  user_settings: { owner: "user_id", key: "user_id", required: [], defaults: () => ({ settings: {} }) },
  profiles: { owner: "user_id", key: "user_id", required: [], defaults: () => ({}) },
  viewings: { owner: "user_id", required: ["movie_id", "watched_on"], defaults: () => ({ note: null }) },
};

// Migration 0007's rules, as the database enforces them (a refusal is
// thrown as { status, code, message } and becomes the request's error).
const LAST_VIEWING = "A watched movie keeps at least one viewing: change its date instead.";
const KEEP_DATE = "A watched movie keeps its date: change it instead.";
const refuse = (message, code = "P0001", status = 400) => {
  throw { status, code, message };
};

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function createBackend() {
  const users = new Map(); // id → { id, email, password }
  const sessions = new Map(); // access token → user id
  const refreshTokens = new Map(); // refresh token → user id
  const db = Object.fromEntries(Object.keys(TABLES).map((name) => [name, []]));
  const log = []; // every write, as "INSERT movies 1", for assertions
  const emails = []; // reset emails "sent": { email, redirectTo }
  const blocked = []; // outside requests the app shouldn't have made
  const accessRequests = []; // "Request access" forms sent: what Web3Forms got
  const channels = []; // joined realtime channels: { ws, topic, joinRef, userId, bindings }
  // Set by a test to make writes fail: (method, table) → an error message,
  // or nothing to let the write through.
  // holdRealtime: queue the realtime pushes instead of sending them, until
  // the test calls releaseRealtime() — to decide exactly when echoes land.
  // hideCount: answer without the total row count (Content-Range), as a
  // misconfigured or older server might.
  const hooks = { failWhen: null, holdRealtime: false, hideCount: false };
  const heldPushes = [];

  function issueSession(userId) {
    const user = users.get(userId);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const accessToken = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: userId,
      email: user.email,
      role: "authenticated",
      exp,
      session_id: crypto.randomUUID(),
    })}.fake-signature`;
    const refreshToken = crypto.randomUUID();
    sessions.set(accessToken, userId);
    refreshTokens.set(refreshToken, userId);
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      refresh_token: refreshToken,
      user: publicUser(user),
    };
  }

  function publicUser(user) {
    return {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { ...user.metadata },
      identities: [],
      created_at: "2026-01-01T00:00:00Z",
    };
  }

  function userFromRequest(req) {
    const token = (req.headers()["authorization"] ?? "").replace(/^Bearer\s+/i, "");
    return sessions.get(token) ?? null;
  }

  /* ---------- auth ---------- */

  function handleAuth(route, req, url) {
    const path = url.pathname.replace(/^\/auth\/v1/, "");
    const body = req.postDataJSON?.() ?? null;
    const reply = (status, json) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json ?? {}) });

    if (path === "/token" && url.searchParams.get("grant_type") === "password") {
      const user = [...users.values()].find((u) => u.email === body.email && u.password === body.password);
      if (!user) return reply(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return reply(200, issueSession(user.id));
    }
    if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const userId = refreshTokens.get(body.refresh_token);
      if (!userId) return reply(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return reply(200, issueSession(userId));
    }
    if (path === "/signup") {
      // Slate is invite-only: "Allow new users to sign up" is off.
      return reply(422, { code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance" });
    }
    if (path === "/recover") {
      emails.push({ email: body.email, redirectTo: url.searchParams.get("redirect_to") });
      return reply(200, {});
    }
    if (path === "/logout") {
      const userId = userFromRequest(req);
      for (const [token, id] of sessions) if (id === userId) sessions.delete(token);
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/user") {
      const userId = userFromRequest(req);
      if (!userId) return reply(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const user = users.get(userId);
      if (req.method() === "PUT" && body?.password) {
        if (body.password === user.password) {
          return reply(422, { code: 422, error_code: "same_password", msg: "New password should be different from the old password." });
        }
        user.password = body.password;
        log.push("PASSWORD CHANGED");
      }
      if (req.method() === "PUT" && body?.data) user.metadata = { ...user.metadata, ...body.data };
      return reply(200, publicUser(user));
    }
    return reply(404, { msg: `fake auth: no ${req.method()} ${path}` });
  }

  /* ---------- realtime ---------- */

  function ownerOf(table, row) {
    const spec = TABLES[table];
    if (spec.owner) return row[spec.owner];
    return db.collections.find((c) => c.id === row.collection_id)?.user_id ?? null;
  }

  // What the realtime server does after a committed write: tell every
  // channel of the row's owner that listens to this table. A beat later,
  // as over a real network — and after the write's own response.
  function pushChange(table, type, row, before) {
    const owner = ownerOf(table, type === "DELETE" ? before : row);
    const data = {
      schema: "public",
      table,
      commit_timestamp: new Date().toISOString(),
      type,
      columns: [],
      record: type === "DELETE" ? {} : { ...row },
      old_record: type === "INSERT" ? {} : { id: (before ?? row).id },
      errors: null,
    };
    const deliver = () =>
      channels
        .filter((ch) => ch.userId && ch.userId === owner)
        .forEach((ch) => {
          const ids = ch.bindings
            .filter((b) => (b.table === table || b.table === "*") && (b.event === "*" || b.event === type))
            .map((b) => b.id);
          if (ids.length) ch.ws.send(JSON.stringify([ch.joinRef, null, ch.topic, "postgres_changes", { ids, data }]));
        });
    if (hooks.holdRealtime) heldPushes.push(deliver);
    else setTimeout(deliver, 20);
  }

  // Sends the first `count` held pushes (all by default), oldest first.
  function releaseRealtime(count = heldPushes.length) {
    heldPushes.splice(0, count).forEach((deliver) => deliver());
  }

  /* ---------- viewings (migration 0007) ---------- */

  const viewingsOfMovie = (movieId) => db.viewings.filter((v) => v.movie_id === movieId);

  // Rule 1: a movie's watched_date is its latest viewing.
  function syncWatchedDate(movieId) {
    const movie = db.movies.find((m) => m.id === movieId);
    if (!movie) return;
    const latest = viewingsOfMovie(movieId).map((v) => v.watched_on).sort().pop() ?? null;
    if (movie.watched_date === latest) return;
    movie.watched_date = latest;
    pushChange("movies", "UPDATE", movie, movie);
  }

  function checkViewing(row, userId) {
    const movie = db.movies.find((m) => m.id === row.movie_id);
    if (!movie || movie.user_id !== userId) refuse('new row violates row-level security policy for table "viewings"', "42501", 403);
    if (row.note != null && String(row.note).length > 200) refuse('new row for relation "viewings" violates check constraint "viewings_note_check"', "23514");
  }

  // Rule 3: a watched_date written straight onto a movie becomes its
  // viewing (created, or the latest one moved); clearing one is refused.
  function checkMovieDateChange(movie, changes) {
    if ("watched_date" in changes && changes.watched_date == null && movie.watched_date != null) refuse(KEEP_DATE);
  }

  function movieDateWritten(movie, before) {
    if (movie.watched_date == null || movie.watched_date === before) return;
    const latest = viewingsOfMovie(movie.id).sort((a, b) => (b.watched_on + b.created_at).localeCompare(a.watched_on + a.created_at))[0];
    if (latest) {
      latest.watched_on = movie.watched_date;
      pushChange("viewings", "UPDATE", latest, latest);
    } else {
      const viewing = { id: crypto.randomUUID(), created_at: new Date().toISOString(), user_id: movie.user_id, movie_id: movie.id, watched_on: movie.watched_date, note: null };
      db.viewings.push(viewing);
      pushChange("viewings", "INSERT", viewing);
    }
    syncWatchedDate(movie.id);
  }

  // Deleting a movie takes its viewings with it (on delete cascade).
  function dropViewingsOf(movieIds) {
    const gone = db.viewings.filter((v) => movieIds.includes(v.movie_id));
    db.viewings = db.viewings.filter((v) => !gone.includes(v));
    gone.forEach((v) => pushChange("viewings", "DELETE", null, v));
  }

  /* ---------- database (PostgREST) ---------- */

  function canSee(table, row, userId) {
    const spec = TABLES[table];
    if (!userId) return false;
    if (spec.owner) return row[spec.owner] === userId;
    // collection_items: through the collection they belong to
    const col = db.collections.find((c) => c.id === row.collection_id);
    return Boolean(col && col.user_id === userId);
  }

  function parseValue(raw) {
    if (raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw.replace(/^"(.*)"$/, "$1");
  }

  // Filters from the query string (eq, neq, in, is), as supabase-js writes them.
  function rowFilter(url) {
    const tests = [];
    for (const [column, expr] of url.searchParams) {
      if (["select", "order", "offset", "limit", "columns", "on_conflict"].includes(column)) continue;
      const dot = expr.indexOf(".");
      const op = expr.slice(0, dot);
      const arg = expr.slice(dot + 1);
      if (op === "eq") tests.push((row) => String(row[column]) === String(parseValue(arg)));
      else if (op === "neq") tests.push((row) => String(row[column]) !== String(parseValue(arg)));
      else if (op === "is") tests.push((row) => row[column] === parseValue(arg));
      else if (op === "in") {
        const values = arg.replace(/^\(|\)$/g, "").split(",").map(parseValue);
        tests.push((row) => values.includes(row[column]));
      } else throw new Error(`fake db: unsupported filter ${column}=${expr}`);
    }
    return (row) => tests.every((t) => t(row));
  }

  function sortRows(rows, order) {
    if (!order) return rows;
    const keys = order.split(",").map((part) => {
      const [column, dir] = part.split(".");
      return { column, desc: dir === "desc" };
    });
    return [...rows].sort((a, b) => {
      for (const { column, desc } of keys) {
        const x = a[column];
        const y = b[column];
        if (x === y) continue;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }

  function project(rows, select) {
    if (!select || select === "*") return rows;
    const cols = select.split(",");
    return rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c]])));
  }

  // delete_my_account() (migration 0005): the caller's account and,
  // by cascade, everything that's theirs.
  function deleteUser(userId) {
    users.delete(userId);
    for (const [token, id] of sessions) if (id === userId) sessions.delete(token);
    for (const [token, id] of refreshTokens) if (id === userId) refreshTokens.delete(token);
    for (const table of ["movies", "shows", "collections", "user_settings", "profiles", "viewings"]) {
      db[table] = db[table].filter((row) => row.user_id !== userId);
    }
    const colIds = new Set(db.collections.map((c) => c.id));
    db.collection_items = db.collection_items.filter((item) => colIds.has(item.collection_id));
    log.push("ACCOUNT DELETED");
  }

  // replace_my_library() (migration 0008): the caller's library swapped for
  // the one sent, as one transaction. Everything is checked before anything
  // changes; a refusal (thrown as { status, code, message }) leaves the
  // library exactly as it was.
  function replaceLibrary(userId, library) {
    const list = (key) => (Array.isArray(library?.[key]) ? library[key] : []);
    const mine = (table) => db[table].filter((row) => canSee(table, row, userId));
    const taken = (table, id) => db[table].some((row) => row.id === id && !canSee(table, row, userId));

    const rows = {};
    for (const table of ["movies", "shows", "collections"]) {
      const spec = TABLES[table];
      rows[table] = list(table).map((input) => ({
        created_at: new Date().toISOString(),
        ...spec.defaults(),
        ...Object.fromEntries(Object.entries(input).filter(([, v]) => v != null)),
        user_id: userId,
      }));
      rows[table].forEach((row) => {
        const missing = spec.required.find((col) => row[col] == null);
        if (missing) refuse(`null value in column "${missing}" of relation "${table}" violates not-null constraint`, "23502");
        if (taken(table, row.id)) refuse(`duplicate key value violates unique constraint "${table}_pkey"`, "23505", 409);
      });
      if (spec.uniqueTitle) {
        const ids = rows[table].map((row) => row.tmdb_id).filter((id) => id != null);
        if (new Set(ids).size !== ids.length) refuse(`duplicate key value violates unique constraint "${table}_user_tmdb_unique"`, "23505", 409);
      }
    }
    const movieIds = new Set(rows.movies.map((row) => row.id));
    const collectionIds = new Set(rows.collections.map((row) => row.id));
    const viewings = list("viewings").map((v) => {
      if (!movieIds.has(v.movie_id)) refuse('new row violates row-level security policy for table "viewings"', "42501", 403);
      if (!v.watched_on) refuse('null value in column "watched_on" of relation "viewings" violates not-null constraint', "23502");
      return { id: crypto.randomUUID(), user_id: userId, note: null, movie_id: v.movie_id, watched_on: v.watched_on, created_at: v.created_at ?? new Date().toISOString() };
    });
    const items = list("items").map((item) => {
      if (!collectionIds.has(item.collection_id)) refuse('new row violates row-level security policy for table "collection_items"', "42501", 403);
      return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null)) };
    });

    const kept = { movies: new Set(rows.movies.map((r) => r.tmdb_id)), shows: new Set(rows.shows.map((r) => r.tmdb_id)) };
    const removed = ["movies", "shows"].reduce((n, table) => n + mine(table).filter((row) => !kept[table].has(row.tmdb_id)).length, 0);

    // Out with the old (items, viewings by cascade)…
    for (const table of ["collection_items", "viewings", "collections", "movies", "shows"]) {
      const gone = mine(table);
      db[table] = db[table].filter((row) => !gone.includes(row));
      gone.forEach((row) => pushChange(table, "DELETE", null, row));
    }
    // …and in with the file's. Movies go in undated; their viewings date them.
    for (const [table, list] of [["movies", rows.movies], ["shows", rows.shows], ["viewings", viewings], ["collections", rows.collections], ["collection_items", items]]) {
      list.forEach((row) => {
        if (table === "movies") row.watched_date = null;
        db[table].push(row);
        pushChange(table, "INSERT", row);
      });
    }
    new Set(viewings.map((v) => v.movie_id)).forEach(syncWatchedDate);
    log.push("RPC replace_my_library");
    return { removed };
  }

  function handleRest(route, req, url) {
    if (url.pathname === "/rest/v1/rpc/replace_my_library") {
      const userId = userFromRequest(req);
      const fail = (status, code, message) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code, message, details: null, hint: null }) });
      if (!userId) return fail(401, "42501", "permission denied for function replace_my_library");
      // "network": the connection drops before the call gets there;
      // "network after": it goes through, but the answer never comes back.
      const injected = hooks.failWhen?.(req.method(), "rpc/replace_my_library");
      if (injected === "network") return route.abort("failed");
      if (injected && injected !== "network after") {
        log.push("RPC replace_my_library FAILED");
        return fail(500, "XX000", injected);
      }
      let result;
      try {
        result = replaceLibrary(userId, req.postDataJSON()?.library);
      } catch (e) {
        if (!e.code) throw e;
        return fail(e.status, e.code, e.message);
      }
      if (injected === "network after") return route.abort("failed");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
    }
    if (url.pathname === "/rest/v1/rpc/delete_my_account") {
      const userId = userFromRequest(req);
      if (!userId) {
        return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "permission denied for function delete_my_account" }) });
      }
      const injected = hooks.failWhen?.(req.method(), "rpc/delete_my_account");
      if (injected) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "XX000", message: injected }) });
      deleteUser(userId);
      return route.fulfill({ status: 204, body: "" });
    }
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const spec = TABLES[table];
    const headers = req.headers();
    const prefer = headers["prefer"] ?? "";
    const wantsObject = (headers["accept"] ?? "").includes("vnd.pgrst.object");
    const userId = userFromRequest(req);
    const method = req.method();
    const fail = (status, code, message) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code, message, details: null, hint: null }) });
    if (!spec) return fail(404, "42P01", `relation "public.${table}" does not exist`);

    const answer = (rows, status = 200, total) => {
      const shaped = project(rows, url.searchParams.get("select"));
      // As the real API sends them: the page's own origin is another, so
      // the browser only lets the app read Content-Range if it's exposed.
      const extra = { "access-control-allow-origin": "*", "access-control-expose-headers": "Content-Range" };
      if (prefer.includes("count=exact") && !hooks.hideCount) {
        const offset = Number(url.searchParams.get("offset") ?? 0);
        extra["content-range"] = `${offset}-${offset + Math.max(shaped.length - 1, 0)}/${total ?? shaped.length}`;
      }
      if (wantsObject) {
        if (shaped.length !== 1) {
          return route.fulfill({
            status: 406,
            contentType: "application/json",
            body: JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${shaped.length} rows`, hint: null }),
          });
        }
        return route.fulfill({ status, contentType: "application/json", headers: extra, body: JSON.stringify(shaped[0]) });
      }
      const representation = method === "GET" || method === "HEAD" || prefer.includes("return=representation");
      return route.fulfill({
        status,
        contentType: "application/json",
        headers: extra,
        body: method === "HEAD" ? "" : representation ? JSON.stringify(shaped) : "",
      });
    };

    if (method === "GET" || method === "HEAD") {
      const all = sortRows(db[table].filter((row) => canSee(table, row, userId)).filter(rowFilter(url)), url.searchParams.get("order"));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      // Like the real API (Settings → API → Max rows): never more than
      // MAX_ROWS in one answer, asked for or not — and no error about it.
      const limit = Math.min(url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : Infinity, MAX_ROWS);
      return answer(all.slice(offset, offset + limit), 200, all.length);
    }

    if (!userId) return fail(401, "42501", "permission denied");
    const injected = hooks.failWhen?.(method, table);
    if (injected) {
      log.push(`${method} ${table} FAILED`);
      return fail(500, "XX000", injected);
    }

    if (method === "POST") {
      const list = [].concat(req.postDataJSON());
      const upsert = prefer.includes("resolution=merge-duplicates");
      const keyCol = url.searchParams.get("on_conflict") ?? spec.key ?? "id";
      const written = [];
      for (const input of list) {
        const existing = upsert && input[keyCol] != null ? db[table].find((r) => r[keyCol] === input[keyCol]) : null;
        if (existing) {
          if (!canSee(table, existing, userId)) return fail(403, "42501", `new row violates row-level security policy for table "${table}"`);
          // An upsert that finds its row is an update: 0007's rules apply.
          try {
            if (table === "movies") checkMovieDateChange(existing, input);
            if (table === "viewings") checkViewing({ ...existing, ...input }, userId);
          } catch (e) {
            return fail(e.status, e.code, e.message);
          }
          const before = { ...existing };
          Object.assign(existing, input);
          written.push(existing);
          pushChange(table, "UPDATE", existing, existing);
          if (table === "viewings") {
            syncWatchedDate(existing.movie_id);
            if (before.movie_id !== existing.movie_id) syncWatchedDate(before.movie_id);
          }
          if (table === "movies" && "watched_date" in input) movieDateWritten(existing, before.watched_date);
          continue;
        }
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...(spec.owner ? { [spec.owner]: userId } : {}),
          ...spec.defaults(),
          ...input,
        };
        // One title per account (migration 0004's unique indexes).
        if (spec.uniqueTitle && row.tmdb_id != null && db[table].some((r) => r.user_id === row.user_id && r.tmdb_id === row.tmdb_id)) {
          return fail(409, "23505", `duplicate key value violates unique constraint "${table}_user_tmdb_unique"`);
        }
        const missing = spec.required.find((col) => row[col] == null);
        if (missing) return fail(400, "23502", `null value in column "${missing}" of relation "${table}" violates not-null constraint`);
        if (!canSee(table, row, userId)) return fail(403, "42501", `new row violates row-level security policy for table "${table}"`);
        try {
          if (table === "viewings") checkViewing(row, userId);
        } catch (e) {
          return fail(e.status, e.code, e.message);
        }
        db[table].push(row);
        written.push(row);
        pushChange(table, "INSERT", row);
        if (table === "viewings") syncWatchedDate(row.movie_id);
        if (table === "movies") movieDateWritten(row, null);
      }
      log.push(`${upsert ? "UPSERT" : "INSERT"} ${table} ${written.length}`);
      return answer(written, 201);
    }

    if (method === "PATCH") {
      const changes = req.postDataJSON();
      const rows = db[table].filter((row) => canSee(table, row, userId)).filter(rowFilter(url));
      // All or nothing, as one statement: every row checked first.
      try {
        rows.forEach((row) => {
          if (table === "movies") checkMovieDateChange(row, changes);
          if (table === "viewings") checkViewing({ ...row, ...changes }, userId);
        });
      } catch (e) {
        return fail(e.status, e.code, e.message);
      }
      rows.forEach((row) => {
        const before = { ...row };
        Object.assign(row, changes);
        pushChange(table, "UPDATE", row, row);
        if (table === "viewings") {
          syncWatchedDate(row.movie_id);
          if (before.movie_id !== row.movie_id) syncWatchedDate(before.movie_id);
        }
        if (table === "movies" && "watched_date" in changes) movieDateWritten(row, before.watched_date);
      });
      log.push(`UPDATE ${table} ${rows.length}`);
      return answer(rows);
    }

    if (method === "DELETE") {
      const match = rowFilter(url);
      const gone = db[table].filter((row) => canSee(table, row, userId) && match(row));
      // Rule 2: never a watched movie's last viewing.
      if (table === "viewings") {
        const leftFor = (movieId) => viewingsOfMovie(movieId).filter((v) => !gone.includes(v)).length;
        if (gone.some((v) => leftFor(v.movie_id) === 0)) return fail(400, "P0001", LAST_VIEWING);
      }
      db[table] = db[table].filter((row) => !gone.includes(row));
      gone.forEach((row) => pushChange(table, "DELETE", null, row));
      if (table === "movies") dropViewingsOf(gone.map((m) => m.id));
      if (table === "viewings") new Set(gone.map((v) => v.movie_id)).forEach(syncWatchedDate);
      log.push(`DELETE ${table} ${gone.length}`);
      return answer(gone);
    }

    return fail(405, "PGRST", `fake db: ${method} not supported`);
  }

  /* ---------- the tmdb Edge Function ---------- */

  function handleFunction(route, req, url) {
    const reply = (status, json) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, body: "" });
    if (url.pathname !== "/functions/v1/tmdb") return reply(404, { error: "no such function" });
    if (!userFromRequest(req)) return reply(401, { error: "Sign in to use TMDB." });
    const { path, query, language } = req.postDataJSON() ?? {};
    let m;
    if ((m = /^search\/(movie|tv)$/.exec(path))) {
      // Like TMDB: found by any of its names, answered in the language asked.
      const q = String(query ?? "").toLowerCase();
      const results = TMDB_CATALOG[m[1]]
        .filter((t) => [t, inLanguage(m[1], t, "es-MX")].some((v) => (v.title ?? v.name).toLowerCase().includes(q)))
        .map((t) => inLanguage(m[1], t, language));
      return reply(200, { page: 1, results, total_results: results.length });
    }
    if (path === "watch/providers/regions") return reply(200, { results: TMDB_WATCH_REGIONS });
    if ((m = /^(movie|tv)\/(\d+)\/watch\/providers$/.exec(path))) {
      return reply(200, { id: Number(m[2]), results: TMDB_WATCH_PROVIDERS[`${m[1]}/${m[2]}`] ?? {} });
    }
    if ((m = /^(movie|tv)\/(\d+)(\/videos)?$/.exec(path))) {
      const title = TMDB_CATALOG[m[1]].find((t) => t.id === Number(m[2]));
      if (!title) return reply(404, { success: false, status_code: 34, status_message: "The resource you requested could not be found." });
      return reply(200, m[3] ? { id: title.id, results: title.videos ?? [] } : inLanguage(m[1], title, language));
    }
    return reply(400, { error: "Not a TMDB request Slate makes." });
  }

  /* ---------- Web3Forms (Request access) ---------- */

  function handleWeb3Forms(route, req, url) {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, accept" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });
    const reply = (status, json) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(json) });
    if (req.method() !== "POST" || url.pathname !== "/submit") return reply(404, { success: false, message: "Not found" });
    const injected = hooks.failWhen?.("POST", "web3forms");
    if (injected) return reply(injected.status ?? 500, { success: false, message: injected.message ?? "Injected failure" });
    const body = req.postDataJSON() ?? {};
    if (!body.access_key) return reply(400, { success: false, message: "Access key missing" });
    accessRequests.push(body);
    return reply(200, { success: true, message: "Email sent successfully!" });
  }

  /* ---------- installing it into a page ---------- */

  async function install(page) {
    await page.route(
      (url) => url.hostname !== "127.0.0.1" && url.hostname !== "localhost",
      (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.pathname.startsWith("/auth/v1/")) return handleAuth(route, req, url);
        if (url.pathname.startsWith("/rest/v1/")) return handleRest(route, req, url);
        if (url.pathname.startsWith("/functions/v1/")) return handleFunction(route, req, url);
        if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("supabase-js")) {
          // With CORS, as the CDN answers: index.html loads it with an
          // integrity hash (crossorigin), so the bytes must match too.
          return route.fulfill({ contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: SUPABASE_JS });
        }
        if (url.hostname === "fonts.googleapis.com") return route.fulfill({ contentType: "text/css", body: "" });
        if (url.hostname === "image.tmdb.org") return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
        if (url.hostname === "api.web3forms.com") return handleWeb3Forms(route, req, url);
        if (url.hostname === "www.youtube-nocookie.com") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Trailer</title>" });
        blocked.push(req.url());
        return route.abort();
      }
    );
    // Realtime (Phoenix protocol 2.0.0: [join_ref, ref, topic, event,
    // payload]): joins get their postgres_changes bindings back with ids,
    // as from the real server; heartbeats and token updates are acked.
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
      ws.onMessage((raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (!Array.isArray(msg)) return;
        const [joinRef, ref, topic, event, payload] = msg;
        const tokenUser = (token) => sessions.get(token) ?? null;
        let response = {};
        if (event === "phx_join") {
          const bindings = (payload?.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: i + 1 }));
          channels.push({ ws, topic, joinRef, userId: tokenUser(payload?.access_token), bindings });
          response = { postgres_changes: bindings };
        } else if (event === "access_token") {
          channels.filter((ch) => ch.ws === ws && ch.topic === topic).forEach((ch) => (ch.userId = tokenUser(payload?.access_token)));
        } else if (event === "phx_leave") {
          channels.splice(0, channels.length, ...channels.filter((ch) => !(ch.ws === ws && ch.topic === topic)));
        } else if (event !== "heartbeat") {
          return;
        }
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      });
      ws.onClose(() => {
        channels.splice(0, channels.length, ...channels.filter((ch) => ch.ws !== ws));
      });
    });
  }

  /* ---------- test setup helpers ---------- */

  // An account as it is once its owner has chosen a password. `temporary`:
  // as just made by hand in Supabase (Add user), still on the password it
  // was given — Slate asks for a new one first (migration 0006).
  function addUser(email, password, { temporary = false } = {}) {
    const metadata = temporary ? {} : { password_chosen: true };
    const user = { id: crypto.randomUUID(), email, password, metadata };
    users.set(user.id, user);
    return user;
  }

  // Puts rows straight into a table (no request, no log entry).
  function seed(table, rows, userId) {
    const spec = TABLES[table];
    const made = rows.map((row) => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...(spec.owner ? { [spec.owner]: userId } : {}),
      ...spec.defaults(),
      ...row,
    }));
    db[table].push(...made);
    // As migration 0007 left the database: every watched movie has a viewing.
    if (table === "movies") {
      made
        .filter((m) => m.watched_date != null && !viewingsOfMovie(m.id).length)
        .forEach((m) => db.viewings.push({ id: crypto.randomUUID(), created_at: m.created_at, user_id: m.user_id, movie_id: m.id, watched_on: m.watched_date, note: null }));
    }
    if (table === "viewings") {
      new Set(made.map((v) => v.movie_id)).forEach((movieId) => {
        const movie = db.movies.find((m) => m.id === movieId);
        if (movie) movie.watched_date = viewingsOfMovie(movieId).map((v) => v.watched_on).sort().pop() ?? null;
      });
    }
    return made;
  }

  // The address a reset email would link to: this page, with a fresh
  // session for the user in the fragment, as Supabase sends it.
  function recoveryLink(email, base = "/") {
    const user = [...users.values()].find((u) => u.email === email);
    const s = issueSession(user.id);
    return `${base}#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=${s.expires_in}&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`;
  }

  // A deep copy of every table, to compare against later.
  function snapshot() {
    return JSON.parse(JSON.stringify(db));
  }

  return { install, addUser, seed, recoveryLink, snapshot, hooks, releaseRealtime, heldPushes, db, users, log, emails, blocked, accessRequests };
}

module.exports = { createBackend };
