'use strict';
(() => {
// ───────────────────────── helpers ─────────────────────────
const $ = id => document.getElementById(id);
const cvs = $('game'), ctx = cvs.getContext('2d');
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(i, j, s) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const HEXC = {};
const rgb = h => HEXC[h] || (HEXC[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dith = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function ramp(r, v, x, y) { v = clamp(v, 0, 1) * (r.length - 1); let i = Math.floor(v); if (v - i > dith(x, y)) i++; return r[Math.min(i, r.length - 1)]; }
const LIGHT = (() => { const l = [-0.5, -0.68, 0.55], m = Math.hypot(...l); return l.map(v => v / m); })();
function sphereV(nx, ny) { const q = 1 - nx * nx - ny * ny; if (q < 0) return 0; return clamp(nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(q) * LIGHT[2], 0, 1); }

// Пиксельный буфер для генерации спрайтов
class PB {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null; }
  ell(cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, typeof fn === 'string' ? fn : fn(nx, ny, x, y));
      }
  }
  poly(pts, fn) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const px = x + 0.5, py = y + 0.5; let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.set(x, y, typeof fn === 'string' ? fn : fn(x, y));
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { this.set(x0, y0, typeof c === 'string' ? c : c(x0, y0)); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  rows(ox, oy, rows, pal) { rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) this.set(ox + x, oy + y, pal[ch]); })); }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (!this.get(x, y) && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) add.push(x, y);
    for (let i = 0; i < add.length; i += 2) this.d[add[i + 1] * this.w + add[i]] = c;
    return this;
  }
  canvas() {
    const c = mk(this.w, this.h), g = c.getContext('2d'), im = g.createImageData(this.w, this.h);
    this.d.forEach((col, i) => { if (!col) return; const [r, gg, b] = rgb(col); im.data.set([r, gg, b, 255], i * 4); });
    g.putImageData(im, 0, 0); return c;
  }
}
function flipC(c) { const o = mk(c.width, c.height), g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; }
function tintC(c, col) { const o = mk(c.width, c.height), g = o.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return o; }
function rotC(c) { const o = mk(c.height, c.width), g = o.getContext('2d'); g.translate(o.width, 0); g.rotate(Math.PI / 2); g.drawImage(c, 0, 0); return o; }

// ───────────────────────── tuning (всё черновое) ─────────────────────────
const K = 2;                         // мировых единиц в одном арт-пикселе
const WORLD = { w: 3600, h: 3600 };
const CX = WORLD.w / 2, CY = WORLD.h / 2;
const PFONT = '"Press Start 2P", monospace';
const OUT = '#0c0906';
let LANG = 'ru';
try { LANG = localStorage.getItem('dark_soup_language') === 'en' ? 'en' : 'ru'; } catch (_) {}
const TEXT = {
  ru: {
    menuIntro: 'Ты — котёл с супом на костре. Гоблины лезут из чащи. Уворачивайся, копи опыт и бросай в суп добавки.', menuHint: 'ПК: WASD / стрелки · Esc — пауза<br>Телефон: веди пальцем по экрану', start: 'РАЗЖЕЧЬ КОСТЁР', settings: 'НАСТРОЙКИ',
    pause: 'ПАУЗА', pauseHint: 'Суп томится на медленном огне.', resume: 'ПРОДОЛЖИТЬ', restart: 'НАЧАТЬ ЗАНОВО', over: 'СУП ОСТЫЛ…', retry: 'СВАРИТЬ ЗАНОВО',
    settingsTitle: 'НАСТРОЙКИ', language: 'ЯЗЫК', russian: 'РУССКИЙ', english: 'ENGLISH', enemies: 'ВИДЫ МОБОВ', recipes: 'КНИГА РЕЦЕПТОВ И УЛУЧШЕНИЙ', back: 'НАЗАД', openRecipes: 'ОТКРЫТЬ КНИГУ РЕЦЕПТОВ', coverTitle: 'КНИГА РЕЦЕПТОВ', coverHint: 'НАЖМИ, ЧТОБЫ ОТКРЫТЬ', closeBook: 'ЗАКРЫТЬ', prevPage: '← НАЗАД', nextPage: 'ДАЛЬШЕ →', page: 'СТРАНИЦА',
    hp: 'Здоровье', speed: 'Скорость', damage: 'Урон', xp: 'Опыт', maxRank: 'Макс. уровень', ingredient: 'Добавка в суп', seasoning: 'Приправа', recovery: 'Восстановление',
    mob_goblin: 'Гоблин', mob_goblin_desc: 'Обычный боец ближнего боя. Идёт прямо на котёл.', mob_runner: 'Гоблин-бегун', mob_runner_desc: 'Хрупкий, но очень быстрый преследователь.', mob_brute: 'Гоблин-громила', mob_brute_desc: 'Медленный, крепкий и наносит сильный удар.',
    upgrade_carrot: 'Морковь', upgrade_carrot_desc: 'Раз в 2 секунды с неба падает морковка и бьёт по области.', upgrade_cabbage: 'Капуста', upgrade_cabbage_desc: 'Когда враги подходят близко, барьер из листьев наносит урон и отбрасывает их. Перезарядка — 30 секунд.', upgrade_onion: 'Лук', upgrade_onion_desc: 'Луковицы разного размера кружат вокруг котла и бьют врагов.',
    upgrade_salt: 'Соль', upgrade_salt_desc: '+15% к урону всех добавок.', upgrade_pepper: 'Перец', upgrade_pepper_desc: '+8% к скорости котла.', upgrade_broth: 'Бульон', upgrade_broth_desc: '+20 к максимальному здоровью и восстанавливает 30 здоровья.', upgrade_laurel: 'Лавровый лист', upgrade_laurel_desc: '+35% к радиусу притяжения опыта.', upgrade_heal: 'Глоток супа', upgrade_heal_desc: 'Восстанавливает 40 здоровья.',
    cooldown: 'перезарядка', count: 'количество', radius: 'радиус', orbit: 'орбита', firstPick: 'ПЕРВАЯ ДОБАВКА', chooseFirst: 'С ЧЕГО НАЧНЁМ ВАРИТЬ СУП?', chooseUpgrade: 'БРОСЬ ДОБАВКУ В СУП', new: 'НОВОЕ', treatment: 'ЛЕЧЕНИЕ',
    survived: 'продержался', record: ' · рекорд!', level: 'уровень', goblinsCooked: 'гоблинов сварено', bestTime: 'лучшее время', horde: 'ОРДА!', levelShort: 'УР'
  },
  en: {
    menuIntro: 'You are a soup cauldron over a campfire. Goblins are closing in. Dodge, gain XP, and toss upgrades into the soup.', menuHint: 'PC: WASD / arrows · Esc — pause<br>Mobile: drag a finger to move', start: 'START COOKING', settings: 'SETTINGS',
    pause: 'PAUSED', pauseHint: 'The soup is simmering over a low flame.', resume: 'RESUME', restart: 'START OVER', over: 'SOUP HAS GONE COLD…', retry: 'COOK AGAIN',
    settingsTitle: 'SETTINGS', language: 'LANGUAGE', russian: 'РУССКИЙ', english: 'ENGLISH', enemies: 'ENEMY TYPES', recipes: 'RECIPE & UPGRADE BOOK', back: 'BACK', openRecipes: 'OPEN RECIPE BOOK', coverTitle: 'RECIPE BOOK', coverHint: 'TAP TO OPEN', closeBook: 'CLOSE', prevPage: '← PREVIOUS', nextPage: 'NEXT →', page: 'PAGE',
    hp: 'Health', speed: 'Speed', damage: 'Damage', xp: 'XP', maxRank: 'Max rank', ingredient: 'Soup ingredient', seasoning: 'Seasoning', recovery: 'Recovery',
    mob_goblin: 'Goblin', mob_goblin_desc: 'A common melee fighter that heads straight for the cauldron.', mob_runner: 'Goblin Runner', mob_runner_desc: 'Fragile, but a very fast pursuer.', mob_brute: 'Goblin Brute', mob_brute_desc: 'Slow, tough, and hits hard.',
    upgrade_carrot: 'Carrot', upgrade_carrot_desc: 'A carrot drops from above every 2 seconds, damaging an area.', upgrade_cabbage: 'Cabbage', upgrade_cabbage_desc: 'When enemies get close, a leaf barrier damages and knocks them back. 30 second cooldown.', upgrade_onion: 'Onion', upgrade_onion_desc: 'Onions of different sizes orbit the cauldron and strike enemies.',
    upgrade_salt: 'Salt', upgrade_salt_desc: '+15% damage for all ingredients.', upgrade_pepper: 'Pepper', upgrade_pepper_desc: '+8% cauldron movement speed.', upgrade_broth: 'Broth', upgrade_broth_desc: '+20 maximum health and restores 30 health.', upgrade_laurel: 'Bay Leaf', upgrade_laurel_desc: '+35% XP pickup radius.', upgrade_heal: 'Sip of Soup', upgrade_heal_desc: 'Restores 40 health.',
    cooldown: 'cooldown', count: 'count', radius: 'radius', orbit: 'orbit', firstPick: 'FIRST INGREDIENT', chooseFirst: 'WHAT GOES INTO THE SOUP?', chooseUpgrade: 'ADD IT TO THE SOUP', new: 'NEW', treatment: 'HEALING',
    survived: 'survived', record: ' · new record!', level: 'level', goblinsCooked: 'goblins cooked', bestTime: 'best time', horde: 'HORDE!', levelShort: 'LV'
  }
};
const tr = key => TEXT[LANG][key] || key;
const localized = entry => typeof entry === 'string' ? entry : entry[LANG];

const ETYPES = {
  goblin: { hp: 22, spd: 72, dmg: 8, r: 14, xp: 1 },
  runner: { hp: 12, spd: 118, dmg: 6, r: 11, xp: 1 },
  brute: { hp: 110, spd: 50, dmg: 18, r: 24, xp: 6 },
};
const STATUS_EFFECTS = {
  burning: { interval: 0.5, damage: 3, onTick: enemy => damageEnemy(enemy, STATUS_EFFECTS.burning.damage) },
};
const ST = {
  carrot: l => ({ cd: +Math.max(0.8, 2.0 - 0.2 * (l - 1)).toFixed(1), n: 1 + Math.floor((l - 1) / 2) + (l >= 6 ? 1 : 0), dmg: 22 + 8 * (l - 1), r: 55 + 6 * (l - 1) }),
  cabbage: l => ({ cd: Math.max(10, 30 - 4 * (l - 1)), R: 170 + 30 * (l - 1), dmg: 35 + 15 * (l - 1), trig: 110 }),
  onion: l => ({ n: Math.min(8, 1 + l), dmg: 9 + 4 * (l - 1), spd: +(2.2 + 0.25 * (l - 1)).toFixed(2), orbit: 72 + 6 * (l - 1) }),
};
const LABELS = { cd: ['cooldown', ' s'], n: ['count', ''], dmg: ['damage', ''], r: ['radius', ''], R: ['radius', ''], spd: ['speed', ''], orbit: ['orbit', ''] };
function statDiff(id, l) {
  const a = ST[id](l), b = ST[id](l + 1), out = [];
  for (const k in b) if (a[k] !== b[k] && LABELS[k]) out.push(`${tr(LABELS[k][0])} ${a[k]}→${b[k]}${LABELS[k][1]}`);
  return out.join(', ');
}
const UPG = [
  { id: 'carrot', kind: 'ing', name: 'upgrade_carrot', max: 6, desc: l => l === 0 ? tr('upgrade_carrot_desc') : statDiff('carrot', l) },
  { id: 'cabbage', kind: 'ing', name: 'upgrade_cabbage', max: 6, desc: l => l === 0 ? tr('upgrade_cabbage_desc') : statDiff('cabbage', l) },
  { id: 'onion', kind: 'ing', name: 'upgrade_onion', max: 6, desc: l => l === 0 ? tr('upgrade_onion_desc') : statDiff('onion', l) },
  { id: 'salt', kind: 'pas', name: 'upgrade_salt', max: 5, desc: () => tr('upgrade_salt_desc') },
  { id: 'pepper', kind: 'pas', name: 'upgrade_pepper', max: 5, desc: () => tr('upgrade_pepper_desc') },
  { id: 'broth', kind: 'pas', name: 'upgrade_broth', max: 5, desc: () => tr('upgrade_broth_desc') },
  { id: 'laurel', kind: 'pas', name: 'upgrade_laurel', max: 4, desc: () => tr('upgrade_laurel_desc') },
];
const HEAL = { id: 'heal', kind: 'heal', name: 'upgrade_heal', max: 99, desc: () => tr('upgrade_heal_desc') };
const needFor = l => Math.floor(5 + (l - 1) * 4 + Math.pow(l - 1, 1.5));

// ───────────────────────── sprites ─────────────────────────
const PAL = {
  k: OUT, o: '#ee7a22', O: '#ffb04a', q: '#a8450f', l: '#4f9a2a', L: '#8fd24e', n: '#2e5a1a',
  w: '#f4f1ea', W: '#ffffff', c: '#b8b2a4', p: '#f6e2b4', P: '#d9a35e', u: '#8a5a24',
  r: '#d8312a', R: '#ff7a5a', m: '#6e120e', y: '#f0b23a', Y: '#ffe07a', z: '#8a5210',
  b: '#8a5a34', B: '#4a2e18', t: '#c8a878',
};
const ICON_ROWS = {
  carrot: ['.........ln.', '......l.lLl.', '.......lLl..', '......kkkl..', '.....kOOok..', '....kOooqk..', '...kOoqok...', '...kooqk....', '..koqok.....', '..kqok......', '.kqk........', '.kk.........'],
  cabbage: ['...kkkkkk...', '..knlLLlnk..', '.knlLLLLlnk.', 'knlLLlLLLlnk', 'knLLlLLLlLnk', 'knlLLlLLlLnk', 'knlLLLllLLnk', 'knnlLLLLLlnk', '.knnlllllnk.', '..knnnnnnk..', '...kkkkkk...'],
  onion: ['.....l.l....', '.....lnl....', '......t.....', '.....kpk....', '....kpPpk...', '...kpWpPPk..', '..kpWppPPPk.', '..kpppPPPuk.', '..kppPPPPuk.', '...kPPPPuk..', '....kkkkk...', '....t.t.t...'],
  salt: ['............', '.....W......', '....kwk.....', '...kwWwk..W.', '..kwwWwwk...', '.kwwwwwcwk..', 'kwwcwwwwwck.', 'kbbbbbbbbbbk', '.kBbbbbbbBk.', '..kkkkkkkk..'],
  pepper: ['.........n..', '........ln..', '.......kllk.', '......krrk..', '.....krRrk..', '....krRrrk..', '...krRrrmk..', '..krrrrmk...', '.krrrrmk....', '.krrmmk.....', 'kmmkk.......', 'kk..........'],
  broth: ['.....kk.....', '....kYyk....', '....kYyk....', '...kYyyyk...', '..kYWyyyzk..', '.kyWyyyyyzk.', '.kyWyyyyyzk.', '.kyyyyyyyzk.', '..kyyyyyzk..', '...kzzzzk...', '....kkkk....'],
  laurel: ['..........k.', '........kkl.', '......klLlk.', '.....kLLlnk.', '....kLLlnk..', '...kLLlnlk..', '..kLLlnllk..', '..kLlnllk...', '.kLlnllk....', '.klnlkk.....', '.knkk.......', 'kk..........'],
  heal: ['............', '.kkk...kkk..', 'kRRrk.kRrrk.', 'kRWrrkrrrrk.', 'krrrrrrrrmk.', 'krrrrrrrrmk.', '.krrrrrrmk..', '..krrrrmk...', '...krrmk....', '....kmk.....', '.....k......'],
};
const ICON = {};
for (const id in ICON_ROWS) { const pb = new PB(12, 12); pb.rows(0, 0, ICON_ROWS[id], PAL); ICON[id] = pb.canvas(); }
const FALL_CARROT = (() => {
  const pb = new PB(9, 16);
  pb.rows(0, 0, ['..n.n.n..', '..lLlLl..', '...lLl...', '..kkkkk..', '.kOOooqk.', '.kOoooqk.', '.kOqooqk.', '..kOooqk.', '..kOoqk..', '..kOoqk..', '..kOqok..', '...kOqk..', '...kok...', '...kqk...', '....k....'], PAL);
  return pb.canvas();
})();
const GEM = [
  (() => { const pb = new PB(5, 7); pb.rows(0, 0, ['..k..', '.kYk.', 'kYyyk', 'kyyzk', '.kzk.', '..k..'], PAL); return pb.canvas(); })(),
  (() => { const pb = new PB(7, 9); pb.rows(0, 0, ['...k...', '..kWk..', '.kYYyk.', 'kYYyyyk', 'kYyyyzk', '.kyyzk.', '..kzk..', '...k...'], PAL); return pb.canvas(); })(),
];
const LEAF_H = (() => { const pb = new PB(7, 4); pb.rows(0, 0, ['.kkkk..', 'kLLLlk.', 'klllnnk', '.kkkkk.'], PAL); return pb.canvas(); })();
const LEAF_V = rotC(LEAF_H);
const SKULL = (() => { const pb = new PB(7, 7); pb.rows(0, 0, ['.kkkkk.', 'kwwwwwk', 'kwkwkwk', 'kwwwwwk', '.kwkwk.', '.kkkkk.'], PAL); return pb.canvas(); })();
const HEART = (() => { const pb = new PB(7, 6); pb.rows(0, 0, ['.kk.kk.', 'kRrkrrk', 'krrrrmk', '.krrmk.', '..kmk..', '...k...'], PAL); return pb.canvas(); })();

// Гоблины: генерируются из фигур, потом обводка
const GOB_DEF = {
  goblin: { head: 5, body: 4, leg: 3, ear: 4, skin: ['#2f3818', '#4a5629', '#65733a', '#84924c', '#a3ae62'], rag: ['#1e140c', '#33241a', '#4a3524'], eye: 'big' },
  runner: { head: 4.5, body: 3, leg: 3, ear: 4, skin: ['#3a3c16', '#58602a', '#78843a', '#98a44c', '#b8c060'], rag: ['#2a0e0a', '#4a1c14', '#6a2a1c'], eye: 'big', weap: 'spear' },
  brute: { head: 7, body: 6, leg: 4, ear: 5, skin: ['#262e16', '#3b4724', '#526034', '#6b7a44', '#86955a'], rag: ['#18110a', '#2a1f14', '#3e2e1e'], eye: 'mean', weap: 'club' },
};
function buildGoblin(o, frame) {
  const w = Math.ceil(o.head * 2 + o.ear * 2 + 10), h = Math.ceil(o.leg + o.body * 2 + o.head * 2 + 10);
  const pb = new PB(w, h), cx = Math.floor(w / 2), feet = h - 2, s = o.skin, rg = o.rag;
  const by = feet - o.leg - Math.round(o.body * 0.8) + frame;
  const hy = by - o.body - Math.round(o.head * 0.6);
  const lw = o.body >= 6 ? 2 : 1;
  // ноги
  const legX = [cx - Math.ceil(o.body * 0.5), cx + Math.floor(o.body * 0.5) - lw + 1];
  legX.forEach((lx, k) => {
    const lift = k === frame ? 1 : 0;
    for (let y = by + Math.round(o.body * 0.5); y <= feet - lift; y++) for (let q = 0; q < lw; q++) pb.set(lx + q, y, s[1]);
    pb.set(k ? lx + lw : lx - 1, feet - lift, s[0]);
  });
  // руки
  const ay = by - Math.round(o.body * 0.3);
  const up = [frame ? 3 : -1, frame ? -1 : 3];
  pb.line(cx - o.body, ay, cx - o.body - 2, ay + 2 - up[0], s[2]); pb.set(cx - o.body - 2, ay + 1 - up[0], s[3]);
  pb.line(cx + o.body, ay, cx + o.body + 2, ay + 2 - up[1], s[2]); pb.set(cx + o.body + 2, ay + 1 - up[1], s[3]);
  // тело: грудь кожей, ниже тряпьё
  pb.ell(cx + 0.5, by, o.body + 0.6, o.body * 0.9 + 0.6, (nx, ny, x, y) => ny > -0.05 ? ramp(rg, sphereV(nx, ny) * 1.2, x, y) : ramp(s, sphereV(nx, ny) * 0.9, x, y));
  for (let x = cx - o.body + 1; x <= cx + o.body; x++) if ((x + frame) % 2) pb.set(x, by + Math.ceil(o.body * 0.9) + 1, rg[0]);
  // оружие
  if (o.weap === 'spear') {
    const x = cx + o.body + 3;
    for (let y = hy - o.head - 2; y <= by + 3; y++) pb.set(x, y, y % 3 ? '#6b4a2a' : '#4a3018');
    pb.set(x, hy - o.head - 3, '#d8d8cc'); pb.set(x, hy - o.head - 4, '#d8d8cc'); pb.set(x - 1, hy - o.head - 2, '#9a9a90'); pb.set(x + 1, hy - o.head - 2, '#9a9a90');
  } else if (o.weap === 'club') {
    const x = cx + o.body + 3;
    for (let y = by - 6; y <= by + 3; y++) { pb.set(x, y, '#5a3a1c'); pb.set(x + 1, y, '#3e2814'); }
    pb.ell(x + 1, by - 8, 2.8, 3, (nx, ny, px, py) => ramp(['#3e2814', '#5a3a1c', '#7a5230', '#9a6c40'], sphereV(nx, ny), px, py));
  }
  // уши, потом голова
  const er = o.ear;
  pb.poly([[cx - o.head + 1.5, hy - 1.5], [cx - o.head - er, hy - er * 0.7 - 1], [cx - o.head + 1.5, hy + 2]], (x, y) => ramp(s, 0.75, x, y));
  pb.poly([[cx + o.head - 0.5, hy - 1.5], [cx + o.head + er + 1, hy - er * 0.7 - 1], [cx + o.head - 0.5, hy + 2]], (x, y) => ramp(s, 0.4, x, y));
  pb.set(cx - o.head, hy, s[1]); pb.set(cx + o.head, hy, s[1]);
  pb.ell(cx + 0.5, hy, o.head + 0.5, o.head * 0.92 + 0.5, (nx, ny, x, y) => ramp(s, sphereV(nx, ny) * 1.1 + 0.05, x, y));
  // глаза
  const ex = Math.ceil(o.head * 0.45);
  if (o.eye === 'big') {
    for (const e of [cx - ex, cx + ex]) { pb.ell(e + 0.5, hy + 0.5, 1.6, 1.8, '#07060a'); pb.set(e - 1 + (e > cx ? 1 : 0), hy - 1 + 1, '#07060a'); pb.set(e, hy - 1 + 1, '#f4f0dc'); }
  } else {
    for (const e of [cx - ex, cx + ex]) { pb.set(e, hy, '#07060a'); pb.set(e + 1, hy, '#07060a'); pb.set(e + (e > cx ? 0 : 1), hy, '#ff4a2a'); pb.set(e, hy - 1, s[0]); pb.set(e + 1, hy - 1, s[0]); }
  }
  // рот с зубом
  const my = hy + Math.round(o.head * 0.55);
  for (let x = cx - 1; x <= cx + 2; x++) pb.set(x, my, '#2a0c08');
  pb.set(cx, my, '#e8dcc0'); if (o.head >= 6) pb.set(cx + 2, my, '#e8dcc0');
  pb.outline(OUT);
  return { img: pb.canvas(), ax: cx, ay: feet };
}
const GOB = {};
for (const t in GOB_DEF) {
  GOB[t] = [0, 1].map(f => {
    const g = buildGoblin(GOB_DEF[t], f);
    const fl = flipC(g.img);
    return { r: g.img, l: fl, rw: tintC(g.img, '#ffffff'), lw: tintC(fl, '#ffffff'), ax: g.ax, ay: g.ay, w: g.img.width };
  });
}

// Котёл на треноге
const IRON = ['#0d0d12', '#1a1a22', '#282832', '#3a3a48', '#565666', '#7a7a8c'];
const RIM = ['#1a1a22', '#3a3a48', '#5a5a6a', '#8a8a9c'];
const SOUP = ['#8a2e10', '#c24e1c', '#e07b2f', '#f5a64a', '#ffd08a'];
const POT = (() => {
  const w = 50, h = 60, cx = 25, ground = h - 2, apex = 3;
  const pb = new PB(w, h);
  const pcy = ground - 21, rimY = pcy - 8;
  pb.line(cx, apex + 2, cx + 5, ground - 10, '#1f150d');
  for (const d of [-1, 1]) {
    pb.line(cx, apex, cx + d * 22, ground, '#4a3320');
    pb.line(cx + d, apex + 1, cx + d * 22 + d, ground, '#2a1c10');
  }
  for (let y = apex - 1; y <= apex + 2; y++) { pb.set(cx - 1, y, '#8a6a3a'); pb.set(cx, y, '#a8844a'); pb.set(cx + 1, y, '#6a4e2a'); }
  for (let y = apex + 3; y <= rimY - 7; y++) pb.set(cx, y, y % 2 ? '#8a8a94' : '#3c3c44');
  for (let a = Math.PI; a <= TAU + 0.001; a += 0.05) pb.set(cx + Math.cos(a) * 12, rimY - 1 + Math.sin(a) * 6, '#2a2a32');
  pb.ell(cx + 0.5, pcy, 13, 10.5, (nx, ny, x, y) => ramp(IRON, sphereV(nx, ny) * 1.15, x, y));
  pb.set(cx - 7, pcy + 10, IRON[1]); pb.set(cx + 7, pcy + 10, IRON[1]); pb.set(cx - 7, pcy + 11, IRON[0]); pb.set(cx + 7, pcy + 11, IRON[0]);
  pb.ell(cx + 0.5, rimY, 13, 3.8, (nx, ny, x, y) => ramp(RIM, 0.55 - ny * 0.4 - nx * 0.25, x, y));
  pb.ell(cx + 0.5, rimY + 0.4, 10.5, 2.5, (nx, ny, x, y) => ramp(SOUP, 0.55 - nx * 0.35 - ny * 0.25, x, y));
  pb.outline(OUT);
  const img = pb.canvas();
  return { img, hit: tintC(img, 'rgba(255,60,40,.55)'), ax: cx, ay: ground, soupDy: rimY - ground, soupRx: 9, soupRy: 2 };
})();
const FIRE_LOGS = (() => {
  const pb = new PB(32, 11), cx = 16, cy = 6;
  const logs = [[-14, 3], [14, 3], [-8, -4], [8, -4], [0, 4]];
  for (const [dx, dy] of logs) {
    pb.line(cx, cy, cx + dx, cy + dy, '#4a2f1a'); pb.line(cx, cy + 1, cx + dx, cy + dy + 1, '#2e1d10');
    pb.set(cx + dx, cy + dy, '#9a7040');
  }
  pb.ell(cx + 0.5, cy + 0.5, 4, 2, '#1a120a');
  pb.outline(OUT);
  return pb.canvas();
})();

// Луковицы разных размеров
const ONION_SPR = {};
function onionSprite(r) {
  if (ONION_SPR[r]) return ONION_SPR[r];
  const w = r * 2 + 5, h = r * 2 + 8, cx = w / 2, cy = h - r - 3;
  const pb = new PB(w, h);
  const ramp5 = ['#6a3e14', '#a8692a', '#d99a4a', '#f2c47a', '#fff0c8'];
  pb.ell(cx, cy, r + 0.5, r + 0.3, (nx, ny, x, y) => {
    let v = sphereV(nx, ny) * 1.1; if (Math.abs(Math.abs(nx) - 0.5) < 0.12 && ny > -0.6) v -= 0.25; return ramp(ramp5, v, x, y);
  });
  for (let k = 1; k <= Math.ceil(r * 0.6); k++) { pb.set(cx - 0.5, cy - r - k + 1, ramp5[3]); if (k < 2) { pb.set(cx - 1.5, cy - r - k + 1, ramp5[2]); pb.set(cx + 0.5, cy - r - k + 1, ramp5[2]); } }
  pb.set(cx - 0.5, cy - r - Math.ceil(r * 0.6), '#7ab04a');
  pb.set(cx - 1.5, cy + r + 1, '#e8d0a0'); pb.set(cx + 0.5, cy + r + 1, '#e8d0a0');
  pb.outline('#2a1606');
  return (ONION_SPR[r] = { img: pb.canvas(), ax: Math.floor(cx), ay: Math.round(cy) });
}

// Деревья
const OAK_RAMP = ['#0b150c', '#122016', '#1a2e1c', '#243e22', '#31522b', '#41672f'];
const PINE_RAMP = ['#08120f', '#0e1d18', '#152a21', '#1e3a2b', '#2a4c37'];
const BARK = ['#170f08', '#2a1c10', '#3e2a18', '#553b22'];
function buildOak(seed, s) {
  const R = mulberry32(seed), w = s * 2 + 10, h = s * 2 + 24, cx = w / 2, ccy = s + 4;
  const pb = new PB(w, h);
  const trunkTop = ccy + s * 0.4, ground = h - 2;
  for (let y = Math.floor(trunkTop); y <= ground; y++) {
    const hw = 2 + (y > ground - 3 ? 1 : 0);
    for (let x = -hw; x <= hw; x++) pb.set(cx + x - 0.5, y, ramp(BARK, 0.7 - (x + hw) / (hw * 2) * 0.7 + (hash2(x, y, seed) - 0.5) * 0.3, cx + x, y));
  }
  const circles = [{ x: cx, y: ccy, r: s * 0.78 }];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + R() * 0.8; circles.push({ x: cx + Math.cos(a) * s * 0.48, y: ccy + Math.sin(a) * s * 0.36, r: s * (0.42 + R() * 0.16) }); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = null, bi = 0;
    for (const c of circles) { const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y), ins = 1 - d / c.r; if (ins > 0 && (!best || ins > bi)) { best = c; bi = ins; } }
    if (!best) continue;
    let v = sphereV((x + 0.5 - best.x) / best.r * 0.95, (y + 0.5 - best.y) / best.r * 0.95) * 1.05 - (y / h) * 0.18;
    if (hash2(x, y, seed + 7) < 0.06) v -= 0.25;
    pb.set(x, y, ramp(OAK_RAMP, v, x, y));
  }
  pb.outline('#050905');
  return { img: pb.canvas(), ax: Math.floor(cx), ay: ground, top: 0 };
}
function buildPine(seed, s) {
  const w = s * 2 + 6, h = Math.round(s * 3.2) + 14, cx = w / 2, ground = h - 2;
  const pb = new PB(w, h);
  for (let y = ground - 7; y <= ground; y++) for (let x = -1; x <= 1; x++) pb.set(cx + x - 0.5, y, ramp(BARK, 0.6 - (x + 1) * 0.25, cx + x, y));
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const base = ground - 6 - i * s * 0.62, ht = s * 1.1, hw = s * (1 - i * 0.2) + 1;
    for (let y = Math.floor(base - ht); y <= base; y++) {
      const k = (y - (base - ht)) / ht, jag = hash2(y, i, seed) < 0.5 ? 1 : 0, span = hw * k + jag;
      for (let x = Math.floor(cx - span); x <= Math.ceil(cx + span); x++) {
        const nx = (x + 0.5 - cx) / Math.max(1, span);
        let v = 0.62 - nx * 0.4 - k * 0.25 + (1 - i / layers) * -0.05;
        if (y > base - 2) v -= 0.2;
        pb.set(x, y, ramp(PINE_RAMP, v, x, y));
      }
    }
  }
  pb.outline('#040806');
  return { img: pb.canvas(), ax: Math.floor(cx), ay: ground, top: 0 };
}
const OAKS = [], PINES = [], OAKS_B = [], PINES_B = [];
for (let i = 0; i < 5; i++) {
  OAKS.push(buildOak(11 + i, 14 + i)); PINES.push(buildPine(31 + i, 9 + (i % 3)));
  OAKS_B.push(buildOak(51 + i, 19 + (i % 3))); PINES_B.push(buildPine(71 + i, 12 + (i % 3)));
}

// Реквизит
const TENT = (() => {
  const w = 68, h = 50, pb = new PB(w, h);
  const A = [25, 6], BL = [3, h - 3], BR = [46, h - 3], S1 = [57, 9], S2 = [65, h - 3];
  const F = ['#3e2a14', '#5a3e1e', '#7a5a2e', '#9a7844', '#b8945a'], S = ['#23170b', '#342312', '#46301a', '#5a4024'];
  pb.poly([A, S1, S2, BR], (x, y) => ramp(S, 0.75 - (x - 40) / 40 * 0.5 + (hash2(x, y, 3) - 0.5) * 0.15, x, y));
  pb.poly([A, BL, BR], (x, y) => ramp(F, 0.8 - (y / h) * 0.35 + (25 - x) / 70 + (hash2(x, y, 4) - 0.5) * 0.12, x, y));
  pb.poly([[25, 20], [16, h - 3], [34, h - 3]], (x, y) => ramp(['#070503', '#120c07', '#1e150c'], (y - 20) / (h - 20) * 0.8, x, y));
  pb.line(25, 6, 57, 9, '#c8a468');
  pb.line(10, 30, 16, 30, '#46301a'); pb.line(36, 26, 40, 26, '#46301a');
  for (let y = 0; y <= 6; y++) pb.set(25, y, '#2a1c10');
  for (let y = 3; y <= 9; y++) pb.set(57, y, '#2a1c10');
  pb.rows(26, 0, ['rr..', 'rRr.', 'rr..'], PAL);
  pb.outline(OUT);
  pb.line(25, 6, 0, h - 1, '#5a4630'); pb.line(57, 9, 67, h - 6, '#5a4630');
  return { img: pb.canvas(), ax: 34, ay: h - 3 };
})();
const LOG_CACHE = {};
function logSprite(len, vert) {
  const key = len + '_' + vert; if (LOG_CACHE[key]) return LOG_CACHE[key];
  const L = Math.round(len), pb = new PB(vert ? 11 : L + 2, vert ? L + 2 : 11);
  if (!vert) {
    for (let x = 1; x < L; x++) for (let y = 2; y <= 8; y++) pb.set(x, y, ramp(BARK, 0.85 - (y - 2) / 6 * 0.8 + (hash2(x >> 2, y, 5) - 0.5) * 0.25, x, y));
    pb.ell(L - 1.5, 5.5, 2.4, 3.6, (nx, ny, x, y) => (nx * nx + ny * ny < 0.3 ? '#7e5c36' : '#b08858'));
  } else {
    for (let y = 3; y <= L; y++) for (let x = 2; x <= 8; x++) pb.set(x, y, ramp(BARK, 0.85 - (x - 2) / 6 * 0.8 + (hash2(x, y >> 2, 5) - 0.5) * 0.25, x, y));
    pb.ell(5.5, 3.5, 3.6, 2.4, (nx, ny) => (nx * nx + ny * ny < 0.3 ? '#7e5c36' : '#b08858'));
  }
  pb.outline(OUT);
  return (LOG_CACHE[key] = pb.canvas());
}
const STUMP = (() => {
  const pb = new PB(16, 14);
  for (let y = 5; y <= 12; y++) for (let x = 2; x <= 13; x++) pb.set(x, y, ramp(BARK, 0.9 - (x - 2) / 11 * 0.8, x, y));
  pb.set(1, 12, BARK[2]); pb.set(14, 12, BARK[1]);
  pb.ell(8, 5, 6, 2.6, (nx, ny) => (nx * nx + ny * ny < 0.25 ? '#6e5030' : nx * nx + ny * ny < 0.55 ? '#9a7448' : '#b8905a'));
  pb.outline(OUT);
  return { img: pb.canvas(), ax: 8, ay: 12 };
})();
const ROCKS = [0, 1, 2].map(i => {
  const r = 7 + i * 2, w = r * 2 + 4, h = Math.round(r * 1.5) + 4, pb = new PB(w, h), R = mulberry32(90 + i);
  const cx = w / 2, cy = h - 2 - r * 0.7;
  pb.ell(cx, cy, r, r * 0.75, (nx, ny, x, y) => ramp(['#1e1d1a', '#34322d', '#4b4841', '#66625a', '#827d72'], sphereV(nx, ny) + (hash2(x, y, 9) - 0.5) * 0.2, x, y));
  pb.ell(cx + r * 0.4 * (R() - 0.5) * 2, cy - r * 0.2, r * 0.6, r * 0.55, (nx, ny, x, y) => ramp(['#34322d', '#4b4841', '#66625a', '#827d72', '#9a958a'], sphereV(nx, ny), x, y));
  pb.outline(OUT);
  return { img: pb.canvas(), ax: Math.floor(cx), ay: h - 2 };
});
const BUSHES = [0, 1, 2].map(i => {
  const s = 6 + i * 2, w = s * 3, h = s * 2 + 2, pb = new PB(w, h);
  const cs = [[w / 2, h - s * 0.9, s], [w / 2 - s * 0.8, h - s * 0.7, s * 0.7], [w / 2 + s * 0.8, h - s * 0.7, s * 0.75]];
  for (const [x, y, r] of cs) pb.ell(x, y, r, r * 0.85, (nx, ny, px, py) => ramp(OAK_RAMP, sphereV(nx, ny) * 0.9, px, py));
  pb.outline('#050905');
  return pb.canvas();
});

// ───────────────────────── world ─────────────────────────
const trees = [], props = [];
const GRID = 200, cgrid = new Map();
const gkey = (i, j) => i * 1000 + j;
function addCollider(x, y, r) {
  const c = { x, y, r };
  for (let i = Math.floor((x - r) / GRID); i <= Math.floor((x + r) / GRID); i++)
    for (let j = Math.floor((y - r) / GRID); j <= Math.floor((y + r) / GRID); j++) {
      const k = gkey(i, j); if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(c);
    }
}
function pushOut(ent) {
  const r = ent.r;
  for (let i = Math.floor((ent.x - r) / GRID); i <= Math.floor((ent.x + r) / GRID); i++)
    for (let j = Math.floor((ent.y - r) / GRID); j <= Math.floor((ent.y + r) / GRID); j++) {
      const arr = cgrid.get(gkey(i, j)); if (!arr) continue;
      for (const c of arr) {
        const dx = ent.x - c.x, dy = ent.y - c.y, rs = r + c.r, dd = dx * dx + dy * dy;
        if (dd < rs * rs) { const d = Math.sqrt(dd) || 0.01, p = rs - d; ent.x += dx / d * p; ent.y += dy / d * p; }
      }
    }
}
(function genWorld() {
  const R = mulberry32(1337), rr = (a, b) => a + R() * (b - a);
  const mkTree = (x, y, big) => {
    const pine = R() < 0.4, set = big ? (pine ? PINES_B : OAKS_B) : (pine ? PINES : OAKS);
    trees.push({ kind: 'tree', x: Math.round(x / K) * K, y: Math.round(y / K) * K, spr: set[Math.floor(R() * set.length)] });
    addCollider(x, y - 4, pine ? 9 : 11);
  };
  for (let side = 0; side < 4; side++)
    for (let s = 0; s <= WORLD.w; s += rr(45, 70))
      for (let row = 0; row < 2; row++) {
        const off = rr(-10, 50) + row * 70;
        const [x, y] = side === 0 ? [s, off] : side === 1 ? [s, WORLD.h - off] : side === 2 ? [off, s] : [WORLD.w - off, s];
        mkTree(x, y, true);
      }
  let tries = 0;
  while (trees.length < 950 && tries++ < 30000) {
    const x = rr(150, WORLD.w - 150), y = rr(150, WORLD.h - 150);
    if (Math.hypot(x - CX, y - CY) < 340) continue;
    const dens = 0.5 + 0.5 * Math.sin(x * 0.004 + 1.3) * Math.cos(y * 0.0035 - 0.7);
    if (R() > dens * 0.9 + 0.1) continue;
    let ok = true;
    for (const t of trees) if (d2(x, y, t.x, t.y) < 80 * 80) { ok = false; break; }
    if (ok) mkTree(x, y, false);
  }
  props.push({ kind: 'spr', x: CX - 180, y: CY - 130, s: TENT }); addCollider(CX - 180, CY - 150, 58);
  const logs = [[CX + 160, CY - 80, 0, 84], [CX - 70, CY + 175, 0, 104], [CX + 230, CY + 150, 0, 76], [CX - 250, CY + 60, 0, 66]];
  for (const [x, y, v, len] of logs) {
    const img = logSprite(len / K, !!v);
    props.push({ kind: 'spr', x, y, s: { img, ax: Math.floor(img.width / 2), ay: v ? img.height - 2 : 8 } });
    for (let k = -1; k <= 1; k++) addCollider(v ? x : x + k * len * 0.33, v ? y - len * (0.5 + k * 0.33) : y - 4, 12);
  }
  for (let k = 0; k < 70; k++) {
    const x = rr(200, WORLD.w - 200), y = rr(200, WORLD.h - 200);
    if (Math.hypot(x - CX, y - CY) < 300) continue;
    if (R() < 0.45) { props.push({ kind: 'spr', x, y, s: STUMP }); addCollider(x, y - 6, 14); }
    else { const s = ROCKS[Math.floor(R() * 3)]; props.push({ kind: 'spr', x, y, s }); addCollider(x, y - 6, s.img.width * 0.8); }
  }
})();

// Земля запекается в одну большую текстуру заранее
const GROUND = (() => {
  const GW = WORLD.w / K, GH = WORLD.h / K, c = mk(GW, GH), g = c.getContext('2d');
  const im = g.createImageData(GW, GH), D = im.data;
  const MUD = ['#120e09', '#1a150e', '#221b12', '#2b2216', '#352a1b', '#40331f'].map(rgb);
  const GRS = ['#121a0d', '#172211', '#1d2b14', '#243518', '#2c411c', '#364e21'].map(rgb);
  const ccx = CX / K, ccy = CY / K;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const n1 = vnoise(x / 70, y / 70, 1), n2 = vnoise(x / 20, y / 20, 2), n3 = hash2(x, y, 3);
    const dc = Math.hypot(x - ccx, y - ccy);
    const grass = n1 * 0.65 + n2 * 0.35 - Math.max(0, 1 - dc / 200) * 0.55;
    const isG = grass > 0.47 + (n3 - 0.5) * 0.06;
    const r = isG ? GRS : MUD;
    let v = n2 * 0.55 + n3 * 0.35 + (isG ? 0.05 : 0.1 + Math.max(0, 1 - dc / 240) * 0.3);
    const t = clamp(v, 0, 1) * (r.length - 1); let i = Math.floor(t); if (t - i > dith(x, y)) i++; i = Math.min(i, r.length - 1);
    const col = r[i], o = (y * GW + x) * 4;
    D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const R = mulberry32(4242), ri = n => Math.floor(R() * n);
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let k = 0; k < 9000; k++) {
    const x = ri(GW), y = ri(GH), c1 = R() < 0.5 ? '#3f5a22' : '#4a6a28', c2 = '#2a3c18';
    px(x, y, c2); px(x, y - 1, c1); px(x - 1, y - 2, c1); px(x + 1, y - 1, c1); if (R() < 0.5) px(x + 2, y - 3, c1);
  }
  for (let k = 0; k < 2500; k++) { const x = ri(GW), y = ri(GH); px(x, y, '#4e473a'); px(x + 1, y, '#3a342a'); px(x, y - 1, '#6a6150'); }
  for (let k = 0; k < 1400; k++) { const x = ri(GW), y = ri(GH); g.fillStyle = ['#5e3e1c', '#7a4e22', '#4a3216'][ri(3)]; g.fillRect(x, y, 2, 1); }
  for (let k = 0; k < 200; k++) { const x = ri(GW), y = ri(GH); px(x, y, '#d8ccb0'); px(x, y - 1, '#a8321e'); px(x - 1, y - 1, '#a8321e'); px(x + 1, y - 1, '#7a2014'); }
  for (let k = 0; k < 300; k++) { const x = ri(GW), y = ri(GH); px(x, y, ['#c8b870', '#b08aa0', '#9ab0c8'][ri(3)]); }
  for (let k = 0; k < 260; k++) { const b = BUSHES[ri(3)], x = ri(GW), y = ri(GH); if (Math.hypot(x - ccx, y - ccy) < 150) continue; g.drawImage(b, x, y); }
  // старое кострище у палатки
  const fx = Math.round((CX - 110) / K), fy = Math.round((CY - 20) / K);
  for (let yy = -6; yy <= 6; yy++) for (let xx = -12; xx <= 12; xx++) { const q = (xx * xx) / 144 + (yy * yy) / 36; if (q < 0.55) px(fx + xx, fy + yy, hash2(xx, yy, 5) < 0.5 ? '#141210' : '#201c18'); }
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU, x = fx + Math.round(Math.cos(a) * 12), y = fy + Math.round(Math.sin(a) * 6); g.fillStyle = OUT; g.fillRect(x - 2, y - 1, 5, 4); g.fillStyle = '#5a5750'; g.fillRect(x - 1, y - 1, 3, 2); g.fillStyle = '#7a766c'; g.fillRect(x - 1, y - 1, 2, 1); }
  return c;
})();

// ───────────────────────── canvas / view ─────────────────────────
let W = 0, H = 0, DPR = 1, PX = 4, LW = 0, LH = 0, SAFE = { t: 0, r: 0, b: 0, l: 0 };
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  PX = Math.max(2, Math.round(Math.min(W, H) * DPR / 270));
  LW = Math.ceil(W * DPR / PX); LH = Math.ceil(H * DPR / PX);
  cvs.width = LW; cvs.height = LH;
  cvs.style.width = (LW * PX / DPR) + 'px'; cvs.style.height = (LH * PX / DPR) + 'px';
  ctx.imageSmoothingEnabled = false;
  const cs = getComputedStyle($('safe'));
  SAFE = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
addEventListener('resize', resize);
resize();
const VW = () => LW * K, VH = () => LH * K;

// ───────────────────────── state ─────────────────────────
let state = 'menu', time = 0, kills = 0, spawnT = 0, hordeT = 60, shake = 0, steamT = 0;
let P, enemies, gems, strikes, waves, parts, texts, drops, choices = [];
const cam = { x: CX, y: CY };
let best = 0; try { best = +localStorage.getItem('cauldron_best') || 0; } catch (e) {}

function reset() {
  P = {
    x: CX, y: CY + 20, r: 22, vx: 0, vy: 0, baseSpeed: 175, speed: 175, hp: 100, maxHp: 100, iframe: 0,
    xp: 0, lvl: 1, need: needFor(1), pending: 0, walk: 0, face: 1, dmgMul: 1, magnet: 90,
    contactEffects: ['burning'],
    lv: { carrot: 0, cabbage: 0, onion: 0, salt: 0, pepper: 0, broth: 0, laurel: 0 },
    cd: { carrot: 0, cabbage: 0 },
  };
  enemies = []; gems = []; strikes = []; waves = []; parts = []; texts = []; drops = [];
  time = 0; kills = 0; spawnT = 1.5; hordeT = 60; shake = 0;
  cam.x = P.x; cam.y = P.y;
}
reset();

// ───────────────────────── input ─────────────────────────
const keys = new Set();
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if ($('recipeBook').classList.contains('show')) { if (e.code === 'Escape') closeRecipeBook(); }
    else if ($('settings').classList.contains('show') && e.code === 'Escape') closeSettings();
    else if (state === 'play') setPause(true); else if (state === 'pause') setPause(false);
  }
  if (state === 'levelup' && /^Digit[1-3]$/.test(e.code)) pick(+e.code.slice(5) - 1);
  if ((state === 'over' || state === 'menu') && e.code === 'Enter') startRun();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); joy.active = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPause(true); });
cvs.addEventListener('pointerdown', e => {
  if (joy.active) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
});
cvs.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const joyEnd = e => { if (e.pointerId === joy.id) joy.active = false; };
cvs.addEventListener('pointerup', joyEnd); cvs.addEventListener('pointercancel', joyEnd);
cvs.addEventListener('contextmenu', e => e.preventDefault());

const JOY_MAX = 56;
function inputVec() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (joy.active) {
    let dx = joy.x - joy.ox, dy = joy.y - joy.oy; const m = Math.hypot(dx, dy);
    if (m > JOY_MAX) { joy.ox = joy.x - dx / m * JOY_MAX; joy.oy = joy.y - dy / m * JOY_MAX; dx = dx / m * JOY_MAX; dy = dy / m * JOY_MAX; }
    if (m > 6) { x += dx / JOY_MAX; y += dy / JOY_MAX; }
  }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  return { x, y };
}

// ───────────────────────── UI flow ─────────────────────────
$('startBtn').onclick = startRun;
$('restartBtn').onclick = startRun;
$('quitBtn').onclick = () => { $('pause').classList.remove('show'); startRun(); };
$('resumeBtn').onclick = () => setPause(false);
$('pauseBtn').onclick = () => setPause(true);
$('menuSettingsBtn').onclick = () => openSettings('menu');
$('pauseSettingsBtn').onclick = () => openSettings('pause');
$('settingsBackBtn').onclick = closeSettings;
$('ruBtn').onclick = () => setLanguage('ru');
$('enBtn').onclick = () => setLanguage('en');
$('recipeBookBtn').onclick = openRecipeBook;
$('bookCloseBtn').onclick = closeRecipeBook;
$('bookPrevBtn').onclick = () => turnRecipePage(-1);
$('bookNextBtn').onclick = () => turnRecipePage(1);
$('recipeBook').onclick = e => { if (e.target === $('recipeBook')) closeRecipeBook(); };

let settingsReturn = 'menu';
let recipePage = 0;
const RECIPES = [...UPG, HEAL];
function setLanguage(next) {
  LANG = next;
  try { localStorage.setItem('dark_soup_language', LANG); } catch (_) {}
  applyLanguage();
}
function applyLanguage() {
  document.documentElement.lang = LANG;
  document.title = 'Dark Soup';
  $('menuIntro').textContent = tr('menuIntro');
  $('menuHint').innerHTML = tr('menuHint');
  $('startBtn').textContent = tr('start'); $('menuSettingsBtn').textContent = tr('settings');
  $('pauseTitle').textContent = tr('pause'); $('pauseHint').textContent = tr('pauseHint');
  $('resumeBtn').textContent = tr('resume'); $('pauseSettingsBtn').textContent = tr('settings'); $('quitBtn').textContent = tr('restart');
  $('overTitle').textContent = tr('over'); $('restartBtn').textContent = tr('retry');
  $('settingsTitle').textContent = tr('settingsTitle'); $('languageTitle').textContent = tr('language');
  $('ruBtn').textContent = tr('russian'); $('enBtn').textContent = tr('english');
  $('enemyTitle').textContent = tr('enemies'); $('recipeTitle').textContent = tr('recipes'); $('settingsBackBtn').textContent = tr('back');
  $('recipeCoverTitle').textContent = tr('coverTitle'); $('recipeCoverHint').textContent = tr('coverHint');
  $('recipeBookBtn').setAttribute('aria-label', tr('openRecipes'));
  $('bookTitle').textContent = tr('coverTitle'); $('bookCloseBtn').textContent = tr('closeBook');
  $('bookPrevBtn').textContent = tr('prevPage'); $('bookNextBtn').textContent = tr('nextPage');
  $('ruBtn').classList.toggle('selected', LANG === 'ru'); $('enBtn').classList.toggle('selected', LANG === 'en');
  $('pauseBtn').setAttribute('aria-label', tr('pause'));
  if ($('settings').classList.contains('show')) renderSettingsCatalog();
  if ($('recipeBook').classList.contains('show')) renderRecipeBook();
}
function openSettings(from) {
  settingsReturn = from;
  $(from).classList.remove('show');
  $('settings').classList.add('show');
  renderSettingsCatalog();
}
function closeSettings() {
  $('settings').classList.remove('show');
  $(settingsReturn).classList.add('show');
}
function renderSettingsCatalog() {
  $('enemyList').innerHTML = Object.entries(ETYPES).map(([id, e]) =>
    `<article class="catalogCard"><div><b>${tr(`mob_${id}`)}</b><p>${tr(`mob_${id}_desc`)}</p><span class="meta">${tr('hp')} ${e.hp} · ${tr('speed')} ${e.spd} · ${tr('damage')} ${e.dmg} · ${tr('xp')} ${e.xp}</span></div></article>`
  ).join('');
  [...$('recipeBookBtn').querySelectorAll('canvas')].forEach((canvas, i) => {
    canvas.getContext('2d').drawImage(ICON[UPG[i].id], 0, 0);
  });
}
function openRecipeBook() {
  recipePage = 0;
  $('recipeBook').classList.add('show');
  renderRecipeBook();
  $('bookCloseBtn').focus();
}
function closeRecipeBook() {
  $('recipeBook').classList.remove('show');
  $('recipeBookBtn').focus();
}
function recipePageSize() { return matchMedia('(max-width:640px)').matches ? 1 : 2; }
function turnRecipePage(direction) {
  const size = recipePageSize();
  recipePage = Math.max(0, Math.min(RECIPES.length - 1, Math.floor(recipePage / size) * size + direction * size));
  renderRecipeBook();
}
function fillRecipePage(element, index) {
  const u = RECIPES[index];
  if (!u) { element.innerHTML = ''; return; }
  const kind = u.kind === 'ing' ? tr('ingredient') : u.kind === 'pas' ? tr('seasoning') : tr('recovery');
  element.innerHTML = `<span class="pageNumber">${String(index + 1).padStart(2, '0')}</span><canvas class="pageIcon" width="12" height="12" aria-hidden="true"></canvas><span class="pageCategory">${kind}</span><h3>${tr(u.name)}</h3><p>${u.desc(0)}</p><span class="pageRank">${tr('maxRank')}: ${u.max === 99 ? '∞' : u.max}</span>`;
  element.querySelector('canvas').getContext('2d').drawImage(ICON[u.id], 0, 0);
}
function renderRecipeBook() {
  const size = recipePageSize();
  recipePage = Math.floor(recipePage / size) * size;
  fillRecipePage($('bookLeftPage'), recipePage);
  if (size === 2) fillRecipePage($('bookRightPage'), recipePage + 1);
  $('bookCounter').textContent = `${tr('page')} ${Math.floor(recipePage / size) + 1} / ${Math.ceil(RECIPES.length / size)}`;
  $('bookPrevBtn').disabled = recipePage === 0;
  $('bookNextBtn').disabled = recipePage + size >= RECIPES.length;
}
addEventListener('resize', () => { if ($('recipeBook').classList.contains('show')) renderRecipeBook(); });
let recipeSwipeX = null;
$('recipeBook').addEventListener('touchstart', e => { recipeSwipeX = e.touches[0]?.clientX ?? null; }, { passive: true });
$('recipeBook').addEventListener('touchend', e => {
  if (recipeSwipeX === null) return;
  const dx = e.changedTouches[0].clientX - recipeSwipeX;
  if (Math.abs(dx) > 55) turnRecipePage(dx < 0 ? 1 : -1);
  recipeSwipeX = null;
}, { passive: true });
applyLanguage();

function startRun() {
  ['menu', 'over', 'pause', 'settings'].forEach(id => $(id).classList.remove('show'));
  reset();
  $('pauseBtn').style.display = 'block';
  openLevelUp(true);
}
function setPause(on) {
  if (on && state === 'play') { state = 'pause'; $('pause').classList.add('show'); joy.active = false; }
  else if (!on && state === 'pause') { state = 'play'; $('pause').classList.remove('show'); lastT = performance.now(); }
}
function rollChoices() {
  const bag = UPG.filter(u => P.lv[u.id] < u.max).map(u => ({ u, w: u.kind === 'ing' ? (P.lv[u.id] === 0 ? 2.4 : 1.8) : 1 }));
  const out = [];
  while (out.length < 3 && bag.length) {
    let s = bag.reduce((a, b) => a + b.w, 0) * Math.random(), i = 0;
    while (i < bag.length - 1 && (s -= bag[i].w) > 0) i++;
    out.push(bag.splice(i, 1)[0].u);
  }
  if (out.length < 3) out.push(HEAL);
  return out;
}
function openLevelUp(first) {
  state = 'levelup'; joy.active = false;
  choices = first ? UPG.filter(u => u.kind === 'ing') : rollChoices();
  $('luTitle').textContent = first ? tr('firstPick') : `${tr('level')} ${P.lvl}!`;
  $('luSub').textContent = first ? tr('chooseFirst') : tr('chooseUpgrade');
  const box = $('cards'); box.innerHTML = '';
  choices.forEach((u, i) => {
    const lv = P.lv[u.id] || 0;
    const b = document.createElement('button'); b.className = 'card';
    const ic = mk(12, 12); ic.getContext('2d').drawImage(ICON[u.id], 0, 0);
    const tag = u.kind === 'heal' ? `<span class="tag">${tr('treatment')}</span>` : lv === 0 ? `<span class="tag new">${tr('new')}</span>` : `<span class="tag">${LANG === 'ru' ? 'ур.' : 'lv.'}${lv} > ${lv + 1}</span>`;
    b.innerHTML = `<div class="txt"><span class="nm">${tr(u.name)}</span>${tag}<span class="ds">${u.desc(lv)}</span><span class="key">[${i + 1}]</span></div>`;
    b.prepend(ic);
    b.onclick = () => pick(i);
    box.appendChild(b);
  });
  $('levelup').classList.add('show');
}
function pick(i) {
  const u = choices[i]; if (!u || state !== 'levelup') return;
  applyUpgrade(u);
  drops.push({ id: u.id, t: 0 });
  $('levelup').classList.remove('show');
  if (P.pending > 0) P.pending--;
  if (P.pending > 0) openLevelUp(false); else { state = 'play'; lastT = performance.now(); }
}
function applyUpgrade(u) {
  if (u.id === 'heal') { P.hp = Math.min(P.maxHp, P.hp + 40); return; }
  P.lv[u.id]++;
  if (u.id === 'broth') { P.maxHp += 20; P.hp = Math.min(P.maxHp, P.hp + 30); }
  P.dmgMul = 1 + 0.15 * P.lv.salt;
  P.speed = P.baseSpeed * (1 + 0.08 * P.lv.pepper);
  P.magnet = 90 * (1 + 0.35 * P.lv.laurel);
  if (u.id === 'carrot' && P.lv.carrot === 1) P.cd.carrot = 0.6;
}
function gameOver() {
  state = 'over'; $('pauseBtn').style.display = 'none';
  const isBest = time > best; if (isBest) { best = time; try { localStorage.setItem('cauldron_best', String(best)); } catch (e) {} }
  $('stats').innerHTML =
    `<div><b>${fmtTime(time)}</b><span>${tr('survived')}${isBest ? tr('record') : ''}</span></div>` +
    `<div><b>${P.lvl}</b><span>${tr('level')}</span></div>` +
    `<div><b>${kills}</b><span>${tr('goblinsCooked')}</span></div>` +
    `<div><b>${fmtTime(best)}</b><span>${tr('bestTime')}</span></div>`;
  $('over').classList.add('show');
}
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ───────────────────────── gameplay ─────────────────────────
function spawnEnemy(type, x, y) {
  const T = ETYPES[type], hpMul = 1 + time / 150;
  enemies.push({ type, x, y, r: T.r, hp: T.hp * hpMul, max: T.hp * hpMul, spd: T.spd * rand(0.88, 1.12), dmg: T.dmg, xp: T.xp,
    kx: 0, ky: 0, flash: 0, anim: rand(0, TAU), face: 1, oh: {}, wave: -1, dead: false, effects: {} });
}
function edgePos() {
  const a = rand(0, TAU), d = Math.hypot(VW(), VH()) / 2 + 70;
  return [clamp(P.x + Math.cos(a) * d, 80, WORLD.w - 80), clamp(P.y + Math.sin(a) * d, 80, WORLD.h - 80)];
}
function pickType() {
  const r = Math.random();
  if (time > 100 && r < Math.min(0.14, (time - 100) / 1500 + 0.04)) return 'brute';
  if (time > 40 && r < 0.35) return 'runner';
  return 'goblin';
}
function updateSpawns(dt) {
  spawnT -= dt;
  if (spawnT <= 0 && enemies.length < 280) {
    spawnT = Math.max(0.22, 1.2 - time * 0.0065);
    const n = 1 + Math.floor(time / 75);
    for (let i = 0; i < n; i++) { const [x, y] = edgePos(); spawnEnemy(pickType(), x, y); }
  }
  hordeT -= dt;
  if (hordeT <= 0) {
    hordeT = 60;
    const n = 14 + Math.floor(time / 10), R = Math.hypot(VW(), VH()) / 2 + 40;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      spawnEnemy(i % 5 === 0 && time > 110 ? 'brute' : 'goblin', clamp(P.x + Math.cos(a) * R, 80, WORLD.w - 80), clamp(P.y + Math.sin(a) * R, 80, WORLD.h - 80));
    }
    texts.push({ x: P.x, y: P.y - 130, t: 0, life: 1.8, txt: tr('horde'), col: '#ff6a4a', size: 16 });
  }
}
function applyStatusEffect(target, id) {
  const effect = STATUS_EFFECTS[id];
  if (!effect || target.dead || target.effects[id]) return;
  target.effects[id] = { elapsed: 0 };
  for (let i = 0; i < 7; i++) parts.push({ x: target.x + rand(-target.r, target.r), y: target.y - rand(target.r, target.r * 2), vx: rand(-35, 35), vy: rand(-115, -35), g: -25, life: rand(0.25, 0.5), t: 0, r: rand(2, 4), c: i % 2 ? '#f7aa35' : '#ffdc75' });
}
function removeStatusEffect(target, id) { delete target.effects[id]; }
function updateStatusEffects(target, dt) {
  for (const [id, state] of Object.entries(target.effects)) {
    const effect = STATUS_EFFECTS[id];
    state.elapsed += dt;
    while (state.elapsed + 1e-9 >= effect.interval && !target.dead) {
      state.elapsed = Math.max(0, state.elapsed - effect.interval);
      effect.onTick(target);
    }
  }
}
function damageEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.dead = true; kills++;
    gems.push({ x: e.x, y: e.y, v: e.xp, vx: rand(-40, 40), vy: rand(-40, 40), pull: false });
    for (let i = 0; i < 12; i++) parts.push({ x: e.x, y: e.y - e.r, vx: rand(-120, 120), vy: rand(-170, 30), g: 380, life: rand(0.3, 0.7), t: 0, r: rand(2, 5), c: e.effects.burning ? (i % 2 ? '#ee7a22' : '#ffc247') : (i % 3 ? '#5b7a2c' : '#2b2a1a') });
  }
}
function hurt(e, dmg, fx, fy, kb) {
  if (e.dead) return;
  dmg = Math.max(1, Math.round(dmg * P.dmgMul * rand(0.9, 1.1)));
  e.flash = 0.12;
  const d = Math.hypot(fx, fy) || 1, k = kb * (e.type === 'brute' ? 0.35 : 1);
  e.kx += fx / d * k; e.ky += fy / d * k;
  texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r * 3, t: 0, life: 0.6, txt: String(dmg), col: '#fff3d6', size: 8 });
  damageEnemy(e, dmg);
}
function updateEnemies(dt) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j], rs = a.r + b.r, dx = b.x - a.x; if (dx > rs || dx < -rs) continue;
      const dy = b.y - a.y; if (dy > rs || dy < -rs) continue;
      const dd = dx * dx + dy * dy; if (dd >= rs * rs) continue;
      const d = Math.sqrt(dd) || 0.01, p = (rs - d) * 0.5, ux = dx / d, uy = dy / d, wa = b.r / rs, wb = a.r / rs;
      a.x -= ux * p * wa; a.y -= uy * p * wa; b.x += ux * p * wb; b.y += uy * p * wb;
    }
  }
  const kd = Math.exp(-7 * dt);
  for (const e of enemies) {
    if (e.dead) continue;
    updateStatusEffects(e, dt);
    if (e.dead) continue;
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 1500) { const [x, y] = edgePos(); e.x = x; e.y = y; continue; }
    const slow = e.flash > 0 ? 0.4 : 1;
    e.x += (dx / d * e.spd * slow + e.kx) * dt; e.y += (dy / d * e.spd * slow + e.ky) * dt;
    e.kx *= kd; e.ky *= kd;
    pushOut(e);
    e.face = dx >= 0 ? 1 : -1; e.anim += dt * e.spd * 0.06; e.flash -= dt;
    if (d < e.r + P.r - 4 && P.iframe <= 0) {
      P.hp -= e.dmg; P.iframe = 0.6; shake = Math.min(8, shake + 5);
      for (const effect of P.contactEffects) applyStatusEffect(e, effect);
      e.kx -= dx / d * 260; e.ky -= dy / d * 260;
      texts.push({ x: P.x, y: P.y - 90, t: 0, life: 0.7, txt: '-' + e.dmg, col: '#ff5a4a', size: 8 });
      for (let k = 0; k < 8; k++) parts.push({ x: P.x, y: P.y - 50, vx: rand(-90, 90), vy: rand(-160, -40), g: 300, life: rand(0.3, 0.6), t: 0, r: rand(2, 4), c: '#e07b2f' });
    }
  }
  enemies = enemies.filter(e => !e.dead);
}
const POT_CY = 42; // высота центра котла над землёй (в мировых единицах)
function abilities(dt) {
  if (P.lv.carrot > 0) {
    const s = ST.carrot(P.lv.carrot);
    P.cd.carrot -= dt;
    if (P.cd.carrot <= 0) {
      P.cd.carrot = s.cd;
      const cands = enemies.filter(e => d2(e.x, e.y, P.x, P.y) < 440 * 440);
      for (let i = 0; i < s.n; i++) {
        let tx, ty;
        if (cands.length) {
          const e = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
          const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, lead = Math.min(d * 0.5, e.spd * 0.4);
          tx = e.x + dx / d * lead; ty = e.y + dy / d * lead;
        } else { const a = rand(0, TAU), dd = rand(80, 240); tx = P.x + Math.cos(a) * dd; ty = P.y + Math.sin(a) * dd; }
        strikes.push({ x: tx, y: ty, t: -i * 0.12, fall: 0.55, r: s.r, dmg: s.dmg, hit: false });
      }
    }
  }
  for (const s of strikes) {
    s.t += dt;
    if (!s.hit && s.t >= s.fall) {
      s.hit = true; shake = Math.min(6, shake + 2);
      for (const e of enemies) if (d2(e.x, e.y, s.x, s.y) < (s.r + e.r) ** 2) hurt(e, s.dmg, e.x - s.x, e.y - s.y, 220);
      for (let k = 0; k < 18; k++) { const a = rand(0, TAU), v = rand(60, 220); parts.push({ x: s.x, y: s.y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 90, g: 420, life: rand(0.3, 0.7), t: 0, r: rand(2, 5), c: ['#ee7a22', '#ffc247', '#6b4a2a', '#fff0b0'][k % 4] }); }
    }
  }
  strikes = strikes.filter(s => s.t < s.fall + 0.5);

  if (P.lv.cabbage > 0) {
    const s = ST.cabbage(P.lv.cabbage);
    P.cd.cabbage -= dt;
    if (P.cd.cabbage <= 0 && enemies.some(e => d2(e.x, e.y, P.x, P.y) < (s.trig + e.r) ** 2)) {
      P.cd.cabbage = s.cd;
      waves.push({ t: 0, dur: 0.7, R: s.R, dmg: s.dmg, id: Math.random() });
      shake = Math.min(8, shake + 4);
    }
  }
  for (const w of waves) {
    w.t += dt;
    const cur = w.R * (1 - Math.pow(1 - Math.min(1, w.t / w.dur), 3));
    for (const e of enemies) if (e.wave !== w.id && d2(e.x, e.y, P.x, P.y) < (cur + e.r) ** 2) { e.wave = w.id; hurt(e, w.dmg, e.x - P.x, e.y - P.y, 520); }
  }
  waves = waves.filter(w => w.t < w.dur + 0.3);

  if (P.lv.onion > 0) {
    for (const b of onionBalls()) for (const e of enemies) {
      if (d2(e.x, e.y - e.r, b.x, b.y) < (b.r + e.r) ** 2 && time - (e.oh[b.i] || -9) > 0.4) {
        e.oh[b.i] = time; hurt(e, b.dmg, e.x - P.x, e.y - P.y, 140);
      }
    }
  }
}
const ONION_SIZES = [10, 6, 12, 7, 9, 5, 11, 8];
function onionBalls(tOff = 0) {
  const s = ST.onion(P.lv.onion), out = [], t = time - tOff;
  for (let i = 0; i < s.n; i++) {
    const a = t * s.spd + i / s.n * TAU;
    const rad = s.orbit + ((i % 3) - 1) * 16 + Math.sin(t * 1.7 + i * 2.1) * 8;
    const r = ONION_SIZES[i];
    out.push({ i, x: P.x + Math.cos(a) * rad, y: P.y - POT_CY + Math.sin(a) * rad * 0.8, r, dmg: s.dmg * (0.7 + r / 20) });
  }
  return out;
}
function updateGems(dt) {
  for (const g of gems) {
    const dx = P.x - g.x, dy = (P.y - 30) - g.y, d = Math.hypot(dx, dy) || 1;
    if (d < P.magnet) g.pull = true;
    if (g.pull) { const sp = 420 + (P.magnet - Math.min(d, P.magnet)) * 4; g.vx = lerp(g.vx, dx / d * sp, 1 - Math.exp(-10 * dt)); g.vy = lerp(g.vy, dy / d * sp, 1 - Math.exp(-10 * dt)); }
    else { g.vx *= Math.exp(-5 * dt); g.vy *= Math.exp(-5 * dt); }
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (d < P.r + 6) { g.got = true; addXP(g.v); }
  }
  gems = gems.filter(g => !g.got);
}
function addXP(v) {
  P.xp += v;
  while (P.xp >= P.need) {
    P.xp -= P.need; P.lvl++; P.need = needFor(P.lvl); P.pending++;
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; parts.push({ x: P.x, y: P.y - POT_CY, vx: Math.cos(a) * 180, vy: Math.sin(a) * 150, g: 0, life: 0.5, t: 0, r: 3, c: '#ffd36a' }); }
  }
}
function updateFx(dt) {
  steamT -= dt;
  if (steamT <= 0) {
    steamT = 0.1;
    parts.push({ x: P.x + rand(-10, 10), y: P.y - 60, vx: rand(-8, 8), vy: rand(-45, -25), g: 0, life: rand(0.9, 1.5), t: 0, r: rand(3, 6), c: 'steam' });
    if (Math.random() < 0.6) parts.push({ x: P.x + rand(-12, 12), y: P.y - 6, vx: rand(-25, 25) - P.vx * 0.4, vy: rand(-110, -50), g: -20, life: rand(0.4, 0.9), t: 0, r: 2, c: 'ember' });
  }
  for (const p of parts) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.t < p.life);
  for (const t of texts) { t.t += dt; t.y -= 28 * dt; }
  texts = texts.filter(t => t.t < t.life);
  for (const d of drops) d.t += dt;
  drops = drops.filter(d => {
    if (d.t >= 0.45 && !d.splashed) {
      d.splashed = true;
      for (let k = 0; k < 12; k++) parts.push({ x: P.x, y: P.y + POT.soupDy * K, vx: rand(-80, 80), vy: rand(-180, -80), g: 500, life: rand(0.4, 0.7), t: 0, r: 2, c: '#e98a3a' });
    }
    return d.t < 0.5;
  });
}
function update(dt) {
  time += dt;
  const v = inputVec(), f = 1 - Math.exp(-12 * dt);
  P.vx = lerp(P.vx, v.x * P.speed, f); P.vy = lerp(P.vy, v.y * P.speed, f);
  P.x += P.vx * dt; P.y += P.vy * dt;
  pushOut(P);
  P.x = clamp(P.x, 70, WORLD.w - 70); P.y = clamp(P.y, 90, WORLD.h - 70);
  if (Math.hypot(P.vx, P.vy) > 20) P.walk += dt;
  if (Math.abs(v.x) > 0.1) P.face = Math.sign(v.x);
  P.iframe -= dt;
  updateSpawns(dt); updateEnemies(dt); abilities(dt); updateGems(dt); updateFx(dt);
  const cf = 1 - Math.exp(-8 * dt);
  cam.x = lerp(cam.x, P.x, cf); cam.y = lerp(cam.y, P.y - 30, cf);
  shake = Math.max(0, shake - dt * 25);
  if (P.hp <= 0) { P.hp = 0; gameOver(); }
  else if (P.pending > 0) openLevelUp(false);
}

// ───────────────────────── drawing ─────────────────────────
let camL = 0, camT = 0;
const sx = wx => Math.round(wx / K) - camL;
const sy = wy => Math.round(wy / K) - camT;
function blit(img, wx, wy, ax, ay) { ctx.drawImage(img, sx(wx) - ax, sy(wy) - ay); }
function pRect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function pEll(cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy); ry = Math.max(1, Math.round(ry)); ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) { const k = 1 - (y * y) / (ry * ry); if (k < 0) continue; const hw = Math.round(rx * Math.sqrt(k)); ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); }
}
function pRing(cx, cy, rx, ry, c, dash = 0, phase = 0) {
  const n = Math.max(12, Math.round((rx + ry) * 3.3)); ctx.fillStyle = c;
  for (let i = 0; i < n; i++) {
    if (dash && ((i + phase) % (dash * 2)) >= dash) continue;
    const a = i / n * TAU; ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
  }
}
function ptext(str, x, y, col, size = 8, align = 'left') {
  ctx.font = `${size}px ${PFONT}`; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = OUT;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(str, Math.round(x) + dx, Math.round(y) + dy);
  ctx.fillStyle = col; ctx.fillText(str, Math.round(x), Math.round(y));
}

function drawGround() {
  ctx.fillStyle = '#070906'; ctx.fillRect(0, 0, LW, LH);
  const x0 = Math.max(0, camL), y0 = Math.max(0, camT), x1 = Math.min(GROUND.width, camL + LW), y1 = Math.min(GROUND.height, camT + LH);
  if (x1 > x0 && y1 > y0) ctx.drawImage(GROUND, x0, y0, x1 - x0, y1 - y0, x0 - camL, y0 - camT, x1 - x0, y1 - y0);
}
function drawTree(t) {
  const s = t.spr, X = sx(t.x), Y = sy(t.y);
  pEll(X + 3, Y + 1, s.img.width * 0.35, 3, 'rgba(0,0,0,.35)');
  const px = sx(P.x), py = sy(P.y) - 20;
  const behind = P.y < t.y && px > X - s.ax && px < X - s.ax + s.img.width && py > Y - s.ay && py < Y - 8;
  if (behind) ctx.globalAlpha = 0.45;
  ctx.drawImage(s.img, X - s.ax, Y - s.ay);
  ctx.globalAlpha = 1;
}
function drawBurning(e, fr, X, Y) {
  const phase = Math.floor(time * 13) + Math.floor(e.anim);
  const base = Y - Math.max(4, Math.round(fr.ay * 0.16));
  const spread = Math.max(5, Math.round(fr.w * 0.28));
  for (let i = 0; i < 5; i++) {
    const h = Math.round(fr.ay * 0.28) + 4 + ((phase + i * 7) % 6);
    const root = X + Math.round((i - 2) * spread * 0.5);
    for (let y = 0; y < h; y++) {
      const tip = y / h, sway = Math.round(Math.sin(phase * 0.7 + i * 2 + y * 0.5) * tip * 2);
      const width = tip < 0.35 ? 3 : tip < 0.75 ? 2 : 1;
      const color = tip > 0.8 ? '#ffca55' : (i + y + phase) % 4 ? '#ee7620' : '#ffd36a';
      pRect(root + sway - Math.floor(width / 2), base - y, width, 1, color);
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = X + ((phase * (i + 2) + i * 13) % (spread * 2 + 1)) - spread;
    const y = base - Math.round(fr.ay * 0.35) - ((phase + i * 5) % 9);
    pRect(x, y, 1, 1, i === 0 ? '#fff0a0' : '#ffad3a');
  }
}
function drawGoblin(e) {
  const fr = GOB[e.type][Math.floor(e.anim) % 2], X = sx(e.x), Y = sy(e.y);
  pEll(X, Y, Math.round(e.r / K) + 1, e.type === 'brute' ? 3 : 2, 'rgba(0,0,0,.4)');
  const fl = e.flash > 0, img = e.face > 0 ? (fl ? fr.rw : fr.r) : (fl ? fr.lw : fr.l);
  const ax = e.face > 0 ? fr.ax : fr.w - 1 - fr.ax;
  ctx.drawImage(img, X - ax, Y - fr.ay);
  if (e.type === 'brute' && e.hp < e.max) {
    const bw = 16, by = Y - fr.ay - 3;
    pRect(X - bw / 2 - 1, by - 1, bw + 2, 4, OUT); pRect(X - bw / 2, by, bw, 2, '#3a1210');
    pRect(X - bw / 2, by, Math.round(bw * Math.max(0, e.hp / e.max)), 2, '#e0452e');
  }
}
function drawFire(X, Y) {
  const t = Math.floor(time * 12) / 12;
  for (let x = -7; x <= 7; x++) {
    const h = Math.max(1, Math.round((8 - Math.abs(x)) * 1.1 + 2 + Math.sin(t * 12 + x * 1.7) * 1.6 + Math.sin(t * 7.3 + x * 0.9) * 1.2));
    for (let i = 0; i < h; i++) {
      const f = i / h;
      ctx.fillStyle = f < 0.28 ? '#fff3b0' : f < 0.55 ? '#ffc247' : f < 0.8 ? '#f07a1e' : '#c83a14';
      if (f >= 0.8 && (x + i + Math.floor(t * 12)) % 2) continue;
      ctx.fillRect(X + x, Y - 1 - i, 1, 1);
    }
  }
}
function drawPot() {
  const X = sx(P.x), Y = sy(P.y), dead = state === 'over';
  const bob = Math.hypot(P.vx, P.vy) > 20 ? Math.floor(P.walk * 10) % 2 : 0;
  pEll(X, Y + 1, 24, 4, 'rgba(0,0,0,.4)');
  ctx.drawImage(FIRE_LOGS, X - 16, Y - 6);
  if (!dead) drawFire(X, Y - 1);
  const hit = P.iframe > 0 && Math.floor(P.iframe * 20) % 2 === 0;
  ctx.drawImage(hit ? POT.hit : POT.img, X - POT.ax, Y - POT.ay - bob);
  // суп: ингредиенты и пузыри
  const SX = X, SY = Y + POT.soupDy - bob;
  const items = [];
  for (let k = 0; k < Math.min(3, P.lv.carrot); k++) items.push(['#f08a2a', '#ffb04a']);
  for (let k = 0; k < Math.min(3, P.lv.cabbage); k++) items.push(['#6fae3f', '#a6d86a']);
  for (let k = 0; k < Math.min(3, P.lv.onion); k++) items.push(['#e8c890', '#fff0c8']);
  items.forEach((c, i) => {
    const a = time * 0.6 + i * 2.4, ix = Math.round(SX + Math.cos(a) * (3 + (i % 3) * 2.5)), iy = Math.round(SY + Math.sin(a) * 1.2);
    pRect(ix, iy, 2, 1, c[0]); pRect(ix, iy, 1, 1, c[1]);
  });
  if (!dead) for (let k = 0; k < 3; k++) {
    const ph = (time * 1.3 + k * 0.37) % 1, bx = Math.round(SX + Math.sin(k * 5.1 + Math.floor(time * 1.3 + k * 0.37) * 3.7) * 7);
    if (ph < 0.7) pRect(bx, SY - (ph > 0.4 ? 1 : 0), ph > 0.4 ? 2 : 1, 1, '#ffd08a');
  }
  for (const d of drops) {
    const k = Math.min(1, d.t / 0.45);
    ctx.drawImage(ICON[d.id], SX - 6, Math.round(SY - 12 - (1 - k * k) * 60));
  }
}
function drawEffectsGround() {
  for (const s of strikes) {
    if (s.t < 0) continue;
    const X = sx(s.x), Y = sy(s.y), r = s.r / K;
    if (!s.hit) {
      const k = s.t / s.fall;
      pRing(X, Y, r, r * 0.55, `rgba(255,150,60,${0.35 + 0.5 * k})`, 3, Math.floor(time * 20));
      pEll(X, Y, 1 + 6 * k, 1 + 2.5 * k, `rgba(0,0,0,${0.45 * k})`);
    } else {
      const k = (s.t - s.fall) / 0.5, rr = r * (0.6 + k * 0.6);
      pRing(X, Y, rr, rr * 0.55, `rgba(255,200,120,${1 - k})`);
      pRing(X, Y, rr - 1, rr * 0.55 - 1, `rgba(255,120,40,${0.8 * (1 - k)})`);
      pEll(X, Y, 8, 3, `rgba(20,12,6,${0.6 * (1 - k)})`);
    }
  }
  for (const w of waves) {
    const k = Math.min(1, w.t / w.dur), cur = w.R * (1 - Math.pow(1 - k, 3)) / K, a = w.t > w.dur ? 1 - (w.t - w.dur) / 0.3 : 1;
    const X = sx(P.x), Y = sy(P.y);
    pRing(X, Y, cur, cur * 0.8, `rgba(150,220,90,${0.35 * a})`);
    pRing(X, Y, cur - 2, cur * 0.8 - 2, `rgba(110,190,70,${0.2 * a})`, 2);
    const n = Math.max(8, Math.floor(cur / 5));
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU + w.t * 0.8, lx = Math.round(X + Math.cos(an) * cur), ly = Math.round(Y + Math.sin(an) * cur * 0.8);
      const img = Math.abs(Math.sin(an)) > 0.6 ? LEAF_H : LEAF_V;
      ctx.drawImage(img, lx - (img.width >> 1), ly - (img.height >> 1));
    }
    ctx.globalAlpha = 1;
  }
  if (P.lv.cabbage > 0 && P.cd.cabbage <= 0 && state !== 'over') {
    const s = ST.cabbage(P.lv.cabbage), pulse = 0.5 + 0.5 * Math.sin(time * 4), r = s.trig / K;
    pRing(sx(P.x), sy(P.y), r, r * 0.8, `rgba(150,220,90,${0.25 + 0.2 * pulse})`, 2, Math.floor(time * 6));
  }
  for (const g of gems) {
    const img = GEM[g.v > 1 ? 1 : 0], bob = Math.floor(time * 4 + g.x) % 2;
    pEll(sx(g.x), sy(g.y) + 3, 2, 1, 'rgba(0,0,0,.35)');
    ctx.drawImage(img, sx(g.x) - (img.width >> 1), sy(g.y) - img.height + 2 - bob);
  }
}
function drawEffectsAir() {
  for (const e of enemies) if (e.effects.burning && e.x > (camL - 40) * K && e.x < (camL + LW + 40) * K && e.y > (camT - 40) * K && e.y < (camT + LH + 40) * K) {
    const fr = GOB[e.type][Math.floor(e.anim) % 2];
    drawBurning(e, fr, sx(e.x), sy(e.y));
  }
  if (P.lv.onion > 0 && state !== 'over') {
    for (let k = 6; k >= 1; k--) for (const b of onionBalls(k * 0.035)) pRect(sx(b.x), sy(b.y), k < 3 ? 2 : 1, 1, `rgba(255,214,140,${0.5 * (1 - k / 7)})`);
    for (const b of onionBalls()) {
      const o = onionSprite(Math.round(b.r / K) + 1);
      pEll(sx(b.x), sy(b.y) + 16, o.ax - 1, 1, 'rgba(0,0,0,.3)');
      ctx.drawImage(o.img, sx(b.x) - o.ax, sy(b.y) - o.ay);
    }
  }
  for (const s of strikes) {
    if (s.t < 0) continue;
    if (!s.hit) {
      const k = s.t / s.fall, h = (1 - k) * (1 - k) * 620;
      ctx.drawImage(FALL_CARROT, sx(s.x) - 4, sy(s.y - h) - 15);
    } else {
      const k = (s.t - s.fall) / 0.5;
      ctx.globalAlpha = 1 - k * k; ctx.drawImage(FALL_CARROT, sx(s.x) - 4, sy(s.y) - 11, 9, 11, sx(s.x) - 4, sy(s.y) - 11, 9, 11); ctx.globalAlpha = 1;
    }
  }
  for (const p of parts) {
    const k = p.t / p.life, X = sx(p.x), Y = sy(p.y);
    if (p.c === 'steam') { const r = Math.max(1, Math.round(p.r / K * (1 + k))); ctx.fillStyle = `rgba(210,205,195,${0.28 * (1 - k)})`; ctx.fillRect(X - r, Y - r, r * 2, r * 2); }
    else if (p.c === 'ember') { ctx.fillStyle = k < 0.5 ? '#ffe08a' : '#ff8a2a'; if (k < 0.9) ctx.fillRect(X, Y, 1, 1); }
    else { const r = Math.max(1, Math.round(p.r / K * (1 - k * 0.5))); ctx.fillStyle = p.c; ctx.fillRect(X, Y, r, r); }
  }
  for (const t of texts) {
    const k = t.t / t.life;
    if (k > 0.75 && Math.floor(t.t * 30) % 2) continue;
    ptext(t.txt, sx(t.x), sy(t.y), t.col, t.size, 'center');
  }
}
const DARK_BANDS = (() => { const b = [[0, 0]]; const n = 10; for (let i = 0; i < n; i++) { const r0 = 0.14 + i * 0.075, a0 = i / n * 0.74, a1 = (i + 1) / n * 0.74; b.push([r0, a0], [r0, a1]); } b.push([1, 0.74]); return b; })();
function drawLighting() {
  const X = sx(P.x), Y = sy(P.y) - 20, dead = state === 'over';
  const fl = dead ? 0.6 : 1 + (Math.floor(time * 8) % 3 - 1) * 0.02;
  const R = Math.max(LW, LH) * 0.95 * fl;
  const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
  for (const [s, a] of DARK_BANDS) g.addColorStop(s, `rgba(6,4,10,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  if (!dead) {
    ctx.globalCompositeOperation = 'lighter';
    const w = ctx.createRadialGradient(X, Y + 12, 0, X, Y + 12, 110 * fl);
    for (const [s, a] of [[0, 0.18], [0.25, 0.18], [0.25, 0.13], [0.45, 0.13], [0.45, 0.08], [0.7, 0.08], [0.7, 0.04], [1, 0.04], [1, 0]]) w.addColorStop(s, `rgba(255,130,40,${a})`);
    ctx.fillStyle = w; ctx.fillRect(0, 0, LW, LH);
    ctx.globalCompositeOperation = 'source-over';
  }
}
function drawHUD() {
  const s = DPR / PX, top = Math.round(SAFE.t * s) + 3, left = Math.round(SAFE.l * s) + 3, right = LW - Math.round(SAFE.r * s) - 3;
  // опыт
  const bw = right - left;
  pRect(left, top, bw, 6, OUT); pRect(left + 1, top + 1, bw - 2, 4, '#2a1e12');
  const xw = Math.round((bw - 2) * P.xp / P.need);
  if (xw > 0) { pRect(left + 1, top + 1, xw, 4, '#e8962a'); pRect(left + 1, top + 1, xw, 1, '#ffe07a'); }
  // здоровье
  const hy = top + 9, hw = Math.min(72, Math.round(LW * 0.3));
  ctx.drawImage(HEART, left, hy + 1);
  const hx = left + 9;
  pRect(hx, hy, hw, 8, OUT); pRect(hx + 1, hy + 1, hw - 2, 6, '#3a1210');
  const hpw = Math.round((hw - 2) * P.hp / P.maxHp);
  if (hpw > 0) { pRect(hx + 1, hy + 1, hpw, 6, P.hp / P.maxHp < 0.3 ? '#ff3a2a' : '#d8452e'); pRect(hx + 1, hy + 1, hpw, 1, '#ff8a6a'); }
  ptext(`${tr('levelShort')}${P.lvl}`, hx + hw + 4, hy, '#ffd98a');
  // время и убийства
  ptext(fmtTime(time), LW / 2, hy + 12, '#fff4e0', 8, 'center');
  const pw = Math.round(48 * s);
  ctx.drawImage(SKULL, right - pw - 32, hy);
  ptext(String(kills), right - pw - 22, hy, '#e8d2b0');
  // иконки добавок
  let ix = left, iy = hy + 24;
  for (const u of UPG) {
    const lv = P.lv[u.id]; if (!lv) continue;
    pRect(ix, iy, 16, 16, OUT); pRect(ix + 1, iy + 1, 14, 14, '#241a10');
    ctx.drawImage(ICON[u.id], ix + 2, iy + 2);
    let cdk = 0;
    if (u.id === 'carrot') cdk = clamp(P.cd.carrot / ST.carrot(lv).cd, 0, 1);
    if (u.id === 'cabbage') cdk = clamp(P.cd.cabbage / ST.cabbage(lv).cd, 0, 1);
    if (cdk > 0) pRect(ix + 1, iy + 1, 14, Math.round(14 * cdk), 'rgba(0,0,0,.6)');
    ptext(String(lv), ix + 11, iy + 10, '#ffd98a');
    ix += 18; if (ix > LW * 0.6) { ix = left; iy += 18; }
  }
  if (joy.active && state === 'play') {
    const k = DPR / PX, ox = joy.ox * k, oy = joy.oy * k, r = JOY_MAX * k;
    pRing(ox, oy, r, r, 'rgba(255,230,190,.5)');
    pEll(joy.x * k, joy.y * k, 6, 6, 'rgba(255,200,140,.6)');
  }
}
function draw() {
  const shx = shake > 0 ? Math.round(rand(-shake, shake) / K) : 0, shy = shake > 0 ? Math.round(rand(-shake, shake) / K) : 0;
  camL = Math.round(cam.x / K - LW / 2) + shx; camT = Math.round(cam.y / K - LH / 2) + shy;
  const vx0 = camL * K, vy0 = camT * K, vx1 = vx0 + LW * K, vy1 = vy0 + LH * K;
  drawGround();
  drawEffectsGround();
  const list = [];
  for (const t of trees) if (t.x > vx0 - 90 && t.x < vx1 + 90 && t.y > vy0 - 10 && t.y < vy1 + 200) list.push(t);
  for (const p of props) if (p.x > vx0 - 150 && p.x < vx1 + 150 && p.y > vy0 - 20 && p.y < vy1 + 120) list.push(p);
  for (const e of enemies) if (e.x > vx0 - 50 && e.x < vx1 + 50 && e.y > vy0 - 10 && e.y < vy1 + 80) list.push(e);
  list.push(P);
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    if (o === P) drawPot();
    else if (o.kind === 'tree') drawTree(o);
    else if (o.kind === 'spr') blit(o.s.img, o.x, o.y, o.s.ax, o.s.ay);
    else drawGoblin(o);
  }
  drawEffectsAir();
  drawLighting();
  if (state !== 'menu') drawHUD();
  if (P.hp / P.maxHp < 0.3 && state === 'play' && Math.floor(time * 3) % 2) {
    ctx.fillStyle = 'rgba(200,20,10,.35)';
    ctx.fillRect(0, 0, LW, 2); ctx.fillRect(0, LH - 2, LW, 2); ctx.fillRect(0, 0, 2, LH); ctx.fillRect(LW - 2, 0, 2, LH);
  }
}

// ───────────────────────── loop ─────────────────────────
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (state === 'play') update(dt);
  else if (state === 'menu') { time += dt; cam.x = CX + Math.sin(time * 0.1) * 60; cam.y = CY - 30; updateFxIdle(dt); }
  else if (state === 'over') { for (const p of parts) p.t += dt; parts = parts.filter(p => p.t < p.life); }
  draw();
  requestAnimationFrame(frame);
}
function updateFxIdle(dt) { updateFx(dt); }
if (document.fonts && document.fonts.load) document.fonts.load(`8px ${PFONT}`).catch(() => {});
requestAnimationFrame(frame);

window.__game = { get P() { return P; }, get enemies() { return enemies; }, get state() { return state; }, addXP: v => addXP(v), step: (n = 60) => { for (let i = 0; i < n && state === 'play'; i++) update(1 / 60); draw(); } };
})();
