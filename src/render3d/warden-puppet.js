import { alignY, eulerMatrix, tiltParts } from "./puppet.js";
import { bakeSheet, mat, limb, add, rotate, mulSimple } from "./creatures.js";
// Существо-1 (Страж Колеса): высокая рогатая фигура в рваном саване, тёмно-зелёная
// кожа, крылья, когтистая левая рука и клинок из кости в правой. Колесо
// (кольцо с восемью шарами) — отдельная трёхмерная модель над головой,
// потому что оно вращается и светится при адаптации.
const SKIN = ["#17200e", "#29391a", "#3c5025", "#506732", "#647d40", "#7b934f"];
const SHROUD = ["#0a0908", "#16130f", "#241e19", "#382f27"];
const HORN = ["#060505", "#241e1a", "#48403a", "#8a7e70"];
const BONE = ["#6e6a60", "#aaa598", "#dcd8cc", "#f2efe6"];
const EYE = "#ff2a2a";
const EYE_CAST = "#c050ff";

export const WARDEN_CLIPS = { walk: 6, windup: 2, strike: 2, cast: 2, hit: 1, death: 4 };
export const WARDEN_CELL = [144, 144];

function wardenFace(glow) {
  return (u) => {
    if (u[2] < 0.3) return undefined;
    for (const s of [-1, 1]) {
      const e = Math.hypot(u[0] - s * 0.4, u[1] - 0.12);
      if (e < 0.2) return e < 0.12 ? (glow ? EYE_CAST : EYE) : "#050203";
    }
    if (u[1] > 0.3 && u[1] < 0.38 && Math.abs(u[0]) > 0.15 && Math.abs(u[0]) < 0.75) return SKIN[0];
    if (u[1] < -0.32 && u[1] > -0.42 && Math.abs(u[0]) < 0.42) return "#180608";
    return undefined;
  };
}

function wardenBase(p) {
  const skin = mat(SKIN, { gain: 1 }),
    shroud = mat(SHROUD),
    bone = mat(BONE),
    horn = mat(HORN),
    parts = [];
  const bob = p.bob || 0,
    Y = (v) => v + bob;
  // Саван: несколько расширяющихся к низу слоёв и рваные лоскуты по подолу.
  const layers = [
    [74, 11, 12, 8],
    [64, 12.6, 12, 9.4],
    [54, 14.2, 12, 10.8],
    [44, 15.8, 12, 12.2],
    [34, 17.4, 12, 13.6],
    [24, 19, 12, 15],
    [14, 20.6, 11, 16.4],
  ];
  layers.forEach(([y, rx, ry, rz], i) => parts.push({ c: [0, Y(y), -1 + i * 0.2], r: [rx + (p.flare || 0) * i * 0.3, ry, rz], mat: mat(SHROUD, { gain: 1.1 + i * 0.02 }) }));
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + 0.3,
      sway = Math.sin(p.tatter * 1.3 + k * 1.9) * 2.4,
      len = 9 + ((k * 7) % 5) * 1.6;
    parts.push({ c: [Math.cos(a) * 20.5 + sway, 5 + bob * 0.5, Math.sin(a) * 15.5], r: [3.2, len * 0.65, 2.4], m: eulerMatrix(0, -a + 1.57, Math.cos(a) * 0.25), mat: shroud });
  }
  // мыски, еле видные из-под савана
  for (const s of [-1, 1]) parts.push({ c: [s * 6, 2.4, 10 + (p.feet?.[s > 0 ? 0 : 1] ?? 0)], r: [2.4, 2.1, 5.4], mat: mat(SKIN, { gain: 0.7 }) });
  // торс
  const torsoC = [0, Y(88), 0.6];
  parts.push({
    c: torsoC, r: [10.6, 15.5, 7.4], m: eulerMatrix(0.06, 0, 0),
    mat: mat(SKIN, { paint: (u) => ((u[0] * 5 + u[1] * 3 + 40) % 1 < 0.06 && u[2] > 0.3 ? SKIN[1] : undefined) }),
  });
  // воронка на груди: тёмное «колесо-глаз»
  parts.push({ c: [0, Y(90), 7.4], r: [3.6, 3.6, 1.2], mat: mat(SHROUD, { paint: (u) => (Math.hypot(u[0], u[1]) < 0.22 ? (p.glow ? "#b07ae0" : "#6a0c12") : undefined) }) });
  // пояс из костей и лента
  parts.push({ c: [0, Y(72.6), 0.8], r: [12.8, 2.6, 9.4], mat: bone });
  parts.push({ c: [6.5 + (p.sash || 0), Y(63), 8.4], r: [1.6, 9, 0.9], m: eulerMatrix(0.1, 0, 0.1), mat: bone });
  // наплечники-шипы
  for (const s of [-1, 1]) {
    parts.push({ c: [s * 14.5, Y(100.5), 0], r: [4.6, 3.6, 4.4], mat: shroud });
    parts.push({ c: [s * 16.5, Y(105.5), -0.5], r: [1.6, 6.4, 1.6], m: eulerMatrix(0, 0, -s * 0.32), mat: bone });
  }
  // крылья: по пять «перьев», взмах по фазе
  for (const s of [-1, 1]) {
    const flap = (p.wing || 0) * (s < 0 ? 1 : 0.85),
      spread = p.wingSpread || 0;
    for (let f = 0; f < 5; f++) {
      const a = 0.35 + f * 0.24 + spread * 0.08 + flap * 0.06,
        L = 30 - f * 2.4,
        base = [s * 6, Y(95 - f * 2.4), -6],
        tip = [s * (6 + Math.sin(a) * L), Y(95 - f * 2.4 + Math.cos(a) * L * 0.55 + flap * 0.8), -6 - 5 - Math.cos(a) * 5];
      parts.push(limb(base, tip, 3.6 - f * 0.25, 0.9, mat(SHROUD, { gain: 1.15 })));
    }
  }
  // левая рука с когтями (поднята)
  const shL = [14, Y(97), 0],
    L = p.lArm,
    elbowL = [shL[0] + L[0][0], shL[1] + L[0][1], shL[2] + L[0][2]],
    handL = [elbowL[0] + L[1][0], elbowL[1] + L[1][1], elbowL[2] + L[1][2]];
  parts.push(limb(shL, elbowL, 3, 2.6, skin), limb(elbowL, handL, 2.6, 2.1, skin));
  parts.push({ c: handL, r: [3.4, 3.4, 3], mat: skin });
  for (let i = 0; i < 4; i++) {
    const dx = -3.6 + i * 2.4;
    parts.push(limb([handL[0] + dx * 0.6, handL[1] + 1, handL[2] + 1], [handL[0] + dx, handL[1] + 7, handL[2] + 4.5], 1.1, 0.4, mat(BONE)));
  }
  if (p.glow) parts.push({ c: [handL[0], handL[1] + 11, handL[2] + 3], r: [4.4, 4.4, 4.4], mat: mat(["#0a0612", "#5a2a8a", "#b07ae0", "#f0dcff"], { gain: 1.1 }) });
  // правая рука с костяным клинком
  const shR = [-14, Y(97), 0],
    R = p.rArm,
    elbowR = [shR[0] + R[0][0], shR[1] + R[0][1], shR[2] + R[0][2]],
    handR = [elbowR[0] + R[1][0], elbowR[1] + R[1][1], elbowR[2] + R[1][2]];
  parts.push(limb(shR, elbowR, 3, 2.6, skin), limb(elbowR, handR, 2.6, 2.1, skin));
  parts.push({ c: handR, r: [3.2, 3.2, 3.2], mat: skin });
  const bd = p.blade,
    bl = Math.hypot(...bd),
    bdir = bd.map((v) => v / bl);
  const seg = (t0, t1, r0, r1) => limb(add(handR, bdir.map((v) => v * t0)), add(handR, bdir.map((v) => v * t1)), r0, r1, mat(BONE, { gain: 1.05 + (p.gleam ? 0.25 : 0) }));
  parts.push(seg(-4, 6, 1.6, 1.6));
  parts.push({ c: add(handR, bdir.map((v) => v * 7)), r: [4.6, 1.3, 1.6], m: alignY([1, 0, 0]), mat: mat(BONE) });
  const b1 = seg(6, 26, 0.9, 3.4),
    b2 = seg(26, 46, 3.2, 1.2);
  b1.r = [0.9, b1.r[1], 3.3];
  b2.r = [0.7, b2.r[1], 2.6];
  parts.push(b1, b2);
  // шея, голова, уши, рога
  parts.push({ c: [0, Y(107), 1.5], r: [2.8, 5, 2.8], mat: skin });
  const hp = p.headPitch || 0,
    Rh = eulerMatrix(hp, 0, 0),
    headC = [0, Y(115), 3];
  parts.push({ c: headC, r: [6.6, 8.4, 6.8], m: Rh, mat: mat(SKIN, { paint: wardenFace(p.glow) }) });
  parts.push({ c: add(headC, rotate(Rh, [0, -7.6, 2.4])), r: [3.6, 4.2, 4], m: Rh, mat: skin });
  const H = (rel) => add(headC, rotate(Rh, rel));
  for (const s of [-1, 1]) {
    parts.push({ c: H([s * 11.5, 2, -1]), r: [8.4, 1.8, 2.4], m: mulSimple(Rh, eulerMatrix(0, s * 0.28, s * 0.5)), mat: skin });
    // два рога: короткий и длинный, изгиб цепочкой эллипсоидов
    for (const [rise, spread, w] of [[9, 7, 1.7], [18, 8.5, 2.3]]) {
      let prev = H([s * 4.2, rise * 0.15 + 4, -0.5]);
      for (let t = 1; t <= 4; t++) {
        const k = t / 4,
          pt = H([s * (4.2 + spread * k + 0.28 * spread * k * k), 4 + rise * k - 0.13 * rise * k * k * 0 + (rise > 12 ? 0 : 0), -0.5 - k * 1.2]);
        parts.push(limb(prev, pt, w * (1.1 - k * 0.7), w * (1.1 - (k + 0.25) * 0.7), mat(HORN)));
        prev = pt;
      }
    }
  }
  return parts;
}
const BASE = {
  bob: 0, wing: 0, wingSpread: 0, tatter: 0, flare: 0, sash: 0, glow: false, gleam: false, headPitch: 0,
  lArm: [[-3, -12, 5], [3, 8, 5]],
  rArm: [[-3, -9, 3], [-2, -8, 4]],
  blade: [0.2, -1, 0.5],
};
const POSES = {
  walk: Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2,
      s = Math.sin(a),
      c = Math.cos(a);
    return { ...BASE, bob: Math.abs(s) * 1.6, wing: s * 2, tatter: i, sash: -s, feet: [s * 2, -s * 2], lArm: [[-3, -12 + c, 5], [3, 8, 5 + s]], rArm: [[-3, -9, 3 + s], [-2, -8, 4 + s]], blade: [0.2, -1, 0.5 + s * 0.15] };
  }),
  windup: [
    { ...BASE, wing: -1, rArm: [[-4, 2, -3], [-3, 9, -5]], blade: [0.1, 0.5, -1], headPitch: 0.1 },
    { ...BASE, bob: 1, wing: -2, gleam: true, rArm: [[-4, 6, -5], [-3, 8, -6]], blade: [0.1, 0.9, -1], headPitch: 0.2 },
  ],
  strike: [
    { ...BASE, wing: 2, wingSpread: 1, flare: 2, tatter: 3, rArm: [[-4, -5, 9], [-3, -4, 9]], blade: [0.15, -0.35, 1], headPitch: -0.15 },
    { ...BASE, bob: 1, wing: 1, flare: 1, tatter: 4, rArm: [[-4, -10, 7], [-3, -9, 6]], blade: [0.15, -1, 0.5], headPitch: -0.1 },
  ],
  cast: [0, 1].map((i) => ({ ...BASE, bob: i, wing: -2, wingSpread: 2, glow: true, tatter: 5 + i, flare: 1, lArm: [[-2, 4, 6], [3, 11, 5]], rArm: [[-3, -9, 3], [-2, -8, 4]] })),
  hit: [{ ...BASE, headPitch: -0.3, wing: 2, tatter: 2, lArm: [[-4, -6, -2], [3, 6, -3]], rArm: [[-4, -6, -1], [-3, -7, 1]], blade: [0.2, -1, 0] }],
};
export function wardenParts(clip, k) {
  if (clip === "death") {
    const base = wardenBase({ ...POSES.hit[0] });
    if (k === 0) return base;
    return tiltParts(base, [0, -0.5, -1.05, -1.5708][k], k === 3 ? 0.6 : 0);
  }
  return wardenBase(POSES[clip][k]);
}
export const bakeWarden = (onFrame) => bakeSheet({ cell: WARDEN_CELL, clips: WARDEN_CLIPS, partsFor: wardenParts, anchorY: 3, onFrame });
