import { ABILITY_BEHAVIOR, ABILITY_STATS, WORLD } from "../data/balance.js";
import { clamp, d2, rand } from "../shared/math.js";
import { nearestEnemy } from "./targeting.js";
const B = ABILITY_BEHAVIOR.beet;
// Свекольная лужа появляется в видимой области. Наступивший враг на время
// переходит на сторону котла: бьёт ближайших врагов и не трогает котёл.
// Обычные враги его не атакуют. Лимит обращённых по уровню — общий на все лужи.
export function createBeet(player, enemies, fx, hurt, viewport) {
  const pools = [];
  let timer = null;
  const charmedCount = () =>
    enemies.reduce((n, e) => n + (!e.dead && e.charm > 0 ? 1 : 0), 0);
  // Лужи одного залпа — в разных местах видимой области; несколько попыток
  // найти точку не ближе minSeparation радиусов к уже выбранным.
  function spawnPools(s) {
    const w = viewport.width * B.viewportShare,
      h = viewport.height * B.viewportShare,
      placed = [];
    for (let i = 0; i < s.pools; i++) {
      let x, y;
      for (let attempt = 0; attempt < 12; attempt++) {
        x = clamp(player.x + rand(-w / 2, w / 2), 80, WORLD.w - 80);
        y = clamp(player.y + rand(-h / 2, h / 2), 80, WORLD.h - 80);
        if (placed.every((p) => d2(p.x, p.y, x, y) >= (B.minSeparation * s.R) ** 2)) break;
      }
      placed.push({ x, y });
      pools.push({ x, y, r: s.R, dur: s.dur, t: 0, life: B.poolLife });
    }
  }
  function charm(e, pool) {
    e.charm = pool.dur;
    e.atk = 0;
    for (let k = 0; k < 8; k++)
      fx.parts.push({
        x: e.x + rand(-e.r, e.r),
        y: e.y - rand(0, e.r * 2),
        vx: rand(-40, 40),
        vy: rand(-120, -40),
        g: 0,
        life: rand(0.3, 0.6),
        t: 0,
        r: rand(2, 4),
        c: k % 2 ? "#c2266a" : "#f07ab0",
      });
  }
  function update(dt) {
    const level = player.lv.beet || 0;
    if (level > 0) {
      const s = ABILITY_STATS.beet(level);
      if (timer === null) timer = B.firstDelay;
      timer -= dt;
      if (timer <= 0) {
        timer = s.cd;
        spawnPools(s);
      }
    }
    const limit = level > 0 ? ABILITY_STATS.beet(level).limit : 0;
    let charmed = charmedCount();
    for (const pool of pools) {
      pool.t += dt;
      if (pool.t >= pool.life) continue;
      for (const e of enemies) {
        if (charmed >= limit) break;
        if (e.dead || e.charm > 0 || (e.adapted && e.adapted.includes("beet"))) continue;
        if (d2(e.x, e.y, pool.x, pool.y) < pool.r * pool.r) {
          charm(e, pool);
          charmed++;
        }
      }
    }
    pools.splice(0, pools.length, ...pools.filter((p) => p.t < p.life));
  }
  // Вызывается системой врагов вместо обычного преследования котла.
  function control(e, dt, slow) {
    if (!(e.charm > 0)) return false;
    e.charm -= dt;
    if (e.charm <= 0) {
      delete e.charm;
      delete e.atk;
      return false; // обращение закончилось — снова обычный враг
    }
    e.atk = Math.max(0, e.atk - dt);
    const target = nearestEnemy(enemies, e.x, e.y, B.targetRange, e);
    const tx = target ? target.x : player.x,
      ty = target ? target.y : player.y,
      stop = target ? e.r + target.r - 2 : B.idleDistance;
    const dx = tx - e.x,
      dy = ty - e.y,
      d = Math.hypot(dx, dy) || 1,
      move = d > stop ? e.spd * slow : 0;
    e.x += ((dx / d) * move + e.kx) * dt;
    e.y += ((dy / d) * move + e.ky) * dt;
    e.face = dx >= 0 ? 1 : -1;
    if (target && d <= e.r + target.r + 2 && e.atk <= 0) {
      e.atk = B.attackInterval;
      hurt(target, e.dmg, dx, dy, B.attackKnockback, { source: "beet" });
    }
    return true;
  }
  return {
    update,
    control,
    view: () => pools.map(({ x, y, r, t, life }) => ({ x, y, r, t, life })),
    cooldown: () =>
      player.lv.beet > 0 && timer !== null
        ? clamp(timer / ABILITY_STATS.beet(player.lv.beet).cd, 0, 1)
        : 0,
  };
}
