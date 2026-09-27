export const K = 2; // мировых единиц в одном арт-пикселе
export const WORLD = { w: 3600, h: 3600 };
export const CX = WORLD.w / 2,
  CY = WORLD.h / 2;
export const ENEMY_TYPES = {
  goblin: { hp: 22, spd: 72, dmg: 8, r: 14, xp: 1 },
  runner: { hp: 12, spd: 118, dmg: 6, r: 11, xp: 1 },
  brute: { hp: 110, spd: 50, dmg: 18, r: 24, xp: 6 },
};
export const ABILITY_STATS = {
  carrot: (l) => ({
    cd: +Math.max(0.8, 2.0 - 0.2 * (l - 1)).toFixed(1),
    n: 1 + Math.floor((l - 1) / 2) + (l >= 6 ? 1 : 0),
    dmg: 22 + 8 * (l - 1),
    r: 55 + 6 * (l - 1),
  }),
  cabbage: (l) => ({
    cd: Math.max(10, 30 - 4 * (l - 1)),
    R: 170 + 30 * (l - 1),
    dmg: 35 + 15 * (l - 1),
    trig: 110,
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
    pellets: 10 + (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0),
    pelletDmg: 5 + (l - 1),
  }),
  beet: (l) => ({
    cd: 30 - 2 * (l - 1),
    R: 70 + 8 * (l - 1),
    dur: 10 + (l - 1),
  }),
  tomato: (l) => ({
    cd: +(5 - 0.4 * (l - 1)).toFixed(1),
    n: l >= 3 ? 2 : 1,
    dmg: 30 + 8 * (l - 1),
    r: 60 + 5 * (l - 1),
  }),
  bellPepper: (l) => ({
    cd: +(5 - 0.4 * (l - 1)).toFixed(1),
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
  },
  cabbage: { duration: 0.7, knockback: 520, afterglow: 0.3 },
  onion: { hitInterval: 0.4, knockback: 140 },
  potato: {
    range: 420, // дальность выбора цели
    speed: 360,
    hitRadius: 8,
    maxDistance: 520, // промахнувшаяся картофелина исчезает
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
    maxCharmed: 5, // одновременно на всей карте
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
    spread: 0.3, // время растекания лужи
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
