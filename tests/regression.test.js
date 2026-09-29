import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playReference } from "./reference-scenario.js";
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/reference-runs.json", import.meta.url)),
);
// Reference runs recorded from the current mechanics (carrot volleys, cabbage
// field, four vegetable abilities) with a seeded RNG. Any unintended change in
// movement, enemies, spawns, combat, abilities or XP shows up as a diff here.
// After an intentional mechanics change: npm run capture-reference, then review.
// Enemy `id` was added to the snapshot later, for the renderers only (frame-to-frame
// matching, death animation). It is not a rule input, so the recorded gameplay
// fixtures stay untouched and are compared without it; ids get their own checks.
const gameplay = (snapshot) => ({ ...snapshot, enemies: snapshot.enemies.map(({ id, ...enemy }) => enemy) });
for (const fixture of fixtures)
  test(`reference run: ingredient ${fixture.ingredient}`, () => {
    const expected = new Map(fixture.checkpoints.map((c) => [c.frame, c.snapshot]));
    let checked = 0;
    playReference(fixture, (frame, snapshot) => {
      const ids = snapshot.enemies.map((e) => e.id);
      assert.ok(ids.every((id) => Number.isInteger(id) && id > 0), `frame ${frame}: every enemy has an id`);
      assert.equal(new Set(ids).size, ids.length, `frame ${frame}: ids are unique`);
      assert.deepEqual(gameplay(snapshot), expected.get(frame), `frame ${frame}`);
      checked++;
    });
    assert.equal(checked, fixture.checkpoints.length);
  });
