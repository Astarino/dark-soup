import { ABILITY_BEHAVIOR, ABILITY_STATS } from "../data/balance.js";
import { TAU, clamp, d2, rand } from "../shared/math.js";
import { isHostile, nearestEnemy } from "./targeting.js";
const B = ABILITY_BEHAVIOR.bellPepper;
// Долька болгарского перца летит бумерангом и возвращается к котлу.
// Проходит сквозь врагов; урон падает по списку B.hits, после него долька
// больше не бьёт. Одного врага задевает раз на пути туда и раз обратно.
// Новый бросок не ждёт возвращения предыдущих долек.
export function createBellPepper(player, enemies, fx, hurt) {
  const slices = [];
  let timer = 0,
    side = 1;
  // Бросок из s.n долек: первая — к ближайшему врагу, остальные с равным шагом
  // по кругу. Соседние дольки изгибаются в разные стороны. У каждой дольки
  // свой счёт попаданий и своё возвращение.
  function throwSlices(s) {
    const target = nearestEnemy(enemies, player.x, player.y, B.range);
    let base;
    if (target) base = Math.atan2(target.y - player.y, target.x - player.x);
    else if (Math.hypot(player.vx, player.vy) > 20)
      base = Math.atan2(player.vy, player.vx);
    else base = rand(0, TAU);
    for (let i = 0; i < s.n; i++) {
      const a = base + (i * TAU) / s.n;
      side = -side;
      slices.push({
        ox: player.x,
        oy: player.y,
        x: player.x,
        y: player.y,
        dx: Math.cos(a),
        dy: Math.sin(a),
        side,
        spin0: i * 3, // разный поворот, чтобы дольки залпа не выглядели одинаково
        range: s.range,
        mul: s.dmg / B.hits[0],
        t: 0,
        phase: "out",
        hits: 0,
        struck: { out: new Set(), back: new Set() },
        done: false,
      });
    }
  }
  function move(slice, dt) {
    slice.t += dt;
    if (slice.phase === "out") {
      const k = Math.min(1, slice.t / B.outTime),
        along = slice.range * Math.sin((k * Math.PI) / 2),
        bend = Math.sin(k * Math.PI) * B.curve * slice.side;
      slice.x = slice.ox + slice.dx * along - slice.dy * bend;
      slice.y = slice.oy + slice.dy * along + slice.dx * bend;
      if (k >= 1) slice.phase = "back";
      return;
    }
    const dx = player.x - slice.x,
      dy = player.y - slice.y,
      d = Math.hypot(dx, dy) || 1,
      step = Math.min(d, B.returnSpeed * dt);
    slice.x += (dx / d) * step;
    slice.y += (dy / d) * step;
    if (d - step < B.catchRadius) slice.done = true;
  }
  function strike(slice) {
    const seen = slice.struck[slice.phase];
    for (const e of enemies) {
      if (slice.hits >= B.hits.length) return;
      if (!isHostile(e) || seen.has(e)) continue;
      if (d2(e.x, e.y, slice.x, slice.y) >= (B.hitRadius + e.r) ** 2) continue;
      seen.add(e);
      const dmg = Math.max(1, Math.round(B.hits[slice.hits] * slice.mul));
      slice.hits++;
      hurt(e, dmg, e.x - slice.x, e.y - slice.y, B.knockback);
    }
  }
  function update(dt) {
    const level = player.lv.bellPepper || 0;
    if (level > 0) {
      const s = ABILITY_STATS.bellPepper(level);
      timer -= dt;
      if (timer <= 0) {
        timer = s.cd;
        throwSlices(s);
      }
    }
    for (const slice of slices) {
      move(slice, dt);
      if (!slice.done) strike(slice);
    }
    slices.splice(0, slices.length, ...slices.filter((s) => !s.done));
  }
  return {
    update,
    view: () =>
      slices.map(({ x, y, t, spin0, phase, hits }) => ({
        x,
        y,
        spin: t * 14 + spin0,
        phase,
        spent: hits >= B.hits.length,
      })),
    cooldown: () =>
      player.lv.bellPepper > 0
        ? clamp(timer / ABILITY_STATS.bellPepper(player.lv.bellPepper).cd, 0, 1)
        : 0,
  };
}
