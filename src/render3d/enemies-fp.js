import * as THREE from "./three.js";
import { WARDEN } from "../data/balance.js";
import { TAU } from "../shared/math.js";
import { spriteDirection, angleDiff } from "../shared/view-math.js";
import { bakeCreature, CLIPS, CREATURE_SIZE, TEXEL_WU } from "./creatures.js";
import { bakeWarden, WARDEN_CLIPS, WARDEN_CELL } from "./warden-puppet.js";
import { createSpriteBatch } from "./sprite-batch.js";
import { flameSheet } from "./textures.js";
import { blob } from "./geometry-kit.js";
import { limb as limbGeo } from "./models.js";

// Враги в виде от первого лица: спрайты из запечённых «кукол» (8 направлений),
// тени и пламя на земле, колесо Стража как настоящая модель. Читает только
// снимок; смерть ловится по исчезновению номера врага между кадрами.
let sheets = null; // запечённые листы живут между включениями вида
export async function prepareSprites(onProgress = () => {}) {
  if (sheets) return sheets;
  const next = {};
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const list = [
    ["goblin", () => bakeCreature("goblin")],
    ["runner", () => bakeCreature("runner")],
    ["brute", () => bakeCreature("brute")],
    ["warden", () => bakeWarden()],
  ];
  for (let i = 0; i < list.length; i++) {
    await yieldFrame();
    next[list[i][0]] = list[i][1]();
    onProgress((i + 1) / list.length);
  }
  sheets = next;
  return sheets;
}

const DEATH_STEP = 0.11; // секунд на кадр падения
const GHOST_LIFE = 1.5;
const MAX_GHOSTS = 48;
const MAX_FLAMES = 60;

export function createEnemyRenderer({ scene, tracker, materials, sheets: S, decals, tex }) {
  const types = ["goblin", "runner", "brute", "warden"];
  const clipsOf = { goblin: CLIPS, runner: CLIPS, brute: CLIPS, warden: WARDEN_CLIPS };
  const batches = {},
    sizeOf = {};
  for (const t of types) {
    const s = S[t],
      data = new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength),
      texture = tracker.track(new THREE.DataTexture(data, s.width, s.height, THREE.RGBAFormat, THREE.UnsignedByteType));
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    batches[t] = createSpriteBatch(tracker, tracker.track(materials.sprite(texture)), t === "warden" ? 4 : 420);
    scene.add(batches[t].mesh);
    sizeOf[t] = t === "warden" ? { w: WARDEN_CELL[0] * TEXEL_WU, h: WARDEN_CELL[1] * TEXEL_WU } : CREATURE_SIZE(t);
  }
  // пламя горящих врагов
  const flameTexture = tex(flameSheet(), { mips: false });
  flameTexture.flipY = false;
  const flameBatch = createSpriteBatch(tracker, tracker.track(materials.sprite(flameTexture)), MAX_FLAMES + 4);
  scene.add(flameBatch.mesh);

  // Колесо Стража: кольцо, спицы и восемь шаров — объёмная модель над головой.
  const wheel = new THREE.Group();
  scene.add(wheel);
  tracker.track(wheel);
  const ringGeo = tracker.track(new THREE.TorusGeometry(17, 1.3, 5, 26));
  ringGeo.rotateX(Math.PI / 2);
  const boneTex = tex(
    (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 8;
      const g = c.getContext("2d");
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = ["#6e6a60", "#aaa598", "#dcd8cc", "#f2efe6"][(x * 3 + y * 5) % 4];
          g.fillRect(x, y, 1, 1);
        }
      return c;
    })(),
    { mips: false },
  );
  const ringMat = tracker.track(materials.lit({ map: boneTex, emissive: 0.12, side: THREE.DoubleSide }));
  wheel.add(new THREE.Mesh(ringGeo, ringMat));
  const spokeGeos = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const g = tracker.track(limbGeo([0, 0, 0], [Math.cos(a) * 28, 0, Math.sin(a) * 28], 0.7, 0.7, 4));
    spokeGeos.push(g);
    wheel.add(new THREE.Mesh(g, ringMat));
  }
  const orbGeo = tracker.track(blob({ seed: 5, radius: 4.2, detail: 1, squash: 1, jitter: 0.03 }));
  const orbMat = tracker.track(materials.lit({ map: boneTex, emissive: 0.3, tint: "#e8d8a0" }));
  const orbs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU,
      m = new THREE.Mesh(orbGeo, orbMat);
    m.position.set(Math.cos(a) * 28, 0, Math.sin(a) * 28);
    wheel.add(m);
    orbs.push(m);
  }
  wheel.visible = false;

  // Состояние между кадрами: известные враги (для смерти и курса), «призраки» смерти.
  let known = new Map(),
    ghosts = [],
    lastTime = 0;

  function clipFor(e, snapshot, p, time) {
    const dx = p.x - e.x,
      dy = p.y - e.y,
      dist = Math.hypot(dx, dy);
    if (e.type === "warden") {
      if (e.state === "windup") return ["windup", e.stateT > WARDEN.slash.windup / 2 ? 0 : 1];
      if (e.state === "strike") return ["strike", e.stateT > WARDEN.slash.recover / 2 ? 0 : 1];
      if (e.state === "cast") return ["cast", Math.floor(time * 8) % 2];
      return ["walk", Math.floor(e.anim * 1.8) % 6];
    }
    if (e.flash > 0.03) return ["hit", 0];
    // рядом с котлом враг бьёт: замах — удар — возврат по кругу
    if (!(e.charm > 0) && dist < e.r + p.r + 24) {
      const ph = (time * 2.6 + (e.id % 7) * 0.31) % 1;
      return ["attack", ph < 0.42 ? 0 : ph < 0.7 ? 1 : 2];
    }
    return ["walk", Math.floor(e.anim) % 4];
  }

  return {
    // → { threats } для звуковых подсказок; рисует всё в пачки.
    update(snapshot, cam, dt, opts) {
      const { enemies, player, time } = snapshot;
      const { far } = opts;
      if (time < lastTime - 0.5) {
        known = new Map();
        ghosts = [];
      }
      lastTime = time;
      for (const b of Object.values(batches)) b.begin();
      flameBatch.begin();
      const seen = new Set();
      const burning = [];
      const threats = [],
        died = [];
      const camX = cam.x,
        camZ = cam.z,
        r2 = far * far;
      for (const e of enemies) {
        seen.add(e.id);
        let k = known.get(e.id);
        if (!k) known.set(e.id, (k = { x: e.x, y: e.y, heading: Math.atan2(player.y - e.y, player.x - e.x) }));
        const mvx = e.x - k.x,
          mvy = e.y - k.y;
        // Курс: к котлу; у обращённых — по движению (они идут к другим врагам).
        if (e.charm > 0) {
          if (mvx * mvx + mvy * mvy > 0.16) k.heading = Math.atan2(mvy, mvx);
        } else k.heading = Math.atan2(player.y - e.y, player.x - e.x);
        k.x = e.x;
        k.y = e.y;
        k.type = e.type;
        k.burning = !!e.effects?.burning;
        k.charm = e.charm > 0;
        k.r = e.r;
        const dx = e.x - camX,
          dz = e.y - camZ,
          d2c = dx * dx + dz * dz;
        // подсказки: близкие враги вне поля зрения
        if (d2c < 300 * 300 && opts.yaw !== null) {
          const b = angleDiff(Math.atan2(dz, dx), opts.yaw);
          if (Math.abs(b) > opts.halfFov + 0.12) threats.push({ bearing: b, dist: Math.sqrt(d2c), type: e.type });
        }
        if (d2c > r2) continue;
        const [clip, frame] = clipFor(e, snapshot, player, time);
        const s = S[e.type],
          idx = s.index[clip].start + frame,
          dir = spriteDirection(k.heading, e.x, e.y, camX, camZ),
          [cw, ch] = s.cell,
          batch = batches[e.type],
          size = sizeOf[e.type];
        const flash = e.flash > 0 ? Math.min(1, e.flash / 0.1) : 0,
          charmVis = e.charm > 0 && (e.charm > 1.5 || Math.floor(time * 8) % 2 === 0) ? 1 : 0;
        const glow = charmVis ? 0.22 : e.effects?.burning ? 0.16 : 0;
        batch.push(e.x, -s.anchorPx * TEXEL_WU, e.y, size.w, size.h, (idx * cw) / s.width, (dir * ch) / s.height, cw / s.width, ch / s.height, flash, charmVis, 1, glow);
        // тень; у союзника — ещё розовое кольцо
        decals.shadow(e.x, e.y, e.r * (e.type === "warden" ? 1.3 : 1.15), 0.55);
        if (e.charm > 0) decals.ring(9, e.x, e.y, e.r * 1.25, { seed: e.id, alpha: charmVis ? 1 : 0.4, color: [0.95, 0.45, 0.7] });
        if (e.effects?.burning && e.type !== "warden") burning.push({ e, d: d2c });
      }
      // Пламя только у ближайших горящих: толпа не превращается в светлое пятно.
      burning.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(MAX_FLAMES, burning.length); i++) {
        const { e } = burning[i],
          f = Math.floor(time * 12 + e.id * 1.7) % 4,
          h = (e.type === "brute" ? 64 : 44) * (0.9 + 0.1 * Math.sin(time * 9 + e.id));
        flameBatch.push(e.x, 0, e.y, e.type === "brute" ? 34 : 24, h, f * 0.25, 0, 0.25, 1, 0, 0, 0.92, 1);
      }
      // Смерть: номера, пропавшие с прошлого кадра, превращаются в «призраки».
      if (snapshot.state === "play" || snapshot.state === "over") {
        for (const [id, k] of known)
          if (!seen.has(id)) {
            known.delete(id);
            const dxk = k.x - camX,
              dzk = k.y - camZ;
            if (dxk * dxk + dzk * dzk < r2 && snapshot.state === "play") {
              ghosts.push({ id, ...k, t: 0 });
              died.push({ x: k.x, y: k.y, type: k.type, burning: k.burning, r: k.r });
            }
          }
        if (ghosts.length > MAX_GHOSTS) ghosts.splice(0, ghosts.length - MAX_GHOSTS);
      } else known.forEach((_, id) => !seen.has(id) && known.delete(id));
      const alive = [];
      for (const g of ghosts) {
        g.t += dt;
        const life = g.type === "warden" ? GHOST_LIFE * 1.6 : GHOST_LIFE;
        if (g.t > life) continue;
        alive.push(g);
        const s = S[g.type],
          n = s.index.death.count,
          frame = Math.min(n - 1, Math.floor(g.t / (g.type === "warden" ? DEATH_STEP * 1.5 : DEATH_STEP))),
          idx = s.index.death.start + frame,
          dir = spriteDirection(g.heading, g.x, g.y, camX, camZ),
          [cw, ch] = s.cell,
          fadeStart = life * 0.55,
          fade = g.t < fadeStart ? 1 : Math.max(0, 1 - (g.t - fadeStart) / (life - fadeStart)),
          size = sizeOf[g.type];
        batches[g.type].push(g.x, -s.anchorPx * TEXEL_WU, g.y, size.w, size.h, (idx * cw) / s.width, (dir * ch) / s.height, cw / s.width, ch / s.height, g.t < 0.08 ? 1 : 0, 0, fade, g.charm ? 0.2 : 0);
        if (frame < n - 1 || fade > 0.5) decals.shadow(g.x, g.y, g.r * 1.1, 0.4 * fade);
      }
      ghosts = alive;
      for (const b of Object.values(batches)) b.end();
      flameBatch.end();
      // Колесо Стража
      const boss = enemies.find((e) => e.type === "warden");
      wheel.visible = !!boss;
      if (boss) {
        const kk = boss.wheelAnim / WARDEN.wheelTurnTime,
          ease = kk * kk * (3 - 2 * kk),
          turn = boss.wheelSteps - ease;
        const bob = 0;
        wheel.position.set(boss.x, 146 + bob + Math.sin(time * 2) * 1.5, boss.y);
        wheel.rotation.y = turn * (Math.PI / 4);
        const glowing = boss.wheelAnim > 0;
        orbMat.uniforms.uEmissive.value = glowing ? 1.2 : 0.3;
        ringMat.uniforms.uEmissive.value = glowing ? 0.6 : 0.12;
      }
      threats.sort((a, b) => a.dist - b.dist);
      return { threats: threats.slice(0, 4), boss, died };
    },
    dispose() {
      known = new Map();
      ghosts = [];
    },
  };
}
