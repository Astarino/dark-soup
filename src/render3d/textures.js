import { TAU, clamp, hash2, mulberry32 } from "../shared/math.js";
import { mk, rgb, ramp, dith } from "../render/pixels.js";
// Процедурные пиксельные текстуры окружения. Палитры те же, что у спрайтов вида
// сверху (кора, крона, камни), поэтому оба вида выглядят частью одной игры.
// Все текстуры рисуются один раз; сцена берёт их из кэша.

export const RAMPS = {
  oak: ["#0b150c", "#122016", "#1a2e1c", "#243e22", "#31522b", "#41672f"],
  pine: ["#08120f", "#0e1d18", "#152a21", "#1e3a2b", "#2a4c37"],
  bark: ["#170f08", "#2a1c10", "#3e2a18", "#553b22"],
  rock: ["#1e1d1a", "#34322d", "#4b4841", "#66625a", "#827d72"],
  moss: ["#1a2812", "#243a18", "#31501f", "#41672a"],
  wood: ["#2a1a0e", "#4a2e18", "#6e4624", "#8e5e32"],
  canvas: ["#3e2a14", "#5a3e1e", "#7a5a2e", "#9a7844", "#b8945a"],
  ring: ["#5e4426", "#7e5c36", "#9a7448", "#b8905a", "#c8a06a"],
};

function paint(w, h, fn) {
  const c = mk(w, h),
    g = c.getContext("2d"),
    im = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      if (!col) continue;
      const [r, gg, b] = rgb(col),
        o = (y * w + x) * 4;
      im.data[o] = r;
      im.data[o + 1] = gg;
      im.data[o + 2] = b;
      im.data[o + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  return c;
}
const wrap = (a, p) => ((a % p) + p) % p;
// Шум, тайлящийся по периоду (px, py) клеток решётки.
function tnoise(x, y, px, py, seed) {
  const i = Math.floor(x),
    j = Math.floor(y),
    fx = x - i,
    fy = y - j,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash2(wrap(a, px), wrap(b, py), seed);
  const a = h(i, j),
    b = h(i + 1, j),
    c = h(i, j + 1),
    d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Клеточный узор: расстояние до ближайшей точки на тайлящейся решётке.
function worley(x, y, cells, seed) {
  const cx = Math.floor(x * cells),
    cy = Math.floor(y * cells);
  let best = 9,
    id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i,
        gy = cy + j,
        wx = wrap(gx, cells),
        wy = wrap(gy, cells),
        px = gx + hash2(wx, wy, seed),
        py = gy + hash2(wx, wy, seed + 1),
        d = Math.hypot(x * cells - px, y * cells - py);
      if (d < best) {
        best = d;
        id = hash2(wx, wy, seed + 2);
      }
    }
  return { d: best, id };
}

function barkTexture_(seed = 1, moss = 0) {
  return paint(64, 64, (x, y) => {
    const n = tnoise(x / 8, y / 32, 8, 2, seed),
      ridge = 0.5 + 0.5 * Math.sin(TAU * (x / 64) * 5 + n * 5),
      crack = tnoise(x / 4, y / 6, 16, 11, seed + 3),
      knot = tnoise(x / 14, y / 14, 4, 4, seed + 5) > 0.82 ? -0.25 : 0;
    let v = 0.25 + ridge * 0.55 + (crack - 0.5) * 0.25 + knot;
    // мох на «северной» стороне и у корней
    const m = moss * (tnoise(x / 6, y / 6, 10, 10, seed + 9) + (1 - y / 64) * 0.25);
    if (m > 0.62) return ramp(RAMPS.moss, 0.25 + (m - 0.62) * 2.2, x, y);
    return ramp(RAMPS.bark, v, x, y);
  });
}
// Крона дуба/куста: ячейки-«пучки» листвы, подсвеченные сверху.
function leafTexture_(seed = 2, palette = RAMPS.oak, cells = 7) {
  return paint(64, 64, (x, y) => {
    const u = x / 64,
      v = y / 64,
      w = worley(u, v, cells, seed),
      inner = clamp(1 - w.d * 0.95, 0, 1);
    let l = 0.12 + inner * 0.62 + (w.id - 0.5) * 0.22;
    if (hash2(x, y, seed + 7) < 0.07) l -= 0.3; // тёмные просветы
    if (hash2(x, y, seed + 8) < 0.05) l += 0.28; // блики листьев
    return ramp(palette, l, x, y);
  });
}
// Хвоя: короткие косые штрихи, ряды свисающих лап.
function needleTexture_(seed = 3) {
  return paint(64, 64, (x, y) => {
    const row = Math.floor(y / 8),
      shift = hash2(row, 0, seed) * 8,
      stroke = wrap(x + y * 1.4 + shift, 8) < 2.4,
      edge = wrap(y, 8) / 8,
      n = tnoise(x / 6, y / 6, 11, 11, seed);
    let l = 0.28 + n * 0.32 + (stroke ? 0.22 : 0) - edge * 0.16;
    if (hash2(x, y, seed + 4) < 0.06) l += 0.25;
    return ramp(RAMPS.pine, l, x, y);
  });
}
function rockTexture_(seed = 4, moss = 0.35) {
  return paint(64, 64, (x, y) => {
    const n = tnoise(x / 6, y / 6, 11, 11, seed),
      n2 = tnoise(x / 2.4, y / 2.4, 27, 27, seed + 1),
      crack = Math.abs(tnoise(x / 9, y / 5, 7, 13, seed + 2) - 0.5) < 0.035 ? -0.35 : 0;
    let v = 0.3 + n * 0.4 + (n2 - 0.5) * 0.28 + crack;
    const m = moss * tnoise(x / 8, y / 8, 8, 8, seed + 6);
    if (m > 0.2 && n > 0.5) return ramp(RAMPS.moss, 0.2 + m * 1.6, x, y);
    return ramp(RAMPS.rock, v, x, y);
  });
}
// Спил бревна/пня: годовые кольца от центра (диск раскладывается на весь квадрат).
function ringTexture_(seed = 5) {
  return paint(48, 48, (x, y) => {
    const dx = (x + 0.5) / 48 - 0.5,
      dy = (y + 0.5) / 48 - 0.5,
      d = Math.hypot(dx, dy) * 2,
      wob = tnoise(Math.atan2(dy, dx) * 2 + 8, d * 3, 16, 8, seed) * 0.07;
    if (d > 0.985) return RAMPS.bark[1];
    if (d > 0.9) return RAMPS.bark[2];
    const ringV = 0.5 + 0.5 * Math.sin((d + wob) * 30);
    if (d < 0.07) return "#5a4024";
    return ramp(RAMPS.ring, 0.25 + ringV * 0.6 - d * 0.2 + (hash2(x, y, seed) - 0.5) * 0.12, x, y);
  });
}
function canvasTexture_(seed = 6, dark = false) {
  return paint(64, 64, (x, y) => {
    const weave = ((x >> 1) + (y >> 1)) % 2 ? 0.05 : -0.05,
      seam = wrap(y, 21) < 1 ? -0.3 : 0,
      n = tnoise(x / 10, y / 10, 6, 6, seed),
      patch = worley(x / 64, y / 64, 2, seed).d < 0.16 ? 0.1 : 0,
      stitch = wrap(y, 21) === 2 && x % 3 === 0 ? -0.18 : 0;
    const v = 0.5 + weave + seam + (n - 0.5) * 0.5 + patch + stitch - (dark ? 0.35 : 0);
    return ramp(RAMPS.canvas, v, x, y);
  });
}
function plankTexture_(seed = 7) {
  return paint(32, 32, (x, y) => {
    const plank = Math.floor(y / 8),
      edge = y % 8 === 7 ? -0.5 : y % 8 === 0 ? 0.12 : 0,
      grain = tnoise(x / 9 + plank * 3, y / 2.5, 4, 13, seed),
      nail = (x === 2 || x === 29) && y % 8 === 3 ? -0.4 : 0;
    return ramp(RAMPS.wood, 0.45 + (grain - 0.5) * 0.55 + edge + nail + (plank % 2) * 0.08, x, y);
  });
}
// Небо: ночной градиент со звёздами; линия горизонта сливается с туманом.
function skyTexture_() {
  const w = 1024,
    h = 512,
    R = mulberry32(77);
  const c = paint(w, h, (x, y) => {
    if (y >= h / 2) return "#0b1211"; // ниже горизонта — цвет тумана
    const t = y / (h / 2); // 0 — зенит, 1 — горизонт
    // к горизонту небо сходится к цвету тумана (#0b1211), без видимого шва
    const k = Math.pow(t, 1.6),
      r = 0.03 + (0.043 - 0.03) * k,
      g = 0.055 + (0.07 - 0.055) * k,
      b = 0.12 + (0.067 - 0.12) * k;
    const q = (v, i) => Math.round(clamp(v + (dith(x, y) - 0.5) * 0.02, 0, 1) * 255 + i * 0);
    return "#" + [r, g, b].map((v) => q(v, 0).toString(16).padStart(2, "0")).join("");
  });
  const g = c.getContext("2d");
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(R() * w),
      y = Math.floor(R() * h * 0.42),
      bright = R();
    g.fillStyle = bright > 0.8 ? "#f4f0dc" : bright > 0.4 ? "#a8b4c8" : "#5a6478";
    g.fillRect(x, y, 1, 1);
  }
  // луна: бледный диск с несколькими кратерами (тот же источник света, что и у моделей)
  const mx = 380,
    my = 110,
    mr = 15;
  for (let y = -mr; y <= mr; y++)
    for (let x = -mr; x <= mr; x++) {
      const d = Math.hypot(x, y);
      if (d > mr) continue;
      const crater = Math.hypot(x + 5, y - 4) < 4 || Math.hypot(x - 6, y + 3) < 3 || Math.hypot(x - 2, y - 8) < 2.4;
      g.fillStyle = d > mr - 1.3 ? "#8a98b0" : crater ? "#8492aa" : x - y < -4 ? "#d8e0ee" : "#b8c4d8";
      g.fillRect(mx + x, my + y, 1, 1);
    }
  return c;
}
// Кадры пламени для костра и горящих врагов: 4 кадра 16×24, белое ядро → красные кончики.
function flameSheet_() {
  const w = 16,
    h = 24,
    frames = 4,
    R = mulberry32(31);
  const c = mk(w * frames, h),
    g = c.getContext("2d");
  const cols = ["#fff4c0", "#ffd24a", "#ff9a24", "#e0521a", "#8a2410"];
  for (let f = 0; f < frames; f++) {
    for (let t = 0; t < 3; t++) {
      const cx = 8 + (t - 1) * 3.2 + Math.sin(f * 1.7 + t) * 1.2,
        top = 3 + (t === 1 ? 0 : 5) + Math.floor(R() * 4),
        hgt = h - 1 - top;
      for (let y = 0; y < hgt; y++) {
        const k = y / hgt, // 0 — кончик, 1 — основание
          hw = Math.max(0.6, Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.5) * (t === 1 ? 4.6 : 3.2)),
          sway = Math.sin(f * 1.6 + y * 0.35 + t * 2) * (1 - k) * 1.6;
        const ci = Math.min(cols.length - 1, Math.floor((1 - k) * (t === 1 ? 4.6 : 4.1)));
        for (let x = Math.floor(cx + sway - hw); x <= Math.ceil(cx + sway + hw); x++) {
          if (k < 0.25 && (x + y + f) % 2) continue; // рваные кончики
          g.fillStyle = cols[Math.min(cols.length - 1, Math.max(0, ci))];
          g.fillRect(f * w + x, top + y, 1, 1);
        }
      }
    }
  }
  return c;
}
// Небольшое мягкое пятно света/тени (для свечения костра и теней): круг с дизерингом.
function glowTexture_(size = 32) {
  return paint(size, size, (x, y) => {
    const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
    if (d > 1) return null;
    const a = Math.pow(1 - d, 1.6);
    return a > dith(x, y) * 0.9 ? "#ffffff" : null;
  });
}
// Кустик травы для крестообразных плоскостей: 12×14 пикселей.
function grassTexture_(seed = 8) {
  const c = mk(16, 16),
    g = c.getContext("2d"),
    R = mulberry32(seed);
  const cols = ["#1d2b14", "#2c411c", "#3f5a22", "#4a6a28", "#5a7c30"];
  for (let b = 0; b < 7; b++) {
    const x0 = 2 + b * 1.7 + R(),
      hgt = 6 + Math.floor(R() * 8),
      lean = (R() - 0.5) * 3;
    for (let y = 0; y < hgt; y++) {
      const k = y / hgt;
      g.fillStyle = cols[Math.min(4, Math.floor(k * 3.4) + (R() < 0.2 ? 1 : 0))];
      g.fillRect(Math.round(x0 + lean * k * k), 15 - y, 1, 1);
    }
  }
  return c;
}

// ── Предметы способностей ──
const swatch = (size, fn) => paint(size, size, fn);
function produceTexture_(kind) {
  const n = (x, y, s) => hash2(x, y, s);
  switch (kind) {
    case "carrot":
      return swatch(32, (x, y) => {
        const ring = y % 6 === 0 ? -0.22 : 0,
          col = 0.62 - Math.abs(x - 12) / 30 + ring + (n(x, y, 1) - 0.5) * 0.12;
        return ramp(["#7a300a", "#a8450f", "#ee7a22", "#ffb04a", "#ffd88a"], col, x, y);
      });
    case "carrotLeaf":
      return swatch(16, (x, y) => ramp(["#1e3c10", "#2e5a1a", "#4f9a2a", "#8fd24e"], 0.3 + n(x, y, 2) * 0.6, x, y));
    case "tomato":
      return swatch(32, (x, y) => {
        const hi = Math.hypot(x - 10, y - 9) < 4 ? 0.35 : 0;
        return ramp(["#6e120e", "#a8231c", "#d8312a", "#ff5a4a", "#ffa088"], 0.45 + (n(x >> 1, y >> 1, 3) - 0.5) * 0.3 + hi + (y < 8 ? 0.08 : 0), x, y);
      });
    case "tomatoSplat":
      return swatch(32, (x, y) => ramp(["#5a0c0a", "#8a1410", "#c42a22", "#ff6a4a", "#f4e0a0"], 0.25 + n(x >> 1, y >> 1, 4) * 0.6 + (n(x, y, 5) > 0.93 ? 0.5 : 0), x, y));
    case "potato":
      return swatch(32, (x, y) => {
        const eye = n(x >> 3, y >> 3, 6) > 0.7 && x % 8 < 3 && y % 8 < 2;
        return eye ? "#2a180a" : ramp(["#2a180a", "#4a2e14", "#6e4620", "#8e6230", "#a87a3e"], 0.45 + (n(x >> 1, y >> 1, 7) - 0.5) * 0.5, x, y);
      });
    case "onion":
      return swatch(32, (x, y) => {
        const stripe = 0.5 + 0.5 * Math.sin(x * 1.05 + n(x >> 2, y >> 3, 8) * 2);
        return ramp(["#6a3e14", "#a8692a", "#d99a4a", "#f2c47a", "#fff0c8"], 0.3 + stripe * 0.45 + (y < 5 ? 0.12 : 0), x, y);
      });
    case "pepper":
      return swatch(32, (x, y) => ramp(["#5a0a08", "#8a1410", "#c42a22", "#e8483a", "#ff7a5a"], 0.55 + (x < 10 ? 0.25 : 0) - (y > 20 ? 0.2 : 0) + (n(x >> 2, y >> 2, 9) - 0.5) * 0.15, x, y));
    case "cabbageLeaf":
      return paint(64, 32, (x, y) => {
        // основание слева, кончик справа; жилка по центру и боковые «ёлочкой»
        const v = Math.abs(y - 16),
          u = x / 64,
          mid = v < Math.max(0.7, 2.2 * (1 - u)),
          vein = !mid && v > 1.5 && Math.abs(((x - v * 0.8) % 9) - 4.5) < 0.6,
          net = !vein && hash2(x >> 2, y >> 2, 10) < 0.35 && (x % 4 < 1 || y % 4 < 1);
        const shade = 0.75 - u * 0.4 - (v / 16) * 0.2 + (net ? 0.14 : 0);
        // тёмная кромка: соседние листья читаются по отдельности
        const edgeD = Math.min(y, 31 - y, 63 - x) ;
        if (edgeD < 1.2 && !mid) return "#1f3c12";
        if (mid) return u < 0.35 ? "#e6f4c8" : "#cfe8a2";
        if (vein) return "#a8d27a";
        return ramp(["#2c5418", "#3f7524", "#57942e", "#72ae3c", "#90c650", "#b4dc78"], shade, x, y);
      });
    case "steel":
      return swatch(8, (x, y) => ["#4a4a54", "#7a7a86", "#b8b8c4", "#8a8a96"][(x + y * 3) % 4]);
    default:
      return swatch(4, () => "#ffffff");
  }
}

// Текстуры рисуются один раз за сессию (повторное включение вида берёт готовые).
const memo = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
};
export const barkTexture = memo(barkTexture_);
export const leafTexture = memo(leafTexture_);
export const needleTexture = memo(needleTexture_);
export const rockTexture = memo(rockTexture_);
export const ringTexture = memo(ringTexture_);
export const canvasTexture = memo(canvasTexture_);
export const plankTexture = memo(plankTexture_);
export const skyTexture = memo(skyTexture_);
export const flameSheet = memo(flameSheet_);
export const grassTexture = memo(grassTexture_);
export const produceTexture = memo(produceTexture_);
export const glowTexture = memo(glowTexture_);
