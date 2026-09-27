import { TAU, mulberry32, hash2 } from "../shared/math.js";

import { OUT } from "./style.js";
import { PB, ramp, sphereV, flipC, tintC } from "./pixels.js";
const PAL = {
  k: OUT,
  o: "#ee7a22",
  O: "#ffb04a",
  q: "#a8450f",
  l: "#4f9a2a",
  L: "#8fd24e",
  n: "#2e5a1a",
  w: "#f4f1ea",
  W: "#ffffff",
  c: "#b8b2a4",
  p: "#f6e2b4",
  P: "#d9a35e",
  u: "#8a5a24",
  r: "#d8312a",
  R: "#ff7a5a",
  m: "#6e120e",
  y: "#f0b23a",
  Y: "#ffe07a",
  z: "#8a5210",
  b: "#8a5a34",
  B: "#4a2e18",
  t: "#c8a878",
  v: "#8a1a4a",
  V: "#c2266a",
  x: "#4a0a26",
  h: "#f7c0a8",
};
const ICON_ROWS = {
  potato: [
    "............",
    "....kkkk....",
    "..kkttttkk..",
    ".kttBttttBk.",
    ".ktttttttbk.",
    "kttttBtttbk.",
    "ktBtttttbbk.",
    ".kttttBtbBk.",
    ".kbbttbbbBk.",
    "..kkBBBBkk..",
    "....kkkk....",
  ],
  beet: [
    "....l..l....",
    "...lLllLl...",
    "....lnnl....",
    "....kvvk....",
    "..kkVVvvkk..",
    ".kVVVvvvvxk.",
    ".kVWVvvvvxk.",
    ".kVVvvvvvxk.",
    "..kvvvvvxk..",
    "...kvvvxk...",
    "....kvxk....",
    ".....kk.....",
  ],
  tomato: [
    "....n..n....",
    "...nlLln....",
    "..kkllnkk...",
    ".kRRrrrrrk..",
    "kRWRrrrrrmk.",
    "kRRrrrrrrmk.",
    "krrrrrrrrmk.",
    "krrrrrrrmmk.",
    ".krrrrrmmk..",
    "..kkmmmkk...",
    "....kkk.....",
  ],
  bellPepper: [
    "............",
    "..kkk..kkk..",
    ".kRrk..krRk.",
    "kRrhk..khrmk",
    "kRrhk..khrmk",
    "kRrrhkkhrrmk",
    ".kRrrhhrrmk.",
    "..kRrrrrmk..",
    "...kkmmkk...",
    "....kkkk....",
  ],
  carrot: [
    ".........ln.",
    "......l.lLl.",
    ".......lLl..",
    "......kkkl..",
    ".....kOOok..",
    "....kOooqk..",
    "...kOoqok...",
    "...kooqk....",
    "..koqok.....",
    "..kqok......",
    ".kqk........",
    ".kk.........",
  ],
  cabbage: [
    "...kkkkkk...",
    "..knlLLlnk..",
    ".knlLLLLlnk.",
    "knlLLlLLLlnk",
    "knLLlLLLlLnk",
    "knlLLlLLlLnk",
    "knlLLLllLLnk",
    "knnlLLLLLlnk",
    ".knnlllllnk.",
    "..knnnnnnk..",
    "...kkkkkk...",
  ],
  onion: [
    ".....l.l....",
    ".....lnl....",
    "......t.....",
    ".....kpk....",
    "....kpPpk...",
    "...kpWpPPk..",
    "..kpWppPPPk.",
    "..kpppPPPuk.",
    "..kppPPPPuk.",
    "...kPPPPuk..",
    "....kkkkk...",
    "....t.t.t...",
  ],
  salt: [
    "............",
    ".....W......",
    "....kwk.....",
    "...kwWwk..W.",
    "..kwwWwwk...",
    ".kwwwwwcwk..",
    "kwwcwwwwwck.",
    "kbbbbbbbbbbk",
    ".kBbbbbbbBk.",
    "..kkkkkkkk..",
  ],
  pepper: [
    ".........n..",
    "........ln..",
    ".......kllk.",
    "......krrk..",
    ".....krRrk..",
    "....krRrrk..",
    "...krRrrmk..",
    "..krrrrmk...",
    ".krrrrmk....",
    ".krrmmk.....",
    "kmmkk.......",
    "kk..........",
  ],
  broth: [
    ".....kk.....",
    "....kYyk....",
    "....kYyk....",
    "...kYyyyk...",
    "..kYWyyyzk..",
    ".kyWyyyyyzk.",
    ".kyWyyyyyzk.",
    ".kyyyyyyyzk.",
    "..kyyyyyzk..",
    "...kzzzzk...",
    "....kkkk....",
  ],
  laurel: [
    "..........k.",
    "........kkl.",
    "......klLlk.",
    ".....kLLlnk.",
    "....kLLlnk..",
    "...kLLlnlk..",
    "..kLLlnllk..",
    "..kLlnllk...",
    ".kLlnllk....",
    ".klnlkk.....",
    ".knkk.......",
    "kk..........",
  ],
  heal: [
    "............",
    ".kkk...kkk..",
    "kRRrk.kRrrk.",
    "kRWrrkrrrrk.",
    "krrrrrrrrmk.",
    "krrrrrrrrmk.",
    ".krrrrrrmk..",
    "..krrrrmk...",
    "...krrmk....",
    "....kmk.....",
    ".....k......",
  ],
};
export const ICON = {};
for (const id in ICON_ROWS) {
  const pb = new PB(12, 12);
  pb.rows(0, 0, ICON_ROWS[id], PAL);
  ICON[id] = pb.canvas();
}
export const FALL_CARROT = (() => {
  const pb = new PB(9, 16);
  pb.rows(
    0,
    0,
    [
      "..n.n.n..",
      "..lLlLl..",
      "...lLl...",
      "..kkkkk..",
      ".kOOooqk.",
      ".kOoooqk.",
      ".kOqooqk.",
      "..kOooqk.",
      "..kOoqk..",
      "..kOoqk..",
      "..kOqok..",
      "...kOqk..",
      "...kok...",
      "...kqk...",
      "....k....",
    ],
    PAL,
  );
  return pb.canvas();
})();
export const GEM = [
  (() => {
    const pb = new PB(5, 7);
    pb.rows(0, 0, ["..k..", ".kYk.", "kYyyk", "kyyzk", ".kzk.", "..k.."], PAL);
    return pb.canvas();
  })(),
  (() => {
    const pb = new PB(7, 9);
    pb.rows(
      0,
      0,
      [
        "...k...",
        "..kWk..",
        ".kYYyk.",
        "kYYyyyk",
        "kYyyyzk",
        ".kyyzk.",
        "..kzk..",
        "...k...",
      ],
      PAL,
    );
    return pb.canvas();
  })(),
];
export const SKULL = (() => {
  const pb = new PB(7, 7);
  pb.rows(
    0,
    0,
    [".kkkkk.", "kwwwwwk", "kwkwkwk", "kwwwwwk", ".kwkwk.", ".kkkkk."],
    PAL,
  );
  return pb.canvas();
})();
export const HEART = (() => {
  const pb = new PB(7, 6);
  pb.rows(
    0,
    0,
    [".kk.kk.", "kRrkrrk", "krrrrmk", ".krrmk.", "..kmk..", "...k..."],
    PAL,
  );
  return pb.canvas();
})();

// Гоблины: генерируются из фигур, потом обводка

// Снаряды и эффекты новых ингредиентов.
const rowsSprite = (w, h, rows) => {
  const pb = new PB(w, h);
  pb.rows(0, 0, rows, PAL);
  return pb.canvas();
};
export const POTATO_SHOT = rowsSprite(7, 6, [
  ".kkkk..",
  "kttBtk.",
  "kBttttk",
  "ktttbBk",
  ".kBBBk.",
  "..kkk..",
]);
export const PELLETS = [
  rowsSprite(2, 2, ["tb", "bB"]),
  rowsSprite(3, 2, ["tt.", "bbB"]),
  rowsSprite(2, 3, ["t.", "tb", "bB"]),
];
export const FALL_TOMATO = rowsSprite(9, 10, [
  "...n.n...",
  "...nln...",
  "..kknkk..",
  ".kRRrrrk.",
  "kRWRrrrmk",
  "kRRrrrrmk",
  "krrrrrrmk",
  ".krrrrmk.",
  "..kmmmk..",
  "...kkk...",
]);
// Долька болгарского перца: половина кольца поперечного среза, 8 поворотов.
export const PEPPER_SLICE = Array.from({ length: 8 }, (_, k) => {
  const size = 13,
    c = size / 2,
    ro = 5.6,
    ri = 3.1,
    a = (k * Math.PI) / 4,
    nx = Math.cos(a),
    ny = Math.sin(a);
  const pb = new PB(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c,
        dy = y + 0.5 - c,
        d = Math.hypot(dx, dy);
      if (d < ri || d > ro || dx * nx + dy * ny < -0.3) continue;
      const light = (-dx - dy) / (ro * 1.4);
      pb.set(
        x,
        y,
        d < ri + 1
          ? "#f7c0a8"
          : ramp(["#8a1410", "#c42a22", "#e8483a", "#ff7a5a"], 0.5 + light, x, y),
      );
    }
  pb.outline(OUT);
  return pb.canvas();
});
// Розетка капусты: 5–7 больших листьев растут из-под котла и вместе образуют
// круг поля. Форма как у настоящего листа: узкое основание, широкий скруглённый
// край, светлая центральная жилка, веер боковых прожилок и мелкая сетка.
// layout: { leaves: [{ angle, len, width }] } — случайный на каждый забег.
// frame 0–2 — фазы покачивания. Листья лежат на земле: по высоте сжатие 0,8.
const LEAF_RAMP = ["#2c5418", "#3f7524", "#57942e", "#72ae3c", "#90c650", "#b4dc78"];
export function buildCabbageRosette(radiusPx, layout, frame) {
  const R = Math.max(8, radiusPx),
    half = Math.ceil(R * 1.08) + 3,
    w = half * 2,
    h = Math.ceil(half * 0.8) * 2,
    cx = w / 2,
    cy = h / 2,
    phase = [-1, 0, 1][frame];
  const leaves = layout.leaves.map((leaf, i) => {
    const a = leaf.angle + phase * 0.035 * (i % 2 ? 1 : -1),
      L = R * leaf.len * (1 + phase * 0.015 * (i % 2 ? -1 : 1)),
      spread = Math.PI / layout.leaves.length;
    return {
      ca: Math.cos(a),
      sa: Math.sin(a),
      L,
      Wmax: L * 0.75 * Math.tan(spread) * leaf.width,
      seed: i * 7 + 3,
    };
  });
  const halfWidth = (u, leaf) => {
    const { L, Wmax } = leaf,
      k = u / L;
    if (k < 0.05 || k > 1) return -1;
    if (k < 0.7) return Wmax * Math.pow(Math.sin((Math.PI / 2) * (k / 0.7)), 0.7);
    const t = (k - 0.7) / 0.3;
    return Wmax * Math.sqrt(Math.max(0, 1 - t * t));
  };
  const pb = new PB(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - cx,
        py = (y + 0.5 - cy) / 0.8;
      for (let li = leaves.length - 1; li >= 0; li--) {
        const leaf = leaves[li],
          u = px * leaf.ca + py * leaf.sa,
          v = -px * leaf.sa + py * leaf.ca,
          hw = halfWidth(u, leaf);
        if (hw <= 0) continue;
        const serr = 1 - 0.07 * hash2(Math.round(u / 2), v > 0 ? 1 : 0, leaf.seed),
          lim = hw * serr;
        if (Math.abs(v) > lim) continue;
        const k = u / leaf.L,
          av = Math.abs(v),
          edgePx = lim - av; // расстояние до края в пикселях
        // Центральная жилка сужается к кончику листа.
        const midrib = av < Math.max(0.7, 2 * (1 - k)) && k < 0.92;
        // Боковые прожилки ёлочкой: отходят от центральной вперёд к краю
        // и слегка изгибаются.
        const spacing = Math.max(6, leaf.L * 0.13),
          along = u - av * 0.8 - (av * av) / (leaf.L * 1.2),
          vein = !midrib && av > 1.5 && edgePx > 1.5 && Math.abs(along / spacing - Math.round(along / spacing)) * spacing < 0.6;
        // Мелкая сетка между прожилками: светлые короткие перемычки и ячейки.
        const cu = Math.floor(u / 4),
          cv = Math.floor(v / 4),
          cell = hash2(cu, cv, leaf.seed) < 0.45,
          net = !vein && edgePx > 2 && hash2(cu, cv, leaf.seed + 1) < 0.55 && ((u % 4 + 4) % 4 < 0.9 || (v % 4 + 4) % 4 < 0.9);
        const shade = 0.85 - k * 0.5 - (av / lim) * 0.25 + (v > 0 ? -0.07 : 0.05) + (cell ? -0.07 : 0);
        let color;
        if (edgePx < 1.2) color = "#1f3c12"; // тёмная кромка отделяет листья друг от друга
        else if (midrib) color = k < 0.35 ? "#e6f4c8" : "#cfe8a2";
        else if (vein) color = k < 0.45 ? "#c8e89a" : "#a8d27a";
        else if (net) color = ramp(LEAF_RAMP, shade + 0.22, x, y);
        else color = ramp(LEAF_RAMP, shade, x, y);
        pb.set(x, y, color);
        break;
      }
    }
  pb.outline("#10200a");
  return { img: pb.canvas(), ax: Math.floor(cx), ay: Math.floor(cy) };
}
const GOB_DEF = {
  goblin: {
    head: 5,
    body: 4,
    leg: 3,
    ear: 4,
    skin: ["#2f3818", "#4a5629", "#65733a", "#84924c", "#a3ae62"],
    rag: ["#1e140c", "#33241a", "#4a3524"],
    eye: "big",
  },
  runner: {
    head: 4.5,
    body: 3,
    leg: 3,
    ear: 4,
    skin: ["#3a3c16", "#58602a", "#78843a", "#98a44c", "#b8c060"],
    rag: ["#2a0e0a", "#4a1c14", "#6a2a1c"],
    eye: "big",
    weap: "spear",
  },
  brute: {
    head: 7,
    body: 6,
    leg: 4,
    ear: 5,
    skin: ["#262e16", "#3b4724", "#526034", "#6b7a44", "#86955a"],
    rag: ["#18110a", "#2a1f14", "#3e2e1e"],
    eye: "mean",
    weap: "club",
  },
};
function buildGoblin(o, frame) {
  const w = Math.ceil(o.head * 2 + o.ear * 2 + 10),
    h = Math.ceil(o.leg + o.body * 2 + o.head * 2 + 10);
  const pb = new PB(w, h),
    cx = Math.floor(w / 2),
    feet = h - 2,
    s = o.skin,
    rg = o.rag;
  const by = feet - o.leg - Math.round(o.body * 0.8) + frame;
  const hy = by - o.body - Math.round(o.head * 0.6);
  const lw = o.body >= 6 ? 2 : 1;
  // ноги
  const legX = [
    cx - Math.ceil(o.body * 0.5),
    cx + Math.floor(o.body * 0.5) - lw + 1,
  ];
  legX.forEach((lx, k) => {
    const lift = k === frame ? 1 : 0;
    for (let y = by + Math.round(o.body * 0.5); y <= feet - lift; y++)
      for (let q = 0; q < lw; q++) pb.set(lx + q, y, s[1]);
    pb.set(k ? lx + lw : lx - 1, feet - lift, s[0]);
  });
  // руки
  const ay = by - Math.round(o.body * 0.3);
  const up = [frame ? 3 : -1, frame ? -1 : 3];
  pb.line(cx - o.body, ay, cx - o.body - 2, ay + 2 - up[0], s[2]);
  pb.set(cx - o.body - 2, ay + 1 - up[0], s[3]);
  pb.line(cx + o.body, ay, cx + o.body + 2, ay + 2 - up[1], s[2]);
  pb.set(cx + o.body + 2, ay + 1 - up[1], s[3]);
  // тело: грудь кожей, ниже тряпьё
  pb.ell(cx + 0.5, by, o.body + 0.6, o.body * 0.9 + 0.6, (nx, ny, x, y) =>
    ny > -0.05
      ? ramp(rg, sphereV(nx, ny) * 1.2, x, y)
      : ramp(s, sphereV(nx, ny) * 0.9, x, y),
  );
  for (let x = cx - o.body + 1; x <= cx + o.body; x++)
    if ((x + frame) % 2) pb.set(x, by + Math.ceil(o.body * 0.9) + 1, rg[0]);
  // оружие
  if (o.weap === "spear") {
    const x = cx + o.body + 3;
    for (let y = hy - o.head - 2; y <= by + 3; y++)
      pb.set(x, y, y % 3 ? "#6b4a2a" : "#4a3018");
    pb.set(x, hy - o.head - 3, "#d8d8cc");
    pb.set(x, hy - o.head - 4, "#d8d8cc");
    pb.set(x - 1, hy - o.head - 2, "#9a9a90");
    pb.set(x + 1, hy - o.head - 2, "#9a9a90");
  } else if (o.weap === "club") {
    const x = cx + o.body + 3;
    for (let y = by - 6; y <= by + 3; y++) {
      pb.set(x, y, "#5a3a1c");
      pb.set(x + 1, y, "#3e2814");
    }
    pb.ell(x + 1, by - 8, 2.8, 3, (nx, ny, px, py) =>
      ramp(
        ["#3e2814", "#5a3a1c", "#7a5230", "#9a6c40"],
        sphereV(nx, ny),
        px,
        py,
      ),
    );
  }
  // уши, потом голова
  const er = o.ear;
  pb.poly(
    [
      [cx - o.head + 1.5, hy - 1.5],
      [cx - o.head - er, hy - er * 0.7 - 1],
      [cx - o.head + 1.5, hy + 2],
    ],
    (x, y) => ramp(s, 0.75, x, y),
  );
  pb.poly(
    [
      [cx + o.head - 0.5, hy - 1.5],
      [cx + o.head + er + 1, hy - er * 0.7 - 1],
      [cx + o.head - 0.5, hy + 2],
    ],
    (x, y) => ramp(s, 0.4, x, y),
  );
  pb.set(cx - o.head, hy, s[1]);
  pb.set(cx + o.head, hy, s[1]);
  pb.ell(cx + 0.5, hy, o.head + 0.5, o.head * 0.92 + 0.5, (nx, ny, x, y) =>
    ramp(s, sphereV(nx, ny) * 1.1 + 0.05, x, y),
  );
  // глаза
  const ex = Math.ceil(o.head * 0.45);
  if (o.eye === "big") {
    for (const e of [cx - ex, cx + ex]) {
      pb.ell(e + 0.5, hy + 0.5, 1.6, 1.8, "#07060a");
      pb.set(e - 1 + (e > cx ? 1 : 0), hy - 1 + 1, "#07060a");
      pb.set(e, hy - 1 + 1, "#f4f0dc");
    }
  } else {
    for (const e of [cx - ex, cx + ex]) {
      pb.set(e, hy, "#07060a");
      pb.set(e + 1, hy, "#07060a");
      pb.set(e + (e > cx ? 0 : 1), hy, "#ff4a2a");
      pb.set(e, hy - 1, s[0]);
      pb.set(e + 1, hy - 1, s[0]);
    }
  }
  // рот с зубом
  const my = hy + Math.round(o.head * 0.55);
  for (let x = cx - 1; x <= cx + 2; x++) pb.set(x, my, "#2a0c08");
  pb.set(cx, my, "#e8dcc0");
  if (o.head >= 6) pb.set(cx + 2, my, "#e8dcc0");
  pb.outline(OUT);
  return { img: pb.canvas(), ax: cx, ay: feet };
}
// Обращённые свёклой враги: тот же силуэт в свекольных тонах.
const CHARMED_SKIN = ["#3a0a24", "#5e1238", "#8a1c50", "#b8306e", "#e0609a"];
const CHARMED_RAG = ["#1e0a14", "#3a1426", "#5a2038"];
export const GOB = {};
export const GOB_CHARMED = {};
for (const [set, recolor] of [
  [GOB, (d) => d],
  [GOB_CHARMED, (d) => ({ ...d, skin: CHARMED_SKIN, rag: CHARMED_RAG })],
])
for (const t in GOB_DEF) {
  set[t] = [0, 1].map((f) => {
    const g = buildGoblin(recolor(GOB_DEF[t]), f);
    const fl = flipC(g.img);
    return {
      r: g.img,
      l: fl,
      rw: tintC(g.img, "#ffffff"),
      lw: tintC(fl, "#ffffff"),
      ax: g.ax,
      ay: g.ay,
      w: g.img.width,
    };
  });
}

// Котёл на треноге
const IRON = ["#0d0d12", "#1a1a22", "#282832", "#3a3a48", "#565666", "#7a7a8c"];
const RIM = ["#1a1a22", "#3a3a48", "#5a5a6a", "#8a8a9c"];
const SOUP = ["#8a2e10", "#c24e1c", "#e07b2f", "#f5a64a", "#ffd08a"];
export const POT = (() => {
  const w = 50,
    h = 60,
    cx = 25,
    ground = h - 2,
    apex = 3;
  const pb = new PB(w, h);
  const pcy = ground - 21,
    rimY = pcy - 8;
  pb.line(cx, apex + 2, cx + 5, ground - 10, "#1f150d");
  for (const d of [-1, 1]) {
    pb.line(cx, apex, cx + d * 22, ground, "#4a3320");
    pb.line(cx + d, apex + 1, cx + d * 22 + d, ground, "#2a1c10");
  }
  for (let y = apex - 1; y <= apex + 2; y++) {
    pb.set(cx - 1, y, "#8a6a3a");
    pb.set(cx, y, "#a8844a");
    pb.set(cx + 1, y, "#6a4e2a");
  }
  for (let y = apex + 3; y <= rimY - 7; y++)
    pb.set(cx, y, y % 2 ? "#8a8a94" : "#3c3c44");
  for (let a = Math.PI; a <= TAU + 0.001; a += 0.05)
    pb.set(cx + Math.cos(a) * 12, rimY - 1 + Math.sin(a) * 6, "#2a2a32");
  pb.ell(cx + 0.5, pcy, 13, 10.5, (nx, ny, x, y) =>
    ramp(IRON, sphereV(nx, ny) * 1.15, x, y),
  );
  pb.set(cx - 7, pcy + 10, IRON[1]);
  pb.set(cx + 7, pcy + 10, IRON[1]);
  pb.set(cx - 7, pcy + 11, IRON[0]);
  pb.set(cx + 7, pcy + 11, IRON[0]);
  pb.ell(cx + 0.5, rimY, 13, 3.8, (nx, ny, x, y) =>
    ramp(RIM, 0.55 - ny * 0.4 - nx * 0.25, x, y),
  );
  pb.ell(cx + 0.5, rimY + 0.4, 10.5, 2.5, (nx, ny, x, y) =>
    ramp(SOUP, 0.55 - nx * 0.35 - ny * 0.25, x, y),
  );
  pb.outline(OUT);
  const img = pb.canvas();
  return {
    img,
    hit: tintC(img, "rgba(255,60,40,.55)"),
    ax: cx,
    ay: ground,
    soupDy: rimY - ground,
    soupRx: 9,
    soupRy: 2,
  };
})();
export const FIRE_LOGS = (() => {
  const pb = new PB(32, 11),
    cx = 16,
    cy = 6;
  const logs = [
    [-14, 3],
    [14, 3],
    [-8, -4],
    [8, -4],
    [0, 4],
  ];
  for (const [dx, dy] of logs) {
    pb.line(cx, cy, cx + dx, cy + dy, "#4a2f1a");
    pb.line(cx, cy + 1, cx + dx, cy + dy + 1, "#2e1d10");
    pb.set(cx + dx, cy + dy, "#9a7040");
  }
  pb.ell(cx + 0.5, cy + 0.5, 4, 2, "#1a120a");
  pb.outline(OUT);
  return pb.canvas();
})();

// Луковицы разных размеров
const ONION_SPR = {};
export function onionSprite(r) {
  if (ONION_SPR[r]) return ONION_SPR[r];
  const w = r * 2 + 5,
    h = r * 2 + 8,
    cx = w / 2,
    cy = h - r - 3;
  const pb = new PB(w, h);
  const ramp5 = ["#6a3e14", "#a8692a", "#d99a4a", "#f2c47a", "#fff0c8"];
  pb.ell(cx, cy, r + 0.5, r + 0.3, (nx, ny, x, y) => {
    let v = sphereV(nx, ny) * 1.1;
    if (Math.abs(Math.abs(nx) - 0.5) < 0.12 && ny > -0.6) v -= 0.25;
    return ramp(ramp5, v, x, y);
  });
  for (let k = 1; k <= Math.ceil(r * 0.6); k++) {
    pb.set(cx - 0.5, cy - r - k + 1, ramp5[3]);
    if (k < 2) {
      pb.set(cx - 1.5, cy - r - k + 1, ramp5[2]);
      pb.set(cx + 0.5, cy - r - k + 1, ramp5[2]);
    }
  }
  pb.set(cx - 0.5, cy - r - Math.ceil(r * 0.6), "#7ab04a");
  pb.set(cx - 1.5, cy + r + 1, "#e8d0a0");
  pb.set(cx + 0.5, cy + r + 1, "#e8d0a0");
  pb.outline("#2a1606");
  return (ONION_SPR[r] = {
    img: pb.canvas(),
    ax: Math.floor(cx),
    ay: Math.round(cy),
  });
}

// Деревья
const OAK_RAMP = [
  "#0b150c",
  "#122016",
  "#1a2e1c",
  "#243e22",
  "#31522b",
  "#41672f",
];
const PINE_RAMP = ["#08120f", "#0e1d18", "#152a21", "#1e3a2b", "#2a4c37"];
const BARK = ["#170f08", "#2a1c10", "#3e2a18", "#553b22"];
function buildOak(seed, s) {
  const R = mulberry32(seed),
    w = s * 2 + 10,
    h = s * 2 + 24,
    cx = w / 2,
    ccy = s + 4;
  const pb = new PB(w, h);
  const trunkTop = ccy + s * 0.4,
    ground = h - 2;
  for (let y = Math.floor(trunkTop); y <= ground; y++) {
    const hw = 2 + (y > ground - 3 ? 1 : 0);
    for (let x = -hw; x <= hw; x++)
      pb.set(
        cx + x - 0.5,
        y,
        ramp(
          BARK,
          0.7 - ((x + hw) / (hw * 2)) * 0.7 + (hash2(x, y, seed) - 0.5) * 0.3,
          cx + x,
          y,
        ),
      );
  }
  const circles = [{ x: cx, y: ccy, r: s * 0.78 }];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + R() * 0.8;
    circles.push({
      x: cx + Math.cos(a) * s * 0.48,
      y: ccy + Math.sin(a) * s * 0.36,
      r: s * (0.42 + R() * 0.16),
    });
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = null,
        bi = 0;
      for (const c of circles) {
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y),
          ins = 1 - d / c.r;
        if (ins > 0 && (!best || ins > bi)) {
          best = c;
          bi = ins;
        }
      }
      if (!best) continue;
      let v =
        sphereV(
          ((x + 0.5 - best.x) / best.r) * 0.95,
          ((y + 0.5 - best.y) / best.r) * 0.95,
        ) *
          1.05 -
        (y / h) * 0.18;
      if (hash2(x, y, seed + 7) < 0.06) v -= 0.25;
      pb.set(x, y, ramp(OAK_RAMP, v, x, y));
    }
  pb.outline("#050905");
  return { img: pb.canvas(), ax: Math.floor(cx), ay: ground, top: 0 };
}
function buildPine(seed, s) {
  const w = s * 2 + 6,
    h = Math.round(s * 3.2) + 14,
    cx = w / 2,
    ground = h - 2;
  const pb = new PB(w, h);
  for (let y = ground - 7; y <= ground; y++)
    for (let x = -1; x <= 1; x++)
      pb.set(cx + x - 0.5, y, ramp(BARK, 0.6 - (x + 1) * 0.25, cx + x, y));
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const base = ground - 6 - i * s * 0.62,
      ht = s * 1.1,
      hw = s * (1 - i * 0.2) + 1;
    for (let y = Math.floor(base - ht); y <= base; y++) {
      const k = (y - (base - ht)) / ht,
        jag = hash2(y, i, seed) < 0.5 ? 1 : 0,
        span = hw * k + jag;
      for (let x = Math.floor(cx - span); x <= Math.ceil(cx + span); x++) {
        const nx = (x + 0.5 - cx) / Math.max(1, span);
        let v = 0.62 - nx * 0.4 - k * 0.25 + (1 - i / layers) * -0.05;
        if (y > base - 2) v -= 0.2;
        pb.set(x, y, ramp(PINE_RAMP, v, x, y));
      }
    }
  }
  pb.outline("#040806");
  return { img: pb.canvas(), ax: Math.floor(cx), ay: ground, top: 0 };
}
export const OAKS = [],
  PINES = [],
  OAKS_B = [],
  PINES_B = [];
for (let i = 0; i < 5; i++) {
  OAKS.push(buildOak(11 + i, 14 + i));
  PINES.push(buildPine(31 + i, 9 + (i % 3)));
  OAKS_B.push(buildOak(51 + i, 19 + (i % 3)));
  PINES_B.push(buildPine(71 + i, 12 + (i % 3)));
}

// Реквизит
export const TENT = (() => {
  const w = 68,
    h = 50,
    pb = new PB(w, h);
  const A = [25, 6],
    BL = [3, h - 3],
    BR = [46, h - 3],
    S1 = [57, 9],
    S2 = [65, h - 3];
  const F = ["#3e2a14", "#5a3e1e", "#7a5a2e", "#9a7844", "#b8945a"],
    S = ["#23170b", "#342312", "#46301a", "#5a4024"];
  pb.poly([A, S1, S2, BR], (x, y) =>
    ramp(S, 0.75 - ((x - 40) / 40) * 0.5 + (hash2(x, y, 3) - 0.5) * 0.15, x, y),
  );
  pb.poly([A, BL, BR], (x, y) =>
    ramp(
      F,
      0.8 - (y / h) * 0.35 + (25 - x) / 70 + (hash2(x, y, 4) - 0.5) * 0.12,
      x,
      y,
    ),
  );
  pb.poly(
    [
      [25, 20],
      [16, h - 3],
      [34, h - 3],
    ],
    (x, y) =>
      ramp(
        ["#070503", "#120c07", "#1e150c"],
        ((y - 20) / (h - 20)) * 0.8,
        x,
        y,
      ),
  );
  pb.line(25, 6, 57, 9, "#c8a468");
  pb.line(10, 30, 16, 30, "#46301a");
  pb.line(36, 26, 40, 26, "#46301a");
  for (let y = 0; y <= 6; y++) pb.set(25, y, "#2a1c10");
  for (let y = 3; y <= 9; y++) pb.set(57, y, "#2a1c10");
  pb.rows(26, 0, ["rr..", "rRr.", "rr.."], PAL);
  pb.outline(OUT);
  pb.line(25, 6, 0, h - 1, "#5a4630");
  pb.line(57, 9, 67, h - 6, "#5a4630");
  return { img: pb.canvas(), ax: 34, ay: h - 3 };
})();
const LOG_CACHE = {};
export function logSprite(len, vert) {
  const key = len + "_" + vert;
  if (LOG_CACHE[key]) return LOG_CACHE[key];
  const L = Math.round(len),
    pb = new PB(vert ? 11 : L + 2, vert ? L + 2 : 11);
  if (!vert) {
    for (let x = 1; x < L; x++)
      for (let y = 2; y <= 8; y++)
        pb.set(
          x,
          y,
          ramp(
            BARK,
            0.85 - ((y - 2) / 6) * 0.8 + (hash2(x >> 2, y, 5) - 0.5) * 0.25,
            x,
            y,
          ),
        );
    pb.ell(L - 1.5, 5.5, 2.4, 3.6, (nx, ny, x, y) =>
      nx * nx + ny * ny < 0.3 ? "#7e5c36" : "#b08858",
    );
  } else {
    for (let y = 3; y <= L; y++)
      for (let x = 2; x <= 8; x++)
        pb.set(
          x,
          y,
          ramp(
            BARK,
            0.85 - ((x - 2) / 6) * 0.8 + (hash2(x, y >> 2, 5) - 0.5) * 0.25,
            x,
            y,
          ),
        );
    pb.ell(5.5, 3.5, 3.6, 2.4, (nx, ny) =>
      nx * nx + ny * ny < 0.3 ? "#7e5c36" : "#b08858",
    );
  }
  pb.outline(OUT);
  return (LOG_CACHE[key] = pb.canvas());
}
export const STUMP = (() => {
  const pb = new PB(16, 14);
  for (let y = 5; y <= 12; y++)
    for (let x = 2; x <= 13; x++)
      pb.set(x, y, ramp(BARK, 0.9 - ((x - 2) / 11) * 0.8, x, y));
  pb.set(1, 12, BARK[2]);
  pb.set(14, 12, BARK[1]);
  pb.ell(8, 5, 6, 2.6, (nx, ny) =>
    nx * nx + ny * ny < 0.25
      ? "#6e5030"
      : nx * nx + ny * ny < 0.55
        ? "#9a7448"
        : "#b8905a",
  );
  pb.outline(OUT);
  return { img: pb.canvas(), ax: 8, ay: 12 };
})();
export const ROCKS = [0, 1, 2].map((i) => {
  const r = 7 + i * 2,
    w = r * 2 + 4,
    h = Math.round(r * 1.5) + 4,
    pb = new PB(w, h),
    R = mulberry32(90 + i);
  const cx = w / 2,
    cy = h - 2 - r * 0.7;
  pb.ell(cx, cy, r, r * 0.75, (nx, ny, x, y) =>
    ramp(
      ["#1e1d1a", "#34322d", "#4b4841", "#66625a", "#827d72"],
      sphereV(nx, ny) + (hash2(x, y, 9) - 0.5) * 0.2,
      x,
      y,
    ),
  );
  pb.ell(
    cx + r * 0.4 * (R() - 0.5) * 2,
    cy - r * 0.2,
    r * 0.6,
    r * 0.55,
    (nx, ny, x, y) =>
      ramp(
        ["#34322d", "#4b4841", "#66625a", "#827d72", "#9a958a"],
        sphereV(nx, ny),
        x,
        y,
      ),
  );
  pb.outline(OUT);
  return { img: pb.canvas(), ax: Math.floor(cx), ay: h - 2 };
});
export const BUSHES = [0, 1, 2].map((i) => {
  const s = 6 + i * 2,
    w = s * 3,
    h = s * 2 + 2,
    pb = new PB(w, h);
  const cs = [
    [w / 2, h - s * 0.9, s],
    [w / 2 - s * 0.8, h - s * 0.7, s * 0.7],
    [w / 2 + s * 0.8, h - s * 0.7, s * 0.75],
  ];
  for (const [x, y, r] of cs)
    pb.ell(x, y, r, r * 0.85, (nx, ny, px, py) =>
      ramp(OAK_RAMP, sphereV(nx, ny) * 0.9, px, py),
    );
  pb.outline("#050905");
  return pb.canvas();
});
