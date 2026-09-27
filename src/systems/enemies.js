import { COMBAT } from "../data/balance.js";
import { rand } from "../shared/math.js";
import { PLAYER } from "../data/balance.js";
export function updateEnemies(
  player,
  enemies,
  fx,
  dt,
  {
    pushOut,
    edgePos,
    updateStatusEffects,
    applyStatusEffect,
    speedFactor = () => 1,
    control = () => false,
  },
) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j],
        rs = a.r + b.r,
        dx = b.x - a.x;
      if (dx > rs || dx < -rs) continue;
      const dy = b.y - a.y;
      if (dy > rs || dy < -rs) continue;
      const dd = dx * dx + dy * dy;
      if (dd >= rs * rs) continue;
      const d = Math.sqrt(dd) || 0.01,
        p = (rs - d) * 0.5,
        ux = dx / d,
        uy = dy / d,
        wa = b.r / rs,
        wb = a.r / rs;
      a.x -= ux * p * wa;
      a.y -= uy * p * wa;
      b.x += ux * p * wb;
      b.y += uy * p * wb;
    }
  }
  const kd = Math.exp(-COMBAT.knockbackDecay * dt);
  for (const e of enemies) {
    if (e.dead) continue;
    updateStatusEffects(e, dt);
    if (e.dead) continue;
    const dx = player.x - e.x,
      dy = player.y - e.y,
      d = Math.hypot(dx, dy) || 1;
    if (d > COMBAT.recycleDistance) {
      const [x, y] = edgePos();
      e.x = x;
      e.y = y;
      continue;
    }
    const slow = (e.flash > 0 ? COMBAT.hitSlow : 1) * speedFactor(e);
    // Обращённые свёклой враги двигаются по своим правилам и не бьют котёл.
    if (control(e, dt, slow)) {
      e.kx *= kd;
      e.ky *= kd;
      pushOut(e);
      e.anim += dt * e.spd * 0.06;
      e.flash -= dt;
      continue;
    }
    e.x += ((dx / d) * e.spd * slow + e.kx) * dt;
    e.y += ((dy / d) * e.spd * slow + e.ky) * dt;
    e.kx *= kd;
    e.ky *= kd;
    pushOut(e);
    e.face = dx >= 0 ? 1 : -1;
    e.anim += dt * e.spd * 0.06;
    e.flash -= dt;
    if (d < e.r + player.r - COMBAT.contactInset && player.iframe <= 0) {
      player.hp -= e.dmg;
      player.iframe = PLAYER.contactGrace;
      fx.shake = Math.min(8, fx.shake + 5);
      for (const effect of player.contactEffects) applyStatusEffect(e, effect);
      e.kx -= (dx / d) * COMBAT.contactKnockback;
      e.ky -= (dy / d) * COMBAT.contactKnockback;
      fx.texts.push({
        x: player.x,
        y: player.y - 90,
        t: 0,
        life: 0.7,
        txt: "-" + e.dmg,
        col: "#ff5a4a",
        size: 8,
      });
      for (let k = 0; k < 8; k++)
        fx.parts.push({
          x: player.x,
          y: player.y - 50,
          vx: rand(-90, 90),
          vy: rand(-160, -40),
          g: 300,
          life: rand(0.3, 0.6),
          t: 0,
          r: rand(2, 4),
          c: "#e07b2f",
        });
    }
  }
  enemies.splice(0, enemies.length, ...enemies.filter((e) => !e.dead));
}
