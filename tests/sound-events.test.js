import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/core/game.js";
import { createWorld } from "../src/world/world.js";
import { createPreferences } from "../src/storage/preferences.js";
import { UPG } from "../src/systems/upgrades.js";
import { mulberry32 } from "../src/shared/math.js";

// Звук живёт в браузере; здесь проверяем игровые события, из которых он строится.
test("gameplay emits distinct sound events per attack and snapshots stay clean", () => {
  const saved = Math.random;
  Math.random = mulberry32(3);
  try {
    const world = createWorld();
    let armed = false;
    const game = createGame({
      ...world,
      pushOut(e) {
        if (e.lv) {
          if (!armed) {
            for (const u of UPG) e.lv[u.id] = u.kind === "ing" ? 2 : 0;
            armed = true;
          }
          e.hp = e.maxHp;
        }
        world.pushOut(e);
      },
    });
    game.start();
    game.choose(0);
    const seen = new Set();
    for (let f = 0; f < 60 * 70; f++) {
      if (game.state === "levelup") game.choose(0);
      game.step(1 / 60, { x: Math.cos(f / 150), y: Math.sin(f / 150) });
      for (const ev of game.takeSounds()) {
        seen.add(ev.id);
        assert.ok(Number.isFinite(ev.x) && Number.isFinite(ev.y), ev.id);
      }
    }
    for (const id of ["carrotLand", "hit_cabbage", "hit_onion", "potatoFire", "hit_potato", "hit_pellet", "beetPool", "tomatoSplat", "pepperThrow", "hit_bellPepper", "levelUp", "horde"])
      assert.ok(seen.has(id), `missing sound ${id}`);
    assert.equal(game.takeSounds().length, 0, "queue is drained");
    assert.ok(!("sounds" in game.snapshot()), "sound queue is not part of snapshots");
  } finally {
    Math.random = saved;
  }
});

test("sound preference is stored and defaults to on", () => {
  const map = new Map();
  const p = createPreferences({ getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) });
  assert.equal(p.sound(), true);
  p.saveSound(false);
  assert.equal(map.get("dark_soup_sound"), "0");
  assert.equal(p.sound(), false);
});
