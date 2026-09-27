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
| `scripts/` | `stamp.js` keeps the cache stamps (`?v=…`) in `index.html` in step with the files; `install-hooks.js` switches on the git hook in `.githooks/` that runs it on each commit; `supabase-js.js` updates the pinned Supabase library (below) |
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
| `auth.spec.js` | Requesting access, forgot password, the reset link, expired links |
| `library.spec.js` | Marking titles watched, deleting safely, reviews shown as text |
| `customOrder.spec.js` | Drag and drop in Custom order, and the drag bugs it once had |
| `viewings.spec.js` | Rewatches: adding, changing and deleting a movie's viewings, a watched movie never losing its date, and every viewing counting in the stats and the "Watched in" filter |
| `whereToWatch.spec.js` | Where to watch titles not watched yet, by country |
| `librarySearch.spec.js` | Searching and filtering Movies, Shows and the two watchlists, and Custom order pausing meanwhile |
| `shows.spec.js` | A show from the queue to watching to finished |
| `collections.spec.js` | Creating collections and filling them |
| `yourData.spec.js` | Export, and import in both Add and Replace modes, viewings included (and version 1 files) |
| `i18n.spec.js` | Every language has every string, and nothing on screen escapes translation |
| `settings.spec.js` | Settings kept by the account, and saving the profile |
| `account.spec.js` | Deleting an account: the locks, a wrong password, a server failure, and the account gone |
| `mobile.spec.js` | Slate on a phone: nothing scrolls sideways, and the menu and adding a title work by tapping |
| `bigLibrary.spec.js` | Libraries past 1,000 rows load whole |
| `welcomeEmail.spec.js` | The welcome-email tool (`tools/welcome-email.html`) |
| `stamps.spec.js` | Every CSS/JS link in `index.html` has its file's current stamp |

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
- **CSS and JS files are cache-stamped.** Each is linked from `index.html`
  as `file?v=<stamp>`, a fingerprint of its contents (`scripts/stamp.js`),
  so browsers fetch it again exactly when it changed. After `npm install`
  a git hook restamps on every commit by itself; without it, run
  `npm run stamp`. Either way, a stale stamp fails the tests on GitHub,
  naming the file.
- **Database changes go in as a migration:** the next numbered file in
  `supabase/migrations/`, run in the Supabase SQL Editor and committed with
  the code that needs it. Never only in the dashboard.
- **No secrets in `js/`.** Everything there reaches the browser, where
  anyone can read it. A secret belongs on the server, like the TMDB key in
  the `tmdb` Edge Function.
- **Anything shown on the page goes through `escapeHtml`** — titles,
  reviews, names — including what comes from an imported file.
- **The Supabase library is pinned.** `index.html` loads one exact version
  of `supabase-js` from the CDN, the same one `package.json` lists and the
  tests use, with an integrity hash: the browser refuses any other file.
  It only changes when someone updates it (next section).

## Actualizar la librería de Supabase (supabase-js)

*Escrito en español a propósito, para el dueño de Slate.*

Slate usa siempre la misma versión de la librería de Supabase, así que
nunca cambia sola ni se rompe por una actualización ajena. **No hace
falta actualizarla de forma periódica.** Solo hay dos motivos para
hacerlo:

- **GitHub te avisa de una falla de seguridad.** Con las *Dependabot
  alerts* activadas (Settings → Advanced Security → Dependabot alerts →
  Enable), GitHub revisa
  `package.json` y te manda un correo si la versión que usa Slate tiene
  un problema conocido. El correo dice a qué versión subir.
- **Supabase anuncia que dejará de aceptar versiones tan antiguas.**

Para actualizar, en la carpeta de Slate (con Node.js instalado):

1. Instala esa versión y apunta Slate a ella; en vez de `2.118.0`, pon la
   versión que corresponda:
   ```sh
   npm run update-supabase -- 2.118.0
   ```
2. Comprueba que todo sigue funcionando:
   ```sh
   npm test
   ```
3. Si todo pasa, guarda y sube el cambio:
   ```sh
   git add -A
   git commit -m "Update supabase-js to 2.118.0"
   git push
   ```

Si alguna prueba falla, no subas nada: la versión nueva cambió algo que
Slate usa. Deshaz los cambios con `git checkout -- .` y quédate con la
versión actual, que sigue funcionando igual que siempre.

## Credits

Movie and show data and images from [TMDB](https://www.themoviedb.org).
This product uses the TMDB API but is not endorsed or certified by TMDB.
Emoji by [OpenMoji](https://openmoji.org) (CC BY-SA 4.0) and icons by
[Phosphor](https://phosphoricons.com) (MIT) — see `THIRD-PARTY-NOTICES.txt`.
