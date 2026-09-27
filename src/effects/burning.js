import { BURNING } from "../data/balance.js";
import { rand } from "../shared/math.js";
export const burning = {
  interval: BURNING.interval,
  tick: (target, damage) => damage(target, BURNING.damage),
  apply(target, fx) {
    for (let i = 0; i < 7; i++)
      fx.parts.push({
        x: target.x + rand(-target.r, target.r),
        y: target.y - rand(target.r, target.r * 2),
        vx: rand(-35, 35),
        vy: rand(-115, -35),
        g: -25,
        life: rand(0.25, 0.5),
        t: 0,
        r: rand(2, 4),
        c: i % 2 ? "#f7aa35" : "#ffdc75",
      });
  },
};
