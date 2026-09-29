import * as THREE from "./three.js";
import { ABILITY_STATS, WARDEN } from "../data/balance.js";
import { TAU, clamp } from "../shared/math.js";
import { onionBalls } from "../abilities/onion-orbit.js";
import { GEM } from "../render/sprites.js";
import { produceTexture } from "./textures.js";
import { blob, lathe } from "./geometry-kit.js";
import { DECAL } from "./decal-batch.js";
import { createSpriteBatch } from "./sprite-batch.js";

// Представление способностей в перспективе. Всё считается из снимка игры и
// звуковых событий; время попаданий, число снарядов, урон и цели определяет
// симуляция — здесь только рисование.
const HEIGHT = { onion: 40, potato: 42, pepper: 34 };
const ONION_GROUND_DY = 16; // см. docs/architecture.md: сдвиг луковиц под попадание по «экранной» формуле
const fade = (t, life, tail) => clamp((life - t) / tail, 0, 1);

// Лист капусты: узкое основание, широкий скруглённый край, лёгкая дуга и складки.
function leafGeometry() {
  const nx = 12,
    ny = 6,
    pos = [],
    uv = [],
    idx = [];
  const half = (u) => (u < 0.05 ? 0.02 : u < 0.7 ? Math.pow(Math.sin((Math.PI / 2) * (u / 0.7)), 0.7) : Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2)));
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= ny; j++) {
      const u = i / nx,
        v = (j / ny) * 2 - 1,
        hw = half(u) * 0.5;
      const x = u,
        z = v * hw,
        y = 0.06 * Math.sin(u * Math.PI) + 0.05 * Math.abs(v) * half(u) - 0.05 * u * u; // дуга и «чашка»
      pos.push(x, y, z);
      uv.push(u, 0.5 + v * 0.5);
    }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j,
        b = a + 1,
        c = a + ny + 1,
        d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Долька болгарского перца: полукольцо с толщиной, лежит плашмя.
function pepperGeometry() {
  const R = 12,
    r = 6.6,
    shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  shape.absarc(0, 0, r, Math.PI, 0, true);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 4.2, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, R * 0.42);
  return g;
}
function onionGeometry() {
  return lathe([[0.01, -1], [0.55, -0.92], [0.92, -0.45], [1, 0.05], [0.82, 0.55], [0.38, 0.92], [0.1, 1.25], [0.02, 1.55]], 10, 1);
}

export function createEffects({ scene, tracker, materials, tex, decals, particles, rng }) {
  const lit = (params) => tracker.track(materials.lit({ side: THREE.DoubleSide, ...params }));
  const T = {};
  for (const k of ["carrot", "carrotLeaf", "tomato", "tomatoSplat", "potato", "onion", "pepper", "cabbageLeaf", "steel"]) T[k] = tex(produceTexture(k), { mips: false });
  T.cabbageLeaf.wrapS = T.cabbageLeaf.wrapT = THREE.ClampToEdgeWrapping;
  const mesh = (geo, material, capacity) => {
    const m = tracker.track(new THREE.InstancedMesh(tracker.track(geo), material, capacity));
    m.frustumCulled = false;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
    return m;
  };
  const carrotGeo = new THREE.ConeGeometry(5.6, 32, 8);
  carrotGeo.rotateX(Math.PI); // кончик вниз
  carrotGeo.translate(0, 16, 0);
  const carrots = mesh(carrotGeo, lit({ map: T.carrot, emissive: 0.1 }), 48);
  const leafTufts = mesh(new THREE.ConeGeometry(4.2, 12, 5).translate(0, 38, 0), lit({ map: T.carrotLeaf, emissive: 0.1 }), 48);
  const tomatoes = mesh(blob({ seed: 3, radius: 1, detail: 2, squash: 1, jitter: 0.02 }), lit({ map: T.tomato, emissive: 0.1 }), 16);
  const splats = mesh(blob({ seed: 4, radius: 1, detail: 1, squash: 0.25, jitter: 0.18 }), lit({ map: T.tomatoSplat, emissive: 0.12 }), 32);
  const potatoes = mesh(blob({ seed: 6, radius: 1, detail: 1, squash: 0.78, jitter: 0.1 }), lit({ map: T.potato, emissive: 0.08, nearFade: [22, 44] }), 56);
  const pellets = mesh(blob({ seed: 7, radius: 1, detail: 0, squash: 1, jitter: 0.2 }), lit({ map: T.potato, emissive: 0.1 }), 640);
  const onions = mesh(onionGeometry(), lit({ map: T.onion, emissive: 0.05, nearFade: [34, 66], tint: "#e8dcc0" }), 8);
  const peppers = mesh(pepperGeometry(), lit({ map: T.pepper, emissive: 0.18, nearFade: [36, 70] }), 72);
  const leafMeshes = mesh(leafGeometry(), lit({ map: T.cabbageLeaf, emissive: 0.04, tint: "#8aa07a", opacity: 0.78 }), 8);
  // Опыт: кристаллы-плакаты из тех же спрайтов, что сверху.
  const gemAtlas = (() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 9;
    const g = c.getContext("2d");
    g.drawImage(GEM[0], 0, 0);
    g.drawImage(GEM[1], 8, 0);
    const t = tex(c, { mips: false });
    t.flipY = false; // атласы спрайтов читаются сверху вниз
    return t;
  })();
  const gemBatch = createSpriteBatch(tracker, tracker.track(materials.sprite(gemAtlas)), 320);
  scene.add(gemBatch.mesh);

  const dummy = new THREE.Object3D();
  const qSpin = new THREE.Quaternion(),
    qTilt = new THREE.Quaternion(),
    tiltAxis = new THREE.Vector3(),
    AXIS_Y = new THREE.Vector3(0, 1, 0);
  const put = (m, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => {
    if (i >= m.instanceMatrix.count) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  };
  const done = (m, n) => {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  };

  // Раскладка листьев капусты живёт до конца забега: свой генератор, игровой поток случайности не трогаем.
  let cabbage = { layout: null, born: 0, lastTime: 0 };
  let embers = 0,
    last = { time: 0 };

  function emitEvents(events) {
    const P = particles;
    for (const ev of events) {
      const x = ev.x,
        z = ev.y;
      switch (ev.id) {
        case "carrotLand":
          for (let i = 0; i < 10; i++) {
            const a = rng() * TAU,
              v = 40 + rng() * 90;
            P.emit({ x, y: 4, z, vx: Math.cos(a) * v, vy: 60 + rng() * 90, vz: Math.sin(a) * v, g: 380, life: 0.45 + rng() * 0.35, size: 1.6 + rng() * 1.4, color: ["#ee7a22", "#ffc247", "#6b4a2a", "#fff0b0"][i % 4], priority: 0.7 });
          }
          break;
        case "tomatoSplat":
          for (let i = 0; i < 14; i++) {
            const a = rng() * TAU,
              v = 30 + rng() * 80;
            P.emit({ x, y: 5, z, vx: Math.cos(a) * v, vy: 50 + rng() * 80, vz: Math.sin(a) * v, g: 360, life: 0.4 + rng() * 0.3, size: 1.4 + rng() * 1.6, color: ["#d8312a", "#ff6a4a", "#f4e0a0", "#9a1a14"][i % 4], priority: 0.7 });
          }
          break;
        case "potatoBurst":
          for (let i = 0; i < 7; i++) P.emit({ x, y: 40, z, vx: (rng() - 0.5) * 110, vy: 20 + rng() * 60, vz: (rng() - 0.5) * 110, g: 320, life: 0.3 + rng() * 0.2, size: 1.4 + rng(), color: i % 2 ? "#c8a060" : "#8a6a3a", priority: 0.6 });
          break;
        case "beetPool":
          for (let i = 0; i < 6; i++) P.emit({ x: x + (rng() - 0.5) * 30, y: 2, z: z + (rng() - 0.5) * 30, vy: 20 + rng() * 22, g: -5, life: 0.7, size: 1.6, color: "#e0609a", priority: 0.5 });
          break;
        case "charm":
          for (let i = 0; i < 6; i++) P.emit({ x: x + (rng() - 0.5) * 12, y: 24 + rng() * 16, z: z + (rng() - 0.5) * 12, vy: 30 + rng() * 30, life: 0.5, size: 1.8, color: i % 2 ? "#c2266a" : "#f07ab0", priority: 0.6 });
          break;
        case "contactBurn":
        case "playerHurt":
          for (let i = 0; i < 12; i++) {
            const a = rng() * TAU;
            P.emit({ x: x + Math.cos(a) * 40, y: 40 + rng() * 20, z: z + Math.sin(a) * 40, vx: Math.cos(a) * 60, vy: 30 + rng() * 60, vz: Math.sin(a) * 60, g: 220, life: 0.35 + rng() * 0.25, size: 1.6, color: i % 2 ? "#ffb04a" : "#e07b2f" });
          }
          break;
        case "levelUp":
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * TAU;
            P.emit({ x, y: 50, z, vx: Math.cos(a) * 110, vy: 20 + (i % 3) * 10, vz: Math.sin(a) * 110, g: 40, life: 0.55, size: 2, color: "#ffd36a" });
          }
          break;
        case "wheelAdapt":
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * TAU;
            P.emit({ x, y: 150, z, vx: Math.cos(a) * 90, vy: 10, vz: Math.sin(a) * 90, g: 30, life: 0.7, size: 2.2, color: "#f0e0a8" });
          }
          break;
        default:
          if (ev.id.startsWith("hit_")) {
            const col = { carrot: "#ffb04a", cabbage: "#8fd24e", onion: "#f2c47a", potato: "#c8a060", pellet: "#c8a060", beet: "#e0609a", bellPepper: "#ff5a4a", tomato: "#ff6a4a" }[ev.id.slice(4)] || "#ffe0a0";
            for (let i = 0; i < 3; i++) P.emit({ x, y: 22 + rng() * 14, z, vx: (rng() - 0.5) * 70, vy: 20 + rng() * 40, vz: (rng() - 0.5) * 70, g: 260, life: 0.22 + rng() * 0.15, size: 1.3, color: col, priority: 0.3 });
          }
      }
    }
  }

  return {
    update(snapshot, dt, events, info) {
      const { player, strikes, potatoes: shots = [], beetPools = [], tomatoDrops = [], tomatoPuddles = [], pepperSlices = [], gems, time, state, enemies } = snapshot;
      const P = particles;
      if (time < last.time - 0.5) {
        P.clear();
        cabbage = { layout: null, born: 0, lastTime: 0 };
      }
      last = { time };
      const running = state === "play";
      emitEvents(events);
      for (const d of info.died || []) {
        const cols = d.burning ? ["#ee7a22", "#ffc247"] : ["#5b7a2c", "#2b2a1a"];
        for (let i = 0; i < 9; i++) {
          const a = rng() * TAU,
            v = 30 + rng() * 60;
          P.emit({ x: d.x, y: 12 + rng() * 22, z: d.y, vx: Math.cos(a) * v, vy: 30 + rng() * 80, vz: Math.sin(a) * v, g: 300, life: 0.35 + rng() * 0.35, size: 1.6 + rng() * 1.6, color: cols[i % 2], priority: 0.6 });
        }
      }

      // ── Морковь ──
      let nC = 0;
      const tele = Math.min(1, Math.sqrt(4 / Math.max(1, strikes.length)) + 0.25);
      for (const s of strikes) {
        if (s.t < 0) continue;
        if (!s.hit) {
          const k = clamp(s.t / s.fall, 0, 1),
            h = (1 - k) * (1 - k) * 300;
          decals.add(DECAL.warn, s.x, s.y, s.r, { k, alpha: tele, color: [1, 0.6, 0.24] });
          if (nC < 40) {
            put(carrots, nC, s.x, h + 4, s.y, 1, 1, 1, k * 5 + s.x, 0, 0.12);
            put(leafTufts, nC, s.x, h + 4, s.y, 1, 1, 1, k * 5 + s.x, 0, 0.12);
            nC++;
          }
        } else {
          const k = clamp((s.t - s.fall) / 0.5, 0, 1);
          decals.add(DECAL.impact, s.x, s.y, s.r, { k, alpha: 1 - k * 0.5 });
          if (nC < 40) {
            const sc = 1 - k * k;
            put(carrots, nC, s.x, -8, s.y, sc, sc, sc, s.x, 0.22, 0.1);
            put(leafTufts, nC, s.x, -8, s.y, sc, sc, sc, s.x, 0.22, 0.1);
            nC++;
          }
        }
      }
      done(carrots, nC);
      done(leafTufts, nC);

      // ── Помидор ──
      let nT = 0,
        nS = 0;
      for (const d of tomatoDrops) {
        if (d.t < 0) continue;
        const k = clamp(d.t / d.fall, 0, 1),
          h = (1 - k) * (1 - k) * 300,
          sq = k > 0.92 ? 0.7 + (1 - k) * 3 : 1;
        decals.add(DECAL.tomatoWarn, d.x, d.y, d.r, { k, alpha: 0.9 });
        put(tomatoes, nT++, d.x, h + 9 * sq, d.y, 9.5, 9 * sq, 9.5, k * 3);
      }
      for (const p of tomatoPuddles) {
        const a = fade(p.t, p.life, 0.6);
        if (p.r >= 1 && !(a < 0.5 && Math.floor(time * 10) % 2)) decals.add(DECAL.tomatoPuddle, p.x, p.y, p.r, { seed: p.x * 0.013, alpha: 0.5 + 0.5 * a });
        if (p.t < 1.4 && nS < 30) {
          const g = Math.min(1, p.t / 0.12);
          put(splats, nS++, p.x, 0.8, p.y, 13 * g, 13 * g * (1 - p.t / 1.4), 13 * g, p.x);
        }
      }
      done(tomatoes, nT);
      done(splats, nS);

      // ── Свёкла ──
      for (const p of beetPools) {
        const grow = Math.min(1, p.t / 0.3),
          a = fade(p.t, p.life, 1);
        if (a < 0.35 && Math.floor(time * 10) % 2) continue;
        decals.add(DECAL.beetPool, p.x, p.y, p.r * grow, { seed: p.x * 0.017, alpha: Math.min(1, a * 1.4) });
      }

      // ── Капуста ──
      if (player.lv.cabbage > 0 && state !== "over") {
        if (!cabbage.layout) {
          const n = 5 + Math.floor(rng() * 3),
            base = rng() * TAU;
          cabbage.layout = Array.from({ length: n }, (_, i) => ({ angle: base + (i * TAU) / n + (rng() - 0.5) * (TAU / n) * 0.3, len: 0.9 + rng() * 0.12, width: 0.72 + rng() * 0.2, phase: rng() * 6 }));
          cabbage.born = time;
        }
        const R = ABILITY_STATS.cabbage(player.lv.cabbage).R,
          grow = clamp((time - cabbage.born) / 0.6, 0, 1);
        decals.add(DECAL.field, player.x, player.y, R, { alpha: grow });
        cabbage.layout.forEach((l, i) => {
          const L = R * l.len * grow,
            Wd = L * 0.78 * Math.tan(Math.PI / cabbage.layout.length) * l.width,
            sway = Math.sin(time * 2.2 + l.phase) * 0.05;
          // лист лежит на земле, растёт от котла наружу; кончик слегка колышется
          put(leafMeshes, i, player.x, 1.4 + (i % 2) * 0.6, player.y, L, 40 + Math.sin(time * 3 + l.phase) * 6, Wd * 1.25, -(l.angle + sway), 0, 0.03);
        });
        done(leafMeshes, cabbage.layout.length);
      } else {
        cabbage.layout = null;
        done(leafMeshes, 0);
      }

      // ── Картошка ──
      let nP = 0,
        nPl = 0;
      for (const p of shots) {
        if (p.kind === "potato") {
          if (nP < 56) {
            const a = Math.atan2(p.vy, p.vx);
            put(potatoes, nP++, p.x, HEIGHT.potato, p.y, 7.6, 6.2, 5.6, -a, 0, time * 12);
          }
          decals.shadow(p.x, p.y, 6, 0.45);
          if (running) P.emit({ x: p.x - p.vx * 0.012, y: HEIGHT.potato, z: p.y - p.vy * 0.012, life: 0.16, size: 2.2, color: "#c8a060", priority: 0.5 });
        } else if (nPl < 640) put(pellets, nPl++, p.x, HEIGHT.potato - 1, p.y, 2.2, 2.2, 2.2, p.x * 3);
      }
      done(potatoes, nP);
      done(pellets, nPl);

      // ── Лук ──
      let nO = 0;
      if (player.lv.onion > 0 && state !== "over") {
        for (const b of onionBalls(player, time)) {
          put(onions, nO++, b.x, HEIGHT.onion, b.y + ONION_GROUND_DY, b.r * 0.78, b.r * 0.78, b.r * 0.78, time * 2 + b.i);
          decals.shadow(b.x, b.y + ONION_GROUND_DY, b.r * 1.1, 0.35);
        }
      }
      done(onions, nO);

      // ── Болгарский перец ──
      // Дольки вращаются плашмя, но наклонены к зрителю, чтобы полукольцо читалось.
      let nB = 0;
      for (const p of pepperSlices) {
        if (nB >= 72) break;
        const sc = p.spent ? 0.8 : 1,
          vx = p.x - info.pose.x,
          vz = p.y - info.pose.z,
          vl = Math.hypot(vx, vz) || 1;
        qSpin.setFromAxisAngle(AXIS_Y, p.spin);
        tiltAxis.set(-vz / vl, 0, vx / vl); // горизонтально, поперёк линии взгляда
        qTilt.setFromAxisAngle(tiltAxis, -0.62);
        dummy.position.set(p.x, HEIGHT.pepper + 4 + Math.sin(p.spin * 0.5) * 1.2, p.y);
        dummy.quaternion.copy(qTilt).multiply(qSpin);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        peppers.setMatrixAt(nB++, dummy.matrix);
        decals.shadow(p.x, p.y, 8, 0.3);
      }
      done(peppers, nB);

      // ── Опыт ──
      gemBatch.begin();
      for (const g of gems) {
        const big = g.v > 1,
          bob = Math.sin(time * 4 + g.x) * 1.4,
          w = big ? 17 : 12,
          h = big ? 22 : 17;
        gemBatch.push(g.x, 10 + bob, g.y, w, h, big ? 8 / 16 : 0, 0, big ? 7 / 16 : 5 / 16, big ? 1 : 7 / 9, 0, 0, 1, 0.7);
        decals.add(DECAL.glow, g.x, g.y, 9, { alpha: 0.7 });
      }
      gemBatch.end();

      // ── Страж Колеса: опасные зоны на земле ──
      const boss = enemies.find((e) => e.type === "warden");
      if (boss && state !== "menu") {
        if (boss.state === "cast") {
          const k = 1 - Math.max(0, boss.stateT) / WARDEN.gravity.windup;
          decals.add(DECAL.gravity, boss.x, boss.y, WARDEN.gravity.radius, { k, alpha: 1 });
        } else if (boss.state === "windup") {
          const k = 1 - Math.max(0, boss.stateT) / WARDEN.slash.windup;
          decals.add(DECAL.slash, boss.x, boss.y, WARDEN.slash.reach + 22, { k, alpha: 1 });
        } else if (boss.state === "strike") {
          const k = 1 - Math.max(0, boss.stateT) / WARDEN.slash.recover;
          decals.add(DECAL.impact, boss.x, boss.y, WARDEN.slash.reach + 10, { k, color: [1, 0.96, 0.88], alpha: 1 });
        }
      }

      // ── Искры костра у котла: вокруг обода ──
      if (running) {
        embers += dt * 9 * P.budgetRate;
        while (embers >= 1) {
          embers--;
          const a = rng() * TAU,
            d = 34 + rng() * 40;
          P.emit({ x: player.x + Math.cos(a) * d, y: 22 + rng() * 34, z: player.y + Math.sin(a) * d, vx: (rng() - 0.5) * 12 - player.vx * 0.2, vy: 24 + rng() * 40, vz: (rng() - 0.5) * 12 - player.vy * 0.2, g: -8, life: 0.7 + rng() * 0.7, size: 0.9, color: rng() < 0.5 ? "#ffd06a" : "#ff8a2a", priority: 0.2 });
        }
      }
      if (running || state === "over" || state === "menu" || state === "intro") P.update(dt);
    },
  };
}
