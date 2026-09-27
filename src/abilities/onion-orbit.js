import { TAU } from "../shared/math.js";
import { ABILITY_STATS, POT_CY, ONION_SIZES } from "../data/balance.js";
export function onionBalls(player, time, tOff = 0) {
  const s = ABILITY_STATS.onion(player.lv.onion),
    out = [],
    t = time - tOff;
  for (let i = 0; i < s.n; i++) {
    const a = t * s.spd + (i / s.n) * TAU;
    const rad = s.orbit + ((i % 3) - 1) * 16 + Math.sin(t * 1.7 + i * 2.1) * 8;
    const r = ONION_SIZES[i];
    out.push({
      i,
      x: player.x + Math.cos(a) * rad,
      y: player.y - POT_CY + Math.sin(a) * rad * 0.8,
      r,
      dmg: s.dmg * (0.7 + r / 20),
    });
  }
  return out;
}
