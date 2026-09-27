import { ABILITY_BEHAVIOR } from "../data/balance.js";
import { d2 } from "../shared/math.js";

import { onionBalls } from "./onion-orbit.js";
export function onion(player, enemies, clock, hurt) {
  if (player.lv.onion > 0) {
    for (const b of onionBalls(player, clock.time))
      for (const e of enemies) {
        if (
          d2(e.x, e.y - e.r, b.x, b.y) < (b.r + e.r) ** 2 &&
          clock.time - (e.oh[b.i] || -9) > ABILITY_BEHAVIOR.onion.hitInterval
        ) {
          e.oh[b.i] = clock.time;
          hurt(
            e,
            b.dmg,
            e.x - player.x,
            e.y - player.y,
            ABILITY_BEHAVIOR.onion.knockback,
          );
        }
      }
  }
}
