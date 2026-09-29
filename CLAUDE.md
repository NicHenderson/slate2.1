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
  posters escaped as text, and the search's info window in the detail
  window's design (with its trailer).
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
- **Next: episode tracking for shows being watched** (the owner's idea;
  nothing built yet, each stage with their go-ahead). An older Slate had
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
  date!" (stage 5 adds the next air date and the finale). Until stage 9,
  a `.slate` backup doesn't carry episodes, and Replace loses them.
  `tests/episodes.spec.js` covers it (plus Spanish's generic line).
  The owner's one note: the note jumped from a thin strip when it
  loaded. Now it loads at about its final size (150px, 250px on a
  phone, with an empty photo frame) and eases the rest, fading in.
  Stage 5 — built, waiting for the owner's check on the preview: "You're
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
- **Then: Slate that feels like a phone app** (the owner's request),
  on its own branch, `claude/mobile-app`, which goes straight to `main`
  when done; `claude/funny-pascal-bk99gr` stays for small fixes meanwhile.
  Phone-only changes; the computer layout stays as it is. Claude reviewed
  every screen at phone size and proposed stages (installable app, bottom
  tab bar and compact headers, windows as bottom sheets, full-screen
  search and touch polish); none is built until the owner says so.
- **The test scenario** the owner follows to hunt bugs (PC first, then
  the phone): https://claude.ai/artifact/WV8WgTtnTG5LsviRT4amDm. It runs
  with a throwaway account (`+slate1` / `+slate2` Gmail aliases), never a
  real one. Each step is marked ok / bug / odd with a note, saved in the
  page's database: read them with ArtifactData, collection `results`,
  documents `<pc|phone>__<step id>`.
- Optional ideas, not requirements:
  - reordering cards with the keyboard;
  - a privacy policy page;
  - large-grid performance.
- The owner can't pay for services right now; keep everything on free
  tiers. On the free Supabase plan, projects pause after about a week with
  no use and there are no automatic backups. Settings → Your Data → Export
  is each user's backup.
