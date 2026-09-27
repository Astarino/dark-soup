import test from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/core/player.js";
import { createGame } from "../src/core/game.js";
import { createWorld } from "../src/world/world.js";
import { createCombat } from "../src/systems/combat.js";
import { createVisualState } from "../src/systems/visual-effects.js";
import { createStatusSystem } from "../src/effects/status.js";
import { createExperience } from "../src/systems/experience.js";
import { createSpawns } from "../src/systems/spawns.js";
import { updateEnemies } from "../src/systems/enemies.js";
import {
  applyUpgrade,
  rollChoices,
  UPG,
  HEAL,
} from "../src/systems/upgrades.js";
import { carrot } from "../src/abilities/carrot.js";
import { cabbage } from "../src/abilities/cabbage.js";
import { onion } from "../src/abilities/onion.js";
import { onionBalls } from "../src/abilities/onion-orbit.js";
import { createPreferences } from "../src/storage/preferences.js";
import { TEXT, createTranslator } from "../src/data/translations.js";
import { mulberry32 } from "../src/shared/math.js";

function enemy(overrides = {}) {
  return {
    type: "goblin",
    x: 1800,
    y: 1820,
    r: 14,
    hp: 22,
    max: 22,
    spd: 72,
    dmg: 8,
    xp: 1,
    kx: 0,
    ky: 0,
    flash: 0,
    anim: 0,
    face: 1,
    oh: {},
    wave: -1,
    dead: false,
    effects: {},
    ...overrides,
  };
}
function rig() {
  const player = createPlayer(),
    gems = [],
    fx = createVisualState();
  let kills = 0;
  const combat = createCombat(player, gems, fx, () => kills++);
  const status = createStatusSystem(fx, combat.damageEnemy);
  return {
    player,
    gems,
    fx,
    combat,
    status,
    get kills() {
      return kills;
    },
  };
}
function seeded(fn, seed = 42) {
  const saved = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}
const upgrade = (id) => UPG.find((u) => u.id === id);

test("death awards XP and a kill once, even with overlapping damage", () => {
  const r = rig(),
    target = enemy();
  r.combat.damageEnemy(target, 22);
  r.combat.damageEnemy(target, 99);
  assert.equal(target.hp, 0);
  assert.equal(target.dead, true);
  assert.equal(r.kills, 1);
  assert.equal(r.gems.length, 1);
  assert.equal(r.gems[0].v, 1);
});
test("damage multiplier, rounding, minimum damage and brute knockback", () => {
  const r = rig(),
    target = enemy({ type: "brute", hp: 100 });
  const random = Math.random;
  Math.random = () => 0.5;
  try {
    r.player.dmgMul = 1.15;
    r.combat.hurt(target, 10, 3, 4, 100);
    assert.equal(target.hp, 88);
    assert.equal(target.kx, 21);
    assert.equal(target.ky, 28);
    r.combat.hurt(target, 0, 0, 0, 0);
    assert.equal(target.hp, 87);
  } finally {
    Math.random = random;
  }
});
test("burning persists, does not stack/reset, and catches up ticks", () => {
  const r = rig(),
    target = enemy();
  r.status.applyStatusEffect(target, "unknown");
  assert.deepEqual(target.effects, {});
  r.status.applyStatusEffect(target, "burning");
  r.status.updateStatusEffects(target, 0.49);
  assert.equal(target.hp, 22);
  r.status.applyStatusEffect(target, "burning");
  r.status.updateStatusEffects(target, 0.01);
  assert.equal(target.hp, 19);
  r.status.updateStatusEffects(target, 1.5);
  assert.equal(target.hp, 10);
  r.status.updateStatusEffects(target, 20);
  assert.equal(r.kills, 1);
  assert.equal(target.hp, -2);
  r.status.removeStatusEffect(target, "burning");
  assert.deepEqual(target.effects, {});
  r.status.applyStatusEffect(target, "burning");
  assert.deepEqual(target.effects, {});
});
test("contact applies burning, respects invulnerability, and knocks back", () => {
  const r = rig(),
    target = enemy(),
    enemies = [target];
  const dependencies = { pushOut() {}, edgePos: () => [0, 0], ...r.status };
  updateEnemies(r.player, enemies, r.fx, 1 / 60, dependencies);
  assert.equal(r.player.hp, 92);
  assert.equal(r.player.iframe, 0.6);
  assert.ok(target.effects.burning);
  updateEnemies(r.player, enemies, r.fx, 1 / 60, dependencies);
  assert.equal(r.player.hp, 92);
});
test("upgrade formulas, caps, recovery and initial carrot delay", () => {
  const p = createPlayer();
  p.hp = 10;
  applyUpgrade(p, upgrade("broth"));
  assert.equal(p.maxHp, 120);
  assert.equal(p.hp, 40);
  applyUpgrade(p, HEAL);
  assert.equal(p.hp, 80);
  applyUpgrade(p, HEAL);
  applyUpgrade(p, HEAL);
  assert.equal(p.hp, 120);
  for (let i = 0; i < 5; i++) applyUpgrade(p, upgrade("salt"));
  assert.equal(p.dmgMul, 1.75);
  assert.equal(applyUpgrade(p, upgrade("salt")), false);
  applyUpgrade(p, upgrade("pepper"));
  assert.equal(p.speed, 189);
  applyUpgrade(p, upgrade("laurel"));
  assert.equal(p.magnet, 121.50000000000001);
  applyUpgrade(p, upgrade("carrot"));
  assert.equal(p.cd.carrot, 0.6);
  p.cd.carrot = 1;
  applyUpgrade(p, upgrade("carrot"));
  assert.equal(p.cd.carrot, 1);
  assert.equal(applyUpgrade(p, { id: "bad" }), false);
});
test("choices exclude capped ranks, are unique, and fall back to healing", () =>
  seeded(() => {
    const p = createPlayer();
    assert.equal(new Set(rollChoices(p).map((u) => u.id)).size, 3);
    for (const u of UPG) p.lv[u.id] = u.max;
    assert.deepEqual(rollChoices(p), [HEAL]);
  }));
test("XP crosses multiple thresholds and preserves the remainder", () => {
  const r = rig();
  createExperience(r.player, r.gems, r.fx).addXP(31);
  assert.equal(r.player.lvl, 4);
  assert.equal(r.player.xp, 1);
  assert.equal(r.player.pending, 3);
  assert.equal(r.player.need, 22);
});
test("carrot resolves after its fall, hits once, then expires", () =>
  seeded(() => {
    const p = createPlayer(),
      enemies = [enemy()],
      strikes = [
        { x: p.x, y: p.y, t: 0, fall: 0.55, r: 55, dmg: 22, hit: false },
      ],
      fx = createVisualState();
    let hits = 0;
    const hurt = () => hits++;
    carrot(p, enemies, strikes, fx, hurt, 0.54);
    assert.equal(hits, 0);
    carrot(p, enemies, strikes, fx, hurt, 0.01);
    assert.equal(hits, 1);
    carrot(p, enemies, strikes, fx, hurt, 0.6);
    assert.equal(hits, 1);
    assert.equal(strikes.length, 0);
  }));
test("cabbage requires proximity, respects cooldown, hits once per wave", () =>
  seeded(() => {
    const p = createPlayer();
    p.lv.cabbage = 1;
    const enemies = [enemy({ x: p.x + 1000 })],
      waves = [],
      fx = createVisualState();
    let hits = 0;
    cabbage(p, enemies, waves, fx, () => hits++, 0.1);
    assert.equal(waves.length, 0);
    enemies[0].x = p.x + 50;
    cabbage(p, enemies, waves, fx, () => hits++, 0.2);
    assert.equal(p.cd.cabbage, 30);
    assert.equal(hits, 1);
    cabbage(p, enemies, waves, fx, () => hits++, 0.2);
    assert.equal(hits, 1);
    assert.equal(waves.length, 1);
  }));
test("onion collision cooldown is per enemy and ball", () => {
  const p = createPlayer();
  p.lv.onion = 1;
  const clock = { time: 1 };
  const ball = onionBalls(p, clock.time)[0];
  const target = enemy({ x: ball.x, y: ball.y + 14 });
  let hits = 0;
  onion(p, [target], clock, () => hits++);
  onion(p, [target], clock, () => hits++);
  assert.equal(hits, 1);
});
test("spawn timing, scaled health and minute horde", () =>
  seeded(() => {
    const p = createPlayer(),
      enemies = [],
      fx = createVisualState(),
      clock = { time: 0 };
    const spawns = createSpawns(p, enemies, clock, fx, {
      width: 1200,
      height: 800,
    });
    spawns.updateSpawns(1.49);
    assert.equal(enemies.length, 0);
    spawns.updateSpawns(0.011);
    assert.equal(enemies.length, 1);
    assert.equal(enemies[0].hp, 22);
    clock.time = 60;
    spawns.updateSpawns(58.5);
    assert.equal(enemies.length, 22);
    assert.equal(fx.texts[0].txt, "horde");
    assert.equal(enemies.at(-1).hp, 22 * 1.4);
  }));
test("world generation and collisions do not require Canvas", () => {
  const world = createWorld(),
    same = createWorld();
  assert.deepEqual(world.trees, same.trees);
  const p = { x: 1800 - 180 + 10, y: 1800 - 150, r: 22 };
  world.pushOut(p);
  assert.ok(p.x >= 1700);
});
test("state commands reject invalid transitions and snapshots cannot mutate the run", () => {
  const g = createGame();
  assert.equal(g.state, "menu");
  g.pause(true);
  assert.equal(g.state, "menu");
  assert.equal(g.choose(0), false);
  g.start();
  assert.equal(g.state, "levelup");
  g.pause(false);
  assert.equal(g.state, "levelup");
  assert.equal(g.choose(3), false);
  g.choose(0);
  assert.equal(g.state, "play");
  const s = g.snapshot();
  s.player.hp = -100;
  s.enemies.push(enemy());
  assert.equal(g.snapshot().player.hp, 100);
  assert.equal(g.snapshot().enemies.length, 0);
  g.step(1);
  g.pause(true);
  const paused = g.snapshot();
  g.step(10);
  assert.deepEqual(g.snapshot(), paused);
  g.pause(false);
  assert.equal(g.state, "play");
  g.start();
  assert.equal(g.snapshot().time, 0);
  assert.equal(g.snapshot().player.lv.carrot, 0);
});
test("death freezes gameplay and restart resets entities and progression", () =>
  seeded(() => {
    const g = createGame();
    g.start();
    g.choose(1);
    for (let i = 0; i < 20000 && g.state !== "over"; i++) {
      if (g.state === "levelup") g.choose(0);
      g.step(1 / 60);
    }
    assert.equal(g.state, "over");
    const dead = g.snapshot();
    g.pause(false);
    g.step(1);
    assert.equal(g.snapshot().time, dead.time);
    assert.equal(g.snapshot().player.hp, 0);
    g.start();
    assert.equal(g.state, "levelup");
    assert.equal(g.snapshot().kills, 0);
    assert.equal(g.snapshot().player.hp, 100);
  }));
test("settings preserve old storage keys and tolerate storage failures", () => {
  const map = new Map([
    ["dark_soup_language", "en"],
    ["cauldron_best", "42.5"],
  ]);
  const p = createPreferences({
    getItem: (k) => map.get(k),
    setItem: (k, v) => map.set(k, v),
  });
  assert.equal(p.language(), "en");
  assert.equal(p.best(), 42.5);
  p.saveBest(50);
  p.saveLanguage("ru");
  assert.equal(map.get("cauldron_best"), "50");
  assert.equal(map.get("dark_soup_language"), "ru");
  const unavailable = createPreferences({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  assert.equal(unavailable.language(), "ru");
  assert.equal(unavailable.best(), 0);
  unavailable.saveBest(10);
});
test("both languages cover the same translation keys", () => {
  assert.deepEqual(Object.keys(TEXT.ru).sort(), Object.keys(TEXT.en).sort());
  const t = createTranslator("ru");
  assert.equal(t.tr("pause"), "ПАУЗА");
  t.setLanguage("en");
  assert.equal(t.tr("pause"), "PAUSED");
});

test("queued level-ups require one selection each before resuming", () => {
  let award = true;
  const game = createGame({
    pushOut(player) {
      if (award) {
        award = false;
        createExperience(player, [], createVisualState()).addXP(31);
      }
    },
  });
  game.start();
  game.choose(0);
  game.step(1 / 60);
  assert.equal(game.state, "levelup");
  assert.equal(game.snapshot().player.pending, 3);
  game.choose(0);
  assert.equal(game.state, "levelup");
  assert.equal(game.snapshot().player.pending, 2);
  game.choose(0);
  assert.equal(game.state, "levelup");
  assert.equal(game.snapshot().player.pending, 1);
  game.choose(0);
  assert.equal(game.state, "play");
  assert.equal(game.snapshot().player.pending, 0);
});
test("death takes precedence over pending upgrades in the same frame", () => {
  const game = createGame({
    pushOut(player) {
      player.hp = 0;
      player.pending = 2;
    },
  });
  game.start();
  game.choose(0);
  game.step(1 / 60);
  assert.equal(game.state, "over");
  assert.equal(game.choose(0), false);
});
