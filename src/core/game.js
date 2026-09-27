import { CX, CY, needFor } from "../data/balance.js";
import { lerp } from "../shared/math.js";
import { createPlayer } from "./player.js";
import { createWorld } from "../world/world.js";
import { followPlayer } from "../world/camera.js";
import { createCombat } from "../systems/combat.js";
import { createSpawns } from "../systems/spawns.js";
import { updateEnemies } from "../systems/enemies.js";
import { movePlayer } from "../systems/movement.js";
import { createExperience } from "../systems/experience.js";
import {
  applyUpgrade,
  rollChoices,
  rollFirstChoices,
  UPG,
} from "../systems/upgrades.js";
import { createAbilities } from "../abilities/registry.js";
import { createWarden } from "../systems/warden.js";
import { WARDEN } from "../data/balance.js";
import { createStatusSystem } from "../effects/status.js";
import {
  createVisualState,
  createVisualEffects,
} from "../systems/visual-effects.js";

// This closure owns the run. Systems receive only the slices/capabilities they use.
// UI and rendering receive detached snapshots; they cannot mutate live entities.
export function createGame(
  world = createWorld(),
  { translate = (key) => key, catalog = UPG } = {},
) {
  let state = "menu",
    choices = [],
    firstPick = false;
  let player,
    enemies,
    gems,
    clock,
    cam,
    fx,
    combat,
    spawns,
    statuses,
    abilities,
    experience,
    visuals,
    warden,
    slowmo = 0,
    kills,
    run;
  // Главное меню: время сцены лагеря и плавный пролёт камеры к котлу.
  const INTRO = 1.4;
  let menuTime = 0,
    intro = null;
  const viewport = { width: 1200, height: 800 };
  function reset() {
    const steamT = fx?.steamT ?? 0; // The original menu steam timer survives restart.
    player = createPlayer(catalog);
    enemies = [];
    gems = [];
    clock = { time: 0 };
    kills = 0;
    cam = { x: player.x, y: player.y };
    fx = createVisualState();
    fx.steamT = steamT;
    // Статистика забега для экрана итогов и рекордов; в снимки не входит.
    run = { damageBySource: {}, damageTaken: 0, killsByType: {}, bossMet: false, bossKilled: false, bossAdapted: [] };
    combat = createCombat(
      player,
      gems,
      fx,
      (e) => {
        kills++;
        run.killsByType[e.type] = (run.killsByType[e.type] || 0) + 1;
        if (e.type === "warden") run.bossKilled = true;
      },
      (source, dmg) => {
        run.damageBySource[source] = (run.damageBySource[source] || 0) + dmg;
      },
    );
    spawns = createSpawns(player, enemies, clock, fx, viewport, translate);
    statuses = createStatusSystem(fx, (target, dmg) => {
      if (!target.dead) run.damageBySource.burning = (run.damageBySource.burning || 0) + Math.min(dmg, Math.max(0, target.hp));
      combat.damageEnemy(target, dmg);
    });
    abilities = createAbilities(
      player,
      enemies,
      clock,
      fx,
      combat.hurt,
      viewport,
    );
    experience = createExperience(player, gems, fx);
    slowmo = 0;
    warden = createWarden(player, enemies, clock, fx, spawns.edgePos, {
      translate,
      onAdapt: () => {
        slowmo = WARDEN.adaptSlowmo.duration; // щелчок колеса: игра на миг замедляется
      },
    });
    visuals = createVisualEffects(player, fx);
  }
  function levelUp(first) {
    state = "levelup";
    firstPick = first;
    choices = first ? rollFirstChoices(catalog) : rollChoices(player, catalog);
  }
  // Камера меню смотрит на лагерь (палатка, котёл, бревно). Панель меню
  // справа на широком экране и снизу на узком — лагерь сдвигается от неё.
  function menuCamera() {
    const wide = viewport.width > viewport.height;
    return {
      x: (wide ? CX - 110 + viewport.width * 0.16 : CX - 45) + Math.sin(menuTime * 0.15) * 12,
      y: (wide ? CY - 105 : CY - 60 + viewport.height * 0.16) + Math.cos(menuTime * 0.11) * 5,
    };
  }
  // intro: сначала пролёт камеры к котлу, затем выбор первой добавки.
  function start({ intro: withIntro = false } = {}) {
    const from = { x: cam.x, y: cam.y };
    reset();
    if (withIntro) {
      state = "intro";
      intro = { t: 0, from };
      cam.x = from.x;
      cam.y = from.y;
    } else levelUp(true);
  }
  function toMenu() {
    const from = { x: cam.x, y: cam.y };
    reset();
    choices = [];
    state = "menu";
    cam.x = from.x;
    cam.y = from.y;
  }
  const totalXp = () => {
    let xp = player.xp;
    for (let l = 1; l < player.lvl; l++) xp += needFor(l);
    return xp;
  };
  function runStats() {
    const damageTotal = Object.values(run.damageBySource).reduce((a, b) => a + b, 0);
    return structuredClone({
      time: clock.time,
      level: player.lvl,
      kills,
      xp: totalXp(),
      maxHp: player.maxHp,
      upgrades: Object.fromEntries(Object.entries(player.lv).filter(([, v]) => v > 0)),
      damageTotal,
      ...run,
    });
  }
  function pause(on) {
    if (on && state === "play") state = "pause";
    else if (!on && state === "pause") state = "play";
  }
  function choose(index) {
    if (state !== "levelup" || !choices[index]) return false;
    const upgrade = choices[index];
    applyUpgrade(player, upgrade, catalog);
    fx.drops.push({ id: upgrade.id, t: 0 });
    if (player.pending > 0) player.pending--;
    if (player.pending > 0) levelUp(false);
    else {
      choices = [];
      state = "play";
    }
    return true;
  }
  function step(dt, direction = { x: 0, y: 0 }) {
    if (!Number.isFinite(dt) || dt < 0)
      throw new RangeError("Invalid delta time");
    if (state === "menu" || state === "intro") {
      menuTime += dt;
      visuals.updateFx(dt);
      if (state === "menu") {
        const target = menuCamera(),
          f = 1 - Math.exp(-3 * dt);
        cam.x = lerp(cam.x, target.x, f);
        cam.y = lerp(cam.y, target.y, f);
      } else {
        intro.t += dt;
        const k = Math.min(1, intro.t / INTRO),
          e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        cam.x = lerp(intro.from.x, player.x, e);
        cam.y = lerp(intro.from.y, player.y - 30, e);
        if (k >= 1) {
          intro = null;
          levelUp(true);
        }
      }
      return;
    }
    if (state === "over") {
      for (const p of fx.parts) p.t += dt;
      fx.parts = fx.parts.filter((p) => p.t < p.life);
      return;
    }
    if (state !== "play") return;
    fx.sounds.length = 0;
    const hpBefore = player.hp;
    if (slowmo > 0) {
      slowmo -= dt;
      dt *= WARDEN.adaptSlowmo.scale;
    }
    clock.time += dt;
    movePlayer(player, direction, dt, world.pushOut);
    // Order is gameplay: contact/burning precede abilities; death beats a level-up.
    spawns.updateSpawns(dt);
    updateEnemies(player, enemies, fx, dt, {
      pushOut: world.pushOut,
      edgePos: spawns.edgePos,
      ...statuses,
      speedFactor: abilities.enemyHooks.speedFactor,
      control: (e, t, slow) =>
        abilities.enemyHooks.control(e, t, slow) || warden.control(e, t, slow),
    });
    abilities.update(dt);
    warden.update(dt);
    const boss = enemies.find((e) => e.type === "warden");
    if (boss) {
      run.bossMet = true;
      run.bossAdapted = [...boss.adapted];
    }
    experience.updateGems(dt);
    visuals.updateFx(dt);
    followPlayer(cam, player, dt);
    fx.shake = Math.max(0, fx.shake - dt * 25);
    if (player.hp < hpBefore) run.damageTaken += hpBefore - Math.max(0, player.hp);
    if (player.hp <= 0) {
      player.hp = 0;
      choices = [];
      state = "over";
    } else if (player.pending > 0) levelUp(false);
  }
  const visualSnapshot = () => {
    const { sounds, ...visual } = fx;
    return visual;
  };
  reset();
  return Object.freeze({
    start,
    toMenu,
    runStats,
    pause,
    choose,
    step,
    get state() {
      return state;
    },
    setViewport(width, height) {
      viewport.width = width;
      viewport.height = height;
    },
    // Звуковые события последнего шага; очередь очищается при чтении.
    takeSounds: () => fx.sounds.splice(0, fx.sounds.length),
    snapshot: () =>
      structuredClone({
        state,
        firstPick,
        choices: choices.map((u) => u.id),
        player,
        enemies,
        gems,
        time: state === "menu" || state === "intro" ? menuTime : clock.time,
        kills,
        cam,
        ...visualSnapshot(),
        strikes: abilities.strikes,
        ...abilities.view(),
        ...(slowmo > 0 ? { slowmo } : {}),
      }),
  });
}
