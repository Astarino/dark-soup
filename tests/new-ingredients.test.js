import test from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/core/player.js";
import { createGame } from "../src/core/game.js";
import { createCombat } from "../src/systems/combat.js";
import { createVisualState } from "../src/systems/visual-effects.js";
import { createStatusSystem } from "../src/effects/status.js";
import { updateEnemies } from "../src/systems/enemies.js";
import {
  applyUpgrade,
  rollChoices,
  rollFirstChoices,
  UPG,
} from "../src/systems/upgrades.js";
import { createPotato } from "../src/abilities/potato.js";
import { createBeet } from "../src/abilities/beet.js";
import { createTomato } from "../src/abilities/tomato.js";
import { createBellPepper } from "../src/abilities/bell-pepper.js";
import { ABILITY_BEHAVIOR, ABILITY_STATS } from "../src/data/balance.js";
import { TEXT } from "../src/data/translations.js";
import { mulberry32 } from "../src/shared/math.js";

const NEW = ["potato", "beet", "tomato", "bellPepper"];
const DT = 1 / 60;
function enemy(overrides = {}) {
  return {
    type: "goblin",
    x: 1800,
    y: 1820,
    r: 14,
    hp: 1000,
    max: 1000,
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
function rig(levels = {}) {
  const player = createPlayer(),
    gems = [],
    fx = createVisualState(),
    enemies = [];
  Object.assign(player.lv, levels);
  const combat = createCombat(player, gems, fx, () => {});
  const status = createStatusSystem(fx, combat.damageEnemy);
  const hits = [];
  const hurt = (e, dmg, ...rest) => {
    hits.push({ e, dmg });
    combat.hurt(e, dmg, ...rest);
  };
  return { player, gems, fx, enemies, combat, status, hurt, hits };
}
function seeded(fn, seed = 7) {
  const saved = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}
const run = (update, seconds) => {
  for (let t = 0; t < seconds; t += DT) update(DT);
};

test("new ingredients are in the catalog with names and descriptions in both languages", () => {
  for (const id of NEW) {
    const u = UPG.find((x) => x.id === id);
    assert.equal(u.kind, "ing");
    assert.equal(u.max, 6);
    for (const lang of ["ru", "en"]) {
      assert.ok(TEXT[lang][`upgrade_${id}`], `${lang} name ${id}`);
      assert.ok(TEXT[lang][`upgrade_${id}_desc`], `${lang} desc ${id}`);
    }
  }
  // Прежний «Перец» остаётся пассивной скоростью под своим именем.
  const pepper = UPG.find((u) => u.id === "pepper");
  assert.equal(pepper.kind, "pas");
  assert.equal(TEXT.ru.upgrade_pepper, "Перец");
  const p = createPlayer();
  applyUpgrade(p, pepper);
  assert.equal(p.speed, 189);
});

test("first pick offers 3 distinct ingredients and every ingredient can appear", () =>
  seeded(() => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const choices = rollFirstChoices();
      assert.equal(choices.length, 3);
      assert.equal(new Set(choices.map((u) => u.id)).size, 3);
      for (const u of choices) {
        assert.equal(u.kind, "ing");
        seen.add(u.id);
      }
    }
    assert.deepEqual([...seen].sort(), [...NEW, "carrot", "cabbage", "onion"].sort());
    // Старый каталог из трёх ингредиентов: порядок прежний, случайность не тратится.
    const legacy = UPG.filter((u) => ["carrot", "cabbage", "onion", "salt"].includes(u.id));
    const random = Math.random;
    let calls = 0;
    Math.random = () => (calls++, random());
    assert.deepEqual(rollFirstChoices(legacy).map((u) => u.id), ["carrot", "cabbage", "onion"]);
    Math.random = random;
    assert.equal(calls, 0);
  }));

test("new ingredients appear in level-up choices and cap at rank 6", () =>
  seeded(() => {
    const p = createPlayer(),
      seen = new Set();
    for (let i = 0; i < 300; i++) for (const u of rollChoices(p)) seen.add(u.id);
    for (const id of NEW) assert.ok(seen.has(id), id);
    const tomato = UPG.find((u) => u.id === "tomato");
    for (let i = 0; i < 6; i++) assert.equal(applyUpgrade(p, tomato), true);
    assert.equal(applyUpgrade(p, tomato), false);
    assert.equal(p.lv.tomato, 6);
  }));

test("potato hits, splits into a forward fan of pellets that never split again", () =>
  seeded(() => {
    const r = rig({ potato: 1 });
    const target = enemy({ x: r.player.x + 150, y: r.player.y });
    const behind = enemy({ x: r.player.x + 230, y: r.player.y });
    r.enemies.push(target, behind);
    const potato = createPotato(r.player, r.enemies, r.fx, r.hurt);
    const s = ABILITY_STATS.potato(1);
    potato.update(DT);
    assert.equal(potato.view().length, 1, "one main potato");
    let pellets = 0;
    for (let i = 0; i < 60 && !pellets; i++) {
      potato.update(DT);
      pellets = potato.view().filter((p) => p.kind === "pellet").length;
    }
    assert.equal(pellets, ABILITY_BEHAVIOR.potato.pellets);
    assert.equal(potato.view().filter((p) => p.kind === "potato").length, 0);
    assert.equal(r.hits[0].e, target);
    assert.equal(r.hits[0].dmg, s.dmg);
    // Веер вперёд: все дробинки летят в сторону полёта (+x) в пределах 35°.
    for (const p of potato.view())
      assert.ok(Math.abs(Math.atan2(p.vy, p.vx)) <= ABILITY_BEHAVIOR.potato.fan / 2 + 0.06);
    const before = r.hits.length;
    run(potato.update, 1);
    const pelletHits = r.hits.slice(before);
    assert.ok(pelletHits.length > 0, "pellets hit the enemy behind");
    for (const h of pelletHits) {
      assert.equal(h.dmg, s.pelletDmg);
      assert.ok(h.dmg < s.dmg);
      assert.notEqual(h.e, target, "pellets pass through the struck enemy");
    }
    assert.equal(
      potato.view().filter((p) => p.kind === "pellet").length,
      0,
      "pellets expire or vanish on hit; none split",
    );
  }));

test("potato waits for a target and the cooldown follows the stats", () => {
  const r = rig({ potato: 1 });
  const potato = createPotato(r.player, r.enemies, r.fx, r.hurt);
  run(potato.update, 3);
  assert.equal(potato.view().length, 0);
  r.enemies.push(enemy({ x: r.player.x + 300, y: r.player.y }));
  potato.update(DT);
  assert.equal(potato.view().length, 1, "fires as soon as a target is in range");
  assert.ok(potato.cooldown() > 0.95);
});

test("beet puddle appears in view, charms up to 5 enemies, then fades", () =>
  seeded(() => {
    const r = rig({ beet: 1 });
    const viewport = { width: 1200, height: 800 };
    const beet = createBeet(r.player, r.enemies, r.fx, r.hurt, viewport);
    run(beet.update, ABILITY_BEHAVIOR.beet.firstDelay + DT);
    const [pool] = beet.view();
    assert.ok(Math.abs(pool.x - r.player.x) <= 600 && Math.abs(pool.y - r.player.y) <= 400);
    for (let i = 0; i < 8; i++) r.enemies.push(enemy({ x: pool.x + i, y: pool.y }));
    beet.update(DT);
    assert.equal(r.enemies.filter((e) => e.charm > 0).length, 5, "global limit");
    run(beet.update, ABILITY_BEHAVIOR.beet.poolLife);
    assert.equal(beet.view().length, 0, "the puddle does not stay forever");
    assert.ok(beet.cooldown() > 0, "next puddle is on cooldown");
  }));

test("charmed enemies attack other enemies, spare the cauldron and are spared by the horde", () =>
  seeded(() => {
    const r = rig({ beet: 1 });
    const viewport = { width: 1200, height: 800 };
    const beet = createBeet(r.player, r.enemies, r.fx, r.hurt, viewport);
    const foe = enemy({ x: r.player.x + 25, y: r.player.y, hp: 50, max: 50 });
    const ally = enemy({ x: r.player.x + 50, y: r.player.y, charm: 10, atk: 0 });
    r.enemies.push(ally, foe);
    r.player.iframe = 0;
    const deps = {
      pushOut() {},
      edgePos: () => [0, 0],
      ...r.status,
      control: beet.control,
    };
    const hp = r.player.hp;
    updateEnemies(r.player, r.enemies, r.fx, DT, deps);
    assert.ok(foe.hp < 50, "ally hits the enemy next to it");
    assert.equal(r.player.hp < hp, true, "the regular enemy still hits the cauldron");
    // Союзника не задевают способности котла.
    const allyHp = ally.hp;
    r.combat.hurt(ally, 100, 1, 0, 0);
    assert.equal(ally.hp, allyHp);
    // Обращённый не бьёт котёл даже вплотную.
    r.enemies.splice(0, r.enemies.length, ally);
    ally.x = r.player.x;
    ally.y = r.player.y;
    r.player.iframe = 0;
    const hp2 = r.player.hp;
    run((dt) => updateEnemies(r.player, r.enemies, r.fx, dt, deps), 1);
    assert.equal(r.player.hp, hp2);
    // После окончания обращения снова обычный враг.
    ally.charm = DT / 2;
    updateEnemies(r.player, r.enemies, r.fx, DT, deps);
    assert.equal(ally.charm, undefined);
  }));

test("tomato damages only on landing and its puddle slows by 40% without damage", () =>
  seeded(() => {
    const r = rig({ tomato: 1 });
    const target = enemy({ x: r.player.x + 150, y: r.player.y, spd: 0 });
    r.enemies.push(target);
    const tomato = createTomato(r.player, r.enemies, r.fx, r.hurt);
    const B = ABILITY_BEHAVIOR.tomato;
    run(tomato.update, B.firstDelay + DT);
    assert.equal(tomato.view().drops.length, 1);
    assert.equal(r.hits.length, 0, "no damage while falling");
    run(tomato.update, B.fall);
    r.player.lv.tomato = 0; // больше не бросать: проверяем одну лужу
    assert.equal(r.hits.length, 1);
    assert.equal(r.hits[0].dmg, ABILITY_STATS.tomato(1).dmg);
    assert.equal(tomato.speedFactor(target), 0.6);
    run(tomato.update, 2);
    assert.equal(r.hits.length, 1, "puddle does no damage over time");
    run(tomato.update, B.puddleLife);
    assert.equal(tomato.view().puddles.length, 0);
    assert.equal(tomato.speedFactor(target), 1);
  }));

test("bell pepper boomerangs back, hits with decaying damage up to 10 times", () =>
  seeded(() => {
    const r = rig({ bellPepper: 1 });
    const B = ABILITY_BEHAVIOR.bellPepper;
    // Плотная линия врагов на пути дольки.
    for (let i = 0; i < 14; i++)
      r.enemies.push(enemy({ x: r.player.x + 40 + i * 20, y: r.player.y, spd: 0 }));
    const pepper = createBellPepper(r.player, r.enemies, r.fx, r.hurt);
    pepper.update(DT);
    assert.equal(pepper.view().length, 1);
    let far = 0;
    for (let i = 0; i < 300 && pepper.view().length; i++) {
      pepper.update(DT);
      const s = pepper.view()[0];
      if (s) far = Math.max(far, Math.hypot(s.x - r.player.x, s.y - r.player.y));
      if (i === 200) break;
    }
    assert.ok(far > 250, "flies out to its range");
    assert.equal(r.hits.length, B.hits.length, "stops dealing damage after 10 hits");
    assert.deepEqual(r.hits.map((h) => h.dmg), B.hits);
    run(pepper.update, 1.5);
    assert.ok(pepper.cooldown() > 0);
    // Возвращается к котлу и исчезает; следующий бросок — по таймеру, не по возврату.
    const r2 = rig({ bellPepper: 1 });
    const p2 = createBellPepper(r2.player, r2.enemies, r2.fx, r2.hurt);
    p2.update(DT);
    run(p2.update, 2);
    assert.equal(p2.view().length, 0, "slice returned");
    const r3 = rig({ bellPepper: 1 });
    const p3 = createBellPepper(r3.player, r3.enemies, r3.fx, r3.hurt);
    p3.update(DT);
    r3.player.x += 4000; // котёл «убежал», первая долька не успевает вернуться
    run(p3.update, ABILITY_STATS.bellPepper(1).cd);
    assert.equal(p3.view().length, 2, "second slice thrown while first still flies");
  }));

test("bell pepper hits the same enemy once out and once back", () =>
  seeded(() => {
    const r = rig({ bellPepper: 1 });
    const e = enemy({ x: r.player.x + 150, y: r.player.y, spd: 0 });
    r.enemies.push(e);
    const pepper = createBellPepper(r.player, r.enemies, r.fx, r.hurt);
    run(pepper.update, 2);
    assert.deepEqual(r.hits.map((h) => h.dmg), [20, 15]);
  }));

test("full game: new abilities run, appear in snapshots and reset on restart", () =>
  seeded(() => {
    const g = createGame();
    g.start();
    const first = g.snapshot().choices;
    assert.equal(first.length, 3);
    g.choose(0);
    // Выдаём все новые ингредиенты через обычный выбор улучшений.
    let frames = 0;
    while (frames++ < 60 * 90 && g.state !== "over") {
      if (g.state === "levelup") {
        const ids = g.snapshot().choices,
          i = ids.findIndex((id) => NEW.includes(id));
        g.choose(i >= 0 ? i : 0);
      }
      g.step(DT, { x: Math.cos(frames / 90), y: Math.sin(frames / 90) });
    }
    const s = g.snapshot();
    for (const key of ["potatoes", "beetPools", "tomatoDrops", "tomatoPuddles", "pepperSlices", "cooldowns"])
      assert.ok(key in s, key);
    assert.ok(NEW.some((id) => s.player.lv[id] > 0), "at least one new ingredient taken");
    g.start();
    const fresh = g.snapshot();
    for (const id of NEW) assert.equal(fresh.player.lv[id], 0);
    assert.equal(fresh.potatoes.length + fresh.beetPools.length + fresh.pepperSlices.length, 0);
    assert.equal(fresh.tomatoDrops.length + fresh.tomatoPuddles.length, 0);
  }));
