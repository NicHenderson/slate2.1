# `tmdb` — Edge Function

Slate's proxy to TMDB, so the TMDB API key stays on the server
(see the top of `index.ts` for what it accepts and why).

## Deploying from the Supabase dashboard

1. **Edge Functions → Deploy a new function → Via Editor.**
   Name it exactly `tmdb`, replace the sample code with the contents of
   `index.ts`, and deploy.
2. **Turn JWT verification off** for it (the function's settings:
   "Verify JWT" / "Enforce JWT verification"). The function checks the
   caller's session itself, in a way that works with the new
   `sb_publishable_…` keys too.
3. **Edge Functions → Secrets → add `TMDB_API_KEY`** with the TMDB key as
   its value. (`SUPABASE_URL` is provided by Supabase already.)

Updating it later: open the function in the editor, paste the new
`index.ts`, deploy again.

## Tests

From this folder (its `deno.json` maps the test's imports):

```sh
TMDB_PROXY_TEST=1 deno test --allow-env
```

or `npm run test:functions` from the repo root.
