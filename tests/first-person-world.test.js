import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/world/world.js";
import { CX, CY, K } from "../src/data/balance.js";
import { buildTree, buildTent, buildLog, buildStump, buildCrate, buildRock, ROCK_RADIUS, TREE_FAMILIES, treeHeight } from "../src/render3d/models.js";

// Видимая геометрия объёмного мира должна соответствовать существующим
// столкновениям: их радиусы измеряются через настоящий world.pushOut.
const world = createWorld();
// Радиус коллайдера в точке (cx, cy): идём по лучу, пока сущность нулевого размера выталкивается.
function colliderRadius(cx, cy, angle = 0, max = 200) {
  let last = 0;
  for (let r = 0.25; r < max; r += 0.25) {
    const e = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, r: 0.05 };
    world.pushOut(e);
    if (Math.hypot(e.x - (cx + Math.cos(angle) * r), e.y - (cy + Math.sin(angle) * r)) > 1e-6) last = r;
  }
  return last;
}
function extent(geometry, filter = () => true) {
  const p = geometry.attributes.position;
  let r = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (!filter(p.getX(i), p.getY(i), p.getZ(i))) continue;
    r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
    minY = Math.min(minY, p.getY(i));
    maxY = Math.max(maxY, p.getY(i));
  }
  return { r, minY, maxY };
}

test("tree trunks stand on their colliders: visible base ≈ collision radius, canopy is above head height", () => {
  const seen = new Set();
  for (const t of world.trees) {
    const key = `${t.spr.family}:${t.spr.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // у окружённых деревьями точек луч может упереться в соседа: берём направление с минимальным радиусом
    const cy = t.y - 4;
    const measured = Math.min(...[0, 1.3, 2.6, 3.9, 5.2].map((a) => colliderRadius(t.x, cy, a, 40)));
    const want = TREE_FAMILIES[t.spr.family].radius;
    // координаты деревьев в описании мира округлены до 2 ед., поэтому допуск 1,6
    assert.ok(Math.abs(measured - want) <= 1.6, `${key}: collider ${measured} vs modelled ${want}`);
    const { trunk, crown } = buildTree(t.spr.family, t.spr.index);
    const base = extent(trunk, (x, y) => y < 12);
    const mid = extent(trunk, (x, y) => y >= 10 && y < 60); // ниже начала ветвей
    assert.ok(base.r >= want * 0.95 && base.r <= want * 1.5, `${key}: trunk base ${base.r.toFixed(1)}`);
    assert.ok(mid.r <= want * 1.02 && mid.r >= want * 0.35, `${key}: trunk up to head height ${mid.r.toFixed(1)}`);
    const c = extent(crown);
    assert.ok(c.minY > 72, `${key}: the canopy starts above the eye height (${c.minY.toFixed(0)})`);
    assert.ok(Math.abs(c.maxY - treeHeight(t.spr.family, t.spr.index)) < treeHeight(t.spr.family, t.spr.index) * 0.5);
  }
  assert.equal(seen.size, 20, "all 4 families × 5 variants are built");
});

test("the tent fits its collision circle and has an entrance", () => {
  const tent = world.props.find((p) => p.s.family === "TENT");
  const R = colliderRadius(tent.x, tent.y - 20, 0.7, 120);
  assert.equal(R, 58);
  const { canvas, width, depth } = buildTent();
  // самый дальний угол основания не выходит за круг более чем на пару единиц
  const corner = Math.hypot(width / 2, depth / 2);
  assert.ok(corner <= R + 3, `corner ${corner.toFixed(1)} vs collider ${R}`);
  assert.ok(Math.min(width, depth) / 2 >= R * 0.6, "tent is not a tiny object inside a big invisible wall");
  const e = extent(canvas);
  assert.ok(e.maxY > 50 && e.maxY < 90, "tent height");
});

test("logs, stump, crate and rocks match the colliders around them", () => {
  const logs = world.props.filter((p) => p.s.family === "LOG");
  assert.equal(logs.length, 4);
  for (const l of logs) {
    const lenWu = l.s.len * K;
    // три круга r=12 вдоль оси X: крайняя точка = 0,33·len + 12
    const reach = colliderRadius(l.x + 0.33 * lenWu, l.y - 4, 0, 40) + 0.33 * lenWu;
    assert.ok(Math.abs(reach - (0.33 * lenWu + 12)) < 1, `log ${lenWu}: ${reach}`);
    assert.ok(Math.abs(reach - lenWu / 2) < 12, "log ends line up with the last collider");
    const { bark } = buildLog(lenWu);
    const p = bark.attributes.position;
    let maxX = 0;
    for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, Math.abs(p.getX(i)));
    assert.ok(Math.abs(maxX - lenWu / 2) < 3);
  }
  const stump = world.props.find((p) => p.s.family === "STUMP");
  assert.equal(colliderRadius(stump.x, stump.y - 6, 0.3, 60), 14);
  const st = buildStump();
  assert.ok(extent(st.bark).r <= 14 * 1.3 && extent(st.bark).r >= 12, "stump with a small root flare");
  const crate = world.props.find((p) => p.s.family === "CRATE");
  assert.equal(colliderRadius(crate.x, crate.y - 5, 0.9, 60), 16);
  const box = buildCrate().box.parameters;
  assert.ok((Math.hypot(box.width, box.depth) / 2) <= 16 + 0.5);
  world.props
    .filter((p) => p.s.family === "ROCKS")
    .forEach((p) => {
      const measured = Math.min(...[0.2, 1.4, 2.6, 3.8, 5].map((a) => colliderRadius(p.x, p.y - 6, a, 60))); // соседний коллайдер не в счёт
      assert.ok(Math.abs(measured - ROCK_RADIUS[p.s.index]) < 0.6, `rock ${p.s.index}: ${measured} vs ${ROCK_RADIUS[p.s.index]}`);
    });
  for (let i = 0; i < 3; i++) {
    const g = buildRock(i);
    assert.ok(extent(g).minY >= -0.01, "rocks rest on the ground");
    assert.ok(extent(g).r <= ROCK_RADIUS[i] * 1.6);
  }
});

test("the camp is where the top view puts it", () => {
  const tent = world.props.find((p) => p.s.family === "TENT");
  assert.deepEqual([tent.x, tent.y], [CX - 180, CY - 130]);
  assert.ok(world.props.some((p) => p.s.family === "CRATE"));
});
