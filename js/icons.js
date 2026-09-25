/* ---------- collection icons ----------

   A collection's `icon` is stored as plain text, in one of two shapes:

     "🎬"                an emoji, drawn with the OpenMoji artwork
     "icon:ghost:pink"   a Phosphor duotone icon + a colour key

   Old rows only ever held emoji, so nothing needs migrating. Anything that
   shows a collection's icon goes through iconHtml() so it looks the same on
   every device (system emoji fonts differ a lot from phone to phone).
   Data: js/emojiData.js (EMOJI_GROUPS) and js/iconData.js (PH_ICONS). */

const ICON_COLORS = [
  { key: "violet", hex: "#6d28d9", label: "Violet" },
  { key: "pink", hex: "#db2777", label: "Pink" },
  { key: "red", hex: "#dc2626", label: "Red" },
  { key: "orange", hex: "#ea580c", label: "Orange" },
  { key: "amber", hex: "#d97706", label: "Amber" },
  { key: "green", hex: "#16a34a", label: "Green" },
  { key: "teal", hex: "#0d9488", label: "Teal" },
  { key: "blue", hex: "#2563eb", label: "Blue" },
  { key: "slate", hex: "#4b5563", label: "Slate" },
];
const ICON_COLOR_HEX = Object.fromEntries(ICON_COLORS.map((c) => [c.key, c.hex]));
const DEFAULT_ICON_COLOR = "violet";

// Variation selector-16 comes and goes depending on where an emoji was typed
// (❤ vs ❤️), so lookups ignore it.
const stripVariation = (s) => s.replace(/️/g, "");

const EMOJI_FILE = new Map();
EMOJI_GROUPS.forEach((group) =>
  group.items.forEach(([char, file]) => EMOJI_FILE.set(stripVariation(char), file))
);

function encodeIcon(name, color) {
  return `icon:${name}:${color}`;
}

function parseIcon(value) {
  if (!value) return null;
  if (value.startsWith("icon:")) {
    const [, name, color] = value.split(":");
    if (!PH_ICONS[name]) return null;
    return { kind: "icon", name, color: ICON_COLOR_HEX[color] ? color : DEFAULT_ICON_COLOR };
  }
  return { kind: "emoji", char: value };
}

// HTML for an icon at 1em x 1em, so it scales with the font size around it.
function iconHtml(value) {
  const icon = parseIcon(value);
  if (!icon) return "";
  if (icon.kind === "icon") {
    return `<svg class="ico ico-ph" viewBox="${PH_VIEWBOX}" style="color: ${ICON_COLOR_HEX[icon.color]}" aria-hidden="true">${PH_ICONS[icon.name]}</svg>`;
  }
  const file = EMOJI_FILE.get(stripVariation(icon.char));
  return file
    ? `<img class="ico ico-emoji" src="img/emoji/${file}.svg" alt="${icon.char}" draggable="false" />`
    : `<span class="ico ico-native" aria-hidden="true">${icon.char}</span>`; // not in the OpenMoji set: system emoji
}
