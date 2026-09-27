import { TAU, clamp, rand } from "../shared/math.js";
import { WORLD, ENEMY_TYPES, SPAWNS } from "../data/balance.js";
export function createSpawns(
  player,
  enemies,
  clock,
  fx,
  viewport,
  translate = (key) => key,
) {
  let spawnT = SPAWNS.initialDelay,
    hordeT = SPAWNS.hordeInterval;
  const VW = () => viewport.width,
    VH = () => viewport.height;
  function spawnEnemy(type, x, y) {
    const T = ENEMY_TYPES[type],
      hpMul = 1 + clock.time / SPAWNS.healthScale;
    enemies.push({
      type,
      x,
      y,
      r: T.r,
      hp: T.hp * hpMul,
      max: T.hp * hpMul,
      spd: T.spd * rand(0.88, 1.12),
      dmg: T.dmg,
      xp: T.xp,
      kx: 0,
      ky: 0,
      flash: 0,
      anim: rand(0, TAU),
      face: 1,
      oh: {},
      dead: false,
      effects: {},
    });
  }
  function edgePos() {
    const a = rand(0, TAU),
      d = Math.hypot(VW(), VH()) / 2 + 70;
    return [
      clamp(player.x + Math.cos(a) * d, 80, WORLD.w - 80),
      clamp(player.y + Math.sin(a) * d, 80, WORLD.h - 80),
    ];
  }
  function pickType() {
    const r = Math.random();
    if (
      clock.time > 100 &&
      r < Math.min(0.14, (clock.time - 100) / 1500 + 0.04)
    )
      return "brute";
    if (clock.time > 40 && r < 0.35) return "runner";
    return "goblin";
  }
  function updateSpawns(dt) {
    spawnT -= dt;
    if (spawnT <= 0 && enemies.length < SPAWNS.cap) {
      spawnT = Math.max(
        SPAWNS.minInterval,
        SPAWNS.interval - clock.time * SPAWNS.acceleration,
      );
      const n = 1 + Math.floor(clock.time / SPAWNS.growthEvery);
      for (let i = 0; i < n; i++) {
        const [x, y] = edgePos();
        spawnEnemy(pickType(), x, y);
      }
    }
    hordeT -= dt;
    if (hordeT <= 0) {
      hordeT = SPAWNS.hordeInterval;
      fx.sounds.push({ id: "horde", x: player.x, y: player.y });
      const n = 14 + Math.floor(clock.time / 10),
        R = Math.hypot(VW(), VH()) / 2 + 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        spawnEnemy(
          i % 5 === 0 && clock.time > 110 ? "brute" : "goblin",
          clamp(player.x + Math.cos(a) * R, 80, WORLD.w - 80),
          clamp(player.y + Math.sin(a) * R, 80, WORLD.h - 80),
        );
      }
      fx.texts.push({
        x: player.x,
        y: player.y - 130,
        t: 0,
        life: 1.8,
        txt: translate("horde"),
        col: "#ff6a4a",
        size: 16,
      });
    }
  }
  return { updateSpawns, edgePos };
}
