import { ABILITY_BEHAVIOR, ABILITY_STATS } from "../data/balance.js";
import { d2 } from "../shared/math.js";
import { isHostile } from "./targeting.js";
const B = ABILITY_BEHAVIOR.cabbage;
// Постоянное поле из капустных листьев вокруг котла. Урон наносится тиками
// по накопленному игровому времени, поэтому не зависит от частоты кадров.
// Отбрасывания нет; цифры урона не показываются, чтобы поле не засоряло экран.
export function createCabbage(player, enemies, hurt) {
  let elapsed = 0;
  function update(dt) {
    const level = player.lv.cabbage || 0;
    if (level <= 0) {
      elapsed = 0;
      return;
    }
    const s = ABILITY_STATS.cabbage(level);
    elapsed += dt;
    while (elapsed + 1e-9 >= B.tick) {
      elapsed -= B.tick;
      for (const e of enemies)
        if (isHostile(e) && d2(e.x, e.y, player.x, player.y) < (s.R + e.r) ** 2)
          hurt(e, s.tickDmg, e.x - player.x, e.y - player.y, 0, { quiet: true, source: "cabbage" });
    }
  }
  return { update };
}
