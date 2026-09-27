import { rand } from "../shared/math.js";
import { K } from "../data/balance.js";
export function createVisualState() {
  return { parts: [], texts: [], drops: [], shake: 0, steamT: 0 };
}
export function createVisualEffects(player, fx) {
  function updateFx(dt) {
    fx.steamT -= dt;
    if (fx.steamT <= 0) {
      fx.steamT = 0.1;
      fx.parts.push({
        x: player.x + rand(-10, 10),
        y: player.y - 60,
        vx: rand(-8, 8),
        vy: rand(-45, -25),
        g: 0,
        life: rand(0.9, 1.5),
        t: 0,
        r: rand(3, 6),
        c: "steam",
      });
      if (Math.random() < 0.6)
        fx.parts.push({
          x: player.x + rand(-12, 12),
          y: player.y - 6,
          vx: rand(-25, 25) - player.vx * 0.4,
          vy: rand(-110, -50),
          g: -20,
          life: rand(0.4, 0.9),
          t: 0,
          r: 2,
          c: "ember",
        });
    }
    for (const p of fx.parts) {
      p.t += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    fx.parts.splice(
      0,
      fx.parts.length,
      ...fx.parts.filter((p) => p.t < p.life),
    );
    for (const t of fx.texts) {
      t.t += dt;
      t.y -= 28 * dt;
    }
    fx.texts.splice(
      0,
      fx.texts.length,
      ...fx.texts.filter((t) => t.t < t.life),
    );
    for (const d of fx.drops) d.t += dt;
    const remainingDrops = fx.drops.filter((d) => {
      if (d.t >= 0.45 && !d.splashed) {
        d.splashed = true;
        for (let k = 0; k < 12; k++)
          fx.parts.push({
            x: player.x,
            y: player.y + -29 * K,
            vx: rand(-80, 80),
            vy: rand(-180, -80),
            g: 500,
            life: rand(0.4, 0.7),
            t: 0,
            r: 2,
            c: "#e98a3a",
          });
      }
      return d.t < 0.5;
    });
    fx.drops.splice(0, fx.drops.length, ...remainingDrops);
  }
  return { updateFx };
}
