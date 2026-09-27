import { ABILITY_BEHAVIOR } from "../data/balance.js";
import { TAU, rand, d2 } from "../shared/math.js";
import { ABILITY_STATS } from "../data/balance.js";
export function carrot(player, enemies, strikes, fx, hurt, dt) {
  if (player.lv.carrot > 0) {
    const s = ABILITY_STATS.carrot(player.lv.carrot);
    player.cd.carrot -= dt;
    if (player.cd.carrot <= 0) {
      player.cd.carrot = s.cd;
      const cands = enemies.filter(
        (e) =>
          d2(e.x, e.y, player.x, player.y) < ABILITY_BEHAVIOR.carrot.range ** 2,
      );
      // Сначала разные враги в радиусе; лишние морковки снова идут по тем же
      // врагам со сдвигом, чтобы большой залп не падал в одну точку.
      const V = ABILITY_BEHAVIOR.carrotVolley,
        pool = [],
        targets = [],
        stagger = Math.min(ABILITY_BEHAVIOR.carrot.stagger, V.spanTime / s.n);
      for (let i = 0; i < s.n; i++) {
        let tx, ty;
        if (!pool.length && i > 0 && cands.length === 0) pool.push(...targets);
        if (cands.length || pool.length) {
          const fresh = cands.length > 0,
            list = fresh ? cands : pool,
            e = list.splice(Math.floor(Math.random() * list.length), 1)[0];
          if (fresh) targets.push(e);
          const dx = player.x - e.x,
            dy = player.y - e.y,
            d = Math.hypot(dx, dy) || 1,
            lead = Math.min(d * 0.5, e.spd * 0.4);
          tx = e.x + (dx / d) * lead;
          ty = e.y + (dy / d) * lead;
          if (!fresh) {
            const a = rand(0, TAU),
              off = rand(0.3, 1) * s.r * V.jitter;
            tx += Math.cos(a) * off;
            ty += Math.sin(a) * off;
          }
        } else {
          const a = rand(0, TAU),
            dd = rand(80, 240);
          tx = player.x + Math.cos(a) * dd;
          ty = player.y + Math.sin(a) * dd;
        }
        strikes.push({
          x: tx,
          y: ty,
          t: -i * stagger,
          fall: ABILITY_BEHAVIOR.carrot.fall,
          r: s.r,
          dmg: s.dmg,
          hit: false,
          sparks: Math.max(V.minParticles, Math.round(V.particles / Math.sqrt(s.n))),
        });
      }
    }
  }
  for (const s of strikes) {
    s.t += dt;
    if (!s.hit && s.t >= s.fall) {
      s.hit = true;
      fx.shake = Math.min(6, fx.shake + 2);
      for (const e of enemies)
        if (d2(e.x, e.y, s.x, s.y) < (s.r + e.r) ** 2)
          hurt(
            e,
            s.dmg,
            e.x - s.x,
            e.y - s.y,
            ABILITY_BEHAVIOR.carrot.knockback,
          );
      for (let k = 0; k < s.sparks; k++) {
        const a = rand(0, TAU),
          v = rand(60, 220);
        fx.parts.push({
          x: s.x,
          y: s.y - 6,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.5 - 90,
          g: 420,
          life: rand(0.3, 0.7),
          t: 0,
          r: rand(2, 5),
          c: ["#ee7a22", "#ffc247", "#6b4a2a", "#fff0b0"][k % 4],
        });
      }
    }
  }
  strikes.splice(
    0,
    strikes.length,
    ...strikes.filter((s) => s.t < s.fall + ABILITY_BEHAVIOR.carrot.afterglow),
  );
}
