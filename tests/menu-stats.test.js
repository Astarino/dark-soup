import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/core/game.js";
import { createWorld } from "../src/world/world.js";
import { createStatsStore } from "../src/storage/stats.js";
import { createPreferences } from "../src/storage/preferences.js";
import { levelTable, seasoningEffect } from "../src/ui/descriptions.js";
import { UPG } from "../src/systems/upgrades.js";
import { CX, CY } from "../src/data/balance.js";
import { mulberry32 } from "../src/shared/math.js";

const DT = 1 / 60;
function seeded(fn, seed = 9) {
  const saved = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}
const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
};

test("abandoned runs count once before menu or restart, including first pick", () => {
  const g = createGame(), store = createStatsStore(memory());
  const save = () => {
    const result = g.finishRun();
    if (result) store.recordRun(result);
    return result;
  };
  assert.equal(save(), null, "opening the app is not a run");
  g.start();
  g.choose(0);
  g.step(1 / 60);
  g.pause(true);
  const expected = g.runStats();
  assert.deepEqual(save(), expected);
  assert.equal(g.state, "over");
  assert.equal(g.snapshot().player.hp, 0);
  assert.equal(save(), null, "death/menu/restart cannot count twice");
  g.toMenu();
  assert.equal(save(), null);
  assert.equal(store.load().runs, 1);
  g.start();
  save();
  g.start();
  save();
  assert.equal(store.load().runs, 3, "each restarted first-pick screen counts");
});

test("natural death and subsequent exit share one run result", () => {
  const world = createWorld();
  const g = createGame({ ...world, pushOut(e) { if (e.lv) e.hp = 0; } });
  g.start();
  g.choose(0);
  g.step(DT);
  assert.equal(g.state, "over");
  assert.ok(g.finishRun());
  assert.equal(g.finishRun(), null);
  g.toMenu();
  assert.equal(g.finishRun(), null);
});

test("main menu frames the camp; Play glides the camera to the cauldron, then first pick", () => {
  const g = createGame();
  g.setViewport(1200, 800);
  for (let i = 0; i < 120; i++) g.step(DT);
  const menu = g.snapshot();
  assert.equal(menu.state, "menu");
  // Камера у лагеря и сдвинута от панели меню (справа на широком экране).
  assert.ok(menu.cam.x > CX && menu.cam.y < CY, `menu camera ${Math.round(menu.cam.x)},${Math.round(menu.cam.y)}`);
  g.start({ intro: true });
  assert.equal(g.state, "intro");
  assert.equal(g.choose(0), false, "no choice during the intro");
  const path = [];
  for (let i = 0; i < 100 && g.state === "intro"; i++) {
    g.step(DT);
    path.push(g.snapshot().cam.x);
  }
  assert.equal(g.state, "levelup", "first pick after the glide");
  assert.ok(path.length >= 80 && path.length <= 86, `glide lasts ~1.4 s (${path.length} frames)`);
  const p = g.snapshot().player;
  assert.ok(Math.abs(g.snapshot().cam.x - p.x) < 1, "camera arrives at the cauldron");
  // Плавность: без скачков камеры.
  for (let i = 1; i < path.length; i++) assert.ok(Math.abs(path[i] - path[i - 1]) < 12, "smooth glide");
  // Без intro (тесты и перезапуск) — сразу выбор, как раньше.
  g.start();
  assert.equal(g.state, "levelup");
});

test("returning to the main menu resets the run", () =>
  seeded(() => {
    const g = createGame();
    g.start();
    g.choose(0);
    for (let i = 0; i < 600; i++) g.step(DT, { x: 1, y: 0 });
    g.toMenu();
    const s = g.snapshot();
    assert.equal(s.state, "menu");
    assert.equal(s.kills, 0);
    assert.equal(s.enemies.length, 0);
    assert.equal(g.choose(0), false);
  }));

test("run statistics track damage by ingredient, kills by type and damage taken", () =>
  seeded(() => {
    const world = createWorld();
    let armed = false;
    const g = createGame({
      ...world,
      pushOut(e) {
        if (e.lv && !armed) {
          for (const u of UPG) if (u.kind === "ing") e.lv[u.id] = 2;
          armed = true;
        }
        world.pushOut(e);
      },
    });
    g.start();
    g.choose(0);
    for (let i = 0; i < 60 * 70 && g.state !== "over"; i++) {
      if (g.state === "levelup") g.choose(0);
      g.step(DT, { x: Math.cos(i / 150), y: Math.sin(i / 150) });
    }
    const r = g.runStats();
    assert.ok(r.kills > 0);
    assert.equal(Object.values(r.killsByType).reduce((a, b) => a + b, 0), r.kills);
    for (const id of ["carrot", "potato", "onion"]) assert.ok(r.damageBySource[id] > 0, id);
    assert.equal(r.damageTotal, Object.values(r.damageBySource).reduce((a, b) => a + b, 0));
    assert.ok(r.damageTaken >= 0);
    assert.ok(r.xp > 0 && r.level > 1);
    assert.ok(r.upgrades.carrot >= 2);
    assert.ok(!("run" in g.snapshot()), "stats stay out of snapshots");
  }));

test("stats store keeps totals and the record cooking with its full stats", () => {
  const storage = memory(),
    store = createStatsStore(storage);
  const run = (time, kills, extra = {}) => ({
    time,
    level: 5,
    kills,
    xp: 40,
    maxHp: 100,
    upgrades: { carrot: 3, salt: 1 },
    damageTotal: 1000,
    damageBySource: { carrot: 800, burning: 200 },
    damageTaken: 50,
    killsByType: { goblin: kills },
    bossMet: false,
    bossKilled: false,
    bossAdapted: [],
    ...extra,
  });
  assert.equal(store.recordRun(run(120, 30), 1).isRecord, true);
  assert.equal(store.recordRun(run(90, 99), 2).isRecord, false);
  assert.equal(store.recordRun(run(120, 40, { bossMet: true }), 3).isRecord, true, "tie on time → more kills");
  const s = store.load();
  assert.equal(s.runs, 3);
  assert.equal(s.totalTime, 330);
  assert.equal(s.totalKills, 169);
  assert.equal(s.killsByType.goblin, 169);
  assert.equal(s.damageBySource.carrot, 2400);
  assert.equal(s.picks.carrot, 9);
  assert.equal(s.bossMet, 1);
  assert.equal(s.bestRun.kills, 40);
  assert.equal(s.bestRun.date, 3);
  assert.deepEqual(s.bestRun.upgrades, { carrot: 3, salt: 1 });
  // Повреждённые данные и недоступное хранилище не ломают игру.
  storage.map.set("dark_soup_stats", "{oops");
  assert.equal(createStatsStore(storage).load().runs, 0);
  const broken = createStatsStore({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.equal(broken.recordRun(run(10, 1)).isRecord, true);
});

test("recipe book tables list every rank; volumes are stored per category", () => {
  const tr = (k) => k;
  for (const u of UPG) {
    const t = levelTable(u, tr);
    assert.equal(t.rows.length, u.max, u.id);
    assert.ok(t.head.length >= 2);
  }
  const carrot = levelTable(UPG.find((u) => u.id === "carrot"), tr);
  assert.deepEqual(carrot.rows.map((r) => r[carrot.head.indexOf("count")]), ["1", "2", "4", "8", "16", "32"]);
  assert.equal(seasoningEffect("salt", 2, tr), "damage ×1.30");
  const storage = memory(),
    p = createPreferences(storage);
  assert.deepEqual(p.volumes(), { fire: 70, mobs: 70, hits: 70 });
  p.saveVolumes({ fire: 20, mobs: 100, hits: 55 });
  assert.deepEqual(p.volumes(), { fire: 20, mobs: 100, hits: 55 });
  storage.map.set("dark_soup_volume", '{"fire":500}');
  assert.equal(p.volumes().fire, 100, "clamped");
});
