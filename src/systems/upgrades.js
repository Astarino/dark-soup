import { PROGRESSION } from "../data/balance.js";
import { PLAYER, UPGRADE_BONUSES } from "../data/balance.js";
export const UPG = [
  {
    id: "carrot",
    apply: (player) => {
      if (player.lv.carrot === 1)
        player.cd.carrot = UPGRADE_BONUSES.firstCarrotDelay;
    },
    kind: "ing",
    name: "upgrade_carrot",
    max: 6,
    description: "upgrade_carrot_desc",
  },
  {
    id: "cabbage",
    kind: "ing",
    name: "upgrade_cabbage",
    max: 6,
    description: "upgrade_cabbage_desc",
  },
  {
    id: "onion",
    kind: "ing",
    name: "upgrade_onion",
    max: 6,
    description: "upgrade_onion_desc",
  },
  ...["potato", "beet", "tomato", "bellPepper"].map((id) => ({
    id,
    kind: "ing",
    name: `upgrade_${id}`,
    max: 6,
    description: `upgrade_${id}_desc`,
  })),
  {
    id: "salt",
    apply: (player) => {
      player.dmgMul = 1 + UPGRADE_BONUSES.salt * player.lv.salt;
    },
    kind: "pas",
    name: "upgrade_salt",
    max: 5,
    description: "upgrade_salt_desc",
  },
  {
    id: "pepper",
    apply: (player) => {
      player.speed =
        player.baseSpeed * (1 + UPGRADE_BONUSES.pepper * player.lv.pepper);
    },
    kind: "pas",
    name: "upgrade_pepper",
    max: 5,
    description: "upgrade_pepper_desc",
  },
  {
    id: "broth",
    apply: (player) => {
      player.maxHp += UPGRADE_BONUSES.brothHealth;
      player.hp = Math.min(player.maxHp, player.hp + UPGRADE_BONUSES.brothHeal);
    },
    kind: "pas",
    name: "upgrade_broth",
    max: 5,
    description: "upgrade_broth_desc",
  },
  {
    id: "laurel",
    apply: (player) => {
      player.magnet =
        PLAYER.magnet * (1 + UPGRADE_BONUSES.laurel * player.lv.laurel);
    },
    kind: "pas",
    name: "upgrade_laurel",
    max: 4,
    description: "upgrade_laurel_desc",
  },
];
export const HEAL = {
  id: "heal",
  kind: "heal",
  name: "upgrade_heal",
  max: 99,
  description: "upgrade_heal_desc",
};
export function applyUpgrade(player, u, catalog = UPG) {
  if (!u || (u !== HEAL && (!catalog.includes(u) || player.lv[u.id] >= u.max)))
    return false;
  if (u === HEAL) {
    player.hp = Math.min(player.maxHp, player.hp + UPGRADE_BONUSES.heal);
    return true;
  }
  player.lv[u.id]++;
  u.apply?.(player);
  return true;
}
export function rollChoices(player, catalog = UPG) {
  const bag = catalog.filter((u) => player.lv[u.id] < u.max).map((u) => ({
    u,
    w:
      u.kind === "ing"
        ? player.lv[u.id] === 0
          ? PROGRESSION.ingredientNewWeight
          : PROGRESSION.ingredientOwnedWeight
        : PROGRESSION.passiveWeight,
  }));
  const out = [];
  while (out.length < PROGRESSION.choiceCount && bag.length) {
    let s = bag.reduce((a, b) => a + b.w, 0) * Math.random(),
      i = 0;
    while (i < bag.length - 1 && (s -= bag[i].w) > 0) i++;
    out.push(bag.splice(i, 1)[0].u);
  }
  if (out.length < PROGRESSION.choiceCount) out.push(HEAL);
  return out;
}
// Первая добавка: случайные ингредиенты без повторов. Если их не больше
// числа карточек, порядок каталога сохраняется и случайность не расходуется.
export function rollFirstChoices(catalog = UPG) {
  const bag = catalog.filter((u) => u.kind === "ing");
  if (bag.length <= PROGRESSION.choiceCount) return bag;
  const out = [];
  while (out.length < PROGRESSION.choiceCount)
    out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  return out;
}
