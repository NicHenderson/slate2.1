// Cache stamps (scripts/stamp.js): a CSS or JS file changed without
// restamping index.html would reach browsers holding its old copy. Plain
// file checks — no page needed.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { references, stale } = require("../scripts/stamp");

test("every stylesheet and script in index.html carries the stamp of its current contents", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  expect(references(html).length).toBeGreaterThan(40);
  const wrong = stale(html).map((r) => `${r.file}: ?v=${r.current ?? "(none)"}, should be ?v=${r.expected} — run npm run stamp`);
  expect(wrong).toEqual([]);
});
