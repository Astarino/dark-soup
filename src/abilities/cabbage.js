import { ABILITY_BEHAVIOR } from "../data/balance.js";
import { d2 } from "../shared/math.js";
import { ABILITY_STATS } from "../data/balance.js";
export function cabbage(player, enemies, waves, fx, hurt, dt) {
  if (player.lv.cabbage > 0) {
    const s = ABILITY_STATS.cabbage(player.lv.cabbage);
    player.cd.cabbage -= dt;
    if (
      player.cd.cabbage <= 0 &&
      enemies.some(
        (e) => d2(e.x, e.y, player.x, player.y) < (s.trig + e.r) ** 2,
      )
    ) {
      player.cd.cabbage = s.cd;
      waves.push({
        t: 0,
        dur: ABILITY_BEHAVIOR.cabbage.duration,
        R: s.R,
        dmg: s.dmg,
        id: Math.random(),
      });
      fx.shake = Math.min(8, fx.shake + 4);
    }
  }
  for (const w of waves) {
    w.t += dt;
    const cur = w.R * (1 - Math.pow(1 - Math.min(1, w.t / w.dur), 3));
    for (const e of enemies)
      if (
        e.wave !== w.id &&
        d2(e.x, e.y, player.x, player.y) < (cur + e.r) ** 2
      ) {
        e.wave = w.id;
        hurt(
          e,
          w.dmg,
          e.x - player.x,
          e.y - player.y,
          ABILITY_BEHAVIOR.cabbage.knockback,
        );
      }
  }
  waves.splice(
    0,
    waves.length,
    ...waves.filter((w) => w.t < w.dur + ABILITY_BEHAVIOR.cabbage.afterglow),
  );
}
