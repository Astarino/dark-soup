// Лаборатория вида от первого лица: рисует заранее собранные («синтетические») снимки
// игры тем же рендером, что и настоящая игра. Нужна для визуальной проверки редких
// сцен (все способности 6-го уровня, толпа, существо-1) без ожидания и без читов в
// самой игре. Откройте http://localhost:5173/scripts/fp-lab.html и используйте
// window.lab из консоли или автоматизации; скриншоты — как обычно.
import { createGame } from "../src/core/game.js";
import { createWorld } from "../src/world/world.js";
import { createTranslator } from "../src/data/translations.js";
import { CX, CY, ENEMY_TYPES, WARDEN } from "../src/data/balance.js";
import { mulberry32 } from "../src/shared/math.js";
import { createFirstPersonRenderer } from "../src/render3d/fp-renderer.js";
import { FP } from "../src/data/first-person.js";

const world = createWorld();
const tr = createTranslator("ru").tr;
const game = createGame(world, { translate: tr });
game.setViewport(900, 540);
game.start();
game.choose(0);
for (let i = 0; i < 30; i++) game.step(1 / 60);
const base = game.snapshot();
const R = mulberry32(7);

const fp = createFirstPersonRenderer({ world, tr, settings: { sensitivity: 1, sway: true, quality: new URLSearchParams(location.search).get("q") || "high" } });
await fp.prepare();
const api = fp.mount(document.body);

let time = 5,
  id = 1;
const viewOf = () => {
  const DPR = devicePixelRatio || 1,
    W = innerWidth,
    H = innerHeight,
    PX = Math.max(2, Math.round((Math.min(W, H) * DPR) / 270));
  return { W, H, DPR, PX, SAFE: { t: 0, r: 0, b: 0, l: 0 } };
};
function enemy(type, x, y, extra = {}) {
  const T = ENEMY_TYPES[type];
  return { id: id++, type, x, y, r: T.r, hp: T.hp, max: T.hp, spd: T.spd, dmg: T.dmg, xp: T.xp, kx: 0, ky: 0, flash: 0, anim: R() * 6, face: 1, oh: {}, dead: false, effects: {}, ...extra };
}
function boss(x, y, state = "chase", stateT = 0.3) {
  return enemy("warden", x, y, { hp: 4000, max: 6000, adapted: ["carrot"], dmgWindow: {}, sinceAdapt: 0, wheelSteps: 1, wheelAnim: 0, state, stateT, anim: 2 });
}
const px = base.player.x,
  py = base.player.y;
const ring = (n, dist, fn) => Array.from({ length: n }, (_, i) => fn(i, (i / n) * Math.PI * 2, dist));

const SCENES = {
  camp: () => ({}),
  crowd: () => ({ enemies: [...ring(14, 170, (i, a, d) => enemy("goblin", px + Math.cos(a) * d, py + Math.sin(a) * d)), ...ring(8, 300, (i, a, d) => enemy(i % 3 ? "runner" : "brute", px + Math.cos(a) * d, py + Math.sin(a) * d)), ...ring(24, 480, (i, a, d) => enemy("goblin", px + Math.cos(a) * d, py + Math.sin(a) * d))] }),
  close: () => ({ enemies: [enemy("goblin", px + 90, py - 20, { anim: 1 }), enemy("runner", px + 140, py + 50, { anim: 2 }), enemy("brute", px + 210, py - 40, { anim: 1 }), enemy("goblin", px + 60, py + 30, { flash: 0.1 }), enemy("goblin", px + 260, py + 90, { effects: { burning: { elapsed: 0 } } }), enemy("goblin", px + 200, py + 20, { charm: 5 }), enemy("brute", px + 330, py + 10, { effects: { burning: { elapsed: 0 } } })] }),
  boss: () => ({ enemies: [boss(px + 230, py - 20), enemy("goblin", px + 120, py + 60), enemy("brute", px + 160, py - 90)] }),
  bossCast: () => ({ enemies: [boss(px + 300, py, "cast", 0.3)] }),
  // по одному приёму на сцену: удобно рассматривать вблизи
  only: (name) => {
    const one = (patch, lvId) => {
      const lv = { carrot: 0, cabbage: 0, onion: 0, potato: 0, beet: 0, tomato: 0, bellPepper: 0, salt: 0, pepper: 0, broth: 0, laurel: 0, [lvId]: 6 };
      return { player: { ...base.player, lv, lvl: 8 }, enemies: [enemy("goblin", px + 150, py - 30), enemy("goblin", px + 100, py + 70, { charm: 6 }), enemy("brute", px + 260, py + 10)], ...patch };
    };
    const pat = {
      cabbage: () => one({}, "cabbage"),
      onion: () => one({}, "onion"),
      carrot: () => one({ strikes: ring(5, 170, (i, a, d) => ({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, t: [0.1, 0.3, 0.5, 0.58, 0.8][i], fall: 0.55, r: 85, dmg: 60, hit: i >= 4, sparks: 8 })) }, "carrot"),
      potato: () => one({ potatoes: [...ring(3, 90, (i, a, d) => ({ kind: "potato", x: px + 100 + i * 60, y: py - 20 + i * 30, vx: 360, vy: 30 })), ...ring(16, 200, (i) => ({ kind: "pellet", x: px + 200 + (i % 8) * 8, y: py - 40 + (i >> 3) * 14 + (i % 8) * 6, vx: 1, vy: 0 }))] }, "potato"),
      tomato: () => one({ tomatoDrops: [{ x: px + 130, y: py - 40, t: 0.3, fall: 0.6, r: 90 }, { x: px + 200, y: py + 60, t: 0.56, fall: 0.6, r: 90 }], tomatoPuddles: [{ x: px + 260, y: py - 60, r: 130, t: 1.6, life: 4 }, { x: px + 110, y: py + 110, r: 80, t: 0.1, life: 4 }] }, "tomato"),
      beet: () => one({ beetPools: [{ x: px + 130, y: py + 10, r: 115, t: 3, life: 8 }] }, "beet"),
      pepper: () => one({ pepperSlices: ring(10, 130, (i, a, d) => ({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, spin: i * 3, phase: "out", spent: i === 9 })) }, "bellPepper"),
    };
    return pat[name]();
  },
  // тяжёлая сцена для замеров: толпа у предела, горящие и обращённые враги, все приёмы 6-го уровня
  stress: () => {
    const lv = { carrot: 6, cabbage: 6, onion: 6, potato: 6, beet: 6, tomato: 6, bellPepper: 6, salt: 0, pepper: 0, broth: 0, laurel: 0 };
    const types = ["goblin", "runner", "brute"];
    const enemies = Array.from({ length: 280 }, (_, i) => {
      const a = R() * Math.PI * 2, d = 60 + Math.sqrt(R()) * 560;
      return enemy(types[i % 3 === 2 && i % 9 === 8 ? 2 : i % 3 === 1 ? 1 : 0], px + Math.cos(a) * d, py + Math.sin(a) * d, { effects: i % 4 === 0 ? { burning: { elapsed: 0 } } : {}, charm: i % 11 === 0 ? 5 : undefined, flash: i % 13 === 0 ? 0.1 : 0 });
    });
    const strikes = Array.from({ length: 32 }, (_, i) => ({ x: px + (R() - 0.5) * 700, y: py + (R() - 0.5) * 500, t: (i % 8) * 0.07, fall: 0.55, r: 85, dmg: 60, hit: i % 3 === 0, sparks: 6 }));
    return {
      player: { ...base.player, lv, lvl: 20, hp: 60 },
      enemies, strikes: strikes.map((s) => ({ ...s, t: s.hit ? 0.7 : s.t })),
      potatoes: Array.from({ length: 300 }, (_, i) => ({ kind: i % 10 === 0 ? "potato" : "pellet", x: px + (R() - 0.5) * 600, y: py + (R() - 0.5) * 600, vx: 100, vy: 0 })),
      beetPools: [0, 1, 2].map((i) => ({ x: px + (i - 1) * 200, y: py - 150, r: 115, t: 3, life: 8 })),
      tomatoDrops: Array.from({ length: 2 }, (_, i) => ({ x: px + 100 * i, y: py + 200, t: 0.3, fall: 0.6, r: 90 })),
      tomatoPuddles: Array.from({ length: 6 }, (_, i) => ({ x: px + (R() - 0.5) * 500, y: py + (R() - 0.5) * 500, r: 110, t: 1.5, life: 4 })),
      pepperSlices: Array.from({ length: 60 }, (_, i) => ({ x: px + (R() - 0.5) * 500, y: py + (R() - 0.5) * 500, spin: i, phase: "out", spent: false })),
      gems: Array.from({ length: 200 }, () => ({ x: px + (R() - 0.5) * 700, y: py + (R() - 0.5) * 700, v: R() < 0.2 ? 6 : 1, vx: 0, vy: 0, pull: false })),
      texts: [], cooldowns: { potato: 0.5, beet: 0.2, tomato: 0.7, bellPepper: 0.1 },
    };
  },
  abilities: () => {
    const lv = { carrot: 6, cabbage: 6, onion: 6, potato: 6, beet: 6, tomato: 6, bellPepper: 6, salt: 0, pepper: 0, broth: 0, laurel: 0 };
    const enemies = [...ring(10, 180, (i, a, d) => enemy(i % 2 ? "goblin" : "runner", px + Math.cos(a) * d, py + Math.sin(a) * d)), enemy("brute", px + 260, py - 20), enemy("goblin", px + 200, py + 100, { charm: 6 })];
    const strikes = ring(6, 220, (i, a, d) => ({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, t: i < 3 ? 0.25 : 0.62, fall: 0.55, r: 85, dmg: 60, hit: i >= 3, sparks: 8 }));
    return {
      player: { ...base.player, lv, lvl: 12, xp: 5, hp: 84 },
      enemies, strikes,
      potatoes: [...ring(4, 120, (i, a, d) => ({ kind: "potato", x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360 })), ...ring(30, 250, (i, a) => ({ kind: "pellet", x: px + Math.cos(a * 1.1) * 250, y: py + Math.sin(a * 1.1) * 250, vx: 1, vy: 0 }))],
      beetPools: [{ x: px + 140, y: py - 100, r: 115, t: 3, life: 8 }, { x: px - 200, y: py + 120, r: 85, t: 2, life: 8 }],
      tomatoDrops: [{ x: px + 100, y: py + 160, t: 0.4, fall: 0.6, r: 90 }],
      tomatoPuddles: [{ x: px + 230, y: py + 30, r: 120, t: 1.4, life: 4 }, { x: px - 120, y: py - 200, r: 82, t: 0.2, life: 4 }],
      pepperSlices: ring(10, 190, (i, a, d) => ({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, spin: i * 3 + time * 14, phase: "out", spent: i === 9 })),
      cooldowns: { potato: 0.5, beet: 0.2, tomato: 0.7, bellPepper: 0.1 },
      gems: ring(9, 130, (i, a, d) => ({ x: px + Math.cos(a) * d * 0.8, y: py + Math.sin(a) * d * 0.8, v: i % 3 ? 1 : 6, vx: 0, vy: 0, pull: false })),
    };
  },
};

let look = { yaw: FP.startYaw, pitch: 0 };
window.lab = {
  api, fp, game, base,
  // сцена + взгляд; n кадров по 1/60 с, чтобы анимации и частицы успели развернуться
  async show(name, { yaw = look.yaw, pitch = 0, frames = 20, patch = {}, events = [], state = "play", at = null } = {}) {
    look = { yaw, pitch };
    const snap = { ...structuredClone(base), state, ...(name.startsWith("only:") ? SCENES.only(name.slice(5)) : SCENES[name]()), ...patch };
    if (at) snap.player = { ...snap.player, x: at[0], y: at[1] };
    let out;
    for (let i = 0; i < frames; i++) {
      time += 1 / 60;
      snap.time = time;
      out = api.render(snap, { look, dt: 1 / 60, view: viewOf(), events: i === 0 ? events : [], input: { locked: true, touch: false, lockFailed: false, joy: { id: null }, looking: false, dragging: false } });
    }
    return out && { pose: out.pose, stats: api.stats() };
  },
  // ближайший к лагерю предмет мира нужного вида: { x, y }
  find(family, index) {
    const list = [...world.props.map((p) => ({ f: p.s.family, i: p.s.index, x: p.x, y: p.y })), ...world.trees.map((t) => ({ f: t.spr.family, i: t.spr.index, x: t.x, y: t.y }))].filter((o) => o.f === family && (index === undefined || o.i === index));
    list.sort((a, b) => Math.hypot(a.x - CX, a.y - CY) - Math.hypot(b.x - CX, b.y - CY));
    return list[0];
  },
  // урон от врага на заданном курсе относительно взгляда: два кадра «до», затем падение здоровья
  async hurt({ yaw = 0, bearingDeg = 90, dist = 40, hp = 90 } = {}) {
    look = { yaw, pitch: 0 };
    const a = yaw + (bearingDeg * Math.PI) / 180;
    const mk = (h) => ({ ...structuredClone(base), state: "play", enemies: [enemy("goblin", px + Math.cos(a) * dist, py + Math.sin(a) * dist, { anim: 1 })], player: { ...base.player, hp: h } });
    const inp = { locked: true, touch: false, lockFailed: false, joy: { id: null }, looking: false, dragging: false };
    for (let i = 0; i < 3; i++) api.render({ ...mk(100), time: (time += 1 / 60) }, { look, dt: 1 / 60, view: viewOf(), events: [], input: inp });
    const out = api.render({ ...mk(hp), time: (time += 1 / 60) }, { look, dt: 1 / 60, view: viewOf(), events: [{ id: "playerHurt", x: px, y: py }], input: inp });
    for (let i = 0; i < 3; i++) api.render({ ...mk(hp), time: (time += 1 / 60) }, { look, dt: 1 / 60, view: viewOf(), events: [], input: inp });
    return out && out.threats;
  },
  scenes: Object.keys(SCENES).filter((k) => k !== "only"),
  time: () => time,
  WARDEN, CX, CY,
};
document.title = "FP lab ready";
