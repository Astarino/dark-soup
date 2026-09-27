import { TAU, hash2 } from "../shared/math.js";
import { OUT } from "./style.js";
import { PB, ramp, sphereV, flipC, tintC } from "./pixels.js";
// Страж Колеса: тело (без колеса) по кадрам и колесо отдельно, чтобы оно плавно
// поворачивалось при адаптации. Тело смотрит вправо: клинок в правой руке.
const SKIN = ["#17200e", "#29391a", "#3c5025", "#506732", "#647d40", "#7b934f"];
const SHROUD = ["#040303", "#0d0b0a", "#191512", "#2a241f"];
const HORN = ["#060505", "#241e1a", "#48403a", "#8a7e70"];
const RING = ["#4a463e", "#8a867a", "#c8c4b6", "#eeeadc"];
const ORB = ["#6a6660", "#b0aca2", "#e4e0d4", "#fbf9f2"];
const ORB_GLOW = ["#8a6a2a", "#d8b060", "#f6e0a0", "#fffbe8"];
const BONE = ["#6e6a60", "#aaa598", "#dcd8cc", "#f2efe6"];
const W = 72,
  H = 84,
  CX = 36,
  FEET = H - 2;

function thick(pb, x0, y0, x1, y1, r, col) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pb.ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, col);
  }
}
function horn(pb, hx, hy, s, start, spread, rise, width) {
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const x = hx + 0.5 + s * (start[0] + spread * t + 0.28 * spread * t * t),
      y = hy + start[1] - rise * t + 0.13 * rise * t * t,
      th = width * (1 - t) + 0.45,
      ridge = Math.floor(t * 12) % 2;
    pb.ell(x, y, th, th, (nx) => (ridge ? (nx * s > 0.2 ? HORN[3] : HORN[2]) : HORN[1]));
  }
}

// p — параметры позы: смещения, точки рук, кончик клинка.
function buildBody(p) {
  const pb = new PB(W, H),
    cx = CX,
    hx = cx,
    hy = 34 + p.bob,
    sy = hy + 7,
    wy2 = hy + 20;
  // крылья: кончики машут по фазе
  for (const s of [-1, 1]) {
    const X = (dx) => cx + s * dx,
      f = p.wing * (s < 0 ? 1 : 0.8);
    pb.poly(
      [[X(5), sy + 2], [X(17 + p.wingSpread), sy - 16 + f], [X(27 + p.wingSpread), sy - 20 + f * 1.5], [X(22 + p.wingSpread), sy - 8 + f], [X(29 + p.wingSpread), sy - 4 + f], [X(20), sy + 3], [X(26), sy + 12 + f * 0.5], [X(14), sy + 9], [X(8), sy + 14]],
      (x, y) => (hash2(x, y, 21) < 0.05 ? SHROUD[3] : ramp(SHROUD, 0.25 + (y - sy + 20) / 60, x, y)),
    );
  }
  for (const s of [-1, 1]) horn(pb, hx, hy, s, [3.8, -2.5], 9, 7, 1.7);
  for (const s of [-1, 1]) horn(pb, hx, hy, s, [2.3, -5], 9, 15, 2.4);
  // левая рука с когтями
  const [l0, l1, l2] = p.lArm,
    up = p.handUp ? -1 : 1;
  thick(pb, cx + l0[0], sy + l0[1], cx + l1[0], sy + l1[1], 1.1, SKIN[3]);
  thick(pb, cx + l1[0], sy + l1[1], cx + l2[0], sy + l2[1], 1, SKIN[4]);
  const ax = cx + l2[0],
    ay = sy + l2[1];
  pb.ell(ax + 0.5, ay + up * 2, 2.2, 2.2, (nx, ny, x, y) => ramp(SKIN, sphereV(nx, ny) + 0.25, x, y));
  for (let i = 0; i < 4; i++) {
    const fx = ax - 2 + i * 1.4,
      fy = ay + up * 3.5,
      ex = fx - 0.8 + i * 0.5,
      ey = fy + up * 3.2;
    pb.line(fx, fy, ex, ey, SKIN[4]);
    pb.line(ex, ey, ex, ey + up * 1.5, OUT);
  }
  pb.line(ax - 2.2, ay + up * 1.5, ax - 4, ay + up * 2.5, SKIN[4]);
  pb.set(ax - 1, ay, SKIN[0]);
  pb.set(ax, ay, SKIN[0]);
  pb.set(ax + 1, ay, SKIN[0]);
  if (p.glow) {
    // каст гравитации: тёмно-лиловый сгусток над ладонью
    pb.ell(ax + 0.5, ay + up * 7, 2.6, 2.6, (nx, ny) => (nx * nx + ny * ny < 0.35 ? "#0a0612" : "#5a2a8a"));
    pb.set(ax - 1, ay + up * 7, "#b07ae0");
  }
  // правая рука — клинок
  const [r0, r1, r2] = p.rArm;
  thick(pb, cx + r0[0], sy + r0[1], cx + r1[0], sy + r1[1], 1.1, SKIN[3]);
  thick(pb, cx + r1[0], sy + r1[1], cx + r2[0], sy + r2[1], 1, SKIN[3]);
  const bx = cx + r2[0],
    by = sy + r2[1],
    tip = [bx + p.blade[0], by + p.blade[1]];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const x = bx + (tip[0] - bx) * t,
      y = by + (tip[1] - by) * t,
      r = 1.5 * (1 - t) + 0.35;
    pb.ell(x, y, r, r, (nx, ny, px, py) => ramp(BONE, 0.85 - nx * 0.4 - ny * 0.2 + (p.gleam && t > 0.5 ? 0.3 : 0), px, py));
  }
  pb.set(bx, by, SKIN[0]);
  pb.set(bx + 1, by, SKIN[0]);
  pb.set(bx, by + 1, SKIN[0]);
  // рваный низ: лохмотья колышутся по кадрам
  for (let y = wy2 + 2; y < FEET; y++) {
    const k = (y - wy2) / (FEET - wy2),
      hw = 5.5 + k * 8 + p.flare * k;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      if (y > FEET - 1 - Math.floor(hash2(x >> 1, p.tatter, 3) * 7)) continue;
      const dx = (x - cx) / hw,
        fold = (x + Math.floor(y * 0.25) + p.tatter) % 5 === 0 ? 0.3 : 0;
      pb.set(x, y, ramp(SHROUD, 0.55 - Math.abs(dx) * 0.4 + fold, x, y));
    }
  }
  for (const [fx, lift] of p.feet) {
    pb.set(cx + fx, FEET - lift, SKIN[3]);
    pb.set(cx + fx + 1, FEET - lift, SKIN[4]);
  }
  // торс со штриховкой, шипы, воронка, пояс
  pb.poly([[cx - 9, sy], [cx + 10, sy], [cx + 5.5, wy2 + 1], [cx - 4.5, wy2 + 1]], (x, y) => {
    let v = 0.85 - ((x - (cx - 9)) / 19) * 0.45 - Math.max(0, (y - sy - 12) / 12) * 0.6;
    if ((x * 3 + y) % 5 === 0 && hash2(x, y, 9) < 0.55) v -= 0.3;
    return ramp(SKIN, v, x, y);
  });
  pb.poly([[cx - 10, sy + 1], [cx - 12, sy - 5], [cx - 7, sy]], (x, y) => ramp(BONE, 0.8, x, y));
  pb.poly([[cx + 11, sy + 1], [cx + 13, sy - 5], [cx + 8, sy]], (x, y) => ramp(BONE, 0.5, x, y));
  const vx = cx + 0.5,
    vy = sy + 6;
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8 + 0.15,
      L = 4 + (k % 4) * 1.6;
    pb.line(vx + Math.cos(a) * 2, vy + Math.sin(a) * 2, vx + Math.cos(a) * L, vy + Math.sin(a) * L, k % 2 ? SKIN[1] : SKIN[0]);
  }
  pb.ell(vx, vy, 2.3, 2.3, OUT);
  pb.set(vx - 0.5, vy - 0.5, p.glow ? "#b07ae0" : "#6a0c12");
  for (let x = cx - 5; x <= cx + 6; x++) {
    pb.set(x, wy2 + 1, "#ece8da");
    pb.set(x, wy2 + 2, x % 3 ? "#c4c0b2" : "#ece8da");
  }
  pb.line(cx + 5, wy2 + 2, cx + 7 + p.sash, wy2 + 11, "#dcd8ca");
  pb.line(cx + 6, wy2 + 2, cx + 8 + p.sash, wy2 + 10, "#b0ac9e");
  // короткая шея, уши, острое лицо
  for (let y = hy + 6; y <= sy; y++) for (let x = hx - 1; x <= hx + 2; x++) pb.set(x, y, ramp(SKIN, 0.55 - (x - hx) * 0.1, x, y));
  pb.poly([[hx - 3.8, hy - 2], [hx - 10, hy - 5.5], [hx - 3.8, hy + 1]], (x, y) => ramp(SKIN, 0.75, x, y));
  pb.poly([[hx + 4.8, hy - 2], [hx + 11, hy - 5.5], [hx + 4.8, hy + 1]], (x, y) => ramp(SKIN, 0.45, x, y));
  const top = hy - 6,
    jaw = hy - 1,
    chin = hy + 8;
  for (let y = top; y <= chin; y++) {
    const hw = y <= jaw ? 4.6 * Math.sqrt(Math.max(0, 1 - ((jaw - y) / (jaw - top + 0.5)) ** 2)) : 4.6 * Math.pow(1 - (y - jaw) / (chin - jaw + 0.6), 1.15);
    for (let x = Math.floor(hx + 0.5 - hw); x <= Math.ceil(hx + 0.5 + hw) - 1; x++) {
      const nx = (x - hx) / Math.max(1, hw),
        ny = (y - hy) / 7;
      pb.set(x, y, ramp(SKIN, sphereV(nx * 0.85, ny * 0.8) * 1.05 + 0.12, x, y));
    }
  }
  for (let x = hx - 3; x <= hx + 4; x++) pb.set(x, hy - 3, SKIN[1]);
  const eye = p.glow ? "#c050ff" : "#b0181e";
  pb.set(hx - 3, hy - 1, OUT);
  pb.set(hx - 2, hy - 1, OUT);
  pb.set(hx - 1, hy, OUT);
  pb.set(hx - 2, hy, eye);
  pb.set(hx + 4, hy - 1, OUT);
  pb.set(hx + 3, hy - 1, OUT);
  pb.set(hx + 2, hy, OUT);
  pb.set(hx + 3, hy, eye);
  pb.line(hx - 3, hy + 1, hx - 1, hy + 5, SKIN[2]);
  pb.line(hx + 4, hy + 1, hx + 2, hy + 5, SKIN[1]);
  pb.set(hx, hy + 5, SKIN[1]);
  pb.set(hx + 1, hy + 5, SKIN[1]);
  pb.set(hx, hy + 2, SKIN[2]);
  pb.set(hx, hy + 3, SKIN[2]);
  pb.outline(OUT);
  return { img: pb.canvas(), wheelDy: 10 + p.bob - FEET };
}

const BASE = {
  bob: 0,
  wing: 0,
  wingSpread: 0,
  lArm: [[-8, 1], [-15, -5], [-17, -11]],
  handUp: true,
  rArm: [[8, 1], [14, 8], [17, 13]],
  blade: [9, 24],
  tatter: 0,
  flare: 0,
  feet: [[-4, 0], [3, 1]],
  sash: 0,
  glow: false,
  gleam: false,
};
// Шаг: 6 кадров — покачивание, взмах крыльев, рука и клинок, лохмотья, шаги.
const walkPoses = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * TAU,
    s = Math.sin(a),
    c = Math.cos(a);
  return {
    ...BASE,
    bob: Math.round((1 - Math.cos(2 * a)) / 2),
    wing: Math.round(s * 2),
    lArm: [[-8, 1], [-15 + Math.round(s), -5 + Math.round(c)], [-17 + Math.round(s), -11 + Math.round(c)]],
    rArm: [[8, 1], [14, 8 + Math.round(-s * 0.6)], [17 + Math.round(s * 0.6), 13 + Math.round(-s)]],
    blade: [9 + Math.round(s), 24],
    tatter: i,
    feet: s >= 0 ? [[-4, 0], [3, Math.round(s * 2)]] : [[-4, Math.round(-s * 2)], [3, 0]],
    sash: Math.round(-s),
  };
});
// Замах: клинок отведён вверх-назад; удар: клинок выброшен вперёд и вниз.
const windupPoses = [
  { ...BASE, rArm: [[8, 1], [13, -2], [14, -8]], blade: [2, -24], wing: -1, lArm: [[-8, 1], [-13, 4], [-15, 9]], handUp: false },
  { ...BASE, bob: 1, rArm: [[8, 1], [11, -4], [10, -10]], blade: [-6, -22], wing: -2, lArm: [[-8, 1], [-13, 4], [-15, 9]], handUp: false, gleam: true },
];
const strikePoses = [
  { ...BASE, rArm: [[8, 1], [16, 2], [22, 4]], blade: [24, 4], wing: 2, wingSpread: 1, lArm: [[-8, 1], [-14, 3], [-18, 5]], handUp: false, flare: 2, tatter: 3 },
  { ...BASE, bob: 1, rArm: [[8, 1], [15, 6], [20, 11]], blade: [18, 16], wing: 1, lArm: [[-8, 1], [-14, 4], [-17, 8]], handUp: false, flare: 1, tatter: 4 },
];
// Каст гравитации: когтистая рука поднята выше, крылья раскрыты, глаза светятся.
const castPoses = [0, 1].map((i) => ({
  ...BASE,
  bob: i,
  wing: -2,
  wingSpread: 2,
  lArm: [[-8, 1], [-13, -8], [-14, -16]],
  glow: true,
  tatter: 5 + i,
  flare: 1,
}));

function variants({ img, wheelDy }) {
  const left = flipC(img);
  return {
    r: img,
    l: left,
    // По боссу бьют почти непрерывно: вспышка полупрозрачная, силуэт читается.
    rw: tintC(img, "rgba(255,255,255,.3)"),
    lw: tintC(left, "rgba(255,255,255,.3)"),
    rc: tintC(img, "rgba(200,40,120,.4)"), // обращён свёклой
    lc: tintC(left, "rgba(200,40,120,.4)"),
    ax: CX,
    ay: FEET,
    w: W,
    wheelDy,
  };
}
export const WARDEN_SPR = {
  walk: walkPoses.map((p) => variants(buildBody(p))),
  windup: windupPoses.map((p) => variants(buildBody(p))),
  strike: strikePoses.map((p) => variants(buildBody(p))),
  cast: castPoses.map((p) => variants(buildBody(p))),
};

// Колесо: плоское кольцо в перспективе, 8 спиц и 8 шаров на стержнях.
// Узор повторяется через 45°, поэтому достаточно 12 углов внутри этого шага.
// back — шары за кольцом (рисуются позади тела), front — кольцо и передние шары.
const WHEEL_W = 36,
  WHEEL_H = 18,
  WC = [WHEEL_W / 2, WHEEL_H / 2];
function buildWheel(rot, glow) {
  const RX = 8.5,
    RY = 3.2,
    OX = 14.5,
    OY = 6,
    orbRamp = glow ? ORB_GLOW : ORB;
  const back = new PB(WHEEL_W, WHEEL_H),
    front = new PB(WHEEL_W, WHEEL_H);
  const [wx, wy] = WC;
  const orb = (pb, a) => {
    const ix = wx + Math.cos(a) * RX,
      iy = wy + Math.sin(a) * RY,
      ox = wx + Math.cos(a) * OX,
      oy = wy + Math.sin(a) * OY;
    pb.line(ix, iy, ox, oy, RING[1]);
    pb.ell(ox, oy - 0.5, 2.4, 2.4, (nx, ny, x, y) => ramp(orbRamp, sphereV(nx, ny) * 1.15 + 0.1, x, y));
  };
  for (let k = 0; k < 8; k++) {
    const a = rot + (k * Math.PI) / 4;
    if (Math.sin(a) < 0) orb(back, a);
  }
  for (let k = 0; k < 8; k++) {
    const a = rot + (k * Math.PI) / 4 + Math.PI / 8;
    front.line(wx, wy, wx + Math.cos(a) * RX, wy + Math.sin(a) * RY, RING[1]);
  }
  for (let a = 0; a < TAU; a += 0.02) {
    const x = wx + Math.cos(a) * RX,
      y = wy + Math.sin(a) * RY;
    front.set(x, y, Math.sin(a) > 0 ? (glow ? "#fff4c8" : RING[3]) : RING[2]);
    front.set(x, y + 1, RING[1]);
  }
  front.ell(wx + 0.5, wy + 0.5, 2, 1.4, (nx, ny, x, y) => ramp(orbRamp, sphereV(nx, ny) + 0.2, x, y));
  for (let k = 0; k < 8; k++) {
    const a = rot + (k * Math.PI) / 4;
    if (Math.sin(a) >= 0) orb(front, a);
  }
  back.outline(OUT);
  front.outline(OUT);
  return { back: back.canvas(), front: front.canvas() };
}
export const WARDEN_WHEEL_STEPS = 12;
export const WARDEN_WHEEL = [false, true].map((glow) =>
  Array.from({ length: WARDEN_WHEEL_STEPS }, (_, i) => buildWheel((i / WARDEN_WHEEL_STEPS) * (Math.PI / 4), glow)),
);
export const WARDEN_WHEEL_ANCHOR = WC;
