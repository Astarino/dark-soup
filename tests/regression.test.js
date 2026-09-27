import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGame } from "../src/core/game.js";
import { mulberry32 } from "../src/shared/math.js";
import { UPG } from "../src/systems/upgrades.js";
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/original-runs.json", import.meta.url)),
);
// Captured from 0c4603d's unmodified mechanics with a seeded RNG and 1200×800 view.
// No Canvas or fake DOM is needed to run the new implementation.
// The fixtures describe the original catalog, so the run uses exactly those
// upgrades; snapshot keys added later for new ingredients are not compared.
const ORIGINAL_IDS = ["carrot", "cabbage", "onion", "salt", "pepper", "broth", "laurel"];
const ORIGINAL_CATALOG = UPG.filter((u) => ORIGINAL_IDS.includes(u.id));
const NEW_SNAPSHOT_KEYS = ["potatoes", "beetPools", "tomatoDrops", "tomatoPuddles", "pepperSlices", "cooldowns"];
for (const fixture of fixtures)
  test(`original run parity: ingredient ${fixture.ingredient}`, () => {
    const random = Math.random;
    Math.random = mulberry32(fixture.seed);
    try {
      const game = createGame(undefined, { catalog: ORIGINAL_CATALOG });
      game.start();
      game.choose(fixture.ingredient);
      for (let frame = 0; frame < 7200; frame++) {
        if (game.state === "levelup") game.choose(0);
        game.step(1 / 60, {
          x: Math.cos(frame / 180),
          y: Math.sin(frame / 180),
        });
        const checkpoint = fixture.checkpoints.find((c) => c.frame === frame);
        if (!checkpoint) continue;
        const { firstPick, choices, player, ...rest } = game.snapshot();
        for (const key of NEW_SNAPSHOT_KEYS) delete rest[key];
        const actual = { ...rest, P: player };
        for (const text of actual.texts) delete text.translation;
        assert.deepEqual(actual, checkpoint.snapshot, `frame ${frame}`);
      }
    } finally {
      Math.random = random;
    }
  });
