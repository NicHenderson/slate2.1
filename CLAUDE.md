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

## Since the launch: how changes reach people

- `main` **is** what people use: every merge publishes myslate.pages.dev
  in about a minute. Work stays on a branch, tested locally, until the
  owner says "súbelo a main", as before. An open tab keeps the old code
  until it's reloaded.
- The local copy talks to the **live** Supabase project: testing locally
  with a real account changes real data. Test with the owner's own
  account, never a friend's.
- Migrations and `tmdb` function redeploys reach everyone at once, before
  the app's new code does. Write them so the published app keeps working
  with them (as `0007_viewings.sql` was).

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
    the device, else the browser's, else Spanish (Slate's main language),
    and changing it reloads.
    Dates use `LOCALE`.
  - `tests/i18n.spec.js` fails if a language lacks a string or has one
    nothing uses, if placeholders or markup differ, or if the main screens
    show text that doesn't go through translation.
  - Stays in English on purpose: the owner's emails (the Web3Forms
    request) and the welcome-email tool's own page (the email it builds
    is Spanish by default, English on request), Supabase's own emails and error texts (like
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

- Migrations `0001`–`0009` in `supabase/migrations/` have all been applied
  to the live project (0008 by the owner before testing stage 3's preview,
  where Replace worked; 0009, episode tracking, by the owner in Sept. 2026,
  checked: the table empty and in `supabase_realtime`). **Never re-run `0006_invite_only.sql`**: it would
  mark accounts made by hand as already having their own password.
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
  search + filters, where to watch, rewatches of movies (all three
  stages), English + Spanish (the app and TMDB's data), genres and
  posters escaped as text, the search's info window in the detail
  window's design (with its trailer), episode tracking for shows (all
  nine stages, below), and a new season after finishing (PR #22, Sept.
  29, 2026: the note and stamp, Keep watching, finishing again, the
  card's starburst), and (PR #23, Sept. 30, 2026) the privacy page with
  its box, and the background textures setting, and (PR #24, the same
  day) Spanish first: SEO basics, the share image, the Spanish fallback
  and the Spanish welcome email.
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
     the detail window (to watch, watching, dropped) and in the search
     window's details side; Stream / Free / Rent / Buy logos linking to TMDB's watch
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
- **Spanish is Slate's main language** (the owner's decision, Sept. 30,
  2026: Slate is for the Spanish-speaking community). English stays
  available. The repo keeps its convention (code, comments and source
  strings in English; Spanish is their translation in `js/lang/es.js`);
  what changes is what people see first. The owner's call on the
  default: still the language picked on the device, else the browser's
  (an English browser keeps English), and **Spanish, not English, when
  the browser's is neither** (js/i18n.js, privacy.html). What search
  engines and link previews read (title, description, share image) is
  in Spanish for everyone: index.html's `<title>` and those metas carry
  `translate="no"`, so an English page still has the Spanish tab title.
  The welcome email (tools/welcome-email.html, sent to new users) now
  goes out in Spanish by default, English if picked there (remembered
  on the owner's computer); the tool's own page stays in English.
- Translation is done, and Slate is published (below). **Slate launches in
  English and Spanish only** (the owner's decision); German and Italian are out for
  now, and adding a language later only takes its dictionary.
  The owner authorized the stages one at a time:
  1. **The base** — done: `js/i18n.js`, every string through
     `t()`/`tn()`, the tests. English looks exactly as before.
  2. **Spanish** — done, reviewed by the owner:
     `js/lang/es.js` (neutral Spanish, "tú"; película / serie / colección,
     Por ver / Viendo / Visto / Abandonadas, calificación, reseña,
     visionado, "revisionados" for rewatches, Ajustes). Language pickers in
     Settings → Defaults, the landing page's footer and under the login
     card; the choice is per device (not saved to the account). Decimals
     follow the language (`formatDecimal`: "7,8"). The header stats strip
     now puts what doesn't fit on a second row instead of overlapping.
  3. ~~German and Italian~~ — dropped for the launch.
  4. **TMDB's data in the language**, before the launch (the owner's
     choice) — done. Genres are saved in English (by TMDB id,
     `TMDB_GENRES`) and shown translated (`GENRE_NAMES`), so one genre is
     one filter option. Searches and details come in the page's language:
     Spanish is TMDB's Latin American (`es-MX`, the owner's choice). The
     owner decided that **titles and synopses are saved in the language
     Slate is in when they're added, and always shown as saved** (a
     library can mix English and Spanish titles). A synopsis TMDB hasn't
     translated comes from its English details. The owner redeployed the
     live `tmdb` function with `language` (en-US or es-MX).
- **The landing page** was cut down before the launch (the owner's
  decision): it sells the one problem Slate solves, not every feature.
  Hero ("Every movie. Every show. All saved in one place."), "Sound
  familiar?" (three notes: did I see it, the lost recommendation, the
  lost notebook), "Slate keeps it for you" (what you watched, what you
  want to watch, for good), the invite-only call, and last, as the page's
  goodbye, the owner's letter word for word. Features are left for people to find in the app;
  don't add feature tours, FAQs or detail cards back without asking.
- **Publishing on Cloudflare Pages** (free, chosen over Netlify and
  Vercel). Since 2025 Cloudflare steers new projects to Workers (static
  assets) and puts its new work there, but Pages stays fully supported;
  Pages was kept for its simpler setup (no config files) and its nicer
  free address (`<project>.pages.dev`, vs. `<project>.<account>.workers.dev`).
  The whole repo root is served, docs and tests included: the repo is
  public anyway and holds no secrets. Free plan (Sept. 2026): 500 builds a
  month, 20,000 files and 25 MiB per file. The steps:
  1. Done: **Slate is live at https://myslate.pages.dev** (Pages project
     `myslate`, created through "Continue to Pages", which Cloudflare now
     calls the legacy workflow). Production branch `main`, no build
     command, the repo root as output: every merge into `main` publishes.
     `tools/welcome-email.html` is still used from the local server.
  2. Done: Supabase → Authentication → URL Configuration has Site URL
     `https://myslate.pages.dev`, and Redirect URLs
     `https://myslate.pages.dev/**` plus `http://localhost:8080/**` and
     `http://127.0.0.1:8080/**` for local testing.
  3. Web3Forms: on the free plan it has no domain setting (restricting
     domains is a Pro feature); the form's "Website URL" (Settings → Form
     Details) is only a label, set to the new address. The subject and
     sender name its settings show are overridden by what `js/auth.js`
     sends, and its Redirect URL isn't used (Slate posts with fetch). Some
     sources said the free plan blocks free subdomains like `.pages.dev`;
     the owner's own test says otherwise: a request sent from
     myslate.pages.dev arrived.
  4. The owner puts the address in the welcome-email tool (it remembers
     it). Password reset from myslate.pages.dev was tested by the owner
     and works.
  5. Done (`_headers` at the repo root): the simple security headers only:
     `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
     and `X-Content-Type-Options: nosniff`. The owner and Claude decided
     against a full Content-Security-Policy for now: the risk of breaking
     part of Slate outweighs the benefit for a small private app.
- **After the PC test pass (the owner's bug hunt), in this order**, each
  stage only with the owner's go-ahead. Stages 1–6 go on
  `claude/funny-pascal-bk99gr`, each to `main` once approved:
  1. Quick fixes — done: login / Request Access no longer show the landing
     page when zoomed in (the bot-trap field, pushed 10000px left inside
     the tilted card, was carried ~250px down; and the panes now grow with
     the card); adding from Info disables the title's row in the search;
     an empty list's Filters says there's nothing to filter; toasts no
     longer jump sideways; line breaks show in reviews and bios.
  2. Always up to date — done: every write to movies / shows is applied
     to STORE and the grids the moment it succeeds (`applyLocalChange`,
     js/realtime.js), not only when its realtime echo comes back (adding,
     batch adding, adding from a collection, starting / finishing /
     dropping / un-dropping a show, deleting). An open detail window
     follows a title changed elsewhere (`followLiveChange`,
     js/detailModal.js) and closes, saying so, if it's deleted there; an
     Edit form open on it says it changed and offers "Load the changes"
     rather than refilling under the user's hands.
  3. Replace everything in one step — done, tested by the owner: Import → Replace everything is now one call to
     `replace_my_library()` (0008), one transaction, so a tab closed or a
     connection lost halfway can't leave the library half replaced (the
     old way, many requests plus an undo, could). The backup still
     downloads first. If the database refuses, nothing changed; if the
     answer never comes back, the app says the library is either as it was
     or exactly the file, and to refresh. Tested on a local Postgres with
     2,000 movies and 3,000 viewings: under a second.
  4. Ratings as hearts — done, in `main`: of three
     mockups (clean, classic red, doodle) the owner picked the doodle:
     hearts drawn in ink, slightly tilted, the theme's color stuck a touch
     off the line like a sticker (`css/hearts.css`). The picker
     (`js/heartsInput.js`) pops each heart in after the one before;
     clicking the current rating clears it ("Clear it" on hover). Cards
     and the detail window draw the row with CSS masks (one element, fine
     for 1,000+ cards); on cards the ink line is dropped, too thin to read.
  5. Redesigns, mockups first, in two parts.
     5a — done, in `main` (their picks of three
     mockups each): toasts are stickers in the theme's color with a hard
     shadow, a ✓ (errors red with !), a × to close, 5 seconds;
     "↻ Watched it again" is a small dashed button under the watched
     date in the detail window, out of the action row (the owner tried
     a round sticker on the poster, then beside the date, and settled
     on a plain button there); adding
     titles to a collection has "Show watched ones too" (off each time
     the window opens), watched titles mixed in after the To Watch ones
     and stamped Seen / Watching / Abandoned.
     5b — done, in `main`: the TMDB search window is
     results on the left and the picked one's details on the right (the
     owner's pick of three mockups; `js/searchModal.js`,
     `css/searchModal.css`), replacing the separate info window (gone,
     with `js/infoModal.js`). The side says "pick a title…" until one is
     picked and "loading its details…" while it loads (the owner asked
     for both), and only ever shows the last one picked. It searches as
     you type; "[id]" still works; titles already there say so; from To
     Watch / a collection titles are picked (a round toggle on each row,
     or the side's button) and the add bar only shows once something is
     picked, listing it. On a phone the side replaces the list, with
     "← Results".
  6. Settings in two — done, in `main` (their pick
     of three mockups, "menu and page"): a menu with the profile card on
     top (the old "Preview") and two groups, Your Slate profile (Profile,
     Your Data, Account: log out + delete account) and App settings
     (Appearance, Language & country, Your lists); the page picked shows
     beside it. With no room for both (a phone), the menu first and the
     page in its place with "← Settings" (js/settings.js, .at-menu). The
     owner decided Your Data and Account belong to the profile. Log out is
     now in Account too, for the phone (no sidebar there).
  More themes — done, in `main`: of ten mockups the
  owner picked seven, for 15 in all (8 dark, 7 light): Graphite, Gala,
  Wine (dark); Lavender, Peach, Chalk, Sun (light). Each is a block in
  css/base.css plus its swatch colors in js/settings.js (THEME_META; keep
  both in sync). Checked across the app; while building, Chalk's,
  Peach's and Sun's accents were nudged from the mockup so the header tag
  and the profile card's numbers read (contrast ≥ 3), and some pops made
  darker, as they carry white text.
- **Episode tracking for shows being watched** (the owner's idea) —
  done, in `main` since Sept. 29, 2026 (PR #21, with the two fixes
  found on the way). An older Slate had
  a "favorite episode" picker so close to a streaming app's episode list
  that the owner had to change it: it looked like it would play the
  episode. Avoid that here: no ▶, no "Watch now"; Slate's paper look.
  The owner's design and decisions:
  - in a Watching show's detail window, "Up next: S1 · E24": the next
    episode's still, name and description, with "✓ Watched it" that
    marks it and moves on. The next episode is the one after the
    furthest watched (a skipped one doesn't block it);
  - a button opens a bigger window with every episode by season, to see
    where you are and mark several at once: each episode can be ticked
    or unticked on its own, and "Up to here" marks all before it too;
  - descriptions in the language Slate is in; when TMDB has none in that
    language, a generic one ("Episode 23 of Dark"), never the other
    language. No still: the show's poster;
  - last aired episode reached: "You're up to date!"; the series finale:
    "Finished it?" (asks, doesn't move it by itself);
  - the card on Watching shows "S2 · E5" and a progress bar.
  Since episodes are ticked one by one, watched episodes are stored one
  by one (a new table), so it needs: a migration (tested on a local
  Postgres first), `.slate` export / import and `replace_my_library()`
  carrying them, and the `tmdb` function allowing
  `tv/<id>/season/<n>` (the owner redeploys it). The owner's answers
  (Sept. 2026), before the mockups:
  - nothing ticked yet: the block asks "Where are you?" instead of
    assuming S1 · E1 (shows already being watched start that way);
  - a finished show has all its episodes ticked, stored as rows.
    Finishing it the usual way ticks the ones missing; ticking the
    finale of an ended / canceled show opens the usual finish window
    (TMDB's status tells; a show still airing says "You're up to
    date!" instead). Closing that window without saving unticks the
    finale again;
  - specials (season 0) are left out entirely;
  - "up to date" says when the next episode airs, if TMDB knows;
    episodes not aired yet can't be ticked;
  - dropping a show keeps where it stopped ("Stopped at S2 · E5"; no
    "Up next" or "Finished it?"). A dropped show is never picked up
    again: in Slate you start it over, so "Back to To Watch" clears
    its dates, rating and review, and now its ticked episodes too;
  - no date per episode: only the show's started / finished dates, as
    now;
  - the new table is realtime, like movies and shows;
  - `shows.total_episodes` (saved when the show was added) is refreshed
    whenever its details are loaded, so the card's bar stays right.
  Mockup 1a (https://claude.ai/artifact/6Xf5LBNaB1X5YapV5gMTUA): of a
  taped photo, a sticky note and a to-do list, the owner picked the
  sticky note, a touch smaller: a note in the theme's color under the
  started date, the episode's image clipped to it, "Up next S1 · E4",
  name, description, a hand-drawn box "Watched it" and "See all
  episodes →". "Where are you?" picks season + episode ("Tick them")
  or, just starting, offers E1.
  Mockup 1b (https://claude.ai/artifact/MnAXSybJVDrwEppQU2UnSD): of
  season tabs, folded seasons and numbered boxes, the owner picked the
  season tabs (like To Watch / Watching / Dropped, each with "4/8"),
  one season at a time: each row a hand-drawn box, "E4", the name, a
  small description (up to three lines) and the image; "Up next"
  marked; "Tick up to here" on hover (always, on a phone); it opens on
  the next episode. The window shows for finished and dropped shows
  too, **only to look** (nothing can be ticked there). Spanish says
  "episodio", as the app already does, and the generic line is
  "Episode 5 of season 2 of Dark." (Claude's defaults; the owner
  didn't object).
  Mockup 1c (https://claude.ai/artifact/Pt2SXRQBGSLFNcpzoTJVFg): of a
  line and bar, a sticker on the poster and this season's boxes, the
  owner picked the line and bar: under the card's title, the **last
  episode ticked** in handwriting ("S2 · E5", not the next one) with
  "14/26", a hand-drawn bar of the whole show, and the "Started 27d
  ago" line as today. Nothing ticked: "Where are you?"; all aired
  ticked: "Up to date"; dropped: "Stopped at S2 · E5" and the bar.
  Stage 2 — done, applied live by the owner: `0009_watched_episodes.sql`
  (the table, one row per ticked episode, unique per show + season +
  episode, seasons from 1; row-level security like viewings, no
  update; realtime; "back to To Watch" clears a show's episodes in the
  database itself; `replace_my_library()` takes an optional
  `episodes` list). Tested on a local Postgres with 0001–0008 first:
  every rule, the published app's calls unchanged, a second run fails
  harmlessly, and a Replace of 2,000 movies + 300 shows + 15,000
  episodes in half a second.
  Stage 3 — done, redeployed live by the owner: the `tmdb` function
  allows `tv/<id>/season/<n>` (n from 1), with Deno tests.
  Stage 4 — done, checked by the owner on the preview:
  `js/episodes.js` + `css/episodes.css`. Episodes load with the library
  (`STORE.episodes`), follow realtime, and are dropped locally when a
  show is deleted or sent back to To Watch (as the database does). TMDB
  season / details lookups are cached 30 minutes. The note: "Where are
  you?" (season + aired episode picker, "Tick them", or "Watched it" on
  E1), "Up next S1 · E4" with "Watched it", and a plain "You're up to
  date!" (stage 5 adds the next air date and the finale).
  `tests/episodes.spec.js` covers it (plus Spanish's generic line).
  The owner's one note: the note jumped from a thin strip when it
  loaded. Now it loads at about its final size (150px, 250px on a
  phone, with an empty photo frame) and eases the rest, fading in.
  Stage 5 — done: "You're
  up to date!" adds "The next one, S3 · E1, airs on …" when TMDB knows
  it (only for a show still going). For an ended / canceled show
  (TMDB's status), ticking its last episode (from the note or "Tick
  them") opens the usual finish window titled "Finished it?" with
  today's date (`openFinishShowModal`, js/startModal.js); closing it
  without saving deletes that tick again ("Not saved: S3 · E8 unticked
  again."). If a finale is ticked but the show is still Watching, the
  note says "Finished it?" with "Mark it as finished". Finishing a show
  the usual way (newly finished) ticks every episode out
  (`tickAllEpisodes`): earlier seasons by TMDB's counts, the latest
  one episode by episode. A fake still-airing show (Severance, 95396)
  is in tests/support/tmdbCatalog.js.
  Checked by the owner (with The Simpsons' season 38, which premiered
  on Sept. 27, 2026, for "up to date").
  Fixed on the way (a bug in `main` too, found by the owner): adding a
  movie from Movies opened its form with a false "This title just
  changed in another window". The realtime echo lists a row's fields in
  jsonb order (shortest key first), unlike the REST answer, and
  `sameRow` compared them as text; it now compares field by field. The
  fake backend sends realtime rows in that order too.
  Stage 6 — done: the
  episodes window (`#episodes-modal` in index.html, z-index 110: above
  the detail window, under the finish window). "See all episodes →" on
  every state of the note opens it on the next episode's season,
  scrolled to it (marked "Up next"); tabs per season with ticked/out;
  "3 of 26 watched" and a bar; each row a hand-drawn box, "E4", name,
  a small description (3 lines) or "Airs on …" for one not out (its box
  dashed, disabled), and the image. Ticking the finale there opens the
  finish window too; saving it closes the episodes window. It follows
  realtime, closes with the detail window, and with a show deleted
  elsewhere. Checked by the owner.
  Stage 7 — done: "Tick
  up to here" on each row (on hover, always on a phone) ticks it and
  every episode out before it, earlier seasons included (by TMDB's
  counts), and finishes a show whose finale it reaches, as ticking does.
  A finished show's detail window has "See all episodes →" (under the
  dates); its list shows every episode out as watched, whatever's
  stored (shows finished before episodes were tracked have no rows),
  and nothing can be ticked. A dropped show's window has a "Stopped at
  S1 · E3" note (the furthest ticked; none if nothing is) and a list
  only to look at, that episode flagged "Stopped here". The episodes
  window redraws when its show is finished or dropped elsewhere.
  Stage 8 — done: the
  card (`episodeProgressHtml`, from STORE only, no lookup): Watching
  shows "S2 · E5" (the last ticked) + "14/26" + a hand-drawn bar, then
  "Started 27d ago"; with nothing ticked, an empty bar that looks it
  (dashed, hatched) and "0/9" (the owner found "Where are you?" on the
  card ugly; the window's note still asks); "Up to date"
  when everything out is ticked; Dropped shows "Stopped at S2 · E5" +
  the bar. **`shows.total_episodes` now means episodes out**, not
  TMDB's `number_of_episodes` (which counts announced ones, so a show
  still airing never read as up to date): counted up to TMDB's
  `last_episode_to_air` (`episodesOut`), saved that way when a show is
  added and refreshed, with `total_seasons`, whenever its window opens
  (`refreshShowCounts`: one update, only when they differ).
  Stage 9 — done, checked by the owner:
  `.slate` goes to **version 3**: each show lists its ticked episodes
  (`"episodes": [{ season, episode }]`, in order) and `counts.episodes`.
  Import reads them (only for a show that was started; capped, checked,
  each once), the summary counts "N episodes ticked"; Add brings a new
  show's episodes (a show already in the account keeps its own); Replace
  sends them to `replace_my_library()` (0009's `episodes`). Versions 1
  and 2 still import, their shows with nothing ticked; the published
  app, on version 2, says a version 3 file is from a newer Slate.
  With the owner's first go-ahead (Sept. 29, 2026), all of it was
  merged into `claude/funny-pascal-bk99gr`, tested there by the owner,
  and merged into `main` on their "súbelo a main" (PR #21, CI green on
  its exact head).
  **A finished show that gets a new season — done, in `main` since
  Sept. 29, 2026 (PR #22, CI green on its exact head), after the owner
  checked every stage.** What was there before: Today a finished
  show's list shows every episode out as watched (the new season too),
  and the only way back to Watching is Edit → clearing "Finished on",
  which also empties the rating and review. Claude's proposal: an
  episode that aired after the show's finished date counts as new
  (true whether it came out before or after episode tracking existed);
  the finished show's window says "New since you finished: season 4"
  with "Keep watching" (back to Watching, rating and review kept,
  everything aired by the finished date ticked, so "Up next" is S4 ·
  E1); its list shows the new ones unticked, flagged "New". The
  owner's answers: keep the original started date; the old finished
  date goes; finishing again sets the new one (the old isn't kept:
  that's show rewatches, planned apart); yes to a "New season!"
  sticker on cards in Shows; and when finishing again, a small note in
  the finish window says the rating and review are from before the new
  episodes, and can stay as they are. Work on
  `claude/episode-tracking-shows-s9gixh`, then funny-pascal, then
  `main`, as before. Stages: 1 mockups (1a the notice + "Keep
  watching", 1b the list's new episodes, 1c the card sticker, 1d the
  finish window's note; https://claude.ai/artifact/6nr6xj9CiFH68y1Y9Kzf65).
  The owner's picks: 1a the sticky note ("New season!", what came out,
  the button) plus 1b's rubber stamp on the poster, nothing else of B;
  1b a "New" flag on each new episode and on its season's tab; 1c the
  starburst sticker; 1d the pencil note with arrows, pointing at both
  the hearts and the review. Stage 2 — done, waiting for the owner's
  check: `newSinceFinished` (js/episodes.js) counts an episode new when
  it came out after the finished date, whatever is ticked (the owner's
  test found Severance, finished on 2022-05-01, with season 2 ticked:
  `main`'s finish ticks everything out that day, even for a past
  date; so only the date counts for a finished show) (a finished date
  before the show first aired counts as none: everything seen, as
  before); the finished window's note and stamp (no button yet); the
  list shows the new ones unticked and flagged, opens on the first
  season with news, and a season still airing now counts only what's
  out (TMDB's `last_episode_to_air`). Finishing a show now ticks only
  what was out by its finished date (a past date had ticked episodes
  that came out after it). Stages 3 and 4 (done together, the owner's
  call) — done, waiting for the owner's check: "↻ Keep watching" on the
  note and in the list's header asks first (`openActionConfirm`,
  js/confirmModal.js: what stays, what goes, a button in the theme's
  color), then ticks what was out by the finished date, unticks anything
  after it, and clears only the finished date ("Up next" = the first
  new one). A finished date cleared by hand still empties rating and
  review (Slate's rule, the owner's; a first version kept them, and the
  owner caught it); only a show already Watching keeps its own when
  edited. The dates window says "Edit" for a show already started (it
  said "Start watching"; the owner asked). Finishing again: a Watching show
  with a rating or review (only a kept-watching one has them) shows the
  pencil note with its two arrows in the finish window; the new date
  replaces the old and the new episodes get ticked. The owner's addition,
  checked after stage 5: Edit on a finished show with something new (and
  a rating or review) shows the same arrows with "This rating and review
  are from when you finished it, before the new episodes came out. Why
  not keep watching it?" and a "↻ Keep watching" button (leaves Edit
  for the usual question). Stage 5 — done,
  waiting for the owner's check: the starburst on finished shows' cards
  in Shows (`newSeasonStickerHtml`), drawn from what TMDB said kept in
  localStorage (`slate_show_airings`: season premieres and the last
  episode out, per TMDB id), looked up in the background one show every
  1.2 s, again after 3 days (30 for ended shows), at most 200 a visit;
  any lookup of a show's details (its window) refreshes it too. Checked
  in Sept. 2026: Supabase's free plan has 500,000 Edge Function calls a
  month; TMDB allows about 50 requests a second. The headline is the
  same on the card and the note: "New season!" / "N new seasons!"
  (seasons begun after the finished date), else "New episodes!".
  Stage 6: merged into funny-pascal, then `main` on "súbelo a main".
  Stages, each checked by the owner on the branch's preview: 1 mockups
  (1a "Up next" and its states, 1b the episodes window, 1c the card);
  2 the migration; 3 the `tmdb` function; 4 "Up next" with "✓ Watched
  it" and "Where are you?" (its own quick pick, the window comes later);
  5 up to date / the finale / finishing ticks all; 6 the window,
  ticking one by one; 7 "Up to here", finished and dropped shows; 8 the
  card and the refreshed episode count; 9 `.slate` and Replace.
  The owner's flow for it: all stages on their own branch,
  `claude/episode-tracking-shows-s9gixh` (made from
  `claude/funny-pascal-bk99gr`; preview at
  claude-episode-tracking-show.myslate.pages.dev, Cloudflare cuts the
  name at 28 characters). When done, it's merged into
  `claude/funny-pascal-bk99gr` (bring in whatever landed there or in
  `main` meanwhile), tested again there, and goes to `main` only with
  the owner's second go-ahead. `claude/funny-pascal-bk99gr` stays for
  small fixes meanwhile.
  Then the phone project below, on `claude/mobile-app` brought up to date
  with `main`.
  The owner's decisions from that pass:
  - rating and review are optional for shows too, as for movies;
  - ratings become hearts, not stars (the owner's call, against Claude's
    advice: in a 1–10 scale they read as a score, not "loved it");
    tapping the current heart clears the rating; they fill with a soft
    animation that "Reduce animations" turns off. Still 1–10 numbers;
  - a watched (or started / finished) date in the future is refused: the
    field turns red with "Sure you watched this on {date}? That hasn't
    happened yet 👀" as soon as it's picked, and the form won't save (the
    owner first wanted it allowed, then changed their mind); a show
    finished before it started is refused too;
  - "Delete Data" / "Delete my account" must be typed exactly as shown
    (spaces around them forgiven), like a title to delete a movie;
  - two collections can't share a name (case and spacing ignored);
  - Import's summary counts collections, never lists their names;
  - collection names get up to four lines on their card before "…";
  - later, not now: an automatic, read-only drop date for shows (needs a
    migration). Not wanted: dropping a show never started (delete it).
    Two viewings on the same day stay allowed.
- **Now: Slate that feels like a phone app** (the owner's request),
  started Sept. 30, 2026 in a new session (the earlier one's artifacts
  and the private privacy guides are in another Claude account). Branch
  `claude/mobile-app`, made from `main` that day (preview:
  claude-mobile-app.myslate.pages.dev); it goes to `main` **only when
  the owner says so**, not after each stage. `claude/funny-pascal-bk99gr`
  stays for small fixes meanwhile. Phone-only changes: the computer
  layout stays as it is (checked by comparing screenshots). **One phone
  design, chosen by the window's size, not by the device** (the owner's
  call, Sept. 30, 2026): a computer window made phone-narrow gets it too (no
  separate narrow computer design); at computer sizes nothing changes.
  So everything in it must also work with a mouse (a gesture always has
  a button too). The owner finds the phone layout too much "a computer
  page trying to be an app": that gets fixed before stage 2, screen by
  screen, mockups first. **The landing page first**: of three phone
  mockups (https://claude.ai/artifact/W8YjrkyB4BRfB1VcNVwA9m; A a pocket
  board with a fixed bottom bar, B stories, C a cinema ticket) the owner
  loved B: one full screen per idea, swiped up like stories, a progress
  bar on top, "Request access" fixed at the bottom; 1 the cover (pinned
  polaroids, the hero text and lede), 2 "Sound familiar?" (the three
  notes), 3 "Slate keeps it for you" (three tickets like the sidebar's),
  4 the invite as an "Admit one" ticket, 5 the letter (scrolls) and the
  footer. Same words as today's page, nothing added. The owner's calls
  after: the bars mean stories, so they're stepped sideways, not by
  scrolling up; first with ‹ › buttons under the bars (and the bars
  themselves, a 44px tap area each), no swipe (Safari's edge swipe is
  "back"); tapping the left / right side to step may come after. An
  iPhone held sideways keeps the computer page. Built, waiting for the
  owner's check: at ≤640px wide (responsive.css, "The landing page on a
  phone: stories"; js/landing.js marks `[data-story].is-current`), the
  top nav and film strip hidden, "Request access" + "Already have an
  account? Log in" fixed under screens 1–3, "A letter from Slate's
  creator ›" under the invite, tighter at ≤740px tall; computer sizes
  checked pixel for pixel. The owner's iPhone showed two things Android
  didn't: a pale band under screens 1–4 (an installed app with a
  see-through status bar measures the screen short by the bar, so the
  page ended above the bottom and the cached light theme on <html>
  showed) and a pale frame when the page was pulled or pinched. Fixed:
  the stories' backdrop is a fixed layer covering the whole screen, the
  root doesn't bounce there, and on touch screens <html> is the brand's
  dark while the landing page shows. The real cause, found next: iOS
  26's WebKit bug 301108 (an installed app with a see-through status bar
  is told the screen is short by that bar, so anything pinned to the
  bottom floats above an empty band; Safari and Android are fine). A
  fix measuring the shortfall (screen.height vs innerHeight) and moving
  the bottom-pinned pieces down by it was tried and **reverted on the
  owner's word**: on their iPhone "Already have an account?" came out
  cut off, and they'd rather keep the dark band than stack patches. So
  on an installed iPhone the stories' bottom call sits a status bar's
  height above the bottom until Apple fixes it. **Login and Request
  access next**: of three phone mockups
  (https://claude.ai/artifact/SStEPPN9etcqYe93NGXPhG; A a sheet over the
  cover, B the invite's ticket, C a native-looking screen) the owner
  picked A, asking that it never scroll. Built, waiting for the owner's
  check: at ≤640px the card is a paper sheet risen from the bottom over
  the blurred landing page (responsive.css, "The login card on a phone:
  a sheet"): a grip, a × (= Back to Slate; none on reset / choose /
  privacy), tabs Log In | Request access (js/auth.js, `[data-auth-tab]`,
  replacing the link under the form there), a handwritten greeting, no
  title for Request access, no privacy link there either, and no
  language picker on the sheet at all (the owner found it out of place;
  the landing page's last screen has one);
  both forms fit an iPhone 15 and an SE without scrolling
  (tests/mobile.spec.js); a shorter screen scrolls with no bar. It rises
  and sinks as a view transition. Computer sizes pixel-identical. The
  owner's note: the grip and the dimmed page promise ways out, so a tap
  above the sheet closes it, and so does dragging the grip down (the
  sheet's top 40px; a short drag springs back); only the grip drags, so
  a form that must scroll still can. The language picker is gone from
  the sheet (the owner's call).
  **Then the app inside** (the owner asked for thorough help): Claude's
  screen-by-screen diagnosis at iPhone size, with screenshots, six bugs
  that were already there (the Sort menu cut off on the left; Shows
  Queue's and an open collection's header buttons running off the
  right; the ☰ floating over content; the detail window's × stuck to
  the runtime; hover effects stuck after a tap) and a plan in stages:
  https://claude.ai/artifact/5Rqyw2faFYEXbcFybmVSW4. Proposed order:
  bottom tab bar (6 sections into ~5 tabs, mockups), compact list
  headers (stats folded, sort / filter as sheets, a floating +, status
  tabs by the title), windows as sheets, full-screen search, cards /
  collections / settings, touch; then "back" and offline. The owner
  found it too much text and went to the cards instead: of three card
  mockups (https://claude.ai/artifact/CxRDhL78JFdPYkNXvQpqiQ; A a wall
  of small polaroids three across, B diary rows, C posters by month)
  they picked **A, to be used exactly**. Their idea with it, agreed: on
  the phone, **one Movies view** (tabs Watched · To Watch, opens on
  Watched) and **one Shows view** (tabs Watching · To Watch · Finished
  · Dropped, opens on Watching; Spanish "Viendo · Por ver · Terminadas
  · Abandonadas", "Terminadas" rather than "Vistas" so it isn't
  confused with Viendo), each remembering the last tab. The card
  changes with the tab (Watching: "S2 · E3" + bar; To Watch: year +
  seasons; Finished: hearts, date, the starburst; Dropped: "Stopped
  at" + a faded bar). So the phone has 4 sections, and of two menu
  mockups (same artifact, a bar fixed at the bottom vs. a redesigned ☰
  drawer) the owner picked **the bottom bar**: Movies, Shows,
  Collections, Settings, icon + label, the current one highlighted.
  The computer keeps its 6 sections and sidebar. The list header in
  the mockups is a placeholder, to be designed on its own. Stages (the
  owner's go-ahead, Oct. 1, 2026): 1 the bar and the two views, 2 the A
  cards, 3 the list header (mockups first). Stage 1 — done, checked
  by the owner: at ≤640px (641–768 keeps the drawer) the ☰
  and sidebar are gone; `.tab-bar` is the app's last row (`.app` turns
  a column, so nothing scrolls under it), and Movies / Shows show their
  tabs as pills (`.view-tabs`, top of `.content`). js/phoneNav.js maps
  each tab to a computer section (three Shows tabs = Shows Queue + its
  status tab) and clicks those buttons, so everything listening to
  them still works; a MutationObserver on the sections keeps the bar
  in step however a section changes. Last tab per view in
  `slate_phone_views`; tapping the current place scrolls to the top.
  "Vistas" needed its own dictionary entry ("Watched" is "Visto" as a
  status): `data-i18n-key` in js/i18n.js. On an installed iPhone the
  bar will likely sit a status bar's height above the bottom (the iOS
  bug above). Computer sizes checked pixel for pixel (1280/900/700).
  Stage 2 — done, checked by the owner: the six Movies /
  Shows lists, three polaroids across at ≤640px (density too;
  collections untouched), the title on one line, and under it
  `cardGlanceHtml` (js/data.js; hidden on computers): watched / finished
  = one heart + rating and a short date ("Sep 28" this year, else the
  year), to watch = year · length (seasons for shows); watching and
  dropped keep their episode line, smaller ("Started 12d ago" hidden;
  a dropped card breaks "Stopped at" before the code, never in it). The
  starburst and ×N scaled down. Computer sizes pixel-identical.
  Stage 3 — done, checked by the owner on their iPhone: of three header
  mockups (same artifact: A one row of round buttons, B a search bar
  always there with chips, C a big header folding as you scroll) the
  owner picked **A**. js/phoneHead.js: above the tabs, the view's name
  and the list's count, round buttons for 🎲 (lists to watch), search,
  sort, filters (with a count badge), and a floating "+" over the
  bottom right. Each button works the section's own control (its search
  box, sort menu, filters panel, add button), which stay in the page,
  hidden, so search / sort / filters behave as on the computer. The
  search button turns the row into a search field with Cancel. Sort
  and Filters are sheets from the bottom over a dimmed page (the tab
  bar and "+" hidden meanwhile): a tap on the dim or dragging the grip
  down closes them (the grip is a real element with touch-action:
  none, appended last, as the menus style their first child; re-added
  when they redraw). The numbers fold into one strip of the first three
  with "More ▾" (`.hstats-more`, beside the strip, as it's redrawn).
  With "+" floating, the "+ Add" card shows only in an empty list. This
  fixes the diagnosis' cut-off Sort menu and the Shows Queue's buttons
  running off the screen. Collections and Settings keep their headers
  for now. Computer sizes pixel-identical, the sort menu and filters
  panel open included. The owner's iPhone showed both sheets cut in half
  and scrolling the list instead of themselves (Done out of reach):
  Safari makes a container-query container (`.section`, content.css)
  the frame position: fixed is measured in, Chromium doesn't. Fixed:
  the phone's list sections aren't containers (`container: none`), and
  what those queries did for the numbers strip is restated for phones;
  The owner's iPhone still showed it: the sheets were cut at the list
  area's bottom edge. Second cause: `.content`'s view-transition-name
  (for logging in / out) makes it a layer of its own in Safari, which
  clips fixed children and takes their scrolling; it's dropped while a
  sheet is up (`.app.has-sheet`). tests/mobile.spec.js now checks that
  no ancestor of an open sheet has a transform, filter, contain,
  container, view-transition-name, etc. Keep it that way, or this comes
  back. Can't be seen in Chromium: the owner's iPhone is the check.
  Then (the owner's iPhone again): a drag on a sheet with nowhere left
  to scroll went on to scroll the list behind. The list can't scroll
  while a sheet is up (`.app.has-sheet .content { overflow: hidden }`,
  its place kept) and the sheets contain their own overscroll. That
  wasn't enough on the iPhone (the whole page bounced under Sort): a
  touchmove listener (js/phoneHead.js) cancels any drag while a sheet
  is up unless it scrolls a sheet that can still scroll that way, and
  the root's overscroll is off meanwhile.
  **Collections next** (the owner's go-ahead, Oct. 1, 2026): three
  mockups for the list and an open collection, same artifact (A the
  booklets two across, open with the lists' row of round buttons; B
  folders as rows, open with a banner of its posters; C album covers,
  open with the cover centered). The owner picked **B**. Built, waiting
  for the owner's check: the list (CSS only, css/responsive.css
  "Collections on a phone") turns each booklet into a folder row (seal,
  name on up to 2 lines, "8/12 watched" over its bar, three posters
  fanned on the right), under the lists' row with only the name, count
  and "+" (which clicks the "Add Collection" card, shown only when there
  are none). Open: `#col-banner` (index.html, filled by
  js/phoneCollection.js from STORE): posters blurred behind, back /
  edit / delete (red) round buttons, seal, name, "2 movies · ♥ 9,0",
  the progress bar, Surprise Me and Add; each works the computer's
  header button, which is hidden with the stats strip. Movies / Shows as
  pills; the titles three across with their status badge and the
  glance line (`cardGlanceHtml` via `gridIdFor`). Computer sizes
  pixel-identical, open collection included. The owner's iPhone: a
  collection held to reorder showed the computer's huge booklet under
  the finger. The drag copy lives in <body>, out of the list, so the
  phone styles now follow the card (`.collection-card`,
  `.col-item-card`) and a watchlist card's copy says where it came from
  (`data-ghost-of`, js/collections.js). Test in tests/mobile.spec.js.
  **Settings next** (the owner asked for mockups, Oct. 1, 2026; the gear
  icon was redrawn first, sidebar and bar, with their OK): three
  mockups, same artifact, each the menu and Appearance (A grouped
  lists on paper, iPhone-like, each page's current value on the right;
  B a "member card" on top and the six pages as tiles; C one page of
  folders that fold open). The owner picked **B**. Built, waiting for
  the owner's check (css/responsive.css "Settings on a phone",
  js/phoneSettings.js): the profile card exactly as on the computer
  (bio, favorites with posters; the owner rejected the mockup's
  "member card" once built: don't restyle it), the six pages as tilted paper tiles two across,
  each with what's set there (@username, email, theme, language ·
  country, default sort); a page opens under "‹ Its name" (the header
  hidden). Its tiles are flat paper with a hard shadow; Appearance has
  the themes three across (the miniature without its sidebar), the
  backgrounds as chips ("Can't quite see it?" still there), and card
  size + Reduce animations side by side, the size a handwritten word
  over an unseen <select> (`#density-select`, phone only). Computer
  sizes pixel-identical (1280/900/700, every page). The owner's iPhone:
  "Can't quite see it?" hung over the two small tiles, which showed
  through it, and ran off the screen; on a phone it now opens inside
  the Background tile, in the chips' place (it has its own), pushing
  the rest down.
  The owner's iPhone: a drag on the bottom bar bounced the whole app.
  The bar doesn't scroll, so iOS hands the drag to the page: the bar now
  cancels its own touchmoves (js/phoneNav.js, `touch-action: none`) and
  the page doesn't overscroll while the app shows.
  **Windows next** (the owner asked, Oct. 1, 2026: every window
  redesigned for the phone). Claude's count, from screenshots at iPhone
  size: 10 windows. Big ones with their own design: a title's window
  (5 states, viewings, trailer, "Add to collection"), the episodes
  list, TMDB search. Forms and small ones: Edit, the dates window
  (start / finish / mark watched), new / edit collection (+ icons),
  adding titles to a collection, the favorite picker, Import, Confirm.
  Today they're computer windows squeezed in (centered cards, the
  poster taking half the screen, the × by the runtime). Claude's
  proposal, waiting for the owner's go-ahead: 1 one shared phone base
  for all of them at once (mockups first: how a window rises, closes,
  its header and buttons), then own mockups only for 2 a title's
  window, 3 search, 4 episodes, 5 a last pass on the rest. The owner
  agreed, and asked that **nothing be built until they say so** (they
  want to be as sure as possible here). Base mockups (same artifact,
  each on a confirmation, the Edit form and adding titles to a
  collection): A a sheet rising from the bottom like Sort / Filters
  (fits its content, a tall one stops under the status bar; grip, ×,
  the main button pinned at the bottom), B full-screen pages like
  Settings' ("‹ Atrás" / Cancelar · Guardar; questions as a card in
  the middle), C A's sheet as Slate's paper (tape, a sticker title,
  stamped buttons). The owner picked **C** (Oct. 1, 2026); still
  nothing built: they say when. Next, at their go-ahead, the big
  windows' mockups first (all designed before anything is built).
  A title's window (same artifact, each a watched movie, a show being
  watched, a movie to watch; actions pinned at the bottom as stamps):
  A the poster as a polaroid beside the title, all the rest below; B
  the poster as the sheet's cover, the title a sticker label, ‹ ›
  arrows to step; C a compact head and tabs (your record · about it ·
  where to watch). The owner picked **A, with no scrolling at all**
  (they liked compacting everything). Compact A (same artifact, row
  "Ficha A, compacta"): the polaroid smaller, the synopsis cut to 2
  lines and the review to 3, each with "más" that shows the whole text
  on a taped note over the window; the watched date, "↻ La vi otra
  vez" and "×2 ›" on one row; Up next with its photo beside the text;
  everything fits an iPhone 15 with room left. The owner approved it.
  Search next (same artifact, each while typing with the keyboard up,
  a result opened, and picking several from To Watch / a collection):
  A one list in the sheet, a result's compact window in its place
  ("‹ Resultados"); B results as a wall of polaroids, a result rising
  on its own sheet above; C the search field at the bottom over the
  keyboard, results above it. The owner picked **A**. Episodes next
  (same artifact, each a show being watched opening on "up next" and a
  dropped one only to look; season tabs kept): A compact rows (box,
  E4 + name, two lines, a small photo, "↓ Marcar hasta aquí"); B each
  episode a big polaroid photo with its text below; C the season as a
  card of numbered hand-drawn boxes (tap to see one below, with "✓ Ya
  lo vi" and "↓ Hasta aquí"; no scrolling for most seasons). The
  owner picked **C** (on the computer they had preferred rows; this is
  phone only). The other 7 windows' review (same artifact, row
  "Repaso", each on base C and fitting one screen): a confirmation
  that asks for the title typed; Edit of a finished show (both dates
  on one row); starting a show; a new collection (only the icons' box
  scrolls); adding titles to a collection (search A's picking); the
  favorite picker (search A, a tap picks); Import's two ways. The
  owner approved it: everything is designed. Claude's build order,
  proposed, waiting for the owner's go-ahead (nothing built until
  then; each stage checked on the iPhone before the next; computer
  pixel-identical): 1 base C + Confirm, the dates window, Edit; 2
  new collection, adding titles, the favorite picker, Import; 3 a
  title's window (compact A, all its states and pieces); 4 search A;
  5 episodes C; 6 a last pass on the iPhone. Pieces with no mockup of
  their own (the finish window's pencil note, "Keep watching"'s
  question, the viewings list, the trailer, "Add to collection") take
  the same style and are shown for checking in their stage. The owner
  said go for stage 1. Stage 1 — built, waiting for the owner's check
  (css/responsive.css "Windows on a phone", js/phoneWindows.js): at
  ≤640px #update-modal (Edit / Mark as watched), #start-modal (the
  dates window: start, finish, Edit of a show) and #confirm-modal rise
  from the bottom as the paper sheet (scalloped top, tape, the window's
  name as a handwritten label, the title · year · length under it, no
  poster), the form scrolling inside only if a phone is too short, the
  buttons pinned at the bottom as stamps, Delete a red line above them;
  the review starts at four lines; a show's two dates on one row. They
  close with the ×, a tap above, or dragging the head down (a short drag
  springs back); the question got a phone-only × (`#confirm-close`).
  Fits an iPhone 15 without scrolling, the refinish pencil note
  included. Computer sizes pixel-identical (1280/900/700, each window
  open). The owner has things to fix in stages 1 and 2 (to be told
  after stage 2) and said go for stage 2. Stage 2 — built, waiting for
  the owner's check: the same sheet for #collection-modal (the icon
  box scrolls inside, stamps pinned), #library-modal (adding titles:
  the filter above the list, each title a row with year · length,
  where it stands as a small stamp, a round toggle; the add stamp
  says how many), #favorite-modal (searches as you type, no Search
  button; the whole row picks, js/profile.js, phone only) and
  #import-modal (its views' buttons as stamps pinned at the bottom).
  Lists stand tall so they don't jump as they fill. A message while a
  window is up comes from the top (at the bottom it covered the
  window's buttons). Computer pixel-identical (the new collection
  window's emoji render a few hundred pixels differently run to run,
  old code too). The owner's iPhone, fixed: (1) Edit and the dates
  window scrolled sideways: iOS date fields have a width of their own
  that ignores 100%; drawn plain (`appearance: none`, min-width 0) and
  the windows' bodies never scroll sideways. (2) A new collection and
  adding titles jumped down, cut off at the top: a field focused as the
  sheet rose brought the keyboard up mid-rise and iOS shifted the page.
  On a phone, fields in windows wait to be tapped (`focusOnOpen`,
  js/phoneWindows.js; the computer still focuses them), and a page
  left shifted once the keyboard goes goes back to the top.
  The owner: dragging (sheets down, cards to reorder) is smooth on
  Android, slow on the iPhone (an iPhone 15 is 60 Hz; many Androids
  90–120). Done, to be checked on the iPhone (Chromium can't show it):
  a dragged sheet (windows, Sort / Filters, login) gets `will-change`
  just before it moves and moves by translate3d; no backdrop blur
  behind any window on a phone (only the dim); a dragged card's lift
  without the wide glow, its `translate` hinted.
  The owner's Android: Appearance's theme previews shrank to slivers
  (that browser doesn't stretch a button in a grid cell); the swatch and
  its preview now say width: 100% on phones. Fine on the iPhone.
  The owner checked stages 1 and 2 and said go for stage 3. Stage 3 —
  built, waiting for the owner's check (css/responsive.css "Windows on
  a phone, stage 3"): #detail-modal is the same paper sheet, always the
  screen's height minus a strip (so stepping titles doesn't jump); the
  poster a small polaroid beside the title (`.detail-head-poster`,
  drawn in renderDetail, hidden on computers; the big one hidden on
  phones; "New season!" stamped on it too), year · length, genres and
  the trailer chip beside it (one grid for the window, `display:
  contents` on the head). Synopsis cut to 2 lines and review to 3; when
  cut (`markCutText`, measured once the window shows and when fonts
  arrive) they end in "more" and a tap shows the whole text on a taped
  note over the window (`#detail-note`, index.html). A movie's date,
  "↻ Watched it again" and "N viewings ›" on one row; Up next with its
  photo beside the words; where to watch a row per kind. The buttons
  are stamps pinned at the bottom (placed against the sheet, outside
  what scrolls): the main one wide, Add to collection / delete / drop
  square with only their icon (font-size 0, the icon a ::before; the
  words stay for screen readers). The trailer plays over the window,
  the rest dimmed (a tap on the dim closes it). The head drags the
  sheet down (js/phoneWindows.js now finds each head when the drag
  starts). Fits an iPhone 15 with no scrolling (tests/mobile.spec.js);
  "Where are you?" scrolls a little on an iPhone SE. No ‹ › arrows on a
  phone (hidden below 860px, as before). Computer pixel-identical
  (1280/900/700, every state, viewings, the collection menu).
  The owner's note: the note's × should be plain to see; it's now a
  round ink sticker over the note's corner. Then: go for stage 4.
  The owner's iPhone: a very long review ran off the screen on the note
  (a grid row grows with its content, so the paper's max-height: 100%
  didn't limit it). Now the paper is capped to the screen and only the
  text scrolls, the last lines fading and "↓ Scroll to keep reading"
  until the end; the ruled lines scroll with the text
  (`background-attachment: local`). A bar drawn by Slate showed beside
  the iPhone's own; the owner kept the iPhone's, so Slate's is gone.
  Stage 4 — built, waiting for the owner's check (css/responsive.css
  "Windows on a phone, stage 4"): #search-modal is the same paper sheet
  (it joins stage 2's shared rules), standing tall. The field on top
  (no focus as it rises: a tap types, as in the other windows), then
  one list: each result a row (poster, name, year, "In your library"
  as a small stamp, a › or, picking several, the round toggle), the
  picked ones as chips and the add stamp at the bottom. A result opens
  in the list's place as a compact title's window: "← Results" in the
  head, the polaroid beside the title, the synopsis cut to 3 lines
  ("more" opens it right there, `markCut` in js/detailModal.js), where
  to watch a row per kind, its button (Add / Pick / In your library) a
  stamp pinned at the bottom; the picked ones' bar hides meanwhile.
  The trailer plays over it as in a title's window. The head drags it
  down. Computer pixel-identical (1280/900/700: the list, a result,
  picking).
  Stage 5 — built, waiting for the owner's check (css/responsive.css
  "Windows on a phone, stage 5"): #episodes-modal is the same tall
  sheet; the head is its name as a label, "Tap a number to see that
  episode." (or the read-only note), "12 of 19 watched" and the bar;
  the seasons as tabs sliding sideways; the season a card of numbered
  hand-drawn boxes five across (ticked ones checked, not out dashed,
  Up next / Stopped here / New as a tag under the box). **On a phone a
  box picks, it doesn't tick** (a stray tap must not tick): the picked
  one is ringed and shown below on a note (photo, Up next / Stopped
  here / New / Watched, "E4 · name", four lines), with "✓ Watched it"
  (or "Untick it") and "↓ Up to here" where it can be ticked; ticking
  moves on to the next one (js/episodes.js, `episodesWindow.picked`,
  `episodeCardHtml`). It opens on the flagged episode, else the first
  not watched. Computer keeps its rows, pixel-identical. Found on the
  way: a show of eight seasons widened the sheet past the screen (its
  tabs' width leaked through the backdrop's grid); the sheets'
  backdrops are now one screen-wide column.
  The owner checked stage 5 ("funciona bien"). Stage 6, the last pass —
  done, waiting for the owner's iPhone: every window opened at iPhone
  size with a notch and home bar faked, in a dark and a light theme (27
  screens: each state of a title's window, Edit, Mark as watched,
  starting / finishing / refinishing a show, Keep watching's question,
  deleting a movie, a viewing and the account, a new collection, adding
  titles, the favorite picker, Import, search, episodes). All on base C
  and inside the screen. Fixed: (1) the diagnosis' old bug, a card left
  lifted after a tap (a tap counts as a hover on a phone and sticks):
  the cards' hover lift now needs a pointer that hovers
  (`html.touch-only`, set from `(any-hover: none)` in js/phoneNav.js;
  css/cards.css, modal.css); (2) Delete, before the title is typed, was
  a grey block on the paper; on a phone it's a faded red stamp. The
  danger question keeps Cancel on the right (a deliberate safety swap,
  css/modal.css). Computer unchanged (its hover lift checked).
  **Before `main`** the owner listed general bugs to fix first (Oct. 2,
  2026), then they test the whole app on the phone. Fixed: (1) a request
  sent on a phone pushed "Send again in Ns" off the non-scrolling sheet:
  the form now makes way for the message (`request-sent` on
  #auth-screen, phone only), and after the cooldown "Send another
  request" brings it back; (2) the Privacy Policy box was asked twice
  (Request access and the first login's password card). **The owner's
  call: only on Request access** (where someone first hands over their
  data; the policy says "when you request access or sign in for the first
  time"). The first login now records the acceptance on the account
  without asking (`privacy_accepted_with: "access request"`; the request
  email, with the version, is the proof). Accounts made before the policy
  and a new policy version still get the "Our Privacy Policy" card once.
  So an account should only ever be made from a request (one made for
  someone who never sent one would carry an acceptance they never gave).
  Then, from the owner's phone test: dragging the search window down
  while a result was open closed the whole search (the list and what was
  picked lost). Dragging down now steps back one level, as "← Results"
  does; from the list it closes. The × still closes everything. The
  owner then found the swap abrupt ("metido a fuerzas"): a result's
  details are now a sheet of their own over the results (#modal-preview
  absolute over the window, its own torn edge and shadow; the results
  stay beneath), rising when opened; its top band (64px) drags it alone,
  the results showing under it, and letting go far enough slides it on
  down (`layer` in PHONE_WINDOWS, `slideAway`), as "← Results" does.
  The preview's scrolling part is wrapped (`.tmdb-preview-scroll` >
  `.tmdb-preview-body`, js/searchModal.js); computer pixel-identical.
  Then: "Press & hold to reorder" (custom order: Movies / Shows To
  Watch, Collections, an open collection) sat flush on the numbers
  strip; on a phone it now has 12px under it, left-aligned (the
  owner tried it centred and preferred it on the left).
  Then (the owner's iPhone, Oct. 2, 2026): after a field's keyboard
  came up, a dark band sat under the bottom bar (and under windows,
  the "+", ...) until the app was closed, and the app jumped as the
  keyboard rose. An iOS 26 bug in installed apps with a see-through
  status bar (others hit it too, e.g. github.com/endziu/0xchat/pull/135,
  github.com/MiguelMedeiros/ghostly/pull/651): 100dvh, innerHeight
  and what's pinned to the bottom come up short by the status bar's
  height (~59px), and iOS draws nothing below. Only 100lvh stays
  right. Fix, CSS only, in installed apps (`display-mode: standalone`;
  css/responsive.css "The installed app's height"): `--screen-full` is
  100lvh (the app, html / body, windows' heights) and everything
  pinned to the bottom gets `margin-bottom: -(100lvh - 100dvh)`,
  which is 0 when the screen is measured right (Android, computers).
  It also covers the landing page's band (the earlier JS fix there
  failed likely because the page itself stayed short, so iOS drew
  nothing below). Chromium can't show the bug: checked
  pixel-identical with the rules forced on; the owner's iPhone is the
  check. If it misbehaves, this block is the one place to look.
  Then (the owner's ask): a title added from the search in Movies /
  Shows (watched lists) opens its form over the search; saving that
  form now closes the search too, so the list shows it at once (Cancel
  leaves the search open, as before). `updateFromSearch` /
  `startFromSearch`; test in tests/library.spec.js.
  Then (the owner): "Card density" did nothing on a phone (stage 2
  had pinned three across for both). Now Compact there is four across,
  every piece of the polaroid a size down (lists and an open
  collection), and shorter folder rows in Collections
  (css/responsive.css "Compact cards on a phone"); Comfortable as
  before.
  Then (the owner): an empty Watching / Dropped list (no "+ Add" card
  there) was a blank page. Now a taped paper note says what lands there
  ("Nothing playing right now." with "Go to To Watch →"; "No dropped
  shows. So far, so good!"), computer and phone alike
  (`emptyListNoteHtml`, js/data.js; `.empty-note`, css/cards.css).
  **No pinch zoom on phones** (the
  owner's call, Sept. 30, 2026, told it's an accessibility trade-off and
  that iOS only allows it by workaround): the viewport tag's
  user-scalable=no (Android), `touch-action: pan-x pan-y` on <html> and
  js/noZoom.js cancelling Safari's gesture events (iPhone), on touch
  screens / ≤640px only (a Mac's Safari trackpad pinch sends the same
  events). The system's accessibility zoom still works; privacy.html
  stays zoomable. If an iOS update breaks it, that's why. Native store
  ports are out for now (Play's $25 and 12-tester closed test, Apple's
  $99 a year and a Mac; one would wrap this same web app). The owner
  tests on an iPhone 15 (an Android too, not at hand). Chromium here can
  fake an iPhone's notch and home bar (CDP
  `Emulation.setSafeAreaInsetsOverride`, e.g. top 59 / bottom 34) for
  screenshots; anything Safari-only is checked on the owner's iPhone.
  The stages, from the basics up (the owner asked for them in that
  order), each only with their go-ahead, mockups first for 3–5:
  A. The foundations (Slate looks the same, behaves like an app):
  1. **Opens like an app** — done, waiting for the owner's check:
     `manifest.webmanifest` + icons (`img/icon-192/512.png`,
     `icon-maskable-512.png`, `apple-touch-icon.png`, the master logo on
     the brand's #0d0c15), `viewport-fit=cover`; css/responsive.css's
     `--safe-top/right/bottom/left` (env()) keep content, the ☰ button,
     toasts, windows, the login card and the landing page clear of the
     notch and home bar, `--screen-h` is the height windows fit in, and
     a strip of the theme's background sits under the status bar in the
     app. Every field is ≥16px on touch screens (iOS zooms otherwise;
     tests/mobile.spec.js checks it). js/statusBar.js: `theme-color` is
     the screen's background; the iOS status bar is `black-translucent`
     (white text over the page) on dark backgrounds and `default` on the
     light themes, as iOS can't draw dark text over the page. Unverified:
     whether iOS reads that change while the app is open (it may need
     reopening after a theme change); the owner checks with a light
     theme. privacy.html keeps clear of the edges too.
  2. **Back works** (`pushState` for sections and windows): the edge
     swipe of an installed iOS app (since iOS 12.2), Android's back
     button. The owner left it to Claude: back works on the computer
     too (the browser's button), the one computer change. Keep the auth
     card's `#login` / `#request-access` / `#forgot` routes and
     Supabase's recovery link working. iOS's own back animation may
     clash with Slate's: tune on the iPhone.
  B. What you see (mockups first):
  3. **Tab bar at the bottom** instead of the ☰ drawer. Slate has 6
     sections and such a bar holds about 5: the mockups decide. Mind
     landscape: an iPhone sideways (852px) gets the computer layout.
  4. **Windows as sheets** that slide up and swipe down to close.
  5. **Search and forms with the keyboard open**, search full screen.
  C. The finishing:
  6. **Touch**: 44px targets, a response on tap, swiping between
     subtabs.
  7. **Offline and speed**: opening with no signal showing what was
     last loaded, read-only (a service worker: take care that nobody is
     left stuck on an old version), smooth with 1,000+ cards. It keeps
     more on the device, so the privacy policy changes first: v1.3, a
     new date, the owner's approval word for word, `PRIVACY_VERSION`
     bumped. The policy says Slate uses no analytics, trackers or
     cookies: keep it that way.
- **The owner's own pending tasks** (from the handoff): before Dec. 1,
  2026 delete resolved access requests and sent welcome emails, check
  Supabase's DPA, and turn on two-step verification in Gmail, Supabase,
  GitHub and Cloudflare; check that Search Console reads the sitemap as
  "Success" and Slate shows up when searching "myslate". Unanswered:
  whether to drop "confetti" from "Reduce animations"' text. Later ideas:
  a domain of its own (also IMDb / Letterboxd / Trakt import and the owl,
  below).
- **The test scenario** the owner follows to hunt bugs (PC first, then
  the phone): https://claude.ai/artifact/WV8WgTtnTG5LsviRT4amDm. It runs
  with a throwaway account (`+slate1` / `+slate2` Gmail aliases), never a
  real one. Each step is marked ok / bug / odd with a note, saved in the
  page's database: read them with ArtifactData, collection `results`,
  documents `<pc|phone>__<step id>`.
- **Later, a big one: an owl assistant for recommendations** (the
  owner's idea; they'll draw the owl and name it). Not planned yet.
  Claude's advice, which the owner took as realistic: no AI training;
  an algorithm of its own, prototyped in Python on the owner's `.slate`
  export, then ported to JavaScript to run in the browser (Slate has no
  server; Supabase functions aren't Python). Signals: hearts, reviews,
  dropped shows, rewatches, where you stopped, To Watch, where to watch
  in your country, TMDB's keywords / people / similar titles; always
  saying why. "People like you" doesn't work with an invite-only
  crowd; free-text surveys are hard without an LLM (a keyword map
  first). Stages: "Because you loved X", context filters, feedback
  buttons, its own scoring, the survey.
- **Next small project, before the phone one (proposed, waiting for the
  owner's go-ahead): SEO basics and a privacy page.** Slate is run from
  Chile; the Supabase project is in AWS us-east-2 (Ohio, USA), so data
  lives abroad and the policy must say so. Chile's Ley 21.719 takes
  effect Dec. 1, 2026 (a postponement was being discussed; check), GDPR
  if Europeans use it. Claude isn't a lawyer: a plain, honest policy,
  every sentence approved by the owner. SEO: a realistic goal (found by
  name, nice link previews, internals hidden), not ranking against
  Letterboxd while invite-only: absolute `og:image` (today relative, so
  previews likely lack it), a 1200×630 share image, `robots.txt` +
  noindex for `tests/`, `tools/`, `supabase/`, docs, a `sitemap.xml`;
  the owner registers Google Search Console.
  **SEO, started Sept. 30, 2026** (the owner's go-ahead, after the
  privacy page). Claude's plan, in three stages: 1 the 1200×630 share
  image (mockups: https://claude.ai/artifact/QT5HUTEm1GHPfqTvwYaCr7, A
  the board with pinned posters, B a taped note with an "Invite-only"
  stamp, C a cinema ticket; English / Spanish). The owner picked A;
  done as `img/share.jpg` (1200×630, 84 KB, in Spanish, after the
  owner's decision below), rendered from the mockup with Playwright
  (fonts from Google Fonts through the proxy);
  2 the code (absolute og:image, og:url, twitter card, canonical,
  WebSite JSON-LD for the site name, privacy.html's tags, robots.txt,
  sitemap.xml, X-Robots-Tag noindex on tests/, tools/, supabase/,
  scripts/ and *.md via `_headers`); 3 Search Console by the owner
  (URL-prefix property, the verification tag in index.html, the
  sitemap). Branch previews are noindex already (Cloudflare adds it).
  Stage 2 — done, in `main` since Sept. 30, 2026 (PR #24, CI green on
  its exact head): all of the above, in Spanish; robots.txt allows everything (a Disallow would hide the
  noindex header from crawlers). Tests: an absolute og:image that
  exists (stamps.spec), and a French browser getting Spanish. Stage 3:
  the Search Console property is the owner's, registered with
  slateappmail@gmail.com (URL prefix https://myslate.pages.dev); its
  verification tag is in index.html's head (keep it), in `main` since
  Sept. 30, 2026 (PR #25). The owner verified it the same day; the
  live URL test says the home page is available to Google and can be
  indexed. "Request indexing" hit its daily quota (common on a new
  property; the sitemap does the job anyway). Left to the owner: click Verify, submits sitemap.xml and asks to index the
  home page; then check the link card (opengraph.xyz, WhatsApp) and
  Google's Rich Results Test on the live site.
  The owner asked about one branch per screen (landing / login / app
  on their own subdomains): talked out of it (previews are noindex,
  the session and settings are per origin, three copies of the code);
  `/login` instead of `#login` stays a possible later nicety.
  **Privacy page first, on `claude/funny-pascal-bk99gr`** (the owner's
  call). Stages: 1 the text (Claude's draft, in chat) — the owner answered:
  the page names who's responsible by their real name, Manuel Pinto Devia,
  with their artist name Nicholas Henderson (the law asks for it; they
  agreed); minimum age 14 ("almost" fine: ask what they'd change);
  contact slateappmail@gmail.com. 2 mockups:
  https://claude.ai/artifact/6Ut8VxYrCY8TePJ8itztGW (A pinned sheet with
  an index, B notes on the board, C a ruled letter signed by the owner),
  waiting for their pick. 3 `privacy.html`, English + Spanish, linked
  from the landing footer, Request access and Settings → Account.
  Then the owner brought a (non-professional) Ley 21.719 checklist; what
  Claude checked and proposed: the policy must also state the legal
  basis, the rights by name (access, rectification, deletion,
  opposition, portability, blocking), a 30-calendar-day answer (+30 once,
  told in time) and the right to complain to the Agencia de Protección
  de Datos Personales (30 business days); an unticked "I accept the
  privacy policy and I'm 14 or older" box on Request access and on the
  first-login password card, existing users asked once at their next
  login (kept in user metadata, like `password_chosen`: no migration);
  slateappmail@gmail.com as the formal channel (a @myslate.pages.dev
  address can't exist); and two internal guides for the owner (answering
  requests, and a security incident protocol). The owner then wrote
  their own policy (PDF, v1.0); Claude's v1.1 fixed it (their real name,
  the contact address, the profile is private, Settings paths, the US
  transfer, missing processors) and v1.2 checked it against the official
  text they sent (Ley 21.719 as consolidated by the BCN, Sept. 2026).
  From the law itself: in force Dec. 1, 2026 (transitory art. 1);
  art. 14 ter lists what the policy must say (also: who the data is
  about, where it comes from, recipients, the US transfer and its
  guarantees, no automated decisions); bases are art. 13 c (the
  service, and the access request as a pre-contractual step) and 13 d
  (sign-in logs), not consent, so the box records "I've read it and
  I'm 14 or older"; art. 11: acknowledge receipt, answer in 30
  calendar days (+30 once), blocking in 2 business days, keep proof of
  answers; art. 14 letter d: delete access-request emails once
  resolved (and, Claude's advice, welcome emails, which carry the
  temporary password); art. 27-28: no adequacy list yet, so the US
  transfer rests on Supabase's DPA (standard contractual clauses);
  art. 14 sexies: report breaches to the Agency and keep a register.
  The owl recommender will need the policy's "no automated
  decisions" line revisited (art. 8 bis, 14 ter l). The owner approved
  v1.2 word for word (use it exactly) and picked mockup A (the pinned
  sheet with an index), asking for friendly touches that say "this is
  the legal part"; Claude's A v2 adds a file tab, a stamp, typed
  document details, the article citations as pencil tags, and a signed
  seal at the end. The owner approved A v2 as is, with one fix of theirs:
  §1 names the law by its new title (21.719, art. primero n° 1),
  "Ley N° 19.628 sobre protección de los datos personales (modificada
  por la Ley N° 21.719)". Stage 3 — done, waiting for the owner's
  check: `privacy.html` at the repo root, self-contained (its own
  styles and script, no Supabase), v1.2 in Spanish and its English
  translation, shown in the language picked in the app
  (`slate_language`; no picker of its own, the owner's call); linked from the landing footer, under the login
  card and Settings → Account ("Privacy policy", "Read it");
  `tests/privacy.spec.js`. Its text is the owner's: change a word only
  with their approval, and bump the version and date if it changes.
  **In `main` since Sept. 30, 2026 (PR #23, CI green on its exact
  head), on the owner's word.** Stage 4 — done: the unticked box "I've read the
  Privacy Policy and I'm 14 or older" (linked, opens in a new tab) on
  Request access (the Web3Forms email says it was ticked, and the
  version), on the first-login password card, and on its own card
  ("Our Privacy Policy", `privacy` mode in js/auth.js) for accounts
  made before it, once, before the app opens. Kept in user metadata
  (`privacy_version`, `privacy_accepted_at`; no migration). A new
  policy version bumps `PRIVACY_VERSION` in js/auth.js and asks everyone
  again. If Supabase can't be asked, the app opens (never locked out
  over this); asked once per account, not per device (the owner
  checked). The two internal guides (answering rights requests, with
  templates and a register; security incidents, with templates and a
  register) are done, in Spanish, in a private Claude Doc, not in this
  public repo: https://claude.ai/code/artifact/971432be-eb59-4f24-9d59-8d71b3c9d22b
  (Sept. 30, 2026; Claude asked there whether to always tell affected
  users, as the policy's §7 promises, though the law only requires it
  for sensitive, under-14 or financial data). Left for the law, before
  Dec. 1, 2026: the owner's own tasks (delete resolved requests and sent welcome emails,
  check Supabase's DPA). Then SEO basics. No filing with the Agency is
  needed (art. 14 ter asks for the policy published on the site; only
  breaches are reported, art. 14 sexies; the art. 49 compliance model
  is voluntary).
- **Background textures, a setting** (the owner's request, Sept. 2026) —
  built on `claude/episode-tracking-shows-s9gixh` (restarted from
  `main` after PR #22), merged into `claude/funny-pascal-bk99gr`, and
  in `main` since Sept. 30, 2026 (PR #23), with the privacy page.
  Never use the photo of a cork board they once sent, only patterns
  drawn by code (they said so). Of the gallery mockup
  (https://claude.ai/artifact/9qvFwgMLmMBFVQmC1WKcDQ) they picked Felt,
  Linen, Film grain, Grid, Dot grid, Pegboard, Stripes and None, as a
  choice in Settings → Appearance ("Background", saved in the account's
  settings as `background`, no migration). The old three-dot speckle is
  gone; Dot grid is the default (Claude's pick, closest to it; the
  landing page and the login screen always show it, in the brand's
  ink). Line and dot patterns are CSS (css/base.css, `data-background`);
  felt, linen and grain are drawn on a canvas from a fixed seed
  (js/backgrounds.js), redrawn when the theme flips dark / light.
  The owner's addition: "Can't quite see it?" under the hint opens a
  small animated window (a spring, zooming into the texture) with the
  texture at twice its size and a pinned card for scale; its chips
  preview without saving, "Use this one" saves.
- **Lighter logo** (Sept. 30, 2026, found while reviewing SEO; the owner
  left it to Claude entirely): `img/Slate-logo.png` (1254 px, 1.7 MB) is
  now only the master, referenced nowhere. Pages use `img/logo.webp`
  (288 px, 22 KB: 3× the largest place it shows, the 86 px sidebar
  logo) and `img/favicon.png` (96 px, 17 KB), made from the master by
  halving steps on a canvas. Regenerate both if the logo changes.
- Optional ideas, not requirements:
  - reordering cards with the keyboard;
  - large-grid performance.
- The owner can't pay for services right now; keep everything on free
  tiers. On the free Supabase plan, projects pause after about a week with
  no use and there are no automatic backups. Settings → Your Data → Export
  is each user's backup.
