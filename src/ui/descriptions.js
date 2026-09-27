import { ABILITY_STATS } from "../data/balance.js";
export function describeUpgrade(u, level, tr) {
  const LABELS = {
    cd: ["cooldown", " s"],
    n: ["count", ""],
    dmg: ["damage", ""],
    r: ["radius", ""],
    R: ["radius", ""],
    spd: ["speed", ""],
    orbit: ["orbit", ""],
    pellets: ["pellets", ""],
    pelletDmg: ["pelletDamage", ""],
    dur: ["charmDuration", " s"],
    range: ["range", ""],
    tickDmg: ["damagePerTick", ""],
    pools: ["puddles", ""],
    limit: ["charmLimit", ""],
  };
  function statDiff(id, l) {
    const a = ABILITY_STATS[id](l),
      b = ABILITY_STATS[id](l + 1),
      out = [];
    for (const k in b)
      if (a[k] !== b[k] && LABELS[k])
        out.push(`${tr(LABELS[k][0])} ${a[k]}→${b[k]}${LABELS[k][1]}`);
    return out.join(", ");
  }
  return level > 0 && u.kind === "ing"
    ? statDiff(u.id, level)
    : tr(u.description);
}
