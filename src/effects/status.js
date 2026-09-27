import { STATUS_EFFECTS } from "./registry.js";
export function createStatusSystem(fx, damageEnemy) {
  function applyStatusEffect(target, id) {
    const effect = STATUS_EFFECTS[id];
    if (!effect || target.dead || target.effects[id]) return;
    target.effects[id] = { elapsed: 0 };
    effect.apply?.(target, fx);
  }
  function removeStatusEffect(target, id) {
    delete target.effects[id];
  }
  function updateStatusEffects(target, dt) {
    for (const [id, state] of Object.entries(target.effects)) {
      const effect = STATUS_EFFECTS[id];
      state.elapsed += dt;
      while (state.elapsed + 1e-9 >= effect.interval && !target.dead) {
        state.elapsed = Math.max(0, state.elapsed - effect.interval);
        effect.tick(target, damageEnemy);
      }
    }
  }
  return { applyStatusEffect, removeStatusEffect, updateStatusEffects };
}
