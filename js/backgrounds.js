/* ---------- The board's background texture ----------

   Picked in Settings → Appearance (js/settings.js saves it as
   `background`). The line and dot patterns are plain CSS (css/base.css,
   `data-background` on the root); felt, linen and film grain are noise,
   drawn here once on a canvas and handed to the CSS as an image through
   --board-texture. Nothing is a photo: every tile is generated from a
   fixed seed, so it looks the same on every load and repeats without seams.

   Each texture is drawn in the theme's own color: dark themes carry it
   mostly in shadows, light ones mostly in highlights (a white speck
   barely shows on cream, a black one shouts on it). */

const BACKGROUNDS = ["felt", "linen", "grain", "grid", "dots", "pegboard", "stripes", "none"];
const BACKGROUND_LABELS = {
  felt: t("Felt"),
  linen: t("Linen"),
  grain: t("Film grain"),
  grid: t("Grid"),
  dots: t("Dot grid"),
  pegboard: t("Pegboard"),
  stripes: t("Stripes"),
  none: t("None"),
};

// Tile size in CSS pixels, and how much of the light / dark marks show.
const NOISE_TEXTURES = {
  felt: { tile: 240, gain: [1, 0.9] },
  linen: { tile: 160, gain: [0.9, 0.9] },
  grain: { tile: 240, gain: [0.8, 0.8] },
};

// Drawn at twice the size on sharp screens, so the grain isn't blurred.
const TEXTURE_SCALE = Math.min(2, Math.ceil(window.devicePixelRatio || 1));

function textureRng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Each maker returns a height map: light marks above 0, dark below.
   Strokes are drawn at the tile's wrapped copies too, so one crossing an
   edge comes back on the other side. */

function greyTextureCanvas(n) {
  const canvas = Object.assign(document.createElement("canvas"), { width: n, height: n });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, n, n);
  return [canvas, ctx];
}

function canvasHeights(canvas) {
  const n = canvas.width;
  const px = canvas.getContext("2d").getImageData(0, 0, n, n).data;
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = (px[i * 4] - 128) / 127;
  return h;
}

function drawWrapped(ctx, n, draw) {
  for (const dx of [-n, 0, n]) {
    for (const dy of [-n, 0, n]) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
  }
}

const TEXTURE_MAKERS = {
  // Short curved fibers, light and dark, every which way.
  felt(n, s) {
    const [canvas, ctx] = greyTextureCanvas(n);
    const r = textureRng(11);
    ctx.lineCap = "round";
    for (let i = 0; i < 5200; i++) {
      const sx = r() * n, sy = r() * n, len = (3 + r() * 10) * s, a = r() * Math.PI * 2, bend = (r() - 0.5) * len;
      const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
      ctx.strokeStyle = r() > 0.45 ? `rgba(255,255,255,${0.25 + r() * 0.35})` : `rgba(0,0,0,${0.25 + r() * 0.35})`;
      ctx.lineWidth = (0.4 + r() * 0.5) * s;
      const cx = (sx + ex) / 2 + bend * Math.sin(a), cy = (sy + ey) / 2 - bend * Math.cos(a);
      drawWrapped(ctx, n, () => {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.stroke();
      });
    }
    return canvasHeights(canvas);
  },
  // Threads across and down, each a touch lighter or darker.
  linen(n, s) {
    const [canvas, ctx] = greyTextureCanvas(n);
    const r = textureRng(31), step = 2 * s;
    for (let p = 0; p < n; p += step) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${r() * 0.28})` : `rgba(0,0,0,${r() * 0.28})`;
      ctx.fillRect(0, p, n, step / 2);
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${r() * 0.28})` : `rgba(0,0,0,${r() * 0.28})`;
      ctx.fillRect(p, 0, step / 2, n);
    }
    const h = canvasHeights(canvas);
    for (let i = 0; i < h.length; i++) h[i] += (r() * 2 - 1) * 0.15;
    return h;
  },
  // A film's grain, with a few broken scratches running down it.
  grain(n) {
    const r = textureRng(53), h = new Float32Array(n * n);
    for (let i = 0; i < h.length; i++) h[i] = (r() + r() + r() - 1.5) * 0.9;
    for (let k = 0; k < 3; k++) {
      const col = Math.floor(r() * n), a = 0.4 + r() * 0.5, sign = r() > 0.5 ? 1 : -1;
      for (let y = 0; y < n; y++) if (r() > 0.15) h[y * n + col] += sign * a;
    }
    return h;
  },
};

const textureHeights = {};
const textureUrls = {};

function isDarkTheme(themeKey) {
  const hex = (THEME_META[themeKey] || THEME_META.midnight).bg.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

// The tile's image for this texture in a dark or light theme, drawn
// the first time it's asked for and kept for the rest of the visit.
function noiseTextureUrl(key, dark) {
  const id = `${key}-${dark ? "dark" : "light"}`;
  if (textureUrls[id]) return textureUrls[id];
  const { tile, gain } = NOISE_TEXTURES[key];
  const n = tile * TEXTURE_SCALE;
  textureHeights[key] ??= TEXTURE_MAKERS[key](n, TEXTURE_SCALE);
  const h = textureHeights[key];
  const kL = (dark ? 0.1 : 0.6) * gain[0];
  const kD = (dark ? 0.5 : 0.16) * gain[1];
  const shade = dark ? [0, 0, 0] : [45, 35, 25];
  const canvas = Object.assign(document.createElement("canvas"), { width: n, height: n });
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(n, n);
  const px = img.data;
  for (let i = 0; i < n * n; i++) {
    const v = h[i];
    if (v > 0) {
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
      px[i * 4 + 3] = Math.min(255, v * kL * 255);
    } else {
      [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]] = shade;
      px[i * 4 + 3] = Math.min(255, -v * kD * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  // A data URL, not a blob: it's ready the moment it's made, so the
  // texture never shows up a beat after the page.
  textureUrls[id] = canvas.toDataURL("image/png");
  return textureUrls[id];
}

// Sets (or clears) the noise tile on an element, for the board itself or
// a swatch in Settings. The line and dot patterns need nothing here.
function paintNoiseTexture(el, key, themeKey) {
  if (NOISE_TEXTURES[key]) {
    el.style.setProperty("--board-texture", `url("${noiseTextureUrl(key, isDarkTheme(themeKey))}")`);
    el.style.setProperty("--board-texture-size", `${NOISE_TEXTURES[key].tile}px ${NOISE_TEXTURES[key].tile}px`);
  } else {
    el.style.removeProperty("--board-texture");
    el.style.removeProperty("--board-texture-size");
  }
}

function applyBackground(key, themeKey) {
  document.documentElement.setAttribute("data-background", key);
  paintNoiseTexture(document.documentElement, key, themeKey);
}
