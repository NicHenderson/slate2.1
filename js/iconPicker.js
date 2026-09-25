/* ---------- icon picker (create / edit collection modal) ----------

   Notion-style: a preview tile that opens a panel with Emoji | Icons tabs, a
   search box and, for icons, a colour row. Picking writes the value into the
   hidden #collection-icon input (see icons.js for the value format).
   collections.js drives it through iconPickerSet(). */

const ipHidden = document.getElementById("collection-icon");
const ipError = document.getElementById("collection-error");
const ipToggle = document.getElementById("icon-current");
const ipPreview = document.getElementById("icon-preview");
const ipLabel = document.getElementById("icon-current-label");
const ipPanel = document.getElementById("icon-panel");
const ipTabs = document.getElementById("icon-tabs");
const ipSearch = document.getElementById("icon-search");
const ipColors = document.getElementById("icon-colors");
const ipGrid = document.getElementById("icon-grid");

let ipTab = "emoji"; // "emoji" | "icons"
let ipColor = DEFAULT_ICON_COLOR;
let ipSearchTimer = null;

const ipTokens = () => ipSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
const ipMatches = (words, tokens) => tokens.every((t) => words.includes(t));

function ipIsSelected(cellValue) {
  const current = ipHidden.value;
  if (!current) return false;
  if (ipTab === "icons") return current.startsWith(`icon:${cellValue}:`);
  return !current.startsWith("icon:") && stripVariation(current) === stripVariation(cellValue);
}

function ipEmptyHtml() {
  return `<p class="icon-empty">Nothing matches “<span id="icon-empty-q"></span>”.</p>`;
}

function ipEmojiHtml(tokens) {
  const groups = EMOJI_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter(([, , words]) => !tokens.length || ipMatches(words, tokens)),
  })).filter((g) => g.items.length);
  if (!groups.length) return ipEmptyHtml();
  return groups
    .map(
      (g) => `
      <p class="icon-group-label">${g.label}</p>
      <div class="icon-cells">
        ${g.items
          .map(
            ([char, file, words]) =>
              `<button type="button" class="icon-cell${ipIsSelected(char) ? " selected" : ""}" data-value="${char}" title="${words.slice(0, 40)}"><img src="img/emoji/${file}.svg" alt="${char}" loading="lazy" draggable="false" /></button>`
          )
          .join("")}
      </div>`
    )
    .join("");
}

function ipIconsHtml(tokens) {
  const groups = PH_ICON_GROUPS.map((g) => ({
    label: g.label,
    icons: g.icons.filter(
      (name) =>
        !tokens.length ||
        ipMatches(`${name.replace(/-/g, " ")} ${PH_ICON_TAGS[name] ?? ""}`, tokens)
    ),
  })).filter((g) => g.icons.length);
  if (!groups.length) return ipEmptyHtml();
  return groups
    .map(
      (g) => `
      <p class="icon-group-label">${g.label}</p>
      <div class="icon-cells">
        ${g.icons
          .map(
            (name) =>
              `<button type="button" class="icon-cell${ipIsSelected(name) ? " selected" : ""}" data-value="${name}" title="${name.replace(/-/g, " ")}"><svg class="ico ico-ph" viewBox="${PH_VIEWBOX}" aria-hidden="true">${PH_ICONS[name]}</svg></button>`
          )
          .join("")}
      </div>`
    )
    .join("");
}

function ipRenderGrid() {
  const tokens = ipTokens();
  ipGrid.innerHTML = ipTab === "icons" ? ipIconsHtml(tokens) : ipEmojiHtml(tokens);
  const q = document.getElementById("icon-empty-q");
  if (q) q.textContent = ipSearch.value.trim();
  ipGrid.scrollTop = 0;
}

function ipRenderColors() {
  ipColors.innerHTML = ICON_COLORS.map(
    (c) =>
      `<button type="button" class="icon-color${c.key === ipColor ? " selected" : ""}" data-color="${c.key}" title="${c.label}" aria-label="${c.label}" style="--swatch: ${c.hex}"></button>`
  ).join("");
  ipGrid.style.setProperty("--pick-color", ICON_COLOR_HEX[ipColor]);
}

function ipShowTab(tab) {
  ipTab = tab;
  ipTabs.querySelectorAll("[data-itab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.itab === tab);
  });
  ipColors.classList.toggle("hidden", tab !== "icons");
  ipSearch.placeholder = tab === "icons" ? "Search icons…" : "Search emoji…";
  ipRenderGrid();
}

function ipSetValue(value) {
  ipHidden.value = value;
  const has = Boolean(value);
  ipPreview.innerHTML = has ? iconHtml(value) : `<span class="icon-preview-empty" aria-hidden="true">+</span>`;
  ipLabel.textContent = has ? "Change icon" : "Choose an icon";
  ipGrid.querySelectorAll(".icon-cell").forEach((cell) => {
    cell.classList.toggle("selected", ipIsSelected(cell.dataset.value));
  });
}

function ipSetOpen(open) {
  ipPanel.classList.toggle("hidden", !open);
  ipToggle.setAttribute("aria-expanded", String(open));
  if (open) ipSearch.focus({ preventScroll: true });
}

// Called by collections.js when the modal opens: sets the current value, jumps
// to the matching tab / colour, clears the search and opens or folds the panel.
function iconPickerSet(value, open) {
  const parsed = parseIcon(value);
  if (parsed?.kind === "icon") ipColor = parsed.color;
  ipSearch.value = "";
  ipRenderColors();
  ipShowTab(parsed?.kind === "icon" ? "icons" : "emoji");
  ipSetValue(value || "");
  ipSetOpen(open);
}

ipToggle.addEventListener("click", () => ipSetOpen(ipPanel.classList.contains("hidden")));

ipTabs.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-itab]");
  if (tab && tab.dataset.itab !== ipTab) ipShowTab(tab.dataset.itab);
});

ipSearch.addEventListener("input", () => {
  clearTimeout(ipSearchTimer);
  ipSearchTimer = setTimeout(ipRenderGrid, 80);
});

// Enter in the search box would submit the whole collection form.
ipSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault();
});

ipColors.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-color]");
  if (!btn) return;
  ipColor = btn.dataset.color;
  ipRenderColors();
  // A colour change re-tints an already chosen icon; emoji keep their own colours.
  const parsed = parseIcon(ipHidden.value);
  if (parsed?.kind === "icon") ipSetValue(encodeIcon(parsed.name, ipColor));
});

ipGrid.addEventListener("click", (e) => {
  const cell = e.target.closest(".icon-cell");
  if (!cell) return;
  ipSetValue(ipTab === "icons" ? encodeIcon(cell.dataset.value, ipColor) : cell.dataset.value);
  ipError.classList.add("hidden");
});
