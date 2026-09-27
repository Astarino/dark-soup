import { lerp } from "../shared/math.js";
export function followPlayer(cam, player, dt) {
  const cf = 1 - Math.exp(-8 * dt);
  cam.x = lerp(cam.x, player.x, cf);
  cam.y = lerp(cam.y, player.y - 30, cf);
}
