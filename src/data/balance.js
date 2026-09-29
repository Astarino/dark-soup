export const K = 2; // мировых единиц в одном арт-пикселе
export const WORLD = { w: 3600, h: 3600 };
export const CX = WORLD.w / 2,
  CY = WORLD.h / 2;
export const ENEMY_TYPES = {
  goblin: { hp: 22, spd: 72, dmg: 8, r: 14, xp: 1 },
  runner: { hp: 12, spd: 118, dmg: 6, r: 11, xp: 1 },
  brute: { hp: 110, spd: 50, dmg: 18, r: 24, xp: 6 },
  // Существо-1: здоровье считается при появлении (см. WARDEN), тут — за один ингредиент.
  warden: { hp: 2000, spd: 66, dmg: 30, r: 30, xp: 60 },
};
// Существо-1 (Страж Колеса) появляется на 3-й минуте. Все числа — стартовый баланс.
export const WARDEN = {
  spawnAt: 180,
  spawnMargin: 320, // не появляться в стене деревьев по краю карты
  hpPerIngredient: 2000, // × число ингредиентов игрока с уровнем ≥ rankForHp
  rankForHp: 3,
  minIngredients: 1, // если таких ингредиентов нет, всё равно 2000
  adaptEvery: 5000, // урон между щелчками колеса
  adaptedDamage: 0.2, // урон от освоенной способности делится на 5
  wheelTurnTime: 0.9,
  adaptSlowmo: { duration: 0.6, scale: 0.35 }, // игра на миг замедляется
  knockbackScale: 0.15,
  slash: { reach: 70, windup: 0.45, recover: 0.35, cooldown: 1.6, damage: 30 },
  gravity: { firstDelay: 4, interval: 8, windup: 0.6, radius: 400, duration: 3, slow: 0.5 },
};
// Таблицы прогрессии по уровням 1–6 (индекс = уровень − 1).
export const PROGRESSION_TABLES = {
  carrotCount: [2, 4, 6, 8, 10, 16],
  potatoCount: [1, 2, 3, 5, 7, 10],
  bellPepperCount: [1, 2, 3, 5, 7, 10],
  tomatoCount: [1, 1, 1, 2, 2, 2],
  beetPools: [1, 1, 2, 2, 2, 3],
  beetRadius: [70, 85, 85, 100, 115, 115], // площадь ≈ ×1 / ×1,5 / ×2 / ×2,7
  beetCharmLimit: [5, 7, 7, 10, 15, 15], // общий лимит на все лужи
  cabbageRadius: [170, 190, 210, 230, 250, 270],
  cabbageTickDamage: [3, 4, 5, 6, 7, 8],
};
const at = (table, l) => table[Math.min(table.length, Math.max(1, l)) - 1];
export const ABILITY_STATS = {
  carrot: (l) => ({
    cd: +Math.max(0.8, 2.0 - 0.2 * (l - 1)).toFixed(1),
    n: at(PROGRESSION_TABLES.carrotCount, l),
    dmg: 22 + 8 * (l - 1),
    r: 55 + 6 * (l - 1),
  }),
  // Постоянное поле: урон каждые ABILITY_BEHAVIOR.cabbage.tick секунд.
  cabbage: (l) => ({
    R: at(PROGRESSION_TABLES.cabbageRadius, l),
    tickDmg: at(PROGRESSION_TABLES.cabbageTickDamage, l),
  }),
  onion: (l) => ({
    n: Math.min(8, 1 + l),
    dmg: 9 + 4 * (l - 1),
    spd: +(2.2 + 0.25 * (l - 1)).toFixed(2),
    orbit: 72 + 6 * (l - 1),
  }),
  // Новые ингредиенты: стартовый баланс, согласованный для первой версии.
  potato: (l) => ({
    cd: +Math.max(1.0, 1.6 - 0.12 * (l - 1)).toFixed(2),
    dmg: 20 + 5 * (l - 1),
    n: at(PROGRESSION_TABLES.potatoCount, l),
    pelletDmg: 5 + (l - 1),
  }),
  beet: (l) => ({
    cd: 30 - 2 * (l - 1),
    pools: at(PROGRESSION_TABLES.beetPools, l),
    R: at(PROGRESSION_TABLES.beetRadius, l),
    limit: at(PROGRESSION_TABLES.beetCharmLimit, l),
    dur: 10 + (l - 1),
  }),
  tomato: (l) => ({
    cd: +(5 - 0.4 * (l - 1)).toFixed(1),
    n: at(PROGRESSION_TABLES.tomatoCount, l),
    dmg: +((30 + 8 * (l - 1)) * ABILITY_BEHAVIOR.tomato.damageMul).toFixed(1), // до общих бонусов
    r: 60 + 5 * (l - 1),
  }),
  bellPepper: (l) => ({
    cd: +(5 - 0.4 * (l - 1)).toFixed(1),
    n: at(PROGRESSION_TABLES.bellPepperCount, l),
    dmg: Math.round(20 * (1 + 0.15 * (l - 1))),
    range: 320 + 15 * (l - 1),
  }),
};
export const needFor = (l) =>
  Math.floor(5 + (l - 1) * 4 + Math.pow(l - 1, 1.5));
export const PLAYER = {
  radius: 22,
  speed: 175,
  health: 100,
  magnet: 90,
  contactGrace: 0.6,
};
export const UPGRADE_BONUSES = {
  heal: 40,
  brothHealth: 20,
  brothHeal: 30,
  salt: 0.15,
  pepper: 0.08,
  laurel: 0.35,
  firstCarrotDelay: 0.6,
};
export const SPAWNS = {
  initialDelay: 1.5,
  hordeInterval: 60,
  cap: 280,
  minInterval: 0.22,
  interval: 1.2,
  acceleration: 0.0065,
  growthEvery: 75,
  healthScale: 150,
};
export const POT_CY = 42;
export const ONION_SIZES = [10, 6, 12, 7, 9, 5, 11, 8];

export const COMBAT = {
  damageSpread: [0.9, 1.1],
  bruteKnockback: 0.35,
  hitFlash: 0.12,
  knockbackDecay: 7,
  hitSlow: 0.4,
  contactInset: 4,
  contactKnockback: 260,
  recycleDistance: 1500,
};
export const ABILITY_BEHAVIOR = {
  carrot: {
    range: 440,
    fall: 0.55,
    stagger: 0.12,
    knockback: 220,
    afterglow: 0.5,
    shake: { perHit: 1, max: 3 }, // тряска от падений: слабая и с общим потолком
  },
  carrotVolley: { spanTime: 0.6, jitter: 0.6, particles: 18, minParticles: 4 },
  cabbage: { tick: 0.5 }, // без отбрасывания; вспышка попадания даёт лёгкое торможение
  onion: { hitInterval: 0.4, knockback: 140 },
  potato: {
    range: 420, // дальность выбора цели
    speed: 360,
    hitRadius: 8,
    maxDistance: 520, // промахнувшаяся картофелина исчезает
    volleyGap: 0.05, // задержка между картофелинами залпа
    repeatSpread: (8 * Math.PI) / 180, // отклонение повторных выстрелов в одну цель
    pellets: 10, // дробинок от каждой картофелины
    knockback: 120,
    fan: (70 * Math.PI) / 180, // веер дроби по ходу полёта
    pelletSpeed: 420,
    pelletRange: 140,
    pelletRadius: 4,
    pelletKnockback: 40,
  },
  beet: {
    firstDelay: 1, // первая лужа сразу после выбора
    poolLife: 8,
    viewportShare: 0.8, // лужа появляется в центральной части экрана
    minSeparation: 2, // лужи одного залпа — не ближе 2 радиусов (если получится)
    attackInterval: 0.6,
    attackKnockback: 120,
    targetRange: 450,
    idleDistance: 70,
  },
  tomato: {
    range: 440,
    fall: 0.6,
    stagger: 0.15,
    firstDelay: 0.8,
    knockback: 120,
    puddleLife: 4,
    puddleRadius: 70,
    areaGrowth: 1.5, // площадь лужи ×1,5 за каждую секунду после удара
    damageMul: 1.2, // множитель урона приземления к базе (до соли и прочих бонусов)
    slow: 0.4, // замедление в луже: скорость × (1 − slow)
  },
  bellPepper: {
    range: 440, // дальность выбора цели
    outTime: 0.7,
    curve: 20, // боковой изгиб: меньше суммы радиусов, чтобы долька попадала в цель
    returnSpeed: 480,
    catchRadius: 24,
    hitRadius: 12,
    knockback: 60,
    // Урон по порядку попаданий при уровне 1; максимум — длина списка.
    hits: [20, 15, 13, 11, 10, 7, 6, 5, 4, 3],
  },
};
export const BURNING = { interval: 0.5, damage: 3 };
export const PROGRESSION = {
  ingredientNewWeight: 2.4,
  ingredientOwnedWeight: 1.8,
  passiveWeight: 1,
  choiceCount: 3,
};
