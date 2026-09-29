import * as THREE from "./three.js";
import { mulberry32 } from "../shared/math.js";
// Небольшой набор для сборки низкополигональных моделей: слияние геометрий,
// неровные «глыбы» (кроны, кусты, камни) и раскладка UV по мировым размерам,
// чтобы пиксели текстур были одного размера на всех предметах.

// Плотность пикселей окружения: мировых единиц на один пиксель текстуры.
export const TEXEL = 1.5;
export const TILE = 64; // размер тайловой текстуры, пикселей

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count);
export function mergeGeometries(list) {
  let vertexCount = 0;
  for (const g of list) vertexCount += triCount(g);
  const pos = new Float32Array(vertexCount * 3),
    nor = new Float32Array(vertexCount * 3),
    uv = new Float32Array(vertexCount * 2),
    col = new Float32Array(vertexCount * 3).fill(1);
  const index = [];
  let v = 0;
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src,
      n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, v * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, v * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, v * 3);
    v += n;
    if (g !== src) g.dispose();
  }
  for (let i = 0; i < vertexCount; i++) index.push(i);
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

const m4 = new THREE.Matrix4(),
  q4 = new THREE.Quaternion(),
  e4 = new THREE.Euler();
// Копия геометрии с преобразованием; color — множитель цвета вершин (тени, мох).
export function placed(geometry, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], color = null, uvScale = null } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  q4.setFromEuler(e4.set(rot[0], rot[1], rot[2]));
  m4.compose(new THREE.Vector3(...pos), q4, new THREE.Vector3(...scale));
  g.applyMatrix4(m4);
  const n = g.attributes.position.count;
  if (color) {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = typeof color === "function" ? color(g.attributes.position, i) : color;
      c[i * 3] = k[0];
      c[i * 3 + 1] = k[1];
      c[i * 3 + 2] = k[2];
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  }
  if (uvScale) {
    const uv = g.attributes.uv;
    for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
  }
  return g;
}

// Плоско затенённая неровная глыба: икосаэдр с шумом на вершинах.
// Одинаковые вершины двигаются одинаково, поэтому поверхность остаётся сплошной.
export function blob({ seed = 1, radius = 10, detail = 1, squash = 1, jitter = 0.18, uvSize = 48 } = {}) {
  const R = mulberry32(seed),
    base = new THREE.IcosahedronGeometry(1, detail),
    moved = new Map(),
    p = base.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, 1 + (R() - 0.5) * 2 * jitter);
    const k = moved.get(key) * radius;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  const g = base.index ? base.toNonIndexed() : base;
  if (g !== base) base.dispose();
  g.computeVertexNormals(); // без индекса: нормаль грани (плоское затенение)
  // Мировая раскладка UV: пиксели одного размера у всех глыб.
  const pos = g.attributes.position,
    uv = g.attributes.uv,
    s = 1 / (TILE * TEXEL);
  for (let i = 0; i < pos.count; i += 3) {
    const nx = Math.abs(g.attributes.normal.getX(i)),
      ny = Math.abs(g.attributes.normal.getY(i)),
      nz = Math.abs(g.attributes.normal.getZ(i));
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k),
        y = pos.getY(i + k),
        z = pos.getZ(i + k);
      if (ny >= nx && ny >= nz) uv.setXY(i + k, x * s, z * s);
      else if (nx >= nz) uv.setXY(i + k, z * s, y * s);
      else uv.setXY(i + k, x * s, y * s);
    }
  }
  return g;
}

// Профиль вращения (радиус, высота) → тело с 8–12 гранями; u идёт по окружности.
export function lathe(profile, segments = 8, turns = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segments);
  const uv = g.attributes.uv,
    s = 1 / (TILE * TEXEL),
    maxR = Math.max(...profile.map((p) => p[0]));
  for (let i = 0; i < uv.count; i++) {
    const y = pts[Math.min(pts.length - 1, Math.round(uv.getY(i) * (pts.length - 1)))].y;
    uv.setXY(i, uv.getX(i) * turns * maxR * 2 * Math.PI * s, y * s);
  }
  return g;
}

// Ссылки на все созданные объекты, чтобы освободить их разом (обход сцены не
// находит общие геометрии и материалы, а утечки при переключениях недопустимы).
export function createTracker() {
  const items = new Set();
  return {
    track(obj) {
      if (obj && (obj.dispose || obj.isObject3D)) items.add(obj);
      return obj;
    },
    dispose() {
      for (const o of items) {
        if (o.isObject3D) {
          o.removeFromParent();
          if (o.isInstancedMesh) o.dispose();
        } else o.dispose?.();
      }
      items.clear();
    },
    get size() {
      return items.size;
    },
  };
}
