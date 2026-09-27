import { CX, CY } from "../data/balance.js";
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
    kills;
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
    combat = createCombat(player, gems, fx, () => {
      kills++;
    });
    spawns = createSpawns(player, enemies, clock, fx, viewport, translate);
    statuses = createStatusSystem(fx, combat.damageEnemy);
    abilities = createAbilities(
      player,
      enemies,
      clock,
      fx,
      combat.hurt,
      viewport,
    );
    experience = createExperience(player, gems, fx);
    visuals = createVisualEffects(player, fx);
  }
  function levelUp(first) {
    state = "levelup";
    firstPick = first;
    choices = first ? rollFirstChoices(catalog) : rollChoices(player, catalog);
  }
  function start() {
    reset();
    levelUp(true);
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
    if (state === "menu") {
      clock.time += dt;
      cam.x = CX + Math.sin(clock.time * 0.1) * 60;
      cam.y = CY - 30;
      visuals.updateFx(dt);
      return;
    }
    if (state === "over") {
      for (const p of fx.parts) p.t += dt;
      fx.parts = fx.parts.filter((p) => p.t < p.life);
      return;
    }
    if (state !== "play") return;
    clock.time += dt;
    movePlayer(player, direction, dt, world.pushOut);
    // Order is gameplay: contact/burning precede abilities; death beats a level-up.
    spawns.updateSpawns(dt);
    updateEnemies(player, enemies, fx, dt, {
      pushOut: world.pushOut,
      edgePos: spawns.edgePos,
      ...statuses,
      ...abilities.enemyHooks,
    });
    abilities.update(dt);
    experience.updateGems(dt);
    visuals.updateFx(dt);
    followPlayer(cam, player, dt);
    fx.shake = Math.max(0, fx.shake - dt * 25);
    if (player.hp <= 0) {
      player.hp = 0;
      choices = [];
      state = "over";
    } else if (player.pending > 0) levelUp(false);
  }
  reset();
  return Object.freeze({
    start,
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
    snapshot: () =>
      structuredClone({
        state,
        firstPick,
        choices: choices.map((u) => u.id),
        player,
        enemies,
        gems,
        time: clock.time,
        kills,
        cam,
        ...fx,
        strikes: abilities.strikes,
        waves: abilities.waves,
        ...abilities.view(),
      }),
  });
}
