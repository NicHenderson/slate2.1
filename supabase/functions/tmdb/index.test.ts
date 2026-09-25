// Tests for the "tmdb" function's handler, with fake sign-in and a fake TMDB.
// Run from the repo root:
//   TMDB_PROXY_TEST=1 deno test --allow-env supabase/functions/tmdb/

import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle } from "./index.ts";

const KEY = "test-tmdb-key";

function setup(overrides: Partial<Deps> = {}) {
  const calls: string[] = [];
  const signIns: Array<[string, string | null]> = [];
  const deps: Deps = {
    tmdbKey: KEY,
    isSignedIn: (token, apiKey) => {
      signIns.push([token, apiKey]);
      return Promise.resolve(token === "good-token");
    },
    fetch: (input) => {
      calls.push(String(input));
      return Promise.resolve(new Response(JSON.stringify({ from: "tmdb" }), { status: 200 }));
    },
    ...overrides,
  };
  return { deps, calls, signIns };
}

function post(body: unknown, token = "good-token", extra: Record<string, string> = {}) {
  return new Request("http://localhost/tmdb", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("answers the CORS preflight", async () => {
  const res = await handle(new Request("http://localhost/tmdb", { method: "OPTIONS" }), setup().deps);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(res.headers.get("Access-Control-Allow-Headers")?.includes("apikey"), true);
});

Deno.test("only POST", async () => {
  const res = await handle(new Request("http://localhost/tmdb"), setup().deps);
  assertEquals(res.status, 405);
});

Deno.test("refuses anyone not signed in, before touching TMDB", async () => {
  const { deps, calls } = setup();
  const noToken = new Request("http://localhost/tmdb", { method: "POST", body: "{}" });
  assertEquals((await handle(noToken, deps)).status, 401);
  assertEquals((await handle(post({ path: "movie/1" }, "stolen-anon-key"), deps)).status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("passes the caller's project key along to the sign-in check", async () => {
  const { deps, signIns } = setup();
  await handle(post({ path: "movie/1" }, "good-token", { apikey: "sb_publishable_x" }), deps);
  assertEquals(signIns[0], ["good-token", "sb_publishable_x"]);
});

Deno.test("says so when the key secret is missing", async () => {
  const res = await handle(post({ path: "movie/1" }), setup({ tmdbKey: undefined }).deps);
  assertEquals(res.status, 500);
});

Deno.test("rejects a body that isn't JSON", async () => {
  assertEquals((await handle(post("not json"), setup().deps)).status, 400);
});

Deno.test("only the requests Slate makes", async () => {
  const { deps, calls } = setup();
  for (const path of [
    "account",
    "search/person",
    "movie/abc",
    "movie/1/credits",
    "movie/1/../../account",
    "movie/1?api_key=other",
    "/movie/1",
    "",
    42,
  ]) {
    assertEquals((await handle(post({ path }), deps)).status, 400, `path ${path}`);
  }
  assertEquals(calls.length, 0);
});

Deno.test("a search needs a sensible query", async () => {
  const { deps } = setup();
  assertEquals((await handle(post({ path: "search/movie" }), deps)).status, 400);
  assertEquals((await handle(post({ path: "search/movie", query: "   " }), deps)).status, 400);
  assertEquals((await handle(post({ path: "search/movie", query: "x".repeat(201) }), deps)).status, 400);
});

Deno.test("search: asks TMDB with the key, in English, query encoded", async () => {
  const { deps, calls } = setup();
  const res = await handle(post({ path: "search/tv", query: " Twin Peaks & co " }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { from: "tmdb" });
  const url = new URL(calls[0]);
  assertEquals(url.origin + url.pathname, "https://api.themoviedb.org/3/search/tv");
  assertEquals(url.searchParams.get("api_key"), KEY);
  assertEquals(url.searchParams.get("language"), "en-US");
  assertEquals(url.searchParams.get("query"), "Twin Peaks & co");
});

Deno.test("details and videos, without a query", async () => {
  const { deps, calls } = setup();
  assertEquals((await handle(post({ path: "movie/348", query: "ignored" }), deps)).status, 200);
  assertEquals((await handle(post({ path: "tv/1399/videos" }), deps)).status, 200);
  assertEquals(new URL(calls[0]).pathname, "/3/movie/348");
  assertEquals(new URL(calls[0]).searchParams.has("query"), false);
  assertEquals(new URL(calls[1]).pathname, "/3/tv/1399/videos");
});

Deno.test("TMDB's own errors come back as they are", async () => {
  const { deps } = setup({
    fetch: () => Promise.resolve(new Response('{"status_message":"not found"}', { status: 404 })),
  });
  const res = await handle(post({ path: "movie/999999999" }), deps);
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { status_message: "not found" });
});

Deno.test("TMDB unreachable → 502", async () => {
  const { deps } = setup({ fetch: () => Promise.reject(new TypeError("network down")) });
  assertEquals((await handle(post({ path: "movie/1" }), deps)).status, 502);
});
