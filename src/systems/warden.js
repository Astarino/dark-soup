import { ENEMY_TYPES, WARDEN } from "../data/balance.js";
import { UPG } from "./upgrades.js";
// Страж Колеса — босс. Появляется один раз за забег на WARDEN.spawnAt.
// Здоровье: 10 000 × число ингредиентов игрока с уровнем ≥ 3 (минимум один).
// Адаптация: каждые adaptEvery урона колесо щёлкает, и способность супа,
// нанёсшая больше всего урона с прошлого щелчка, становится «освоенной»:
// урон от неё ×0,2, без торможения, отброса, замедления лужей и обращения.
// Поведение: идёт к котлу, вблизи бьёт клинком после замаха, раз в интервал
// кастует гравитацию — котёл в радиусе замедляется.
const INGREDIENTS = UPG.filter((u) => u.kind === "ing").map((u) => u.id);
const S = WARDEN.slash,
  G = WARDEN.gravity;

export function createWarden(player, enemies, clock, fx, edgePos, { onAdapt = () => {}, translate = (k) => k } = {}) {
  let spawned = false;
  function spawn() {
    spawned = true;
    const T = ENEMY_TYPES.warden,
      strong = INGREDIENTS.filter((id) => (player.lv[id] || 0) >= WARDEN.rankForHp).length,
      hp = Math.max(WARDEN.minIngredients, strong) * WARDEN.hpPerIngredient,
      [x, y] = edgePos();
    enemies.push({
      type: "warden",
      x,
      y,
      r: T.r,
      hp,
      max: hp,
      spd: T.spd,
      dmg: T.dmg,
      xp: T.xp,
      kx: 0,
      ky: 0,
      flash: 0,
      anim: 0,
      face: 1,
      oh: {},
      dead: false,
      effects: {},
      adapted: [],
      dmgWindow: {},
      sinceAdapt: 0,
      wheelSteps: 0,
      wheelAnim: 0,
      state: "chase",
      stateT: 0,
      slashCd: 1,
      gravityCd: G.firstDelay,
    });
    fx.texts.push({ x: player.x, y: player.y - 150, t: 0, life: 2.4, txt: translate("wardenArrives"), col: "#ece8da", size: 16 });
  }
  function adapt(e) {
    while (e.sinceAdapt >= WARDEN.adaptEvery && e.adapted.length < INGREDIENTS.length) {
      e.sinceAdapt -= WARDEN.adaptEvery;
      let best = null,
        most = 0;
      for (const [id, v] of Object.entries(e.dmgWindow))
        if (INGREDIENTS.includes(id) && !e.adapted.includes(id) && v > most) {
          best = id;
          most = v;
        }
      e.dmgWindow = {};
      if (!best) continue; // весь урон шёл от уже освоенного — колесо не щёлкает
      e.adapted.push(best);
      e.wheelSteps++;
      e.wheelAnim = WARDEN.wheelTurnTime;
      if (best === "beet" && e.charm > 0) {
        delete e.charm;
        delete e.atk;
      }
      fx.texts.push({ x: e.x, y: e.y - 190, t: 0, life: 1.6, txt: `${translate("adapted")}: ${translate(`upgrade_${best}`)}`, col: "#f0e0a8", size: 8 });
      fx.shake = Math.min(10, fx.shake + 6);
      onAdapt(best);
    }
  }
  function update(dt) {
    if (!spawned && clock.time >= WARDEN.spawnAt) spawn();
    for (const e of enemies) {
      if (e.type !== "warden" || e.dead) continue;
      adapt(e);
      e.wheelAnim = Math.max(0, e.wheelAnim - dt);
    }
  }
  // Хук системы врагов: вместо обычного преследования и контактного урона.
  function control(e, dt, slow) {
    if (e.type !== "warden") return false;
    e.slashCd -= dt;
    e.gravityCd -= dt;
    e.stateT -= dt;
    const dx = player.x - e.x,
      dy = player.y - e.y,
      d = Math.hypot(dx, dy) || 1,
      inReach = d < S.reach + player.r;
    let move = 0;
    if (e.state === "chase") {
      e.face = dx >= 0 ? 1 : -1;
      if (e.gravityCd <= 0 && d < G.radius) {
        e.state = "cast";
        e.stateT = G.windup;
      } else if (e.slashCd <= 0 && inReach) {
        e.state = "windup";
        e.stateT = S.windup;
      } else if (d > S.reach * 0.8) move = e.spd * slow;
    } else if (e.state === "windup" && e.stateT <= 0) {
      if (inReach && player.iframe <= 0) {
        player.hp -= S.damage;
        player.iframe = 0.6;
        fx.shake = Math.min(10, fx.shake + 7);
        fx.texts.push({ x: player.x, y: player.y - 90, t: 0, life: 0.7, txt: "-" + S.damage, col: "#ff5a4a", size: 8 });
      }
      e.state = "strike";
      e.stateT = S.recover;
      e.slashCd = S.cooldown;
    } else if (e.state === "strike" && e.stateT <= 0) e.state = "chase";
    else if (e.state === "cast" && e.stateT <= 0) {
      if (d < G.radius) {
        player.slowT = G.duration;
        player.slowMul = 1 - G.slow;
      }
      e.gravityCd = G.interval;
      e.state = "chase";
      fx.shake = Math.min(8, fx.shake + 3);
    }
    e.x += ((dx / d) * move + e.kx) * dt;
    e.y += ((dy / d) * move + e.ky) * dt;
    return true;
  }
  return { update, control };
}
