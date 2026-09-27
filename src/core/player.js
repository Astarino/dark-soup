import { CX, CY, needFor, PLAYER } from "../data/balance.js";
import { UPG } from "../systems/upgrades.js";
export function createPlayer(catalog = UPG) {
  return {
    x: CX,
    y: CY + 20,
    r: PLAYER.radius,
    vx: 0,
    vy: 0,
    baseSpeed: PLAYER.speed,
    speed: PLAYER.speed,
    hp: PLAYER.health,
    maxHp: PLAYER.health,
    iframe: 0,
    xp: 0,
    lvl: 1,
    need: needFor(1),
    pending: 0,
    walk: 0,
    face: 1,
    dmgMul: 1,
    magnet: PLAYER.magnet,
    contactEffects: ["burning"],
    lv: Object.fromEntries(catalog.map((u) => [u.id, 0])),
    cd: { carrot: 0 },
  };
}
