import test from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/core/player.js";
import { createGame } from "../src/core/game.js";
import { createWorld } from "../src/world/world.js";
import { createCombat } from "../src/systems/combat.js";
import { createVisualState } from "../src/systems/visual-effects.js";
import { createWarden } from "../src/systems/warden.js";
import { createBeet } from "../src/abilities/beet.js";
import { createTomato } from "../src/abilities/tomato.js";
import { movePlayer } from "../src/systems/movement.js";
import { WARDEN } from "../src/data/balance.js";
import { UPG } from "../src/systems/upgrades.js";
import { mulberry32 } from "../src/shared/math.js";

const DT = 1 / 60;
function seeded(fn, seed = 5) {
  const saved = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}
// Страж рядом с котлом; clock уже после времени появления.
function rig(levels = {}, at = [150, 0]) {
  const player = createPlayer(),
    enemies = [],
    fx = createVisualState(),
    clock = { time: WARDEN.spawnAt },
    adaptations = [];
  Object.assign(player.lv, levels);
  const combat = createCombat(player, [], fx, () => {});
  const warden = createWarden(player, enemies, clock, fx, () => [player.x + at[0], player.y + at[1]], {
    onAdapt: (id) => adaptations.push(id),
  });
  warden.update(DT);
  return { player, enemies, fx, clock, combat, warden, adaptations, boss: enemies[0] };
}
const hit = (r, source, dmg, times = 1) => {
  for (let i = 0; i < times; i++) r.combat.hurt(r.boss, dmg, 1, 0, 100, { source });
};

test("creature-1 spawns once at 3:00 with 2000 HP per rank-3+ ingredient", () =>
  seeded(() => {
    assert.equal(WARDEN.spawnAt, 180);
    const r = rig({ carrot: 3, onion: 4, potato: 2, tomato: 6 });
    assert.equal(r.boss.type, "warden");
    assert.equal(r.boss.hp, 6000);
    assert.equal(r.boss.spd, 66);
    r.warden.update(DT);
    assert.equal(r.enemies.length, 1, "spawns only once");
    assert.equal(rig({ carrot: 1 }).boss.hp, 2000, "minimum one ingredient");
    const list = [];
    createWarden(createPlayer(), list, { time: 179.9 }, createVisualState(), () => [0, 0]).update(DT);
    assert.equal(list.length, 0, "not before 3:00");
  }));

test("every 5000 damage the wheel adapts to the top damage source", () =>
  seeded(() => {
    const r = rig({ carrot: 3, onion: 3 });
    r.boss.hp = r.boss.max = 1e9; // здоровье не мешает счёту урона
    hit(r, "onion", 100, 10); // ~1000
    hit(r, "carrot", 100, 45); // ~4500 → всего ≥ 5000
    r.warden.update(DT);
    assert.deepEqual(r.boss.adapted, ["carrot"]);
    assert.deepEqual(r.adaptations, ["carrot"]);
    assert.equal(r.boss.wheelSteps, 1);
    assert.ok(r.boss.wheelAnim > 0);
    // Освоенная способность: урон ×0,2, без вспышки и отброса.
    r.boss.flash = 0;
    r.boss.kx = 0;
    const before = r.boss.hp;
    hit(r, "carrot", 100);
    const dealt = before - r.boss.hp;
    assert.ok(dealt >= 18 && dealt <= 22, `reduced damage ${dealt}`);
    assert.equal(r.boss.flash, 0);
    assert.equal(r.boss.kx, 0);
    // Неосвоенная — полный урон и эффекты.
    const before2 = r.boss.hp;
    hit(r, "onion", 100);
    assert.ok(before2 - r.boss.hp >= 90);
    assert.ok(r.boss.flash > 0);
  }));

test("the wheel turns at most once per ingredient kind", () =>
  seeded(() => {
    const kinds = UPG.filter((u) => u.kind === "ing").map((u) => u.id);
    const r = rig();
    r.boss.hp = r.boss.max = 1e9;
    for (const id of kinds) {
      hit(r, id, 1000, 6);
      r.warden.update(DT);
    }
    assert.deepEqual([...r.boss.adapted].sort(), [...kinds].sort());
    hit(r, "carrot", 1000, 20);
    r.warden.update(DT);
    assert.equal(r.boss.wheelSteps, kinds.length, "no extra turns");
  }));

test("beet charms and tomato slows the warden only until it adapts to them", () =>
  seeded(() => {
    const r = rig({ beet: 1, tomato: 1 });
    const beet = createBeet(r.player, r.enemies, r.fx, r.combat.hurt, { width: 1200, height: 800 });
    const tomato = createTomato(r.player, r.enemies, r.fx, r.combat.hurt);
    // Лужа свёклы прямо под боссом.
    for (let t = 0; t < 1.1; t += DT) beet.update(DT);
    const [pool] = beet.view();
    r.boss.x = pool.x;
    r.boss.y = pool.y;
    beet.update(DT);
    assert.ok(r.boss.charm > 0, "charmed before adapting");
    delete r.boss.charm;
    r.boss.adapted.push("beet", "tomato");
    beet.update(DT);
    assert.equal(r.boss.charm, undefined, "immune after adapting");
    assert.equal(tomato.speedFactor(r.boss), 1, "tomato no longer slows");
  }));

test("gravity cast slows the cauldron by 50% for 3 s inside its radius", () =>
  seeded(() => {
    const r = rig({}, [300, 0]);
    r.boss.gravityCd = 0;
    r.boss.slashCd = 99;
    r.warden.control(r.boss, DT, 1);
    assert.equal(r.boss.state, "cast");
    for (let t = 0; t < WARDEN.gravity.windup + DT; t += DT) r.warden.control(r.boss, DT, 1);
    assert.equal(r.player.slowT, WARDEN.gravity.duration);
    assert.equal(r.player.slowMul, 0.5);
    // Скорость котла вдвое ниже, пока действует гравитация.
    const p = r.player;
    p.vx = p.vy = 0;
    for (let i = 0; i < 60; i++) movePlayer(p, { x: 1, y: 0 }, DT, () => {});
    assert.ok(Math.abs(p.vx - p.speed * 0.5) < 2, `slowed speed ${p.vx}`);
    // Вне радиуса — не действует.
    const far = rig({}, [WARDEN.gravity.radius + 100, 0]);
    far.boss.gravityCd = 0;
    far.warden.control(far.boss, DT, 1);
    assert.equal(far.boss.state, "chase", "does not cast from afar");
  }));

test("the blade hits after a wind-up and can be dodged", () =>
  seeded(() => {
    const r = rig({}, [60, 0]);
    r.boss.gravityCd = 99;
    r.boss.slashCd = 0;
    r.player.iframe = 0;
    const hp = r.player.hp;
    r.warden.control(r.boss, DT, 1);
    assert.equal(r.boss.state, "windup");
    for (let t = 0; t < WARDEN.slash.windup + DT; t += DT) r.warden.control(r.boss, DT, 1);
    assert.equal(r.player.hp, hp - WARDEN.slash.damage);
    // Увернулся во время замаха — промах.
    const d = rig({}, [60, 0]);
    d.boss.gravityCd = 99;
    d.boss.slashCd = 0;
    d.player.iframe = 0;
    const hp2 = d.player.hp;
    d.warden.control(d.boss, DT, 1);
    d.player.x -= 300;
    for (let t = 0; t < WARDEN.slash.windup + DT; t += DT) d.warden.control(d.boss, DT, 1);
    assert.equal(d.player.hp, hp2);
  }));

test("full game: creature-1 arrives at 3:00 and a wheel turn briefly slows time", () =>
  seeded(() => {
    const world = createWorld();
    let armed = false;
    const game = createGame({
      ...world,
      pushOut(e) {
        if (e.lv) {
          if (!armed) {
            for (const u of UPG) e.lv[u.id] = u.kind === "ing" ? 3 : 0;
            armed = true;
          }
          e.hp = e.maxHp;
        }
        world.pushOut(e);
      },
    });
    game.start();
    game.choose(0);
    let boss = null,
      slowSeen = false;
    for (let f = 0; f < 60 * 340 && game.state !== "over"; f++) {
      if (game.state === "levelup") game.choose(0);
      // До босса котёл бегает по кругу; после — стоит, чтобы босс подошёл.
      game.step(DT, f < 60 * 180 ? { x: Math.cos(f / 200), y: Math.sin(f / 200) } : { x: 0, y: 0 });
      if (f % 15) continue; // снимок раз в 15 кадров: замедление длится дольше
      const s = game.snapshot();
      boss = s.enemies.find((e) => e.type === "warden") || boss;
      if (s.slowmo) slowSeen = true;
    }
    assert.ok(boss, "warden appeared");
    assert.equal(boss.max, 14000, "7 ingredients at rank 3");
    assert.ok(boss.wheelSteps >= 1, "wheel turned at least once");
    assert.ok(slowSeen, "slow-motion on a wheel turn");
  }));
