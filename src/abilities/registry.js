import { carrot } from "./carrot.js";
import { createCabbage } from "./cabbage.js";
import { onion } from "./onion.js";
import { createPotato } from "./potato.js";
import { createBeet } from "./beet.js";
import { createTomato } from "./tomato.js";
import { createBellPepper } from "./bell-pepper.js";
// Explicit registration preserves the original carrot → cabbage → onion ordering;
// new ingredients run after them and consume no randomness until acquired.
export function createAbilities(player, enemies, clock, fx, hurt, viewport) {
  const strikes = [];
  const cabbage = createCabbage(player, enemies, hurt),
    potato = createPotato(player, enemies, fx, hurt),
    beet = createBeet(player, enemies, fx, hurt, viewport),
    tomato = createTomato(player, enemies, fx, hurt),
    bellPepper = createBellPepper(player, enemies, fx, hurt);
  const updates = [
    (dt) => carrot(player, enemies, strikes, fx, hurt, dt),
    cabbage.update,
    () => onion(player, enemies, clock, hurt),
    potato.update,
    beet.update,
    tomato.update,
    bellPepper.update,
  ];
  return {
    strikes,
    update: (dt) => {
      for (const update of updates) update(dt);
    },
    // Hooks for the enemy system: puddle slowdown and charmed behaviour.
    enemyHooks: {
      speedFactor: tomato.speedFactor,
      control: beet.control,
    },
    // Detached data for snapshots/rendering; keys absent from the original game.
    view: () => {
      const tomatoes = tomato.view();
      return {
        potatoes: potato.view(),
        beetPools: beet.view(),
        tomatoDrops: tomatoes.drops,
        tomatoPuddles: tomatoes.puddles,
        pepperSlices: bellPepper.view(),
        cooldowns: {
          potato: potato.cooldown(),
          beet: beet.cooldown(),
          tomato: tomato.cooldown(),
          bellPepper: bellPepper.cooldown(),
        },
      };
    },
  };
}
