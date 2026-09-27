import { ABILITY_BEHAVIOR, ABILITY_STATS } from "../data/balance.js";
import { clamp, d2, rand } from "../shared/math.js";
import { isHostile, nearestEnemy } from "./targeting.js";
const B = ABILITY_BEHAVIOR.potato;
// Картофелина летит в ближайшего врага и при попадании разлетается веером дроби.
// Дробь бьёт одного врага и исчезает; повторно она не делится.
export function createPotato(player, enemies, fx, hurt) {
  const shots = [];
  let timer = 0;
  function fire(s) {
    const target = nearestEnemy(enemies, player.x, player.y, B.range);
    if (!target) return false;
    const dx = target.x - player.x,
      dy = target.y - player.y,
      d = Math.hypot(dx, dy) || 1;
    shots.push({
      kind: "potato",
      x: player.x,
      y: player.y,
      vx: (dx / d) * B.speed,
      vy: (dy / d) * B.speed,
      travelled: 0,
      range: B.maxDistance,
      r: B.hitRadius,
      dmg: s.dmg,
      pellets: s.pellets,
      pelletDmg: s.pelletDmg,
      skip: null,
      done: false,
    });
    return true;
  }
  function split(shot, struck) {
    const base = Math.atan2(shot.vy, shot.vx),
      n = shot.pellets;
    for (let i = 0; i < n; i++) {
      const a =
        base - B.fan / 2 + (B.fan * i) / Math.max(1, n - 1) + rand(-0.05, 0.05);
      const v = B.pelletSpeed * rand(0.85, 1.1);
      shots.push({
        kind: "pellet",
        x: shot.x,
        y: shot.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        travelled: 0,
        range: B.pelletRange,
        r: B.pelletRadius,
        dmg: shot.pelletDmg,
        skip: struck, // дробь пролетает сквозь того, в кого попала картофелина
        done: false,
      });
    }
    for (let k = 0; k < 8; k++)
      fx.parts.push({
        x: shot.x,
        y: shot.y - 20,
        vx: rand(-90, 90),
        vy: rand(-140, -20),
        g: 380,
        life: rand(0.25, 0.5),
        t: 0,
        r: rand(2, 4),
        c: k % 2 ? "#c8a060" : "#8a6a3a",
      });
  }
  function update(dt) {
    const level = player.lv.potato || 0;
    if (level > 0) {
      const s = ABILITY_STATS.potato(level);
      timer -= dt;
      if (timer <= 0) timer = fire(s) ? s.cd : 0;
    }
    const count = shots.length; // дробь, созданная в этом кадре, полетит со следующего
    for (let i = 0; i < count; i++) {
      const shot = shots[i];
      if (shot.done) continue;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.travelled += Math.hypot(shot.vx, shot.vy) * dt;
      for (const e of enemies) {
        if (e === shot.skip || !isHostile(e)) continue;
        if (d2(e.x, e.y, shot.x, shot.y) >= (shot.r + e.r) ** 2) continue;
        shot.done = true;
        if (shot.kind === "potato") {
          hurt(e, shot.dmg, shot.vx, shot.vy, B.knockback);
          split(shot, e);
        } else hurt(e, shot.dmg, shot.vx, shot.vy, B.pelletKnockback);
        break;
      }
      if (shot.travelled >= shot.range) shot.done = true;
    }
    shots.splice(0, shots.length, ...shots.filter((s) => !s.done));
  }
  return {
    update,
    view: () =>
      shots.map(({ kind, x, y, vx, vy }) => ({ kind, x, y, vx, vy })),
    cooldown: () =>
      player.lv.potato > 0
        ? clamp(timer / ABILITY_STATS.potato(player.lv.potato).cd, 0, 1)
        : 0,
  };
}
