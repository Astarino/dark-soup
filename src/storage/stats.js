// Статистика между забегами: общие итоги и «рекордная готовка» — лучший забег
// (по времени, при равенстве — по числу убитых) со всей его статистикой.
// Хранится одним JSON-ключом; повреждённые или недоступные данные не ломают игру.
const KEY = "dark_soup_stats";
const empty = () => ({
  version: 1,
  runs: 0,
  totalTime: 0,
  totalKills: 0,
  totalDamage: 0,
  totalXp: 0,
  bestTime: 0,
  bestLevel: 0,
  bestKills: 0,
  mostDamage: 0,
  killsByType: {},
  damageBySource: {},
  picks: {}, // сколько раз ингредиент был в супе (сумма итоговых уровней)
  bossMet: 0,
  bossKilled: 0,
  bestRun: null,
});
const add = (into, from) => {
  for (const [k, v] of Object.entries(from || {})) into[k] = (into[k] || 0) + v;
};
export function createStatsStore(storage) {
  function load() {
    try {
      const raw = storage?.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && data.version === 1 ? { ...empty(), ...data } : empty();
    } catch {
      return empty();
    }
  }
  function save(data) {
    try {
      storage?.setItem(KEY, JSON.stringify(data));
    } catch {}
  }
  // run — результат game.runStats(); date — отметка времени окончания.
  function recordRun(run, date = Date.now()) {
    const s = load();
    s.runs++;
    s.totalTime += run.time;
    s.totalKills += run.kills;
    s.totalDamage += run.damageTotal;
    s.totalXp += run.xp;
    s.bestTime = Math.max(s.bestTime, run.time);
    s.bestLevel = Math.max(s.bestLevel, run.level);
    s.bestKills = Math.max(s.bestKills, run.kills);
    s.mostDamage = Math.max(s.mostDamage, run.damageTotal);
    add(s.killsByType, run.killsByType);
    add(s.damageBySource, run.damageBySource);
    add(s.picks, run.upgrades);
    if (run.bossMet) s.bossMet++;
    if (run.bossKilled) s.bossKilled++;
    const best = s.bestRun,
      isRecord = !best || run.time > best.time || (run.time === best.time && run.kills > best.kills);
    if (isRecord) s.bestRun = { ...run, date };
    save(s);
    return { stats: s, isRecord };
  }
  return { load, recordRun };
}
