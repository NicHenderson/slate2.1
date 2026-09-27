// Languages (js/i18n.js), for the tests: Slate's strings as the app finds
// them, and a made-up language that shows what escapes translation.
//
// The strings are collected the way the app finds them: index.html's by
// the same walk that translates it (walkStatic), the scripts' from their
// t("…") and tn(n, "…", "…") calls.
const fs = require("fs");
const path = require("path");
const JS_DIR = path.join(__dirname, "..", "..", "js");
// A string literal, in double or single quotes, read as JavaScript reads it.
const STRING = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;
const unquote = (literal) => new Function(`return ${literal};`)();

// Every t() and tn() in the scripts (js/lang holds the dictionaries).
function scriptStrings() {
  const strings = new Set();
  const plurals = new Set();
  const unreadable = [];
  for (const file of fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js") && f !== "i18n.js")) {
    const src = fs.readFileSync(path.join(JS_DIR, file), "utf8");
    for (const [, s] of src.matchAll(new RegExp(String.raw`\bt\(\s*${STRING}`, "g"))) strings.add(unquote(s));
    for (const [, one, other] of src.matchAll(new RegExp(String.raw`\btn\((?:[^"'()]|\([^()]*\))*?,\s*${STRING},\s*${STRING}`, "g"))) {
      plurals.add(`${unquote(one)}|${unquote(other)}`);
    }
    // A string that isn't written out can't be collected, or translated.
    const calls = [...src.matchAll(/\bt\(/g)].length;
    const literal = [...src.matchAll(/\bt\(\s*["']/g)].length;
    const pluralCalls = [...src.matchAll(/\btn\(/g)].length;
    const pluralLiteral = [...src.matchAll(new RegExp(String.raw`\btn\((?:[^"'()]|\([^()]*\))*?,\s*${STRING},\s*${STRING}`, "g"))].length;
    if (calls !== literal || pluralCalls !== pluralLiteral) unreadable.push(file);
  }
  return { strings, plurals, unreadable };
}

// index.html's strings, from the file as it is on disk (not the live page,
// which scripts have added to).
async function pageStrings(page) {
  await page.goto("/");
  return page.evaluate(async () => {
    const html = await (await fetch("/index.html")).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const keys = new Set();
    walkStatic(doc.documentElement, (kind, key) => keys.add(key));
    return [...keys];
  });
}

async function allStrings(page) {
  const { strings, plurals, unreadable } = scriptStrings();
  (await pageStrings(page)).forEach((key) => strings.add(key));
  return { strings, plurals, unreadable };
}

/* ---------- nothing on screen escapes translation ---------- */

// A made-up language that wraps every string in ⟦ ⟧: whatever shows up
// without them wasn't translated.
async function usePseudoLanguage(page) {
  const { strings, plurals } = await allStrings(page);
  const dict = {};
  strings.forEach((s) => (dict[s] = `⟦${s}⟧`));
  plurals.forEach((key) => {
    const [one, other] = key.split("|");
    dict[key] = { one: `⟦${one}⟧`, other: `⟦${other}⟧` };
  });
  await page.addInitScript((strings) => {
    window.SLATE_LANGUAGES = { xx: { name: "Pseudo", locale: "en-US", strings } };
    try {
      localStorage.setItem("slate_language", "xx");
    } catch {} // about:blank has no storage
  }, dict);
  // Away and back, so whatever loads next loads with it (a jump to "#login"
  // alone wouldn't reload the page).
  await page.goto("about:blank");
}

// Visible text (and labels) with words, outside every ⟦ ⟧ (which nest: a
// translated count inside a translated sentence). `data` is what comes
// from the library itself: titles, genres, names.
async function untranslated(page, data = []) {
  return page.evaluate((data) => {
    const found = new Set();
    const skip = (el) => !el || el.closest('[translate="no"], script, style') || !el.checkVisibility({ visibilityProperty: true });
    // How many ⟦ are open where `node` starts, counted from far enough up.
    const depthBefore = (node) => {
      let top = node.parentElement;
      for (let i = 0; i < 8 && top.parentElement && top !== document.body; i++) top = top.parentElement;
      const walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
      let depth = 0;
      while (walker.nextNode() && walker.currentNode !== node) {
        for (const ch of walker.currentNode.nodeValue) depth += ch === "⟦" ? 1 : ch === "⟧" ? -1 : 0;
      }
      return Math.max(0, depth);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue.replace(/\s+/g, " ").trim();
      if (!/\p{L}/u.test(text) || skip(node.parentElement) || data.includes(text)) continue;
      let depth = depthBefore(node);
      let outside = "";
      for (const ch of node.nodeValue) {
        if (ch === "⟦") depth++;
        else if (ch === "⟧") depth--;
        else if (depth <= 0) outside += ch;
      }
      // A lone letter ("A" to "Z" in the sort menu) reads the same anywhere.
      if (/\p{L}.*\p{L}/su.test(outside)) found.add(text);
    }
    document.body.querySelectorAll("[placeholder], [aria-label], [title]").forEach((el) => {
      if (skip(el)) return;
      ["placeholder", "aria-label", "title"].forEach((attr) => {
        const value = el.getAttribute(attr);
        if (value && /\p{L}/u.test(value) && !value.includes("⟦") && !data.includes(value)) found.add(`@${attr}: ${value}`);
      });
    });
    return [...found];
  }, data);
}

module.exports = { allStrings, usePseudoLanguage, untranslated };
