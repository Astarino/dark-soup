import { rgb, ramp } from "../render/pixels.js";
// Запекание существ: персонаж собирается из повёрнутых эллипсоидов (голова, торс,
// конечности, оружие) и «фотографируется» с 8 сторон ортогональным лучом.
// Результат — пиксельные спрайты с одним источником света, палитровыми рампами,
// упорядоченным дизерингом и тёмной обводкой. Так силуэт и объём согласованы
// со всех направлений, а ноги всегда стоят на земле. Модуль не использует DOM,
// поэтому проверяется в Node.
//
// Система координат куклы: y — вверх (ступни на y = 0), z — вперёд (взгляд),
// x — на левую руку существа (с точки зрения зрителя, смотрящего спереди — вправо).

const OUTLINE = "#0c0906";
const SPHERE_EPS = 1e-6;

// Матрица (по столбцам) с осью Y вдоль вектора dir; двигаем «вперёд» по z-ориентации.
export function alignY(dir, roll = 0) {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1,
    y = [dir[0] / len, dir[1] / len, dir[2] / len];
  const ref = Math.abs(y[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  let x = [ref[1] * y[2] - ref[2] * y[1], ref[2] * y[0] - ref[0] * y[2], ref[0] * y[1] - ref[1] * y[0]];
  const xl = Math.hypot(...x) || 1;
  x = x.map((v) => v / xl);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  if (!roll) return [x, y, z];
  const c = Math.cos(roll),
    s = Math.sin(roll);
  return [x.map((v, i) => v * c + z[i] * s), y, x.map((v, i) => -v * s + z[i] * c)];
}
export function eulerMatrix(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz);
  // столбцы = образы осей; R = Ry · Rx · Rz
  const Rx = [[1, 0, 0], [0, cx, sx], [0, -sx, cx]],
    Ry = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]],
    Rz = [[cz, sz, 0], [-sz, cz, 0], [0, 0, 1]];
  return mulMat(mulMat(Ry, Rx), Rz);
}
const mulMat = (A, B) => {
  // A·B, матрицы заданы столбцами: (A·B)[j] = A·B[j]
  const col = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
  return [col(A, B[0]), col(A, B[1]), col(A, B[2])];
};
const applyMat = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];

// Поворот всей куклы вокруг оси X (падение на спину) с подъёмом, чтобы ничто не
// уходило под землю.
export function tiltParts(parts, angle, sink = 0) {
  const R = eulerMatrix(angle, 0, 0);
  const out = parts.map((p) => ({ ...p, c: applyMat(R, p.c), m: mulMat(R, p.m || (p.rot ? eulerMatrix(...p.rot) : eulerMatrix())) }));
  let low = Infinity;
  for (const p of out) {
    const ext = Math.hypot(p.m[0][1] * p.r[0], p.m[1][1] * p.r[1], p.m[2][1] * p.r[2]);
    low = Math.min(low, p.c[1] - ext);
  }
  for (const p of out) p.c = [p.c[0], p.c[1] - low - sink, p.c[2]];
  return out;
}

// parts: [{ c:[x,y,z], r:[rx,ry,rz], rot?:[ex,ey,ez], m?:матрица, mat }]
// mat: { ramp:[hex…], gain?, bias?, paint?(u, n) → hex | false | undefined, id? }
// paint получает точку на единичной сфере в локальных осях части (z — вперёд
// части): глаза, зубы, шрамы «приклеены» к части при любом повороте.
export function bakeFrame({ parts, w, h, scale, azimuth, elevation = 0.14, anchorY = 2, light = [-0.5, 0.66, 0.56], outline = OUTLINE }) {
  const ca = Math.cos(azimuth),
    sa = Math.sin(azimuth),
    ce = Math.cos(elevation),
    se = Math.sin(elevation);
  const right = [ca, 0, -sa];
  const d = [-sa * ce, -se, -ca * ce]; // направление взгляда: камера чуть выше
  const up = [right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]];
  const negD = [-d[0], -d[1], -d[2]];
  const L = [0, 1, 2].map((i) => right[i] * light[0] + up[i] * light[1] + negD[i] * light[2]);
  const ll = Math.hypot(...L);
  for (let i = 0; i < 3; i++) L[i] /= ll;

  const cx = w / 2,
    N = w * h;
  const color = new Array(N).fill(null),
    depth = new Float32Array(N).fill(1e9),
    pid = new Int16Array(N).fill(-1);
  // Подготовка частей: обратная матрица, экранная рамка.
  const prepared = parts.map((p, index) => {
    const m = p.m || (p.rot ? eulerMatrix(...p.rot) : eulerMatrix());
    const rmax = Math.max(p.r[0], p.r[1], p.r[2]);
    // центр в экранных координатах (вправо/вверх), пиксели от левого-верхнего угла
    const sx = p.c[0] * right[0] + p.c[1] * right[1] + p.c[2] * right[2],
      sy = p.c[0] * up[0] + p.c[1] * up[1] + p.c[2] * up[2];
    return {
      index,
      p,
      m,
      x0: Math.floor(cx + (sx - rmax) * scale) - 1,
      x1: Math.ceil(cx + (sx + rmax) * scale) + 1,
      y0: Math.floor(h - anchorY - (sy + rmax) * scale) - 1,
      y1: Math.ceil(h - anchorY - (sy - rmax) * scale) + 1,
    };
  });
  const dl = 400;
  for (const q of prepared) {
    const { p, m } = q;
    const inv = [1 / p.r[0], 1 / p.r[1], 1 / p.r[2]];
    // Направление луча в локальных осях (одинаково для всех пикселей).
    const dLoc = [0, 1, 2].map((k) => (m[k][0] * d[0] + m[k][1] * d[1] + m[k][2] * d[2]) * inv[k]);
    const a = dLoc[0] * dLoc[0] + dLoc[1] * dLoc[1] + dLoc[2] * dLoc[2];
    for (let py = Math.max(0, q.y0); py < Math.min(h, q.y1); py++)
      for (let px = Math.max(0, q.x0); px < Math.min(w, q.x1); px++) {
        const sx = (px + 0.5 - cx) / scale,
          sy = (h - anchorY - py - 0.5) / scale;
        const o = [right[0] * sx + up[0] * sy - d[0] * dl - p.c[0], right[1] * sx + up[1] * sy - d[1] * dl - p.c[1], right[2] * sx + up[2] * sy - d[2] * dl - p.c[2]];
        const oLoc = [0, 1, 2].map((k) => (m[k][0] * o[0] + m[k][1] * o[1] + m[k][2] * o[2]) * inv[k]);
        const b = oLoc[0] * dLoc[0] + oLoc[1] * dLoc[1] + oLoc[2] * dLoc[2],
          cc = oLoc[0] * oLoc[0] + oLoc[1] * oLoc[1] + oLoc[2] * oLoc[2] - 1,
          disc = b * b - a * cc;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / a;
        const idx = py * w + px;
        if (t >= depth[idx]) continue;
        const u = [oLoc[0] + dLoc[0] * t, oLoc[1] + dLoc[1] * t, oLoc[2] + dLoc[2] * t];
        const ul = Math.hypot(...u) || 1;
        u[0] /= ul;
        u[1] /= ul;
        u[2] /= ul;
        // нормаль в мире: R · (u / r)
        const gl = [u[0] * inv[0], u[1] * inv[1], u[2] * inv[2]];
        let n = [m[0][0] * gl[0] + m[1][0] * gl[1] + m[2][0] * gl[2], m[0][1] * gl[0] + m[1][1] * gl[1] + m[2][1] * gl[2], m[0][2] * gl[0] + m[1][2] * gl[1] + m[2][2] * gl[2]];
        const nl = Math.hypot(...n) || 1;
        n = [n[0] / nl, n[1] / nl, n[2] / nl];
        const mat = p.mat;
        let col = mat.paint ? mat.paint(u, n, px, py) : undefined;
        if (col === false) continue; // «дырка» — луч идёт дальше (повязка, глазницы)
        if (!col) {
          const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
          // мягкий верхний свет и затемнение у земли
          const sky = 0.5 + 0.5 * n[1],
            v = 0.2 + 0.62 * lam + 0.14 * sky;
          const ground = 0.78 + 0.22 * Math.min(1, Math.max(0, (p.c[1] + u[1] * p.r[1]) / 14));
          col = ramp(mat.ramp, (v * (mat.gain ?? 1) + (mat.bias ?? 0)) * ground, px, py);
        }
        color[idx] = col;
        depth[idx] = t;
        pid[idx] = q.index;
      }
  }
  // Внутренние контуры: пиксель темнеет, если рядом есть более близкая другая часть.
  const dark = (hex) => {
    const [r, g, b] = rgb(hex),
      [or, og, ob] = rgb(outline);
    return `#${[0, 1, 2].map((i) => Math.round([r, g, b][i] * 0.5 + [or, og, ob][i] * 0.5).toString(16).padStart(2, "0")).join("")}`;
  };
  const edge = new Array(N).fill(false);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!color[i]) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (color[j] && pid[j] !== pid[i] && depth[j] < depth[i] - 2.2) {
          edge[i] = true;
          break;
        }
      }
    }
  const out = new Uint8ClampedArray(N * 4);
  const setPx = (i, hex) => {
    const [r, g, b] = rgb(hex);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  };
  for (let i = 0; i < N; i++) if (color[i]) setPx(i, edge[i] ? dark(color[i]) : color[i]);
  // Внешняя обводка в 1 пиксель.
  const ring = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (color[i]) continue;
      if ((x > 0 && color[i - 1]) || (x < w - 1 && color[i + 1]) || (y > 0 && color[i - w]) || (y < h - 1 && color[i + w])) ring.push(i);
    }
  for (const i of ring) setPx(i, outline);
  return { data: out, w, h };
}
export { SPHERE_EPS };
