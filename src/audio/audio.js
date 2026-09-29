import { clamp } from "../shared/math.js";
// Звук на Web Audio: записанный фон костра, синтезированные звуки ударов и два файла
// для приёмов Стража Колеса. Контекст создаётся только после первого жеста
// игрока (требование браузеров), до этого вызовы тихо игнорируются.
const FIRE = { url: "assets/audio/campfire-loop.mp3", gain: 0.35 };
const FILES = {
  gravityCast: { url: "assets/audio/warden-gravity.mp3", gain: 0.55 },
  wheelAdapt: { url: "assets/audio/warden-wheel-adapt.mp3", gain: 0.45 },
  // Враг врезается в котёл и вспыхивает; звук обрезан до 2 с с затуханием.
  contactBurn: { url: "assets/audio/contact-burn.mp3", gain: 0.5 },
};
// Минимальный интервал между одинаковыми звуками (сек): залп из 16 морковок
// и тики капусты не должны сливаться в шум.
const THROTTLE = {
  hit_cabbage: 0.11,
  hit_onion: 0.05,
  hit_potato: 0.05,
  hit_pellet: 0.03,
  hit_beet: 0.08,
  hit_bellPepper: 0.04,
  carrotLand: 0.035,
  potatoFire: 0.045,
  potatoBurst: 0.05,
  charm: 0.08,
  tomatoSplat: 0.08,
  playerHurt: 0.12,
  contactBurn: 0.25,
  levelUp: 0.2,
};
// Звуки мобов (гоблины, орда, Страж Колеса и их удары по котлу). Остальные
// события — звуки ударов и способностей супа.
const MOB_SOUNDS = new Set(["horde", "playerHurt", "contactBurn", "gravityCast", "wheelAdapt", "slashWindup", "slashStrike"]);
// Шкала громкости 0–100; 70 — задуманный уровень, выше — громче задуманного.
export const DEFAULT_VOLUMES = { fire: 70, mobs: 70, hits: 70 };
// События, которые слышно независимо от расстояния.
const GLOBAL = new Set(["levelUp", "horde", "wheelAdapt", "playerHurt", "contactBurn"]);
const MAX_VOICES = 28;

export function createAudio({ enabled = true, volumes = DEFAULT_VOLUMES } = {}) {
  let ctx = null,
    master,
    sfx,
    mobBus,
    hitBus,
    vol = { ...DEFAULT_VOLUMES, ...volumes },
    fireOut,
    noise,
    on = enabled,
    voices = 0;
  const buffers = {},
    lastPlayed = {},
    fire = { pan: 0 };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.8 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    limiter.connect(master);
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(limiter);
    mobBus = ctx.createGain();
    hitBus = ctx.createGain();
    mobBus.connect(sfx);
    hitBus.connect(sfx);
    applyVolumes();
    // Двухсекундный белый шум — основа шорохов, шлепков и свиста.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    startFire(limiter);
    for (const [id, f] of Object.entries(FILES))
      fetch(f.url)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => (buffers[id] = buf))
        .catch(() => {});
  }
  function unlock() {
    init();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  const factor = (v) => Math.max(0, v) / 70;
  function applyVolumes() {
    if (!ctx) return;
    mobBus.gain.setTargetAtTime(factor(vol.mobs), ctx.currentTime, 0.03);
    hitBus.gain.setTargetAtTime(factor(vol.hits), ctx.currentTime, 0.03);
  }
  function setVolumes(next) {
    vol = { ...vol, ...next };
    applyVolumes();
  }
  // Пример звука категории при движении ползунка.
  function preview(category) {
    if (!ctx || ctx.state !== "running" || !on) return;
    const at = { x: 0, y: 0 },
      events = category === "mobs" ? ["slashStrike"] : category === "hits" ? ["carrotLand", "hit_onion"] : [];
    for (const id of events) {
      lastPlayed[id] = -1;
      play({ id, ...at }, at);
    }
  }
  function setEnabled(value) {
    on = value;
    if (ctx) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
  }

  // ── Костёр: записанный звук огня, бесшовная 40-секундная петля ──
  // Тихий фон. На движение реагирует едва заметно: чуть громче и ярче на бегу,
  // при поворотах стерео мягко смещается на несколько процентов.
  function startFire(dest) {
    fireOut = ctx.createGain();
    fireOut.gain.value = 0;
    const lp = ctx.createBiquadFilter(),
      pan = ctx.createStereoPanner();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    fireOut.connect(lp).connect(pan).connect(dest);
    Object.assign(fire, { panner: pan, lp });
    fetch(FIRE.url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        // Края mp3 могут содержать тишину кодека — петля берётся чуть внутри.
        src.loopStart = 0.05;
        src.loopEnd = buf.duration - 0.05;
        src.connect(fireOut);
        src.start(0, 0.05);
      })
      .catch(() => {});
  }
  function updateFire(snapshot, dt) {
    const { player, state } = snapshot,
      t = ctx.currentTime;
    const level = state === "over" ? 0 : state === "play" ? 1 : state === "menu" ? 0.75 : 0.4;
    const k = clamp(Math.hypot(player.vx, player.vy) / Math.max(1, player.speed), 0, 1);
    const targetPan = clamp((-player.vx / Math.max(1, player.speed)) * 0.08, -0.08, 0.08);
    fire.pan += (targetPan - fire.pan) * Math.min(1, dt * 2);
    fire.panner.pan.setTargetAtTime(fire.pan, t, 0.2);
    fire.lp.frequency.setTargetAtTime(5200 + 1600 * k, t, 0.3);
    fireOut.gain.setTargetAtTime(FIRE.gain * factor(vol.fire) * level * (1 + 0.1 * k), t, state === "over" ? 1.2 : 0.3);
  }

  // ── Синтез: тон с глиссандо и отфильтрованный шум ──
  function voice(dur) {
    if (voices >= MAX_VOICES) return false;
    voices++;
    setTimeout(() => voices--, (dur + 0.05) * 1000);
    return true;
  }
  function tone(out, { type = "sine", f0, f1 = f0, dur, gain, delay = 0, attack = 0.004 }) {
    const t = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function hiss(out, { filter = "bandpass", f0, f1 = f0, q = 1, dur, gain, delay = 0, attack = 0.004 }) {
    const t = ctx.currentTime + delay,
      src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = noise;
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }
  // Каждая атака звучит по-своему и по смыслу: морковь — глухой удар о землю,
  // капуста — шелест листьев, лук — упругий «бонк», картошка — хлопок выстрела
  // и глухой шлепок, дробь — мелкие щелчки, свёкла — бульканье и магический звон,
  // помидор — сочный шлепок, болгарский перец — свист и режущий звук, меч
  // Стража — свист клинка со звоном стали.
  const SOUNDS = {
    carrotLand: (o) => {
      tone(o, { f0: 115, f1: 42, dur: 0.17, gain: 0.3 });
      hiss(o, { f0: 1500, f1: 700, q: 1.2, dur: 0.09, gain: 0.12 });
    },
    hit_cabbage: (o) => hiss(o, { f0: 4200, f1: 2600, q: 1.4, dur: 0.08, gain: 0.05, attack: 0.01 }),
    hit_onion: (o) => {
      tone(o, { type: "triangle", f0: 540, f1: 300, dur: 0.08, gain: 0.12 });
      hiss(o, { f0: 1600, q: 2, dur: 0.03, gain: 0.04 });
    },
    potatoFire: (o) => {
      tone(o, { f0: 260, f1: 120, dur: 0.07, gain: 0.15 });
      hiss(o, { f0: 900, f1: 400, q: 1, dur: 0.06, gain: 0.08 });
    },
    hit_potato: (o) => {
      tone(o, { f0: 150, f1: 70, dur: 0.12, gain: 0.2 });
      hiss(o, { filter: "lowpass", f0: 900, dur: 0.06, gain: 0.09 });
    },
    potatoBurst: (o) => hiss(o, { filter: "highpass", f0: 2200, dur: 0.09, gain: 0.07 }),
    hit_pellet: (o) => tone(o, { type: "square", f0: 1300, f1: 900, dur: 0.025, gain: 0.025 }),
    beetPool: (o) => {
      hiss(o, { filter: "lowpass", f0: 500, f1: 300, dur: 0.45, gain: 0.08, attack: 0.05 });
      for (let i = 0; i < 5; i++) tone(o, { f0: 180 + Math.random() * 160, f1: 380 + Math.random() * 200, dur: 0.07, gain: 0.05, delay: i * 0.07 + Math.random() * 0.03 });
    },
    charm: (o) => {
      tone(o, { f0: 880, dur: 0.28, gain: 0.05, attack: 0.01 });
      tone(o, { f0: 1318, dur: 0.32, gain: 0.035, delay: 0.06, attack: 0.01 });
    },
    hit_beet: (o) => {
      tone(o, { f0: 220, f1: 140, dur: 0.1, gain: 0.1 });
      hiss(o, { f0: 700, q: 1.5, dur: 0.05, gain: 0.05 });
    },
    tomatoSplat: (o) => {
      hiss(o, { filter: "lowpass", f0: 1400, f1: 280, dur: 0.24, gain: 0.25, attack: 0.003 });
      tone(o, { f0: 85, f1: 48, dur: 0.13, gain: 0.16 });
    },
    pepperThrow: (o) => hiss(o, { f0: 700, f1: 2600, q: 2.2, dur: 0.28, gain: 0.1, attack: 0.05 }),
    hit_bellPepper: (o) => {
      hiss(o, { filter: "highpass", f0: 3400, dur: 0.05, gain: 0.08 });
      tone(o, { f0: 1900, f1: 1400, dur: 0.04, gain: 0.04 });
    },
    playerHurt: (o) => {
      tone(o, { f0: 95, f1: 55, dur: 0.2, gain: 0.28 });
      hiss(o, { filter: "lowpass", f0: 2500, f1: 900, dur: 0.14, gain: 0.1 });
    },
    levelUp: (o) => {
      tone(o, { type: "triangle", f0: 660, dur: 0.14, gain: 0.09, attack: 0.01 });
      tone(o, { type: "triangle", f0: 990, dur: 0.22, gain: 0.08, delay: 0.1, attack: 0.01 });
    },
    horde: (o) => {
      tone(o, { f0: 60, f1: 42, dur: 0.7, gain: 0.35, attack: 0.01 });
      hiss(o, { filter: "lowpass", f0: 220, dur: 0.5, gain: 0.25 });
    },
    // Меч Стража: нарастающий свист замаха, затем свист клинка и звон стали.
    slashWindup: (o) => {
      hiss(o, { f0: 400, f1: 1800, q: 3, dur: 0.42, gain: 0.07, attack: 0.3 });
      tone(o, { f0: 700, f1: 1400, dur: 0.42, gain: 0.015, attack: 0.3 });
    },
    slashStrike: (o) => {
      hiss(o, { f0: 3800, f1: 900, q: 1.6, dur: 0.2, gain: 0.3, attack: 0.01 });
      tone(o, { f0: 2350, dur: 0.55, gain: 0.05 });
      tone(o, { f0: 3520, dur: 0.4, gain: 0.03 });
      tone(o, { f0: 4710, dur: 0.3, gain: 0.018 });
    },
  };
  function playFile(id, out) {
    const buf = buffers[id];
    if (!buf) return;
    const src = ctx.createBufferSource(),
      g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = FILES[id].gain;
    src.connect(g).connect(out);
    src.start();
  }
  function play(ev, player) {
    const now = ctx.currentTime,
      min = THROTTLE[ev.id] || 0;
    if (min && now - (lastPlayed[ev.id] || -1) < min) return;
    lastPlayed[ev.id] = now;
    const dx = ev.x - player.x,
      dy = ev.y - player.y,
      d = Math.hypot(dx, dy),
      global = GLOBAL.has(ev.id);
    if (!global && d > 1400) return;
    if (!voice(1)) return;
    const g = ctx.createGain(),
      p = ctx.createStereoPanner();
    g.gain.value = global ? 1 : 1 / (1 + d / 450);
    p.pan.value = global ? 0 : clamp(dx / 350, -1, 1) * 0.8;
    g.connect(p).connect(MOB_SOUNDS.has(ev.id) ? mobBus : hitBus);
    if (FILES[ev.id]) playFile(ev.id, g);
    else SOUNDS[ev.id]?.(g);
  }
  let lastUpdate = 0;
  function update(snapshot, events) {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime,
      dt = Math.min(0.1, now - lastUpdate || 0.016);
    lastUpdate = now;
    updateFire(snapshot, dt);
    if (on) for (const ev of events) play(ev, snapshot.player);
  }
  return {
    unlock,
    setEnabled,
    setVolumes,
    preview,
    update,
    get enabled() {
      return on;
    },
    get volumes() {
      return { ...vol };
    },
  };
}
