import { clamp, lerp } from "../shared/math.js";
import { WORLD } from "../data/balance.js";
export function movePlayer(player, v, dt, pushOut) {
  const f = 1 - Math.exp(-12 * dt);
  // Гравитация Стража Колеса временно замедляет котёл.
  const speed = player.slowT > 0 ? player.speed * player.slowMul : player.speed;
  if (player.slowT > 0) player.slowT -= dt;
  player.vx = lerp(player.vx, v.x * speed, f);
  player.vy = lerp(player.vy, v.y * speed, f);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  pushOut(player);
  player.x = clamp(player.x, 70, WORLD.w - 70);
  player.y = clamp(player.y, 90, WORLD.h - 70);
  if (Math.hypot(player.vx, player.vy) > 20) player.walk += dt;
  if (Math.abs(v.x) > 0.1) player.face = Math.sign(v.x);
  player.iframe -= dt;
}
