# Slate

[![Tests](https://github.com/NicHenderson/slate2.1/actions/workflows/tests.yml/badge.svg)](https://github.com/NicHenderson/slate2.1/actions/workflows/tests.yml)

A corkboard for every movie and show you watch: what you've seen, what
you're halfway through, what you dropped and what you can't wait to start —
rated, reviewed, dated, and grouped into collections. Titles come from
[TMDB](https://www.themoviedb.org); accounts and data live on
[Supabase](https://supabase.com).

Plain HTML, CSS and JavaScript: no framework, no build step, nothing to
install to run the app.

## Running it

From this folder:

```sh
python3 -m http.server 8080
```

then open <http://127.0.0.1:8080>. After pulling changes, hard-refresh
(Ctrl+Shift+R) so the browser drops its cached copies.

## How it's organised

| Where | What |
| --- | --- |
| `index.html` | Every screen: the landing page, the login card, the app and its modals |
| `js/` | One file per part of the app, loaded in order by `index.html` (they share one global scope) |
| `js/config.js` | Which Supabase project the app talks to — public values only |
| `css/` | Styles, one file per area; themes are custom properties in `base.css` |
| `img/` | The logo and the OpenMoji emoji used for collection icons |
| `supabase/` | The database structure (`migrations/`) and server-side code (`functions/`) — see [`supabase/README.md`](supabase/README.md) |
| `tests/` | The automated tests (below) |
| `.github/workflows/tests.yml` | Runs every test on GitHub on each push |

## Tests

Every push runs the whole suite on GitHub (the badge above; details in the
repo's **Actions** tab). To run it on your own computer you need
[Node.js](https://nodejs.org) 22 or newer, then, once:

```sh
npm install
npx playwright install chromium
```

and each time:

```sh
npm test
```

`npm test` opens Slate in a headless Chromium and uses it like a person
would: logging in, adding titles, dragging cards, importing files. It runs
against a **fake Supabase** (`tests/support/fakeSupabase.js`): accounts,
tables, the TMDB function and realtime all simulated in memory. No real
account, database or network is ever touched, so the tests can't change
your data and don't break when your password does.

| File | Covers |
| --- | --- |
| `smoke.spec.js` | Landing page, logging in and out, adding a title from TMDB |
| `auth.spec.js` | Registering, forgot password, the reset link, expired links |
| `library.spec.js` | Marking titles watched, deleting safely, reviews shown as text |
| `customOrder.spec.js` | Drag and drop in Custom order, and the drag bugs it once had |
| `collections.spec.js` | Creating collections and filling them |
| `yourData.spec.js` | Export, and import in both Add and Replace modes |

The TMDB Edge Function has its own tests (Deno):
`npm run test:functions` — see [its README](supabase/functions/tmdb/README.md).

### Writing a new test

Tests live in `tests/*.spec.js`. Each one starts with a fresh fake backend
holding one user (`tester@slate.test`) and a small library — see
`tests/support/fixtures.js`:

```js
const { test, expect, logIn } = require("./support/fixtures");

test("what it checks, as a sentence", async ({ page, backend }) => {
  await logIn(page);
  // …use the page as a person would…
  await expect(page.locator("#some-element")).toHaveText("…");
  // …and check what reached the database:
  expect(backend.db.movies).toHaveLength(3);
});
```

`backend` can also add rows (`backend.seed`), make writes fail
(`backend.hooks.failWhen`), hold realtime echoes (`backend.hooks.holdRealtime`)
and more — each is described where it's defined, in `fakeSupabase.js`.

A test fails on its own if the page throws an uncaught error or tries to
reach any site outside the app.

## House rules

- **Every bug fixed gets a test** that fails on the broken code and passes
  on the fix, so it can't quietly come back.
- **Change a CSS or JS file → bump its `?v=N`** in `index.html`, or browsers
  keep serving the old copy.
- **Database changes go in as a migration:** the next numbered file in
  `supabase/migrations/`, run in the Supabase SQL Editor and committed with
  the code that needs it. Never only in the dashboard.
- **No secrets in `js/`.** Everything there reaches the browser, where
  anyone can read it. A secret belongs on the server, like the TMDB key in
  the `tmdb` Edge Function.
- **Anything shown on the page goes through `escapeHtml`** — titles,
  reviews, names — including what comes from an imported file.

## Credits

Movie and show data and images from [TMDB](https://www.themoviedb.org).
This product uses the TMDB API but is not endorsed or certified by TMDB.
Emoji by [OpenMoji](https://openmoji.org) (CC BY-SA 4.0) and icons by
[Phosphor](https://phosphoricons.com) (MIT) — see `THIRD-PARTY-NOTICES.txt`.
