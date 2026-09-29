import * as THREE from "./three.js";
import { clamp, mulberry32 } from "../shared/math.js";
import { TEXEL, TILE, blob, lathe, mergeGeometries, placed } from "./geometry-kit.js";
// Геометрия неподвижных предметов леса. Размеры выбраны по существующим
// столкновениям (data мира): толстый ствол дерева = радиус его коллайдера,
// брёвна лежат вдоль тех же трёх кругов, палатка вписана в круг r=58, камни и
// пни — по радиусу коллайдера. Высоты больше, чем у спрайтов вида сверху,
// чтобы лес ощущался пространством: игрок (котёл) ниже кроны.
const S = 1 / (TILE * TEXEL);
const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
};
// Отрезок-ветка/жердь между двумя точками (цилиндр с 6–8 гранями).
export function limb(a, b, r0, r1, segments = 6, uvTile = TILE * TEXEL) {
  const va = new THREE.Vector3(...a),
    vb = new THREE.Vector3(...b),
    len = va.distanceTo(vb),
    g = new THREE.CylinderGeometry(r1, r0, len, segments, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((2 * Math.PI * Math.max(r0, r1)) / uvTile), uv.getY(i) * (len / uvTile));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
const shade = (yMin, yMax, lo = 0.5, hi = 1.15) => (pos, i) => {
  const k = clamp((pos.getY(i) - yMin) / Math.max(1, yMax - yMin), 0, 1),
    v = lo + (hi - lo) * k;
  return [v, v, v * 1.03];
};

// ── Деревья ──
// Параметры совпадают с семействами мира: OAKS s=14+i, OAKS_B s=19+(i%3), PINES 9+(i%3), PINES_B 12+(i%3).
export const TREE_FAMILIES = {
  OAKS: { pine: false, size: (i) => 14 + i, radius: 11 },
  OAKS_B: { pine: false, size: (i) => 19 + (i % 3), radius: 11 },
  PINES: { pine: true, size: (i) => 9 + (i % 3), radius: 9 },
  PINES_B: { pine: true, size: (i) => 12 + (i % 3), radius: 9 },
};
export const treeHeight = (family, index) => {
  const f = TREE_FAMILIES[family],
    s = f.size(index);
  return f.pine ? s * 15 + 90 : s * 7 + 60;
};
export function buildTree(family, index) {
  const f = TREE_FAMILIES[family],
    s = f.size(index),
    R = mulberry32(1000 + s * 31 + index * 7 + (f.pine ? 500 : 0)),
    H = treeHeight(family, index),
    r0 = f.radius;
  const trunkProfile = f.pine
    ? [[r0 * 1.3, 0], [r0 * 1.0, 10], [r0 * 0.78, H * 0.25], [r0 * 0.5, H * 0.6], [r0 * 0.2, H * 0.97]]
    : [[r0 * 1.3, 0], [r0 * 1.02, 9], [r0 * 0.82, H * 0.3], [r0 * 0.68, H * 0.55], [r0 * 0.55, H * 0.7]];
  const trunk = [flat(lathe(trunkProfile, 8, 1))];
  // корни: три коротких выступа у основания
  for (let k = 0; k < 3; k++) {
    const a = R() * Math.PI * 2 + k * 2.1;
    trunk.push(limb([Math.cos(a) * r0 * 0.6, 8, Math.sin(a) * r0 * 0.6], [Math.cos(a) * r0 * 1.35, 0, Math.sin(a) * r0 * 1.35], 3.4, 1.4, 5));
  }
  let crown;
  if (f.pine) {
    const parts = [],
      tiers = 5,
      Rb = s * 3.6;
    for (let i = 0; i < tiers; i++) {
      const y0 = H * (0.36 + i * 0.125),
        ht = H * 0.22 + i * 1.5,
        rad = Rb * (1 - i * 0.19);
      const prof = [[0.01, y0 + ht], [rad * 0.55, y0 + ht * 0.5], [rad, y0 + 3], [rad * 0.6, y0 - 3], [rad * 0.12, y0 + 2]];
      const g = flat(lathe(prof, 9, 1.4));
      // рваные лапы: вершины нижнего кольца сдвигаются по кругу
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v);
        if (y < y0 + 5) {
          const k = 1 + (R() - 0.5) * 0.22;
          p.setXYZ(v, p.getX(v) * k, y - R() * 2, p.getZ(v) * k);
        }
      }
      g.computeVertexNormals();
      parts.push(placed(g, { rot: [0, R() * 6.28, 0], color: shade(y0 - 4, y0 + ht, 0.55, 1.1) }));
    }
    crown = mergeGeometries(parts);
  } else {
    const parts = [],
      cy = H * 0.68,
      Rc = s * 2.3;
    const n = 7;
    parts.push(placed(blob({ seed: index * 13 + s, radius: Rc * 0.78, detail: 1, squash: 0.82, jitter: 0.16 }), { pos: [0, cy, 0], color: shade(cy - Rc, cy + Rc, 0.5, 1.15) }));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R() * 0.7,
        d = Rc * (0.55 + R() * 0.25),
        rr = Rc * (0.42 + R() * 0.2),
        y = cy + (R() - 0.35) * Rc * 0.45;
      parts.push(placed(blob({ seed: 50 + k * 7 + index + s, radius: rr, detail: 1, squash: 0.8, jitter: 0.18 }), { pos: [Math.cos(a) * d, y, Math.sin(a) * d], color: shade(cy - Rc, cy + Rc, 0.5, 1.15) }));
      // ветка от ствола к этой массе листвы
      trunk.push(limb([0, H * 0.5, 0], [Math.cos(a) * d * 0.7, y - rr * 0.3, Math.sin(a) * d * 0.7], 4.2, 2.2, 6));
    }
    crown = mergeGeometries(parts);
  }
  const bark = mergeGeometries(trunk);
  trunk.forEach((g) => g.dispose());
  return { trunk: bark, crown, height: H };
}

// ── Кусты: три шара разного размера, ниже глаза котла ──
export function buildBush(variant) {
  const s = 6 + variant * 2, // как у спрайта: s арт-пикселей
    Rr = s * 1.7;
  const parts = [
    placed(blob({ seed: 300 + variant, radius: Rr, detail: 1, squash: 0.85, jitter: 0.2 }), { pos: [0, Rr * 0.75, 0], color: shade(0, Rr * 1.8, 0.55, 1.1) }),
    placed(blob({ seed: 310 + variant, radius: Rr * 0.68, detail: 1, squash: 0.85, jitter: 0.2 }), { pos: [-Rr * 0.95, Rr * 0.5, Rr * 0.2], color: shade(0, Rr * 1.8, 0.5, 1.05) }),
    placed(blob({ seed: 320 + variant, radius: Rr * 0.72, detail: 1, squash: 0.85, jitter: 0.2 }), { pos: [Rr * 0.9, Rr * 0.5, -Rr * 0.15], color: shade(0, Rr * 1.8, 0.5, 1.05) }),
  ];
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// ── Камни: радиус = коллайдер (0,8 ширины спрайта), стоят на земле ──
export const ROCK_RADIUS = [14.4, 17.6, 20.8];
export function buildRock(index) {
  const r = ROCK_RADIUS[index],
    main = blob({ seed: 90 + index * 5, radius: r, detail: 1, squash: 0.72, jitter: 0.24 }),
    small = blob({ seed: 120 + index, radius: r * 0.42, detail: 1, squash: 0.7, jitter: 0.26 });
  const cut = (g, floor) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < floor) p.setY(i, floor);
    g.computeVertexNormals();
    return g;
  };
  cut(main, -r * 0.5);
  cut(small, -r * 0.2);
  const parts = [placed(main, { pos: [0, r * 0.5, 0] }), placed(small, { pos: [r * 0.78, r * 0.2, r * 0.42], rot: [0, 1, 0] })];
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  main.dispose();
  small.dispose();
  return g;
}

// ── Пень: ствол с расширением корней и спил с годовыми кольцами ──
export function buildStump() {
  const r = 13,
    h = 20;
  const side = flat(lathe([[r * 1.2, 0], [r * 1.02, 5], [r * 0.95, 14], [r * 0.98, h]], 10, 1));
  const parts = [side];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6 + 0.4;
    parts.push(limb([Math.cos(a) * r * 0.6, 6, Math.sin(a) * r * 0.6], [Math.cos(a) * r * 1.3, 0, Math.sin(a) * r * 1.3], 3, 1.2, 5));
  }
  const cap = new THREE.CircleGeometry(r * 0.99, 10);
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, h + 0.05, 0);
  const bark = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return { bark, cap };
}

// ── Бревно вдоль оси X: кора и торцы с кольцами различаются ──
export function buildLog(len, radius = 11) {
  const seg = 10,
    side = new THREE.CylinderGeometry(radius, radius, len, seg, 1, true);
  const uv = side.attributes.uv,
    circ = 2 * Math.PI * radius;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (circ / (TILE * TEXEL)), uv.getY(i) * (len / (TILE * TEXEL)));
  side.rotateZ(Math.PI / 2); // ось цилиндра → X
  const g = flat(side);
  const caps = [];
  for (const dir of [-1, 1]) {
    const c = new THREE.CircleGeometry(radius * 0.98, seg);
    c.rotateY(dir * Math.PI / 2);
    c.translate((dir * len) / 2 + dir * 0.05, 0, 0);
    caps.push(c);
  }
  // сучок-обрубок
  const stub = limb([len * 0.12, radius * 0.8, 0], [len * 0.12 + 3, radius * 1.5, 5], 2.6, 1.6, 5);
  const bark = mergeGeometries([g, stub]);
  g.dispose();
  stub.dispose();
  const capsGeo = mergeGeometries(caps);
  caps.forEach((c) => c.dispose());
  return { bark, caps: capsGeo };
}

// ── Палатка: А-образная, вход к костру; вписана в круг коллайдера r=58 ──
export function buildTent() {
  const W = 78,
    D = 88,
    Ht = 64,
    hw = W / 2,
    hd = D / 2;
  const tri = (a, b, c, uvs) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  };
  const quad = (a, b, c, d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    const u = (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) * S,
      v = (Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2])) * S;
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
    g.computeVertexNormals();
    return g;
  };
  // Скаты: от конька (x=0, y=Ht) к нижним краям (±hw, y=0).
  const ridgeF = [0, Ht, hd],
    ridgeB = [0, Ht, -hd];
  const roofL = quad([-hw, 0, hd], [-hw, 0, -hd], ridgeB, ridgeF),
    roofR = quad([hw, 0, -hd], [hw, 0, hd], ridgeF, ridgeB);
  // Задняя стенка — сплошная.
  const back = tri([-hw, 0, -hd], [hw, 0, -hd], ridgeB, [0, 0, W * S, 0, W * S * 0.5, Ht * S]);
  // Передняя: два откинутых полотнища и тёмный проём между ними.
  const open = 0.34; // доля ширины у основания, оставленная под вход
  const dx = hw * open;
  const flapL = tri([-hw, 0, hd], [-dx, 0, hd], ridgeF, [0, 0, (hw - dx) * S, 0, (hw - dx) * S * 0.5, Ht * S]);
  const flapR = tri([dx, 0, hd], [hw, 0, hd], ridgeF, [0, 0, (hw - dx) * S, 0, (hw - dx) * S * 0.5, Ht * S]);
  const canvas = mergeGeometries([roofL, roofR, back, flapL, flapR]);
  // Внутренность: тёмный проём, задняя тень и пол.
  const inside = mergeGeometries([
    tri([-dx, 0, hd - 0.3], [dx, 0, hd - 0.3], ridgeF.map((v, i) => (i === 2 ? v - 0.3 : v)), [0, 0, 1, 0, 0.5, 1]),
    quad([-hw + 2, 0.4, -hd + 2], [hw - 2, 0.4, -hd + 2], [hw - 2, 0.4, hd], [-hw + 2, 0.4, hd]),
  ]);
  // Жерди: конёк выступает вперёд, стойки у входа, вымпел на конце.
  const poles = mergeGeometries([
    limb([0, Ht + 1, -hd - 4], [0, Ht + 1, hd + 8], 1.6, 1.6, 6),
    limb([-dx - 3, 0, hd + 5], [0, Ht + 1, hd + 8], 1.5, 1.4, 6),
    limb([dx + 3, 0, hd + 5], [0, Ht + 1, hd + 8], 1.5, 1.4, 6),
    limb([-hw, 1.5, hd - 1], [-hw, 1.5, -hd + 1], 1.4, 1.4, 5),
    limb([hw, 1.5, hd - 1], [hw, 1.5, -hd + 1], 1.4, 1.4, 5),
  ]);
  // Колышки и петли у углов — внутри круга столкновения.
  const stakes = mergeGeometries(
    [[-hw, hd], [hw, hd], [-hw, -hd], [hw, -hd]].flatMap(([x, z]) => [limb([x * 1.06, 6, z * 1.05], [x * 1.06, -1, z * 1.05], 1.3, 0.8, 5)]),
  );
  const pennant = tri([0, Ht + 1, hd + 8], [0, Ht + 9, hd + 8], [0, Ht + 5, hd + 22], [0, 0, 1, 0, 0.5, 1]);
  // Спальник в глубине — едва видимый в проёме.
  const bedroll = placed(blob({ seed: 5, radius: 11, detail: 1, squash: 0.5, jitter: 0.1 }), { pos: [-6, 5, -hd + 20], scale: [1.4, 1, 2] });
  return { canvas, inside, poles, stakes, pennant, bedroll, width: W, depth: D, height: Ht };
}

// ── Ящик с овощами у костра: вписан в круг r=16 ──
export function buildCrate() {
  const w = 22,
    h = 20;
  const box = new THREE.BoxGeometry(w, h, w);
  box.translate(0, h / 2, 0);
  const uv = box.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * S * 2, uv.getY(i) * h * S * 2);
  const posts = mergeGeometries(
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => placed(new THREE.BoxGeometry(2.4, h + 1, 2.4), { pos: [x * (w / 2 - 0.4), h / 2, z * (w / 2 - 0.4)] })),
  );
  const carrots = mergeGeometries(
    [-5, 0, 5].map((x, i) => placed(new THREE.ConeGeometry(2.2, 15, 6), { pos: [x - 1, h + 5, -4 + i * 3], rot: [Math.PI, 0, (i - 1) * 0.28] })),
  );
  const tops = mergeGeometries(
    [-5, 0, 5].map((x, i) => placed(blob({ seed: 700 + i, radius: 3.2, detail: 0, squash: 1.2, jitter: 0.25 }), { pos: [x - 1 - (i - 1) * 2.4, h + 13.5, -4 + i * 3] })),
  );
  const cabbage = placed(blob({ seed: 710, radius: 6.5, detail: 1, squash: 0.95, jitter: 0.1 }), { pos: [4, h + 5, 4] });
  const onions = mergeGeometries([
    placed(blob({ seed: 720, radius: 3.6, detail: 1, squash: 1, jitter: 0.06 }), { pos: [-6, h + 3.2, 5] }),
    placed(blob({ seed: 721, radius: 3.2, detail: 1, squash: 1, jitter: 0.06 }), { pos: [-1, h + 2.8, 7.5] }),
  ]);
  return { box, posts, carrots, tops, cabbage, onions };
}

// ── Котёл на треноге для меню и вступления ──
export function buildPotModel() {
  const body = flat(
    lathe([[0.01, 27], [10, 27.5], [19, 32], [25, 42], [27, 52], [28.6, 57], [26.6, 58.2], [25.2, 55], [0.01, 55]], 14, 1),
  );
  const rim = new THREE.TorusGeometry(27.6, 1.7, 5, 16);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 57.8, 0);
  const handles = mergeGeometries([
    limb([-28, 54, 0], [-34, 60, 0], 1.6, 1.6, 5),
    limb([28, 54, 0], [34, 60, 0], 1.6, 1.6, 5),
    limb([-34, 60, 0], [0, 84, 0], 1, 1, 4),
    limb([34, 60, 0], [0, 84, 0], 1, 1, 4),
  ]);
  const legs = mergeGeometries(
    [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      return limb([Math.cos(a) * 3, 118, Math.sin(a) * 3], [Math.cos(a) * 44, 0, Math.sin(a) * 44], 2, 2.3, 6);
    }),
  );
  const chain = limb([0, 118, 0], [0, 84, 0], 0.9, 0.9, 4);
  const soup = new THREE.CircleGeometry(24.4, 14);
  soup.rotateX(-Math.PI / 2);
  soup.translate(0, 54.6, 0);
  const iron = mergeGeometries([body, rim]);
  const wood = mergeGeometries([legs, chain, handles]);
  return { iron, wood, soup };
}
// Костровые брёвна: пять коротких поленьев звездой + зола.
export function buildFireLogs() {
  const logs = [
    [0, 0.2], [1.26, 0.2], [2.5, 0.2], [3.77, 0.2], [5.03, 0.2],
  ].map(([a]) => limb([Math.cos(a) * 3, 3, Math.sin(a) * 3], [Math.cos(a) * 26, 6.5 - (a % 2) * 2, Math.sin(a) * 26], 3.2, 2.6, 6));
  const g = mergeGeometries(logs);
  logs.forEach((l) => l.dispose());
  return g;
}
export function buildFirePit() {
  const stones = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2;
    stones.push(placed(blob({ seed: 800 + k, radius: 5.2 + (k % 3) * 0.8, detail: 0, squash: 0.65, jitter: 0.2 }), { pos: [Math.cos(a) * 24, 2.6, Math.sin(a) * 12] }));
  }
  const sticks = [0, 1, 2].map((i) => limb([-10 + i * 6, 1.6, -3 + i * 3], [4 + i * 5, 2.4, 3 - i * 2], 1.5, 1.2, 5));
  const g = mergeGeometries([...stones, ...sticks]);
  [...stones, ...sticks].forEach((x) => x.dispose());
  return g;
}
