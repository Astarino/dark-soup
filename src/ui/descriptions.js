import { ABILITY_STATS, UPGRADE_BONUSES, PLAYER } from "../data/balance.js";
const LABELS = {
  cd: ["cooldown", "sec"],
  n: ["count", ""],
  dmg: ["damage", ""],
  r: ["radius", ""],
  R: ["radius", ""],
  spd: ["speed", ""],
  orbit: ["orbit", ""],
  pellets: ["pellets", ""],
  pelletDmg: ["pelletDamage", ""],
  dur: ["charmDuration", "sec"],
  range: ["range", ""],
  tickDmg: ["damagePerTick", ""],
  pools: ["puddles", ""],
  limit: ["charmLimit", ""],
};
// Единица измерения: секунды переводятся («с» / «s»), остальное без единиц.
const unit = (k, tr) => (LABELS[k][1] === "sec" ? ` ${tr("secShort")}` : "");
export function describeUpgrade(u, level, tr) {
  function statDiff(id, l) {
    const a = ABILITY_STATS[id](l),
      b = ABILITY_STATS[id](l + 1),
      out = [];
    for (const k in b)
      if (a[k] !== b[k] && LABELS[k])
        out.push(`${tr(LABELS[k][0])} ${a[k]}→${b[k]}${unit(k, tr)}`);
    return out.join(", ");
  }
  return level > 0 && u.kind === "ing"
    ? statDiff(u.id, level)
    : tr(u.description);
}
// Эффект приправы на ранге r (для книги рецептов и состояния супа).
export function seasoningEffect(id, r, tr) {
  const B = UPGRADE_BONUSES;
  if (id === "salt") return `${tr("damage")} ×${(1 + B.salt * r).toFixed(2)}`;
  if (id === "pepper") return `${tr("speed")} ${Math.round(PLAYER.speed * (1 + B.pepper * r))}`;
  if (id === "broth") return `${tr("hp")} ${PLAYER.health + B.brothHealth * r}`;
  if (id === "laurel") return `${tr("pickupRadius")} ${Math.round(PLAYER.magnet * (1 + B.laurel * r))}`;
  return "";
}
// Таблица по уровням, как на карточках выбора, но сразу для всех рангов.
export function levelTable(u, tr) {
  if (u.kind === "ing") {
    const keys = Object.keys(ABILITY_STATS[u.id](1)).filter((k) => LABELS[k]);
    return {
      head: [tr("rankShort"), ...keys.map((k) => tr(LABELS[k][0]))],
      rows: Array.from({ length: u.max }, (_, i) => {
        const s = ABILITY_STATS[u.id](i + 1);
        return [i + 1, ...keys.map((k) => `${s[k]}${unit(k, tr)}`)];
      }),
    };
  }
  if (u.kind === "pas")
    return {
      head: [tr("rankShort"), tr("effect")],
      rows: Array.from({ length: u.max }, (_, i) => [i + 1, seasoningEffect(u.id, i + 1, tr)]),
    };
  return null;
}
