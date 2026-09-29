import * as THREE from "./three.js";
import { K, CX, CY, WORLD } from "../data/balance.js";
import { hash2 } from "../shared/math.js";
import { GROUND_BASE, BUSH_SPOTS } from "../render/ground.js";
import * as T from "./textures.js";
import { flameSheet } from "./textures.js";
import { buildTree, buildBush, buildRock, buildStump, buildLog, buildTent, buildCrate, buildPotModel, buildFireLogs, buildFirePit, TREE_FAMILIES } from "./models.js";

// Объёмный мир: земля из той же карты, что и сверху (без запечённых кустов),
// деревья и кусты через InstancedMesh, реквизит — отдельными моделями.
// Всё создаётся через tracker и освобождается одним вызовом.
const pixelTexture = (canvas, { repeat = false, mips = true } = {}) => {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mips;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

// Земля первого лица: та же карта, но светлые «камешки» приглушены — вблизи каждый
// пиксель земли крупнее экранного, и яркие точки читались бы как мусор.
let groundFp = null;
function groundForFirstPerson() {
  if (groundFp) return groundFp;
  const c = document.createElement("canvas");
  c.width = GROUND_BASE.width;
  c.height = GROUND_BASE.height;
  const g = c.getContext("2d");
  g.drawImage(GROUND_BASE, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height),
    d = im.data;
  const remap = new Map([
    [0x6a6150, [0x30, 0x2b, 0x21]],
    [0x4e473a, [0x28, 0x24, 0x1c]],
    [0x3a342a, [0x22, 0x1f, 0x18]],
    [0xd8ccb0, [0x6a, 0x62, 0x50]], // ножки грибов
    [0xc8b870, [0x8a, 0x7e, 0x4a]], // цветы
    [0xb08aa0, [0x74, 0x58, 0x6c]],
    [0x9ab0c8, [0x58, 0x6e, 0x86]],
  ]);
  for (let i = 0; i < d.length; i += 4) {
    const to = remap.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (to) [d[i], d[i + 1], d[i + 2]] = to;
  }
  g.putImageData(im, 0, 0);
  return (groundFp = c);
}

export const createTextureFactory = (tracker) => (canvas, opts) => tracker.track(pixelTexture(canvas, opts));

export function createWorldScene({ scene, tracker, materials, world, maxAnisotropy = 4 }) {
  const track = tracker.track;
  const tex = (canvas, opts) => track(pixelTexture(canvas, opts));
  const lit = (params) => track(materials.lit({ side: THREE.DoubleSide, ...params }));
  const add = (obj) => {
    scene.add(obj);
    return track(obj);
  };
  const dummy = new THREE.Object3D();

  // ── Небо: купол следует за камерой ──
  const skyMat = track(new THREE.MeshBasicMaterial({ map: tex(T.skyTexture(), { mips: false }), side: THREE.BackSide, depthWrite: false, fog: false }));
  const sky = add(new THREE.Mesh(track(new THREE.SphereGeometry(900, 24, 16)), skyMat));
  sky.renderOrder = -10;
  sky.frustumCulled = false;

  // ── Земля ──
  const groundTex = tex(groundForFirstPerson());
  groundTex.anisotropy = maxAnisotropy;
  const groundGeo = track(new THREE.PlaneGeometry(WORLD.w, WORLD.h));
  groundGeo.rotateX(-Math.PI / 2);
  const ground = add(new THREE.Mesh(groundGeo, lit({ map: groundTex, emissive: 0.04 })));
  ground.position.set(WORLD.w / 2, 0, WORLD.h / 2);

  // ── Текстуры и материалы объектов ──
  const barkMats = [tex(T.barkTexture(1, 0), { repeat: true }), tex(T.barkTexture(2, 0.35), { repeat: true })].map((map) => lit({ map }));
  const leafMap = tex(T.leafTexture(2, T.RAMPS.oak, 7), { repeat: true }),
    needleMap = tex(T.needleTexture(3), { repeat: true }),
    rockMap = tex(T.rockTexture(4), { repeat: true }),
    ringMap = tex(T.ringTexture(5)),
    canvasMap = tex(T.canvasTexture(6), { repeat: true }),
    canvasDark = tex(T.canvasTexture(6, true), { repeat: true }),
    plankMap = tex(T.plankTexture(7), { repeat: true });
  const leafMat = lit({ map: leafMap, vertexColors: true }),
    pineMat = lit({ map: needleMap, vertexColors: true }),
    rockMat = lit({ map: rockMap, vertexColors: true }),
    ringMat = lit({ map: ringMap, emissive: 0.02 }),
    tentMat = lit({ map: canvasMap, emissive: 0.03 }),
    plankMat = lit({ map: plankMap });

  // ── Деревья: 4 семейства × 5 вариантов, по 2 InstancedMesh (ствол, крона) ──
  const variants = new Map(); // "FAMILY:i" → { trunk, crown, items: [{x,z,rot,scale}] }
  for (const [name, f] of Object.entries(TREE_FAMILIES)) for (let i = 0; i < 5; i++) variants.set(`${name}:${i}`, { family: name, index: i, pine: f.pine, items: [] });
  for (const t of world.trees) {
    const v = variants.get(`${t.spr.family}:${t.spr.index}`);
    if (!v) continue;
    const h = hash2(Math.round(t.x), Math.round(t.y), 41);
    // Ствол стоит в центре коллайдера (x, y − 4), поворот и масштаб — от координат.
    v.items.push({ x: t.x, z: t.y - 4, rot: h * 6.283, scale: 0.94 + hash2(Math.round(t.y), Math.round(t.x), 42) * 0.12 });
  }
  for (const v of variants.values()) {
    const built = buildTree(v.family, v.index);
    v.height = built.height;
    const n = Math.max(1, v.items.length);
    v.trunkGeo = track(built.trunk);
    v.crownGeo = track(built.crown);
    v.trunk = new THREE.InstancedMesh(v.trunkGeo, barkMats[v.index % 2], n);
    v.crown = new THREE.InstancedMesh(v.crownGeo, v.pine ? pineMat : leafMat, n);
    for (const m of [v.trunk, v.crown]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      add(m);
    }
  }
  let cullX = 1e9,
    cullZ = 1e9,
    cullR = 0;
  function cullTrees(cx, cz, radius) {
    // Пересборка списков — только когда камера заметно сместилась.
    if (Math.abs(cx - cullX) < 28 && Math.abs(cz - cullZ) < 28 && radius === cullR) return;
    cullX = cx;
    cullZ = cz;
    cullR = radius;
    const r2 = (radius + 60) ** 2;
    for (const v of variants.values()) {
      let n = 0;
      for (const it of v.items) {
        const dx = it.x - cx,
          dz = it.z - cz;
        if (dx * dx + dz * dz > r2) continue;
        dummy.position.set(it.x, 0, it.z);
        dummy.rotation.set(0, it.rot, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        v.trunk.setMatrixAt(n, dummy.matrix);
        v.crown.setMatrixAt(n, dummy.matrix);
        n++;
      }
      v.trunk.count = v.crown.count = n;
      v.trunk.instanceMatrix.needsUpdate = v.crown.instanceMatrix.needsUpdate = true;
    }
  }

  // ── Кусты: те же точки, что были запечены в землю вида сверху ──
  const bushMeshes = [0, 1, 2].map((variant) => {
    const spots = BUSH_SPOTS.filter((b) => b.variant === variant);
    const m = new THREE.InstancedMesh(track(buildBush(variant)), lit({ map: leafMap, vertexColors: true }), Math.max(1, spots.length));
    spots.forEach((b, i) => {
      dummy.position.set((b.x + b.w / 2) * K, 0, (b.y + b.h - 2) * K);
      dummy.rotation.set(0, hash2(b.x, b.y, 43) * 6.283, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.frustumCulled = false;
    return add(m);
  });

  // ── Реквизит из описания мира ──
  const stumpBuilt = buildStump();
  const stumpBark = track(stumpBuilt.bark),
    stumpCap = track(stumpBuilt.cap);
  const rockGeos = [0, 1, 2].map((i) => track(buildRock(i)));
  const stumps = [],
    rocks = [[], [], []];
  let crate = null;
  const logMeshes = [];
  for (const p of world.props) {
    const f = p.s.family;
    if (f === "STUMP") stumps.push({ x: p.x, z: p.y - 6 });
    else if (f === "ROCKS") rocks[p.s.index].push({ x: p.x, z: p.y - 6, rot: hash2(Math.round(p.x), Math.round(p.y), 44) * 6.283 });
    else if (f === "LOG") {
      const len = p.s.len * K,
        { bark, caps } = buildLog(len),
        m = add(new THREE.Mesh(track(bark), barkMats[1])),
        c = add(new THREE.Mesh(track(caps), ringMat));
      for (const o of [m, c]) o.position.set(p.x, 10.5, p.y - 4);
      logMeshes.push(m, c);
    } else if (f === "TENT") {
      const tent = buildTent();
      const g = new THREE.Group();
      // Вход обращён к костру: от палатки (CX−180, CY−150) к (CX, CY+20).
      g.position.set(p.x, 0, p.y - 20);
      g.rotation.y = Math.atan2(180, 170);
      const canvasMesh = new THREE.Mesh(track(tent.canvas), tentMat),
        inside = new THREE.Mesh(track(tent.inside), lit({ map: canvasDark, tint: "#3a3a44" })),
        poles = new THREE.Mesh(track(tent.poles), barkMats[0]),
        stakes = new THREE.Mesh(track(tent.stakes), barkMats[0]),
        bedroll = new THREE.Mesh(track(tent.bedroll), lit({ map: canvasDark, tint: "#6a4a3a" })),
        pennant = new THREE.Mesh(track(tent.pennant), lit({ map: tex(T.canvasTexture(9), { repeat: true }), tint: "#ff5a48", emissive: 0.35 }));
      g.add(canvasMesh, inside, poles, stakes, bedroll, pennant);
      add(g);
    } else if (f === "CRATE") crate = { x: p.x, z: p.y - 5 };
  }
  // Пни и камни — по InstancedMesh на вид.
  {
    const sm = new THREE.InstancedMesh(stumpBark, barkMats[0], Math.max(1, stumps.length)),
      sc = new THREE.InstancedMesh(stumpCap, ringMat, Math.max(1, stumps.length));
    stumps.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, hash2(Math.round(s.x), Math.round(s.z), 45) * 6.283, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      sm.setMatrixAt(i, dummy.matrix);
      sc.setMatrixAt(i, dummy.matrix);
    });
    sm.count = sc.count = stumps.length;
    sm.frustumCulled = sc.frustumCulled = false;
    add(sm);
    add(sc);
    rocks.forEach((list, k) => {
      const m = new THREE.InstancedMesh(rockGeos[k], rockMat, Math.max(1, list.length));
      list.forEach((r, i) => {
        dummy.position.set(r.x, 0, r.z);
        dummy.rotation.set(0, r.rot, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.count = list.length;
      m.frustumCulled = false;
      add(m);
    });
  }
  if (crate) {
    const c = buildCrate(),
      g = new THREE.Group(),
      solid = (hex) => tex(paintSolid(hex), { mips: false });
    g.position.set(crate.x, 0, crate.z);
    g.add(
      new THREE.Mesh(track(c.box), plankMat),
      new THREE.Mesh(track(c.posts), lit({ map: plankMap, tint: "#8a6a4a" })),
      new THREE.Mesh(track(c.carrots), lit({ map: solid(["#ee7a22", "#ffb04a", "#a8450f"]) })),
      new THREE.Mesh(track(c.tops), lit({ map: solid(["#4f9a2a", "#8fd24e", "#2e5a1a"]) })),
      new THREE.Mesh(track(c.cabbage), lit({ map: solid(["#5a9a34", "#8fd24e", "#2e5a1a", "#b4dc78"]), vertexColors: false })),
      new THREE.Mesh(track(c.onions), lit({ map: solid(["#d9a35e", "#f6e2b4", "#8a5a24"]) })),
    );
    add(g);
  }
  // Старое кострище у палатки (кольцо камней поверх тёмного пятна на земле).
  {
    const pit = add(new THREE.Mesh(track(buildFirePit()), rockMat));
    pit.position.set(CX - 110, 0, CY - 20);
  }

  // ── Костёр и котёл игрока (для меню, вступления и конца забега) ──
  const potGroup = new THREE.Group();
  add(potGroup);
  const potBuilt = buildPotModel();
  const ironMap = tex(paintIron(), { repeat: true });
  const soupMap = tex(paintSoup(), { repeat: true, mips: false });
  potGroup.add(
    new THREE.Mesh(track(potBuilt.iron), lit({ map: ironMap })),
    new THREE.Mesh(track(potBuilt.wood), barkMats[0]),
    new THREE.Mesh(track(buildFireLogs()), barkMats[1]),
  );
  const soup = new THREE.Mesh(track(potBuilt.soup), lit({ map: soupMap, emissive: 0.9 }));
  potGroup.add(soup);
  // Пламя: четыре пары скрещённых плоскостей с анимацией кадров (в шейдере — через offset).
  const flameTex = tex(flameSheet(), { mips: false });
  flameTex.repeat.set(0.25, 1);
  const flameMat = track(new THREE.MeshBasicMaterial({ map: flameTex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, fog: false }));
  const flameGeo = track(new THREE.PlaneGeometry(1, 1));
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2,
      s = i % 2 ? 22 : 30,
      m = new THREE.Mesh(flameGeo, flameMat);
    m.position.set(Math.cos(a) * 9, s * 0.5 + 4, Math.sin(a) * 9);
    m.scale.set(s * 0.75, s, 1);
    m.userData = { a, s };
    potGroup.add(m);
    flames.push(m);
  }

  // ── Трава: крестообразные плоскости вокруг камеры, раскладка по хэшу ячеек ──
  const grassGeo = track(
    (() => {
      const a = new THREE.PlaneGeometry(1, 1),
        b = new THREE.PlaneGeometry(1, 1);
      b.rotateY(Math.PI / 2);
      const pos = [...a.attributes.position.array, ...b.attributes.position.array],
        uv = [...a.attributes.uv.array, ...b.attributes.uv.array],
        nor = [...a.attributes.normal.array, ...b.attributes.normal.array],
        idx = [...a.index.array, ...[...b.index.array].map((i) => i + 4)];
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor.map(() => 0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setIndex(idx);
      g.translate(0, 0.5, 0);
      a.dispose();
      b.dispose();
      return g;
    })(),
  );
  const GRASS_CELL = 44,
    GRASS_MAX = 900;
  const grass = new THREE.InstancedMesh(grassGeo, lit({ map: tex(T.grassTexture(8), { mips: false }), alphaTest: 0.5, tint: "#c8d8c0" }), GRASS_MAX);
  grass.frustumCulled = false;
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.count = 0;
  add(grass);
  let gcx = 1e9,
    gcz = 1e9,
    gRad = 0;
  function updateGrass(cx, cz, radius) {
    const ci = Math.floor(cx / GRASS_CELL),
      cj = Math.floor(cz / GRASS_CELL);
    if (ci === gcx && cj === gcz && radius === gRad) return;
    gcx = ci;
    gcz = cj;
    gRad = radius;
    const span = Math.ceil(radius / GRASS_CELL);
    let n = 0;
    for (let j = cj - span; j <= cj + span && n < GRASS_MAX; j++)
      for (let i = ci - span; i <= ci + span && n < GRASS_MAX; i++) {
        const cnt = hash2(i, j, 51) < 0.55 ? 2 : 1;
        for (let k = 0; k < cnt; k++) {
          const x = (i + hash2(i, j, 52 + k)) * GRASS_CELL,
            z = (j + hash2(i, j, 54 + k)) * GRASS_CELL;
          if ((x - cx) ** 2 + (z - cz) ** 2 > radius * radius) continue;
          if (x < 40 || z < 40 || x > WORLD.w - 40 || z > WORLD.h - 40) continue;
          const s = 6 + hash2(i, j, 56 + k) * 7;
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0, hash2(i, j, 58 + k) * 6.283, 0);
          dummy.scale.set(s * 1.3, s, s * 1.3);
          dummy.updateMatrix();
          grass.setMatrixAt(n++, dummy.matrix);
        }
      }
    grass.count = n;
    grass.instanceMatrix.needsUpdate = true;
  }

  return {
    cullTrees,
    updateGrass,
    // Купол неба следует за камерой.
    followCamera: (x, y, z) => sky.position.set(x, y, z),
    // Внешний вид котла с костром: только меню/вступление/конец забега.
    setPot(visible, x, z, time, { fire = true } = {}) {
      potGroup.visible = visible;
      if (!visible) return;
      potGroup.position.set(x, 0, z);
      soupMap.offset.set((time * 0.02) % 1, (time * 0.013) % 1);
      flameTex.offset.x = (Math.floor(time * 10) % 4) * 0.25; // кадр общий, формы и повороты разные
      for (const m of flames) {
        m.visible = fire;
        m.rotation.y = m.userData.a;
      }
    },
    flames,
    world,
    stats: () => ({ trees: [...variants.values()].reduce((n, v) => n + v.trunk.count, 0) }),
  };
}

function paintSolid(colors) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d");
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      g.fillStyle = colors[Math.floor(hash2(x, y, 61) * colors.length * 0.999)];
      g.fillRect(x, y, 1, 1);
    }
  return c;
}
function paintIron() {
  // Литое железо: спокойные полосы вдоль обода, клёпки рядами, лёгкая зернистость.
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d"),
    cols = ["#14141a", "#1e1e26", "#2a2a34", "#383846"];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const band = y % 16 < 3 ? 0.7 : 0.3,
        rivet = x % 8 === 3 && (y % 16 === 1 || y % 16 === 8),
        n = hash2(x, y, 62) * 0.35 + band * 0.55 + Math.sin(x * 0.4) * 0.05;
      g.fillStyle = rivet ? "#5a5a6c" : cols[Math.min(3, Math.floor(n * 3.2))];
      g.fillRect(x, y, 1, 1);
    }
  return c;
}
function paintSoup() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d"),
    cols = ["#8a2e10", "#c24e1c", "#e07b2f", "#f5a64a", "#ffd08a"];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const n = hash2(x >> 2, y >> 2, 63) * 0.6 + hash2(x, y, 64) * 0.3;
      g.fillStyle = cols[Math.min(4, Math.floor(n * 5))];
      g.fillRect(x, y, 1, 1);
    }
  return c;
}
