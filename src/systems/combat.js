import { COMBAT, WARDEN } from "../data/balance.js";
import { rand } from "../shared/math.js";
export function createCombat(player, gems, fx, onKill) {
  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.dead = true;
      onKill();
      gems.push({
        x: e.x,
        y: e.y,
        v: e.xp,
        vx: rand(-40, 40),
        vy: rand(-40, 40),
        pull: false,
      });
      for (let i = 0; i < 12; i++)
        fx.parts.push({
          x: e.x,
          y: e.y - e.r,
          vx: rand(-120, 120),
          vy: rand(-170, 30),
          g: 380,
          life: rand(0.3, 0.7),
          t: 0,
          r: rand(2, 5),
          c: e.effects.burning
            ? i % 2
              ? "#ee7a22"
              : "#ffc247"
            : i % 3
              ? "#5b7a2c"
              : "#2b2a1a",
        });
    }
  }
  // source — id способности супа. Страж Колеса считает урон по источникам и,
  // освоив способность, получает от неё в 5 раз меньше урона без побочных
  // эффектов (вспышки с торможением и отброса).
  function hurt(e, dmg, forceX, forceY, kb, { quiet = false, source = null } = {}) {
    if (e.dead || e.charm > 0) return; // обращённые свёклой — союзники котла
    const adapted = !!(source && e.adapted && e.adapted.includes(source));
    dmg = Math.max(
      1,
      Math.round(
        dmg *
          player.dmgMul *
          rand(...COMBAT.damageSpread) *
          (adapted ? WARDEN.adaptedDamage : 1),
      ),
    );
    if (!adapted) {
      e.flash = COMBAT.hitFlash;
      const d = Math.hypot(forceX, forceY) || 1,
        k =
          kb *
          (e.type === "brute"
            ? COMBAT.bruteKnockback
            : e.type === "warden"
              ? WARDEN.knockbackScale
              : 1);
      e.kx += (forceX / d) * k;
      e.ky += (forceY / d) * k;
    }
    if (source && e.dmgWindow) {
      e.dmgWindow[source] = (e.dmgWindow[source] || 0) + dmg;
      e.sinceAdapt += dmg;
    }
    if (!quiet)
      fx.texts.push({
      x: e.x + rand(-6, 6),
      y: e.y - e.r * 3,
      t: 0,
      life: 0.6,
      txt: String(dmg),
      col: adapted ? "#9a9488" : "#fff3d6",
      size: 8,
    });
    damageEnemy(e, dmg);
  }
  return { damageEnemy, hurt };
}
