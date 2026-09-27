import { TAU, lerp } from "../shared/math.js";
import { needFor, POT_CY } from "../data/balance.js";
export function createExperience(player, gems, fx) {
  function updateGems(dt) {
    for (const g of gems) {
      const dx = player.x - g.x,
        dy = player.y - 30 - g.y,
        d = Math.hypot(dx, dy) || 1;
      if (d < player.magnet) g.pull = true;
      if (g.pull) {
        const sp = 420 + (player.magnet - Math.min(d, player.magnet)) * 4;
        g.vx = lerp(g.vx, (dx / d) * sp, 1 - Math.exp(-10 * dt));
        g.vy = lerp(g.vy, (dy / d) * sp, 1 - Math.exp(-10 * dt));
      } else {
        g.vx *= Math.exp(-5 * dt);
        g.vy *= Math.exp(-5 * dt);
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < player.r + 6) {
        g.got = true;
        addXP(g.v);
      }
    }
    gems.splice(0, gems.length, ...gems.filter((g) => !g.got));
  }
  function addXP(v) {
    player.xp += v;
    while (player.xp >= player.need) {
      player.xp -= player.need;
      player.lvl++;
      player.need = needFor(player.lvl);
      player.pending++;
      fx.sounds.push({ id: "levelUp", x: player.x, y: player.y });
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * TAU;
        fx.parts.push({
          x: player.x,
          y: player.y - POT_CY,
          vx: Math.cos(a) * 180,
          vy: Math.sin(a) * 150,
          g: 0,
          life: 0.5,
          t: 0,
          r: 3,
          c: "#ffd36a",
        });
      }
    }
  }
  return { updateGems, addXP };
}
