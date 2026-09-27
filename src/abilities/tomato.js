import { ABILITY_BEHAVIOR, ABILITY_STATS } from "../data/balance.js";
import { TAU, clamp, d2, rand } from "../shared/math.js";
import { isHostile } from "./targeting.js";
const B = ABILITY_BEHAVIOR.tomato;
// Помидор падает на случайного врага рядом: урон при приземлении, затем
// томатная лужа, которая растекается и только замедляет (без урона со временем).
export function createTomato(player, enemies, fx, hurt) {
  const drops = [],
    puddles = [];
  let timer = null;
  function throwTomatoes(s) {
    const cands = enemies.filter(
      (e) => isHostile(e) && d2(e.x, e.y, player.x, player.y) < B.range ** 2,
    );
    for (let i = 0; i < s.n; i++) {
      let x, y;
      if (cands.length) {
        const e = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
        const dx = player.x - e.x,
          dy = player.y - e.y,
          d = Math.hypot(dx, dy) || 1,
          lead = Math.min(d * 0.5, e.spd * 0.4);
        x = e.x + (dx / d) * lead;
        y = e.y + (dy / d) * lead;
      } else {
        const a = rand(0, TAU),
          dd = rand(80, 240);
        x = player.x + Math.cos(a) * dd;
        y = player.y + Math.sin(a) * dd;
      }
      drops.push({ x, y, t: -i * B.stagger, fall: B.fall, r: s.r, dmg: s.dmg });
    }
  }
  function land(drop) {
    fx.sounds.push({ id: "tomatoSplat", x: drop.x, y: drop.y });
    fx.shake = Math.min(6, fx.shake + 2);
    for (const e of enemies)
      if (isHostile(e) && d2(e.x, e.y, drop.x, drop.y) < (drop.r + e.r) ** 2)
        hurt(e, drop.dmg, e.x - drop.x, e.y - drop.y, B.knockback, { source: "tomato", sound: null } /* звук — шлепок при падении */);
    puddles.push({ x: drop.x, y: drop.y, R: B.puddleRadius, t: 0, life: B.puddleLife });
    for (let k = 0; k < 16; k++) {
      const a = rand(0, TAU),
        v = rand(60, 200);
      fx.parts.push({
        x: drop.x,
        y: drop.y - 6,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.5 - 80,
        g: 420,
        life: rand(0.3, 0.6),
        t: 0,
        r: rand(2, 4),
        c: ["#d8312a", "#ff6a4a", "#f4e0a0", "#9a1a14"][k % 4],
      });
    }
  }
  // Площадь растёт в areaGrowth раз за каждую секунду после удара:
  // S(t) = S0 · g^t, значит радиус r(t) = R0 · g^(t/2). Рост непрерывный.
  const radiusOf = (p) => p.R * Math.pow(B.areaGrowth, p.t / 2);
  function update(dt) {
    const level = player.lv.tomato || 0;
    if (level > 0) {
      const s = ABILITY_STATS.tomato(level);
      if (timer === null) timer = B.firstDelay;
      timer -= dt;
      if (timer <= 0) {
        timer = s.cd;
        throwTomatoes(s);
      }
    }
    for (const drop of drops) {
      drop.t += dt;
      if (!drop.landed && drop.t >= drop.fall) {
        drop.landed = true;
        land(drop);
      }
    }
    drops.splice(0, drops.length, ...drops.filter((d) => !d.landed));
    for (const p of puddles) p.t += dt;
    puddles.splice(0, puddles.length, ...puddles.filter((p) => p.t < p.life));
  }
  function speedFactor(e) {
    if (e.charm > 0 || (e.adapted && e.adapted.includes("tomato"))) return 1;
    for (const p of puddles) {
      const r = radiusOf(p);
      if (d2(e.x, e.y, p.x, p.y) < r * r) return 1 - B.slow;
    }
    return 1;
  }
  return {
    update,
    speedFactor,
    view: () => ({
      drops: drops.map(({ x, y, t, fall, r }) => ({ x, y, t, fall, r })),
      puddles: puddles.map((p) => ({ x: p.x, y: p.y, r: radiusOf(p), t: p.t, life: p.life })),
    }),
    cooldown: () =>
      player.lv.tomato > 0 && timer !== null
        ? clamp(timer / ABILITY_STATS.tomato(player.lv.tomato).cd, 0, 1)
        : 0,
  };
}
