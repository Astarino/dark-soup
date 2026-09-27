import { d2 } from "../shared/math.js";
// Живые враги, не перешедшие на сторону котла.
export const isHostile = (e) => !e.dead && !(e.charm > 0);
export function nearestEnemy(enemies, x, y, range, except = null) {
  let best = null,
    bestD = range * range;
  for (const e of enemies) {
    if (e === except || !isHostile(e)) continue;
    const d = d2(e.x, e.y, x, y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}
