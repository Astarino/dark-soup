import test from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/core/player.js";
import { createGame } from "../src/core/game.js";
import { createWorld } from "../src/world/world.js";
import { createVisualState } from "../src/systems/visual-effects.js";
import { carrot } from "../src/abilities/carrot.js";
import { createCabbage } from "../src/abilities/cabbage.js";
import { createPotato } from "../src/abilities/potato.js";
import { createBeet } from "../src/abilities/beet.js";
import { createTomato } from "../src/abilities/tomato.js";
import { createBellPepper } from "../src/abilities/bell-pepper.js";
import {
  ABILITY_BEHAVIOR,
  ABILITY_STATS,
  PROGRESSION_TABLES as T,
} from "../src/data/balance.js";
import { UPG } from "../src/systems/upgrades.js";
import { TAU, mulberry32 } from "../src/shared/math.js";

const DT = 1 / 60;
const LEVELS = [1, 2, 3, 4, 5, 6];
function enemy(overrides = {}) {
  return {
    type: "goblin",
    x: 0,
    y: 0,
    r: 14,
    hp: 1e6,
    max: 1e6,
    spd: 72,
    dmg: 8,
    xp: 1,
    kx: 0,
    ky: 0,
    flash: 0,
    anim: 0,
    face: 1,
    oh: {},
    dead: false,
    effects: {},
    ...overrides,
  };
}
// Кольцо врагов вокруг игрока на расстоянии d.
function ring(player, n, d) {
  return Array.from({ length: n }, (_, i) =>
    enemy({
      x: player.x + Math.cos((i / n) * TAU) * d,
      y: player.y + Math.sin((i / n) * TAU) * d,
    }),
  );
}
function seeded(fn, seed = 11) {
  const saved = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}
const run = (update, seconds, dt = DT) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) update(dt);
};
const noop = () => {};

test("every ingredient still caps at rank 6", () => {
  for (const u of UPG.filter((x) => x.kind === "ing")) assert.equal(u.max, 6, u.id);
});

test("carrot volley sizes per level: 2, 4, 6, 8, 10, 16", () =>
  seeded(() => {
    assert.deepEqual(T.carrotCount, [2, 4, 6, 8, 10, 16]);
    for (const l of LEVELS) {
      const p = createPlayer();
      p.lv.carrot = l;
      const strikes = [];
      carrot(p, ring(p, 40, 200), strikes, createVisualState(), noop, DT);
      assert.equal(strikes.length, T.carrotCount[l - 1], `level ${l}`);
      // Урон, радиус и перезарядка — прежняя прогрессия.
      assert.equal(strikes[0].dmg, 22 + 8 * (l - 1));
      assert.equal(strikes[0].r, 55 + 6 * (l - 1));
      assert.equal(p.cd.carrot, +Math.max(0.8, 2.0 - 0.2 * (l - 1)).toFixed(1));
    }
  }));

test("a 16-carrot volley spreads over few targets and lands within 0.6 s", () =>
  seeded(() => {
    const p = createPlayer();
    p.lv.carrot = 6;
    const strikes = [];
    carrot(p, ring(p, 3, 200), strikes, createVisualState(), noop, DT);
    assert.equal(strikes.length, 16);
    const points = new Set(strikes.map((s) => `${Math.round(s.x)}:${Math.round(s.y)}`));
    assert.ok(points.size >= 15, `distinct impact points: ${points.size}`);
    for (const s of strikes)
      assert.ok(Math.hypot(s.x - p.x, s.y - p.y) < 200 + 55, "stays near the targets");
    const span = -Math.min(...strikes.map((s) => s.t));
    assert.ok(span <= ABILITY_BEHAVIOR.carrotVolley.spanTime + 1e-9, `span ${span}`);
    // Без врагов залп падает вокруг котла, как раньше.
    const empty = [];
    p.cd.carrot = 0;
    carrot(p, [], empty, createVisualState(), noop, DT);
    assert.equal(empty.length, 16);
  }));

test("potato volley sizes per level: 1, 2, 3, 5, 7, 10 whole potatoes, 10 pellets each", () =>
  seeded(() => {
    assert.deepEqual(T.potatoCount, [1, 2, 3, 5, 7, 10]);
    for (const l of LEVELS) {
      const p = createPlayer();
      p.lv.potato = l;
      const enemies = ring(p, 4, 400);
      const potato = createPotato(p, enemies, createVisualState(), noop);
      const n = T.potatoCount[l - 1];
      run(potato.update, ABILITY_BEHAVIOR.potato.volleyGap * n + DT);
      const flying = potato.view().filter((s) => s.kind === "potato");
      assert.equal(flying.length, n, `level ${l}`);
      const spots = new Set(flying.map((s) => `${Math.round(s.x)}:${Math.round(s.y)}`));
      assert.equal(spots.size, n, "potatoes of a volley never overlap completely");
      assert.equal(ABILITY_STATS.potato(l).dmg, 20 + 5 * (l - 1));
      assert.equal(ABILITY_STATS.potato(l).pelletDmg, 5 + (l - 1));
    }
    assert.equal(ABILITY_BEHAVIOR.potato.pellets, 10);
  }));

test("bell pepper throws 1, 2, 3, 5, 7, 10 slices spread evenly, each with its own hits", () =>
  seeded(() => {
    assert.deepEqual(T.bellPepperCount, [1, 2, 3, 5, 7, 10]);
    for (const l of LEVELS) {
      const p = createPlayer();
      p.lv.bellPepper = l;
      const pepper = createBellPepper(p, [], createVisualState(), noop);
      run(pepper.update, 0.3);
      const slices = pepper.view(),
        n = T.bellPepperCount[l - 1];
      assert.equal(slices.length, n, `level ${l}`);
      const angles = slices
        .map((s) => Math.atan2(s.y - p.y, s.x - p.x))
        .sort((a, b) => a - b);
      for (let i = 1; i < angles.length; i++)
        assert.ok(angles[i] - angles[i - 1] > TAU / n / 2, "slices are spread apart");
    }
    // Каждая долька считает свои 10 попаданий отдельно.
    const p = createPlayer();
    p.lv.bellPepper = 2;
    const enemies = [];
    for (let i = 0; i < 12; i++) {
      enemies.push(enemy({ x: p.x + 40 + i * 22, y: p.y, spd: 0 }));
      enemies.push(enemy({ x: p.x - 40 - i * 22, y: p.y, spd: 0 }));
    }
    const hits = [];
    const pepper = createBellPepper(p, enemies, createVisualState(), (e, dmg) =>
      hits.push({ side: Math.sign(e.x - p.x), dmg }),
    );
    run(pepper.update, 0.7);
    const right = hits.filter((h) => h.side > 0).map((h) => h.dmg),
      left = hits.filter((h) => h.side < 0).map((h) => h.dmg);
    const mul = ABILITY_STATS.bellPepper(2).dmg / ABILITY_BEHAVIOR.bellPepper.hits[0];
    const expected = ABILITY_BEHAVIOR.bellPepper.hits.map((d) => Math.max(1, Math.round(d * mul)));
    assert.deepEqual(right, expected);
    assert.deepEqual(left, expected);
  }));

test("tomato count per level: one on 1–3, two on 4–6", () =>
  seeded(() => {
    assert.deepEqual(T.tomatoCount, [1, 1, 1, 2, 2, 2]);
    for (const l of LEVELS) {
      const p = createPlayer();
      p.lv.tomato = l;
      const tomato = createTomato(p, ring(p, 6, 200), createVisualState(), noop);
      run(tomato.update, ABILITY_BEHAVIOR.tomato.firstDelay + DT);
      assert.equal(tomato.view().drops.length, l >= 4 ? 2 : 1, `level ${l}`);
    }
  }));

test("tomato puddle area grows ×1.5 every second (radius ×√1.5)", () =>
  seeded(() => {
    const p = createPlayer();
    p.lv.tomato = 1;
    const tomato = createTomato(p, [], createVisualState(), noop);
    const B = ABILITY_BEHAVIOR.tomato;
    run(tomato.update, B.firstDelay + B.fall + DT);
    p.lv.tomato = 0;
    const [first] = tomato.view().puddles;
    const areas = [first.r ** 2];
    for (let s = 1; s <= 3; s++) {
      run(tomato.update, 1);
      areas.push(tomato.view().puddles[0].r ** 2);
    }
    for (let s = 1; s < areas.length; s++)
      assert.ok(Math.abs(areas[s] / areas[s - 1] - 1.5) < 1e-6, `second ${s}`);
  }));

test("beet: puddles per activation, radius and the shared charm limit per level", () =>
  seeded(() => {
    assert.deepEqual(T.beetPools, [1, 1, 2, 2, 2, 3]);
    assert.deepEqual(T.beetCharmLimit, [5, 7, 7, 10, 15, 15]);
    const view = { width: 1200, height: 800 };
    for (const l of LEVELS) {
      const p = createPlayer();
      p.lv.beet = l;
      const enemies = [];
      const beet = createBeet(p, enemies, createVisualState(), noop, view);
      run(beet.update, ABILITY_BEHAVIOR.beet.firstDelay + DT);
      const pools = beet.view();
      assert.equal(pools.length, T.beetPools[l - 1], `pools at level ${l}`);
      for (const pool of pools) assert.equal(pool.r, T.beetRadius[l - 1]);
      // 12 врагов в каждой луже: обращено ровно столько, сколько позволяет общий лимит.
      for (const pool of pools)
        for (let i = 0; i < 12; i++) enemies.push(enemy({ x: pool.x + i, y: pool.y }));
      beet.update(DT);
      const charmed = enemies.filter((e) => e.charm > 0).length;
      assert.equal(charmed, Math.min(T.beetCharmLimit[l - 1], 12 * pools.length), `limit at level ${l}`);
      // Длительность обращения и перезарядка — прежние.
      assert.equal(ABILITY_STATS.beet(l).dur, 10 + (l - 1));
      assert.equal(ABILITY_STATS.beet(l).cd, 30 - 2 * (l - 1));
    }
  }));

test("cabbage field grows with level and its tick rate does not depend on FPS", () => {
  for (const l of LEVELS) {
    const s = ABILITY_STATS.cabbage(l);
    assert.equal(s.R, T.cabbageRadius[l - 1]);
    assert.equal(s.tickDmg, T.cabbageTickDamage[l - 1]);
  }
  assert.equal(ABILITY_STATS.cabbage(1).R, 170);
  for (const fps of [30, 60, 144]) {
    const p = createPlayer();
    p.lv.cabbage = 1;
    let hits = 0;
    const field = createCabbage(p, [enemy({ x: p.x + 100, y: p.y })], () => hits++);
    run(field.update, 3, 1 / fps);
    assert.equal(hits, 6, `${fps} FPS`);
  }
});

test("performance: every ingredient at rank 6 with a full horde", () =>
  seeded(() => {
    const world = createWorld();
    let armed = false;
    const game = createGame({
      ...world,
      pushOut(entity) {
        if (entity.lv) {
          if (!armed) {
            for (const u of UPG) entity.lv[u.id] = u.kind === "ing" ? 6 : 0;
            armed = true;
          }
          entity.hp = entity.maxHp; // бессмертие для замера
        } else if (entity.type && !entity.tough) {
          entity.tough = true; // живучие враги: орда копится до лимита появления
          entity.hp = entity.max = 4000;
        }
        world.pushOut(entity);
      },
    });
    game.start();
    game.choose(0);
    let worst = 0,
      total = 0,
      frames = 0,
      peak = { enemies: 0, projectiles: 0, strikes: 0, parts: 0 };
    for (let f = 0; f < 60 * 120; f++) {
      if (game.state === "levelup") game.choose(0);
      const t0 = performance.now();
      game.step(DT, { x: Math.cos(f / 200), y: Math.sin(f / 200) });
      const s = game.snapshot();
      const ms = performance.now() - t0;
      if (f > 60 * 60) {
        worst = Math.max(worst, ms);
        total += ms;
        frames++;
      }
      peak.enemies = Math.max(peak.enemies, s.enemies.length);
      peak.projectiles = Math.max(peak.projectiles, s.potatoes.length + s.pepperSlices.length);
      peak.strikes = Math.max(peak.strikes, s.strikes.length);
      peak.parts = Math.max(peak.parts, s.parts.length);
    }
    const avg = total / frames;
    console.log(`max-rank run: avg ${avg.toFixed(2)} ms/frame, worst ${worst.toFixed(2)} ms`, peak);
    assert.equal(game.state, "play");
    assert.ok(peak.enemies >= 120, `horde size ${peak.enemies}`);
    assert.ok(avg < 8, `average simulation+snapshot ${avg.toFixed(2)} ms`);
  }));

test("tomato landing damage is exactly 20% above the old base, before salt and rounding", () =>
  seeded(() => {
    for (const l of LEVELS) {
      const old = 30 + 8 * (l - 1);
      assert.equal(ABILITY_STATS.tomato(l).dmg, +(old * 1.2).toFixed(1), `level ${l}`);
      const p = createPlayer();
      p.lv.tomato = l;
      p.dmgMul = 1.3; // соль применяется после множителя 1,2
      const seen = [];
      const tomato = createTomato(p, ring(p, 1, 100), createVisualState(), (e, dmg) => seen.push(dmg));
      run(tomato.update, ABILITY_BEHAVIOR.tomato.firstDelay + ABILITY_BEHAVIOR.tomato.fall + 0.5);
      assert.ok(seen.length >= 1 && Math.abs(seen[0] - old * 1.2) < 1e-9, `level ${l}: ${seen[0]}`);
    }
  }));

test("carrot volleys shake the screen weakly and cap the total shake", () =>
  seeded(() => {
    const B = ABILITY_BEHAVIOR.carrot.shake;
    assert.deepEqual(B, { perHit: 1, max: 3 });
    const p = createPlayer();
    p.lv.carrot = 6;
    const strikes = [], fx = createVisualState();
    carrot(p, ring(p, 8, 200), strikes, fx, noop, DT);
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      carrot(p, [], strikes, fx, noop, DT);
      peak = Math.max(peak, fx.shake);
    }
    assert.ok(peak > 0 && peak <= B.max, `peak ${peak}`);
  }));
