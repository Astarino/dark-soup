import { alignY, eulerMatrix, tiltParts, bakeFrame } from "./puppet.js";
// Куклы обычных врагов: гоблин, бегун, громила. Один общий скелет (голова, торс,
// две руки и две ноги в сагиттальной плоскости) с разными пропорциями,
// одеждой и оружием. Позы: ходьба, удар (замах, удар, возврат), попадание, смерть.
export const PX_PER_WU = 0.8; // 1 пиксель спрайта = 1,25 мировой единицы у всех существ
export const TEXEL_WU = 1 / PX_PER_WU;

export const SKIN = {
  goblin: ["#2f3818", "#4a5629", "#65733a", "#84924c", "#a3ae62"],
  runner: ["#3a3c16", "#58602a", "#78843a", "#98a44c", "#b8c060"],
  brute: ["#262e16", "#3b4724", "#526034", "#6b7a44", "#86955a"],
};
const RAG = {
  goblin: ["#1e140c", "#33241a", "#4a3524", "#6a4c34"],
  runner: ["#2a0e0a", "#4a1c14", "#7a2c1e", "#a8442c"],
  brute: ["#18110a", "#2a1f14", "#3e2e1e", "#5e4630"],
};
const STEEL = ["#26262c", "#4a4a54", "#7a7a86", "#b8b8c4"];
const RUST = ["#2a201c", "#4e3a2e", "#7a6a5c", "#b4aa9a"]; // потемневшая сталь с ржавчиной
const WOOD = ["#2a1a0e", "#4a2e18", "#6e4624", "#8e5e32"];
const BONE = ["#5a5648", "#9a9484", "#d0cab8", "#f0ecdc"];
const TOOTH = "#ece2c4";

export const mat = (ramp, extra = {}) => ({ ramp, ...extra });
const dot2 = (a, b, c, d) => Math.hypot(a - c, b - d);

// Лица: u — точка на единичной сфере головы (z вперёд, y вверх, x влево существа).
function gobFace(kind) {
  return (u) => {
    if (u[2] < 0.35) return undefined;
    for (const s of [-1, 1]) {
      const e = dot2(u[0], u[1], s * (kind === "brute" ? 0.36 : 0.44), kind === "brute" ? 0.16 : 0.2);
      if (kind === "brute") {
        if (e < 0.11) return e < 0.06 ? "#ff5a32" : "#2a0c08";
      } else {
        if (e < 0.24) return e < 0.09 ? "#0a0708" : kind === "runner" ? "#f0d060" : "#efe6a0";
      }
    }
    // брови: тёмная полоса над глазами; у громилы — тяжёлая надбровная дуга
    const browY = kind === "brute" ? 0.36 : 0.44;
    if (Math.abs(u[1] - browY) < (kind === "brute" ? 0.09 : 0.05) && Math.abs(u[0]) > 0.14 && Math.abs(u[0]) < 0.66) return "#161a0c";
    // рот и зубы
    if (u[1] < -0.28 && u[1] > -0.46 && Math.abs(u[0]) < 0.4) {
      if (u[1] < -0.3 && u[1] > -0.36 && (Math.abs(u[0] - 0.16) < 0.045 || Math.abs(u[0] + 0.2) < 0.045)) return TOOTH;
      return "#2a0c08";
    }
    return undefined;
  };
}

const SPECS = {
  goblin: {
    hip: 17, hipX: 4.4, thigh: 8.6, shin: 8.4, foot: [3.1, 2.2, 5], legR: [2.6, 2.2],
    pelvis: [6.6, 4.6, 5.2],
    torso: { r: [7.6, 9.6, 6], rel: [0, 11.5, 0.6] },
    shoulder: [8.4, 19.4], upper: 8.4, fore: 8.2, armR: [2.5, 2.2], hand: 2.8,
    head: { r: [8.8, 8.4, 8.2], rel: [0, 27.5, 3] },
    lean: 0.22, cell: [80, 76],
  },
  runner: {
    hip: 19.5, hipX: 3.8, thigh: 9.6, shin: 9.6, foot: [2.7, 2, 5], legR: [2.3, 1.9],
    pelvis: [5.6, 4.2, 4.6],
    torso: { r: [6, 9.4, 4.8], rel: [0, 10.5, 0.6] },
    shoulder: [7.2, 18.4], upper: 8.8, fore: 8.6, armR: [2.1, 1.9], hand: 2.5,
    head: { r: [7.6, 7.4, 7.2], rel: [0, 25.5, 3.4] },
    lean: 0.4, cell: [96, 80],
  },
  brute: {
    hip: 26, hipX: 8.6, thigh: 13, shin: 13, foot: [5.3, 3, 7.2], legR: [5.8, 4.8],
    pelvis: [11.5, 7.2, 8.6],
    torso: { r: [15.2, 15.8, 10.6], rel: [0, 17.5, 0.4] },
    shoulder: [18.2, 28.5], upper: 12.6, fore: 12.2, armR: [5.5, 4.9], hand: 5.8,
    head: { r: [8.6, 8.4, 8.4], rel: [0, 40.5, 5.6] },
    lean: 0.14, cell: [112, 112],
  },
};
const HEIGHT_HINT = { goblin: 56, runner: 54, brute: 76 };
export const CREATURE_SIZE = (type) => ({ w: SPECS[type].cell[0] * TEXEL_WU, h: SPECS[type].cell[1] * TEXEL_WU });

export const rotate = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sag = (base, len, a, x = 0) => [base[0] + x, base[1] - Math.cos(a) * len, base[2] + Math.sin(a) * len];
export function limb(a, b, r0, r1, m) {
  const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    L = Math.hypot(...dir);
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [(r0 + r1) / 2, L / 2 + Math.max(r0, r1) * 0.55, (r0 + r1) / 2], m: alignY(dir), mat: m };
}

// Собирает части куклы. pose: наклон, углы бёдер/колен/плеч/локтей, оружие.
function humanoid(type, pose) {
  const S = SPECS[type],
    skin = mat(SKIN[type]),
    rag = mat(RAG[type]),
    parts = [];
  const bob = pose.bob || 0,
    lean = (pose.lean ?? 0) + S.lean;
  const Rt = eulerMatrix(lean, 0, 0);
  const hipC = [0, S.hip + bob, 0];
  // ноги
  const feet = [];
  for (const [side, sx] of [["L", 1], ["R", -1]]) {
    const hp = [sx * S.hipX, S.hip + bob, 0],
      ha = pose["hip" + side] ?? 0,
      ka = pose["knee" + side] ?? 0.15;
    const knee = sag(hp, S.thigh, ha),
      ankle = sag(knee, S.shin, ha - ka);
    parts.push(limb(hp, knee, S.legR[0], S.legR[1] + 0.2, skin));
    parts.push(limb(knee, ankle, S.legR[1], S.legR[1] - 0.2, skin));
    const foot = { c: [sx * S.hipX, ankle[1] - 1.2, ankle[2] + S.foot[2] * 0.42], r: S.foot, m: eulerMatrix(0, 0, 0), mat: mat(SKIN[type], { gain: 0.85 }) };
    parts.push(foot);
    feet.push(foot);
  }
  // таз и торс
  parts.push({ c: [0, hipC[1] + 1, 0], r: S.pelvis, mat: rag });
  const torsoC = add(hipC, rotate(Rt, S.torso.rel));
  parts.push({
    c: torsoC, r: S.torso.r, m: Rt,
    mat: mat(SKIN[type], {
      paint: (u) => {
        if (type === "brute") {
          // шрамы на груди и кожаный жилет по низу
          if (u[2] > 0.2 && Math.abs(u[0] * 0.9 + u[1] * 0.5 - 0.1) < 0.045 && u[1] > -0.2) return SKIN.brute[1];
          if (u[1] < -0.28) return u[1] < -0.32 ? RAG.brute[1] : RAG.brute[2];
        }
        if (u[1] < -0.12) return undefined; // низ торса — рванина, красится тканью ниже
        return undefined;
      },
    }),
  });
  // тряпичный низ торса (набедренная повязка/жилет)
  const beltY = hipC[1] + 3.5;
  parts.push({ c: [0, beltY, 0.4], r: [S.torso.r[0] * 1.02, 3.4, S.torso.r[2] * 1.04], mat: mat(RAG[type], { gain: 1.05 }) });
  parts.push({ c: [0, hipC[1] - 1, S.pelvis[2] * 0.72], r: [S.pelvis[0] * 0.78, type === "brute" ? 10 : 7, 1.6], m: eulerMatrix(0.12, 0, 0), mat: rag });
  parts.push({ c: [0, hipC[1] - 1, -S.pelvis[2] * 0.72], r: [S.pelvis[0] * 0.7, type === "brute" ? 9 : 6, 1.5], m: eulerMatrix(-0.12, 0, 0), mat: rag });
  // руки
  const hands = {};
  for (const [side, sx] of [["L", 1], ["R", -1]]) {
    const sh = add(hipC, rotate(Rt, [sx * S.shoulder[0], S.shoulder[1], 0.3])),
      a1 = pose["sh" + side] ?? 0,
      a2 = pose["el" + side] ?? 0.4,
      spread = (pose.spread || 0) * sx,
      elbow = sag(sh, S.upper, a1, spread),
      wrist = sag(elbow, S.fore, a1 + a2, spread * 0.6);
    parts.push({ c: sh, r: [S.armR[0] * 1.15, S.armR[0] * 1.15, S.armR[0] * 1.15], mat: type === "brute" ? mat(RAG.brute, { gain: 1.1 }) : skin });
    parts.push(limb(sh, elbow, S.armR[0], S.armR[1], skin));
    parts.push(limb(elbow, wrist, S.armR[1], S.armR[1] - 0.3, skin));
    const hand = { c: [wrist[0], wrist[1] - 0.8, wrist[2] + 0.6], r: [S.hand, S.hand, S.hand * 0.9], mat: mat(SKIN[type], { gain: 0.95 }) };
    parts.push(hand);
    hands[side] = wrist;
  }
  // голова с ушами и лицом
  const hpitch = pose.headPitch || 0,
    Rh = eulerMatrix(lean * 0.5 + hpitch, pose.headYaw || 0, 0),
    headC = add(hipC, rotate(Rt, S.head.rel));
  parts.push({ c: headC, r: S.head.r, m: Rh, mat: mat(SKIN[type], { paint: gobFace(type) }) });
  const H = (rel) => add(headC, rotate(Rh, rel));
  const er = type === "brute" ? 5.4 : 7.8;
  for (const s of [1, -1]) {
    parts.push({ c: H([s * (S.head.r[0] + er * 0.62), 1.4, -0.6]), r: [er, 2.1, 3.1], m: mulSimple(Rh, eulerMatrix(0, s * 0.3, s * 0.42)), mat: mat(SKIN[type], { gain: 0.9 }) });
  }
  parts.push({ c: H([0, -S.head.r[1] * 0.18, S.head.r[2] * 0.98]), r: [1.7, 2.5, 3.3], m: mulSimple(Rh, eulerMatrix(0.5, 0, 0)), mat: skin });
  if (type === "brute")
    for (const s of [1, -1]) parts.push({ c: H([s * 4.6, -S.head.r[1] * 0.52, S.head.r[2] * 0.82]), r: [1.4, 3.6, 1.5], m: mulSimple(Rh, eulerMatrix(-0.3, 0, s * 0.18)), mat: mat(BONE) });
  if (type === "runner") {
    // красная повязка на лбу и два хвоста сзади
    parts.push({
      c: headC, r: [S.head.r[0] * 1.07, S.head.r[1] * 1.07, S.head.r[2] * 1.07], m: Rh,
      mat: mat(RAG.runner, { paint: (u) => (u[1] > 0.5 && u[1] < 0.74 ? (u[0] > 0 ? RAG.runner[2] : RAG.runner[3]) : false) }),
    });
    for (const s of [1, -1]) parts.push({ c: H([s * 2.6, 3.6, -S.head.r[2] - 3.6]), r: [1.6, 1.3, 5], m: mulSimple(Rh, eulerMatrix(0.5, s * 0.4, 0)), mat: mat(RAG.runner) });
  }
  if (type === "goblin") {
    // ржавая серьга-кольцо и шрам через щёку — мелкие детали лица
    parts.push({ c: H([S.head.r[0] + er * 1.05, -2.2, -0.6]), r: [1.2, 1.2, 1.2], mat: mat(RUST) });
  }
  // оружие в правой руке (существа: x < 0)
  const w = pose.weapon || { a: 0.3 },
    wristR = hands.R,
    dir = [pose.weaponSide || 0, Math.cos(w.a), Math.sin(w.a)];
  weaponParts(type, wristR, dir, parts);
  // все ступни на землю: сдвиг по самой низкой точке
  let low = Infinity;
  for (const f of feet) low = Math.min(low, f.c[1] - f.r[1]);
  if (!pose.noGround) for (const p of parts) p.c = [p.c[0], p.c[1] - low, p.c[2]];
  return parts;
}
export const mulSimple = (A, B) => {
  const col = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
  return [col(A, B[0]), col(A, B[1]), col(A, B[2])];
};
function weaponParts(type, hand, dir, parts) {
  const L = Math.hypot(...dir),
    d = dir.map((v) => v / L);
  const at = (k) => [hand[0] + d[0] * k, hand[1] + d[1] * k, hand[2] + d[2] * k];
  const m = alignY(d);
  if (type === "goblin") {
    // ржавый тесак: рукоять и широкое зазубренное лезвие
    parts.push({ c: at(3), r: [1.4, 5.2, 1.4], m, mat: mat(WOOD) });
    parts.push({ c: at(11.5), r: [0.9, 8.6, 3.7], m, mat: mat(RUST, { paint: (u) => (Math.abs(u[1]) > 0.82 && u[2] > 0.3 ? false : undefined) }) });
    parts.push({ c: at(6.6), r: [1.7, 1.3, 2.6], m, mat: mat(STEEL) });
  } else if (type === "runner") {
    // копьё: длинное древко и стальной наконечник
    parts.push({ c: at(11), r: [1.1, 26, 1.1], m, mat: mat(WOOD) });
    parts.push({ c: at(38.5), r: [1.1, 6, 2.5], m, mat: mat(STEEL, { gain: 1.1 }) });
    parts.push({ c: at(31), r: [2, 1.3, 2], m, mat: mat(RAG.runner) });
  } else {
    // дубина с шипами
    parts.push({ c: at(11), r: [2.4, 15, 2.4], m, mat: mat(WOOD) });
    parts.push({ c: at(31), r: [7, 12.5, 7], m, mat: mat(WOOD, { gain: 1.1 }) });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2,
        off = [Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2];
      for (const k of [26, 35]) {
        const base = at(k + (i % 2) * 2.5),
          p = [base[0] + off[0] * 0.95, base[1] + off[1], base[2] + off[2] * 0.95];
        parts.push({ c: p, r: [1.5, 3.3, 1.5], m: alignY(off, 0.0), mat: mat(STEEL, { gain: 1.05 }) });
      }
    }
  }
}

// ── Позы ──
const WALK_FRAMES = 4;
export const CLIPS = { walk: WALK_FRAMES, attack: 3, hit: 1, death: 4 };
function poseFor(type, clip, k) {
  const big = type === "brute",
    run = type === "runner";
  const A = run ? 0.75 : big ? 0.42 : 0.55;
  if (clip === "walk") {
    const phi = (k / WALK_FRAMES) * Math.PI * 2 + 0.4,
      s = Math.sin(phi),
      c = Math.cos(phi);
    return {
      bob: 0,
      hipL: A * s, hipR: -A * s,
      kneeL: 0.12 + 0.75 * Math.max(0, c) * (run ? 1.2 : 1), kneeR: 0.12 + 0.75 * Math.max(0, -c) * (run ? 1.2 : 1),
      shL: -0.5 * s, shR: type === "goblin" ? 0.3 + 0.35 * s : 0.5 * s,
      elL: 0.5 + 0.2 * c, elR: 0.6,
      lean: 0, headPitch: -0.08,
      weapon: run ? { a: 1.25 + 0.06 * s } : big ? { a: 0.5 + 0.15 * s } : { a: 0.5 + 0.2 * s },
    };
  }
  if (clip === "attack") {
    // 0 — замах, 1 — удар, 2 — возврат
    const P = [
      { lean: -0.2, shR: big ? 2.6 : 2.3, elR: 0.5, shL: -0.5, elL: 0.6, hipL: 0.3, hipR: -0.4, kneeL: 0.3, kneeR: 0.3, weapon: { a: big ? -0.5 : -0.3 }, headPitch: 0.2 },
      { lean: 0.55, shR: big ? 1.15 : 1.0, elR: 0.25, shL: 0.9, elL: 0.3, hipL: 0.6, hipR: -0.5, kneeL: 0.25, kneeR: 0.5, weapon: { a: big ? 2.0 : 1.8 }, headPitch: -0.25 },
      { lean: 0.3, shR: 0.9, elR: 0.5, shL: 0.2, elL: 0.4, hipL: 0.3, hipR: -0.2, kneeL: 0.2, kneeR: 0.3, weapon: { a: 1.2 }, headPitch: -0.1 },
    ];
    const p = { ...P[k] };
    if (run) {
      // копьё: замах назад и выпад вперёд
      p.weapon = [{ a: 0.5 }, { a: 1.5 }, { a: 1.15 }][k];
      p.shR = [1.2, 1.55, 1.3][k];
      p.elR = [1.0, 0.1, 0.5][k];
    }
    return p;
  }
  if (clip === "hit") return { lean: -0.38, headPitch: 0.45, shL: -0.7, shR: 0.4, elL: 0.3, elR: 0.3, spread: 0.6, hipL: 0.25, hipR: -0.3, kneeL: 0.5, kneeR: 0.6, weapon: { a: 0.2 } };
  // death: 0 — отдача, 1–3 — падение на спину
  return { lean: -0.3, headPitch: 0.4, shL: -0.6, shR: 0.3, elL: 0.3, elR: 0.3, spread: 0.7, hipL: 0.2, hipR: -0.2, kneeL: 0.6, kneeR: 0.7, weapon: { a: 0.2 } };
}
export function creatureParts(type, clip, k) {
  const base = humanoid(type, poseFor(type, clip, k));
  if (clip !== "death" || k === 0) return base;
  const ang = [0, -0.62, -1.15, -1.5708][k];
  return tiltParts(base, ang, k === 3 ? 0.4 : 0);
}

// Собирает лист спрайтов: строки — 8 направлений (0 — лицом к камере), столбцы — кадры клипов.
// clips — { имя: число кадров }; partsFor(clip, k) — части куклы для кадра.
export function bakeSheet({ cell, clips, partsFor, anchorY = 3, onFrame }) {
  const [cw, ch] = cell,
    entries = Object.entries(clips),
    cols = entries.reduce((n, [, c]) => n + c, 0);
  const index = {};
  let col = 0;
  for (const [clip, n] of entries) {
    index[clip] = { start: col, count: n };
    col += n;
  }
  const W = cw * cols,
    H = ch * 8,
    data = new Uint8ClampedArray(W * H * 4);
  for (const [clip, n] of entries)
    for (let k = 0; k < n; k++) {
      const parts = partsFor(clip, k);
      for (let dir = 0; dir < 8; dir++) {
        const f = bakeFrame({ parts, w: cw, h: ch, scale: PX_PER_WU, azimuth: (dir * Math.PI) / 4, anchorY });
        const x0 = (index[clip].start + k) * cw,
          y0 = dir * ch;
        for (let y = 0; y < ch; y++) data.set(f.data.subarray(y * cw * 4, (y + 1) * cw * 4), ((y0 + y) * W + x0) * 4);
      }
      onFrame?.();
    }
  return { data, width: W, height: H, cell: [cw, ch], index, cols, anchorPx: anchorY };
}
export const bakeCreature = (type, onFrame) => bakeSheet({ cell: SPECS[type].cell, clips: CLIPS, partsFor: (clip, k) => creatureParts(type, clip, k), onFrame });
