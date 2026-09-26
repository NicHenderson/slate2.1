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

- **Talk to them in Spanish. Everything in the app stays in English**:
  UI copy, emails, code, comments, commit messages and docs.
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

- Migrations `0001`–`0006` in `supabase/migrations/` have all been applied
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
  tool, the review note redesign, and the trailer button that waits,
  disabled.
- **Next: publish on Cloudflare Pages** (free, chosen over Netlify and
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
- After that, the owner wants the app translated into Spanish, German and
  Italian (besides English), in a new session.
- Optional ideas, not requirements:
  - reordering cards with the keyboard;
  - a privacy policy page;
  - large-grid performance.
- The owner can't pay for services right now; keep everything on free
  tiers. On the free Supabase plan, projects pause after about a week with
  no use and there are no automatic backups. Settings → Your Data → Export
  is each user's backup.
