// Cache stamps (scripts/stamp.js): a CSS or JS file changed without
// restamping index.html would reach browsers holding its old copy. Plain
// file checks — no page needed.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { references, stale } = require("../scripts/stamp");
const { pinned, tagFor, currentTag } = require("../scripts/supabase-js");

test("every stylesheet and script in index.html carries the stamp of its current contents", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  expect(references(html).length).toBeGreaterThan(40);
  const wrong = stale(html).map((r) => `${r.file}: ?v=${r.current ?? "(none)"}, should be ?v=${r.expected} — run npm run stamp`);
  expect(wrong).toEqual([]);
});

// scripts/supabase-js.js: the app loads the very supabase-js the tests run
// against (package.json), and the browser checks it's that exact file.
test("index.html loads package.json's supabase-js, with that file's integrity hash", () => {
  expect(pinned().version).toMatch(/^\d+\.\d+\.\d+$/); // exact, never a range
  expect(currentTag(), "run npm run update-supabase -- <version>").toBe(tagFor(pinned()));
});

// The image chat apps and search engines show for a link to Slate: an
// absolute address (they don't resolve relative ones) to a file that's
// really there, so a rename can't leave every shared link imageless.
test("the pages' link preview image is an absolute address to a real file", () => {
  for (const page of ["index.html", "privacy.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(image, page).toMatch(/^https:\/\/myslate\.pages\.dev\/img\/[\w.-]+$/);
    expect(fs.existsSync(path.join(__dirname, "..", new URL(image).pathname)), `${page}: ${image}`).toBe(true);
  }
});
