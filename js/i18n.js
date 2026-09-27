/* ---------- Languages ----------

   Slate is written in English. Every other language is a dictionary from
   each English string to its translation (js/lang/<code>.js), loaded
   before this file; a string a dictionary lacks stays in English.

   Text gets translated in two ways:
   - index.html, once, as the page loads (translateStatic, below, before
     any other script runs): every text node, and the placeholder,
     aria-label, title and alt attributes. An element with data-i18n is
     translated as a whole, its HTML the key: for a sentence with markup
     inside (a link, a <strong>), which read as pieces would be translated
     out of order. translate="no" leaves an element alone (the made-up
     titles on the landing page, the name Slate).
   - The scripts, with t("English text", { name: value }) and
     tn(count, "{n} movie", "{n} movies"). Placeholders are {name}; {n} is
     the count. The values go in as they are given: anything a user typed
     still goes through escapeHtml when the result ends up in HTML.

   The language is picked once, when the page loads: the one chosen on
   this device, else the first of the browser's languages Slate has, else
   English. Choosing another reloads the page, so nothing that's already
   drawn needs drawing again. */

const SLATE_LANGUAGES = {
  en: { name: "English", locale: "en-US", strings: {} },
  ...(window.SLATE_LANGUAGES ?? {}),
};

const LANGUAGE_KEY = "slate_language";

function pickLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && SLATE_LANGUAGES[saved]) return saved;
  } catch {}
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = String(tag ?? "").toLowerCase().split("-")[0];
    if (SLATE_LANGUAGES[code]) return code;
  }
  return "en";
}

const LANGUAGE = pickLanguage();
// The locale dates and numbers are written in ("Sep 27, 2026").
const LOCALE = SLATE_LANGUAGES[LANGUAGE].locale;
const STRINGS = SLATE_LANGUAGES[LANGUAGE].strings;
const PLURALS = new Intl.PluralRules(LOCALE);
document.documentElement.lang = LANGUAGE;

function setLanguage(code) {
  if (!SLATE_LANGUAGES[code] || code === LANGUAGE) return;
  try {
    localStorage.setItem(LANGUAGE_KEY, code);
  } catch {}
  location.reload();
}

// A number with a set count of decimals, as the language writes it: "7.8"
// in English, "7,8" in Spanish.
function formatDecimal(value, digits = 1) {
  return Number(value).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fillIn(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;
}

function t(text, vars) {
  const translated = STRINGS[text];
  return fillIn(typeof translated === "string" ? translated : text, vars);
}

// A dictionary has one entry per pair, "{n} movie|{n} movies", holding a
// form for each plural category its language uses ({ one, other }, and
// { many } where there is one).
function tn(count, one, other, vars) {
  const forms = STRINGS[`${one}|${other}`];
  const text = forms && typeof forms === "object" ? (forms[PLURALS.select(count)] ?? forms.other) : count === 1 ? one : other;
  return fillIn(text, { n: count, ...vars });
}

/* ---------- index.html ---------- */

const TRANSLATED_ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "svg", "TEMPLATE", "NOSCRIPT"]);

// Only what has a letter in it: stars, "9/10" and "✕" stay as they are.
const hasWords = (text) => /\p{L}/u.test(text);
const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

// Calls visit(kind, key, apply) for everything translatable in `root`:
// the same walk lists the strings (tests/i18n.spec.js) and translates
// them. `apply(translated)` puts a translation in place.
function walkStatic(root, visit) {
  const walk = (el) => {
    if (SKIPPED_TAGS.has(el.tagName) || el.getAttribute("translate") === "no") return;
    TRANSLATED_ATTRIBUTES.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value && hasWords(value)) visit("attr", normalizeText(value), (text) => el.setAttribute(attr, text));
    });
    if (el.tagName === "META" && /^(description|og:title|og:description)$/.test(el.getAttribute("name") ?? el.getAttribute("property") ?? "")) {
      visit("attr", normalizeText(el.content), (text) => (el.content = text));
    }
    if (el.hasAttribute("data-i18n")) {
      visit("html", normalizeText(el.innerHTML), (html) => (el.innerHTML = html));
      return;
    }
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) walk(node);
      else if (node.nodeType === Node.TEXT_NODE && hasWords(node.nodeValue)) {
        // The spaces around it stay: they separate it from its neighbours.
        const [, before, , after] = node.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
        visit("text", normalizeText(node.nodeValue), (text) => (node.nodeValue = before + text + after));
      }
    });
  };
  walk(root);
}

function translateStatic() {
  if (LANGUAGE === "en") return;
  walkStatic(document.documentElement, (kind, key, apply) => {
    const translated = STRINGS[key];
    if (typeof translated === "string") apply(translated);
  });
}

translateStatic();

/* ---------- the pickers ----------

   One on the landing page, one under the login card and one in Settings:
   every language, each by its own name. The choice is this device's. */

function initLanguagePickers() {
  document.querySelectorAll("[data-language-picker]").forEach((select) => {
    select.innerHTML = Object.entries(SLATE_LANGUAGES)
      .map(([code, lang]) => `<option value="${code}" lang="${code}">${lang.name}</option>`)
      .join("");
    select.value = LANGUAGE;
    if (!select.labels?.length) select.setAttribute("aria-label", t("Language"));
    select.addEventListener("change", () => setLanguage(select.value));
  });
}

initLanguagePickers();
