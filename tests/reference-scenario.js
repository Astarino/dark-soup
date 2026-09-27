// Shared by scripts/capture-reference.js and tests/regression.test.js so the
// recorded runs and the checked runs follow exactly the same inputs.
import { createGame } from "../src/core/game.js";
import { mulberry32 } from "../src/shared/math.js";

export const REFERENCE_RUNS = [0, 1, 2].map((ingredient) => ({
  seed: 100 + ingredient,
  ingredient,
}));
export const CHECKPOINT_FRAMES = [59, 599, 1799, 3599, 7199];

// Seeded 2-minute run with a fixed orbit; level-ups always take the first card.
export function playReference({ seed, ingredient }, onCheckpoint) {
  const random = Math.random;
  Math.random = mulberry32(seed);
  try {
    const game = createGame();
    game.start();
    game.choose(ingredient);
    for (let frame = 0; frame < 7200; frame++) {
      if (game.state === "levelup") game.choose(0);
      game.step(1 / 60, { x: Math.cos(frame / 180), y: Math.sin(frame / 180) });
      if (!CHECKPOINT_FRAMES.includes(frame)) continue;
      const snapshot = game.snapshot();
      for (const text of snapshot.texts) delete text.translation;
      onCheckpoint(frame, JSON.parse(JSON.stringify(snapshot)));
    }
  } finally {
    Math.random = random;
  }
}
