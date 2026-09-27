# Slate — notes for Claude

Slate is a private movie and show tracker: a corkboard for what you've
watched, are watching, dropped or want to watch, with ratings, reviews and
collections. It's plain HTML/CSS/JS on Supabase (auth, Postgres, realtime,
one Edge Function) with TMDB for titles. `README.md` and
`supabase/README.md` cover how it's built; this file covers how to work on
it with its owner.

## Keep this file up to date

This file is only as good as it is current. **When something important
changes, update it in the same commit**, for example:

- a migration is applied to the live project;
- a Supabase or service setting changes;
- the owner makes a decision;
- something is published;
- a pending item is done, or a new one appears.

Keep it short. It's a map of what the code can't tell you (how the owner
works, what was done outside the repo, decisions and their reasons,
what's pending), not a description of the code, which Claude can read
directly.

## Working with the owner

- **Talk to them in Spanish. Everything in the repo is written in
  English**: the app's text, emails, code, comments, commit messages and
  docs. Other languages are translations of the English text (see
  Languages below).
- They aren't a professional developer. Explain in plain terms, with
  reasons, and skip jargon unless you explain it.
- **When they ask you to explain before doing anything, only explain, then
  wait for their go-ahead.** For anything bigger than a small fix, propose
  a plan in stages first and build one stage at a time.
- After each stage, say exactly what to check by hand and give them the
  commands (they forget them):
  ```
  git checkout <branch>
  git pull origin <branch>
  python3 -m http.server 8080
  ```
  Then Ctrl+Shift+R in the browser. Also remind them to reload every Slate
  tab that was open before the pull: an old tab keeps running the old code
  (this caused a false alarm once).
- **Never merge into `main` until they say so** (usually "súbelo a main").
  Then: open a PR, check that CI is green on the exact head commit, merge
  with a merge commit (`expectedHeadSha`), bring the working branch up to
  `origin/main`, and give them `git checkout main && git pull origin main`.
- Be honest when you're unsure, and check facts rather than recalling
  them. Service limits and pricing (Supabase, Web3Forms, Cloudflare) change,
  so look them up and cite them. Their own tests beat any announcement.
- When a bug turns up while working on something else, tell them before
  fixing it.

## Code conventions

- **No build step, no framework.** The `js/` files are classic scripts
  loaded in order by `index.html` and share one global scope.
- **Cache stamps.** Every CSS/JS link in `index.html` carries `?v=<hash>` of
  the file. After changing any CSS/JS, run `npm run stamp`. A pre-commit
  hook (`.githooks/`, installed by `npm install`) runs it too, and
  `tests/stamps.spec.js` and CI check it.
- **Keep each file's line endings.** `css/content.css` and `js/iconData.js`
  use CRLF, and so does `css/modal.css` (as of its last commit). Rewriting
  one of them with LF turns a small change into thousands of changed lines.
  Prefer the Edit tool; if you script an edit, read and write the file in
  binary or with `newline=""`.
- **Comments explain why**, in the same style as the code around them.
- **Anything user-provided goes through `escapeHtml`.**
- **Languages** (`js/i18n.js`). Every string the app shows goes through
  translation, so none can be written as bare English:
  - in scripts, `t("English text", { name })` and
    `tn(count, "{n} movie", "{n} movies")`, always with the string written
    out (the tests collect them from the source). A whole sentence per
    string, never one glued from pieces: word order and genders change.
    Values go in as given, so user text still needs `escapeHtml` when the
    result lands in HTML;
  - in `index.html`, text and placeholder/aria-label/title/alt are
    translated automatically at load; `data-i18n` translates an element
    whole (a sentence with markup inside), `translate="no"` skips one;
  - dictionaries (`js/lang/<code>.js`, loaded before `i18n.js`) map each
    English string to its translation; the language is the one picked on
    the device, else the browser's, else English, and changing it reloads.
    Dates use `LOCALE`.
  - `tests/i18n.spec.js` fails if a language lacks a string or has one
    nothing uses, if placeholders or markup differ, or if the main screens
    show text that doesn't go through translation.
  - Stays in English on purpose: the owner's emails (Web3Forms request,
    the welcome-email tool), Supabase's own emails and error texts (like
    weak passwords), emoji and icon names in the icon picker, and the
    "Untitled" saved as a title when TMDB has none.
- **supabase-js is pinned** in `index.html` (exact version + SRI hash) to
  the version in `package.json`. Update it only with
  `npm run update-supabase -- <version>` (`scripts/supabase-js.js`);
  `tests/stamps.spec.js` checks the two agree. The README's section on
  updating it is in Spanish on purpose: it's for the owner, in case
  there's no Claude around.
- **Secrets never go in the repo.** `js/config.js` holds only public values:
  the Supabase URL, the publishable key and the Web3Forms access key. The
  TMDB key is a secret of the `tmdb` Edge Function.

## Tests

- `npm test` runs Playwright against a **fake Supabase**
  (`tests/support/fakeSupabase.js`), covering auth, REST with row-level
  ownership, realtime, the TMDB function and Web3Forms. Tests never touch
  real accounts or the network. Any request to an unexpected host fails the
  test (`backend.blocked`).
- The fixtures (`tests/support/fixtures.js`) give every test a seeded user,
  `tester@slate.test` / `correct-horse-1`, and fail on uncaught page errors.
- A regression test has to fail on the old code; check that before
  trusting it. For UI changes, take screenshots with a throwaway spec and
  look at them (delete the spec afterwards).
- Keep the suite lean. The owner prefers tests where a bug would lose data
  or lock people out, not exhaustive coverage.
- CI (`.github/workflows/tests.yml`) runs the app tests, the stamp check and
  the Edge Function's Deno tests on every push.

## The live Supabase project

- Migrations `0001`–`0007` in `supabase/migrations/` have all been applied
  to the live project. **Never re-run `0006_invite_only.sql`**: it would mark
  accounts made by hand as already having their own password.
- Test a new migration on a throwaway local Postgres before the owner runs
  it in the SQL Editor. Supabase warns about any `delete`/`update` without
  `where`; explain that before they click "Run query".
- **Slate is invite-only.** "Allow new users to sign up" is off.
  - "Request access" (`js/auth.js`) emails requests through Web3Forms to
    `slateappmail@gmail.com`. There, a Gmail filter keeps them out of spam.
  - The owner makes accounts by hand (Authentication → Users → Add user,
    Auto Confirm) with a temporary password from
    `tools/welcome-email.html`, which also builds the welcome email they
    paste into Gmail.
  - At the first login, Slate requires a new password (`choose` mode) until
    the user's metadata has `password_chosen: true`.
- Emails from Supabase itself (password reset) use Supabase's default
  sender. Its templates can't be edited without custom SMTP, and the owner
  decided not to pay for or set that up.

## Where things stand

- Everything so far is in `main`: invite-only access, the welcome-email
  tool, the review note redesign, the trailer button that waits, disabled,
  search + filters, where to watch, and rewatches of movies (all three
  stages).
- Search and filters (`js/librarySearch.js`) cover Movies, Shows, Movies To
  Watch and the Shows Queue; the owner chose to leave collections for later.
  Their decisions:
  - several genres picked means titles with all of them;
  - the rating filter is one number compared ≥ / ≤ / = (or Unrated);
  - while any search or filter is on, Custom order is paused (no dragging,
    the default sort instead, "Custom" locked in the Sort menu) and comes
    back once everything is cleared.
- **Next: v3.0.0**, in this order, one at a time and each only with the
  owner's go-ahead:
  1. **Where to watch** (`js/whereToWatch.js`) — done: below the buttons of
     the detail window (to watch, watching, dropped) and of the search's
     info window; Stream / Free / Rent / Buy logos linking to TMDB's watch
     page, credited to JustWatch; the country is the browser's unless
     picked in Settings → Defaults (`watchRegion`). The `tmdb` Edge
     Function allows `(movie|tv)/<id>/watch/providers` and
     `watch/providers/regions`; the owner redeployed the live function with
     them. Any later change to `supabase/functions/tmdb/index.ts` needs the
     same redeploy (its README says how).
  2. **Rewatches** (movies only for now; shows get planned apart once
     movies work well). Stages 1 (`0007_viewings.sql`, applied live: one
     viewing per watched movie, counts checked) and 2 (the app,
     `js/viewings.js`) are done. The database keeps
     `movies.watched_date` = the latest viewing, refuses to drop a movie's
     last viewing or clear its date, and turns a direct `watched_date`
     write (the current app, a v1 `.slate`) into the matching viewing — so
     it's safe to apply before the app's new code. The owner's decisions:
     - one rating and one review per movie (their current opinion); each
       viewing is just a date. No notes per viewing (the owner tried them
       and didn't want them; the review covers that): the earliest viewing
       shows a fixed, app-set "The first time you saw this movie" instead.
       The `viewings.note` column stays in the database, unused;
     - a watched movie can never lose its date: Edit changes it but can't
       empty it, and the only way back is deleting the movie;
     - viewings can be deleted with a strong confirmation (type the title),
       except the last one;
     - the detail window shows the latest date; with more than one
       viewing, a "N viewings" button lists them, and picking one swaps the
       window's content to that viewing (date, save, delete, back);
       with a single viewing, Edit holds its date;
     - "↻ Watched it again" beside Edit adds one; cards show ×N;
     - Time watched counts every viewing, plus a Rewatches stat; the
       "Watched in" filter matches any viewing's year;
     - `.slate` goes to version 2 carrying viewings; version 1 files still
       import (one viewing per watched movie).
     Stage 3 is done too: `.slate` version 2 lists each movie's viewings
     (version 1 files still import, one viewing per watched movie), Replace
     brings them in and its undo puts them back, Time watched counts every
     viewing, a Rewatches stat shows once there's one, and "Watched in"
     matches any viewing's year. Replace had broken when 0007 went live
     (a movie watched in the account but not in the file can't lose its
     date): such a movie is now deleted and recreated on the same id.
     Nothing of this stage needs a migration or a redeploy.
  3. **Import from other apps: moved to a later update (maybe v3.1.0)**,
     the owner's decision. The plan so far: IMDb (CSV with IMDb ids → TMDB
     `find`), Letterboxd (ZIP of CSVs, title + year matching, diary
     rewatches), Trakt (JSON with TMDB ids). TV Time shut down on July 15,
     2026, and JustWatch has no official export, so both are out. Reuse
     the `.slate` import flow in Add mode, with a review of what didn't
     match. Needs real export files from the owner. Open questions for the
     owner: the watched date for IMDb (it only has the date rated), films
     Letterboxd has as watched but not in the diary, titles already in
     Slate, and where shows go.
- Next: translate the app (Spanish, German and Italian), then publish.
  The owner authorized the stages one at a time:
  1. **The base** — done, not merged: `js/i18n.js`, every string through
     `t()`/`tn()`, the tests. English looks exactly as before.
  2. **Spanish** — done, not merged, waiting for the owner's review:
     `js/lang/es.js` (neutral Spanish, "tú"; película / serie / colección,
     Por ver / Viendo / Visto / Abandonadas, calificación, reseña,
     visionado, "revisionados" for rewatches, Ajustes). Language pickers in
     Settings → Defaults, the landing page's footer and under the login
     card; the choice is per device (not saved to the account). Decimals
     follow the language (`formatDecimal`: "7,8"). The header stats strip
     now puts what doesn't fit on a second row instead of overlapping.
  3. German and Italian, in the same terms once Spanish is approved.
  4. TMDB's data in the language (genres, synopses, search results): the
     owner said yes, to do when it's time. Needs the `tmdb` function to
     pass a language (a redeploy); genres saved in English need a table.
- **Publishing on Cloudflare Pages** (free, chosen over Netlify and
  Vercel). The steps:
  1. Connect the GitHub repo. There's no build command, and the output
     directory is the repo root.
  2. Add the new address to Supabase → Authentication → URL Configuration:
     the Site URL and the Redirect URLs, so password-reset links work.
  3. Update the address in Web3Forms' form settings.
  4. Put the address in the welcome-email tool (it remembers it).
  5. Add a `_headers` file with the simple security headers only:
     `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
     and `X-Content-Type-Options: nosniff`. The owner and Claude decided
     against a full Content-Security-Policy for now: the risk of breaking
     part of Slate outweighs the benefit for a small private app.
- Optional ideas, not requirements:
  - reordering cards with the keyboard;
  - a privacy policy page;
  - large-grid performance.
- The owner can't pay for services right now; keep everything on free
  tiers. On the free Supabase plan, projects pause after about a week with
  no use and there are no automatic backups. Settings → Your Data → Export
  is each user's backup.
