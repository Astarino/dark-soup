import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/core/game.js";
import { createStatsStore } from "../src/storage/stats.js";
import { createPreferences } from "../src/storage/preferences.js";
import { createViewController } from "../src/view-controller.js";
import { createFirstPersonInput } from "../src/input/fp-input.js";
import { VIEWS, DEFAULT_VIEW, VIEW_CODE, normalizeView, toggledView, isViewCode, normalizeFpSettings } from "../src/data/view-mode.js";
import { moveRelativeToView, applyLook, angleDiff, bearingTo, spriteDirection, PITCH_LIMIT, lookVector, rightVector } from "../src/shared/view-math.js";
import { playerCamera, fovForAspect, internalSize, blendCamera } from "../src/render3d/camera.js";
import { FP } from "../src/data/first-person.js";
import { bakeFrame } from "../src/render3d/puppet.js";
import { creatureParts, bakeCreature, CLIPS } from "../src/render3d/creatures.js";
import { wardenParts } from "../src/render3d/warden-puppet.js";

const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, String(v)) };
};
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) < eps, msg ?? `${a} ≈ ${b}`);

test("hidden view switch: code 1234 only, top view is the default", () => {
  assert.equal(VIEW_CODE, "1234");
  assert.equal(DEFAULT_VIEW, VIEWS.top);
  for (const ok of ["1234", " 1234 ", "1234\n"]) assert.ok(isViewCode(ok), JSON.stringify(ok));
  for (const bad of ["", "123", "12345", "1 234", "abcd", null, undefined, "0000"]) assert.ok(!isViewCode(bad), JSON.stringify(bad));
  assert.equal(toggledView(VIEWS.top), VIEWS.first);
  assert.equal(toggledView(VIEWS.first), VIEWS.top);
  for (const junk of [null, undefined, "", "fp", 3, "TOP", {}]) assert.equal(normalizeView(junk), VIEWS.top);
  assert.equal(normalizeView(VIEWS.first), VIEWS.first);
});

test("view and look settings are stored separately and survive garbage", () => {
  const store = memory(),
    prefs = createPreferences(store);
  assert.equal(normalizeView(prefs.view()), VIEWS.top, "no saved value → top view");
  prefs.saveBest(123);
  prefs.saveLanguage("en");
  store.setItem("dark_soup_stats", '{"version":1,"runs":4}');
  const before = new Map(store.map);
  prefs.saveView(VIEWS.first);
  prefs.saveFirstPerson({ sensitivity: 2, sway: false, quality: "low" });
  for (const [k, v] of before) assert.equal(store.map.get(k), v, `${k} untouched`);
  assert.equal(normalizeView(prefs.view()), VIEWS.first);
  assert.deepEqual(normalizeFpSettings(prefs.firstPerson()), { sensitivity: 2, sway: false, quality: "low" });
  store.setItem("dark_soup_fp", "{not json");
  assert.deepEqual(normalizeFpSettings(prefs.firstPerson()), { sensitivity: 1, sway: true, quality: "high" });
  assert.deepEqual(normalizeFpSettings({ sensitivity: 99, sway: "x", quality: "ultra" }), { sensitivity: 3, sway: true, quality: "high" });
  assert.equal(normalizeFpSettings({ sensitivity: 0 }).sensitivity, 0.2);
  // недоступное хранилище не ломает чтение
  const broken = createPreferences({ getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } });
  assert.equal(normalizeView(broken.view()), VIEWS.top);
  broken.saveView(VIEWS.first);
});

test("movement is relative to the look direction", () => {
  const W = { x: 0, y: -1 }, S = { x: 0, y: 1 }, D = { x: 1, y: 0 }, A = { x: -1, y: 0 };
  const cases = [
    // взгляд на север (y −1): W — на север, D — на восток
    [-Math.PI / 2, W, { x: 0, y: -1 }],
    [-Math.PI / 2, D, { x: 1, y: 0 }],
    [-Math.PI / 2, A, { x: -1, y: 0 }],
    [-Math.PI / 2, S, { x: 0, y: 1 }],
    // взгляд на восток: W — на восток, D (вправо) — на юг
    [0, W, { x: 1, y: 0 }],
    [0, D, { x: 0, y: 1 }],
    [0, S, { x: -1, y: 0 }],
    // взгляд на юг: W — на юг, D — на запад
    [Math.PI / 2, W, { x: 0, y: 1 }],
    [Math.PI / 2, D, { x: -1, y: 0 }],
    // взгляд на запад: A (влево) — на юг
    [Math.PI, A, { x: 0, y: 1 }],
  ];
  for (const [yaw, input, want] of cases) {
    const got = moveRelativeToView(input, yaw);
    near(got.x, want.x, 1e-9, `yaw ${yaw} input ${JSON.stringify(input)} → x ${got.x}`);
    near(got.y, want.y, 1e-9, `yaw ${yaw} input ${JSON.stringify(input)} → y ${got.y}`);
  }
  // диагональ и разворот не ускоряют, отсутствие ввода — нулевой вектор
  for (let yaw = -3; yaw <= 3; yaw += 0.7) {
    const v = moveRelativeToView({ x: 1, y: -1 }, yaw);
    assert.ok(Math.hypot(v.x, v.y) <= 1 + 1e-9);
    assert.deepEqual(moveRelativeToView({ x: 0, y: 0 }, yaw), { x: 0, y: 0 });
    const f = lookVector(yaw), r = rightVector(yaw);
    near(f.x * r.x + f.y * r.y, 0, 1e-9, "forward ⟂ right");
  }
  // половина отклонения джойстика — половина скорости
  const half = moveRelativeToView({ x: 0, y: -0.5 }, 0);
  near(Math.hypot(half.x, half.y), 0.5);
});

test("game movement follows the view: same input, different yaw → different world direction", () => {
  const run = (yaw) => {
    const g = createGame();
    g.setViewport(1200, 800);
    g.start();
    g.choose(0);
    const start = g.snapshot().player;
    for (let i = 0; i < 40; i++) g.step(1 / 60, moveRelativeToView({ x: 0, y: -1 }, yaw)); // W
    const end = g.snapshot().player;
    return { dx: end.x - start.x, dy: end.y - start.y };
  };
  const east = run(0), north = run(-Math.PI / 2);
  assert.ok(east.dx > 50 && Math.abs(east.dy) < 1e-6, JSON.stringify(east));
  assert.ok(north.dy < -50 && Math.abs(north.dx) < 1e-6, JSON.stringify(north));
});

test("look: yaw wraps, pitch is clamped, mouse down looks down", () => {
  let look = { yaw: 0, pitch: 0 };
  look = applyLook(look, 10, 0, 0.1);
  near(look.yaw, 1);
  look = applyLook({ yaw: 6.2, pitch: 0 }, 1, 0, 0.5);
  assert.ok(look.yaw >= 0 && look.yaw < 2 * Math.PI);
  look = applyLook({ yaw: 0, pitch: 0 }, 0, 5, 1);
  assert.ok(look.pitch < 0, "dy > 0 (mouse down) → look down");
  look = applyLook({ yaw: 0, pitch: 0 }, 0, -100, 1);
  assert.equal(look.pitch, PITCH_LIMIT);
  look = applyLook({ yaw: 0, pitch: 0 }, 0, 100, 1);
  assert.equal(look.pitch, -PITCH_LIMIT);
  near(angleDiff(0.1, 2 * Math.PI - 0.1), 0.2);
  near(angleDiff(-3, 3), 2 * Math.PI - 6);
  const b = bearingTo({ x: 0, y: 0 }, -Math.PI / 2, 10, -10);
  assert.ok(b.bearing > 0 && b.bearing < Math.PI / 2, "north-east of a north-facing viewer is on the right");
  const behind = bearingTo({ x: 0, y: 0 }, -Math.PI / 2, 0, 10);
  assert.ok(Math.abs(behind.bearing) > Math.PI - 1e-9, "directly behind");
});

test("creature sprite direction: facing the camera, side and away", () => {
  // камера на севере от существа: cam.y < e.y
  const e = { x: 0, y: 0 }, cam = { x: 0, y: -100 };
  const toward = Math.atan2(cam.y - e.y, cam.x - e.x); // существо смотрит на камеру
  assert.equal(spriteDirection(toward, e.x, e.y, cam.x, cam.y), 0, "looking at the camera → front");
  assert.equal(spriteDirection(toward + Math.PI, e.x, e.y, cam.x, cam.y), 4, "walking away → back");
  // существо смотрит на восток, камера на севере: камера у его левого бока (спрайт 2)
  assert.equal(spriteDirection(toward + Math.PI / 2, e.x, e.y, cam.x, cam.y), 2);
  assert.equal(spriteDirection(toward - Math.PI / 2, e.x, e.y, cam.x, cam.y), 6);
  for (let a = -7; a < 7; a += 0.31) {
    const d = spriteDirection(a, 3, 4, -10, 20);
    assert.ok(Number.isInteger(d) && d >= 0 && d < 8);
  }
});

test("first-person camera pose, field of view and pixel grid", () => {
  const player = { x: 1000, y: 2000 };
  const pose = playerCamera(player, { yaw: 0, pitch: 0.1 });
  near(pose.x, 1000 - FP.camBack);
  near(pose.z, 2000);
  assert.ok(pose.y > 55 && pose.y < 90, "eyes just above the cauldron rim");
  const north = playerCamera(player, { yaw: -Math.PI / 2, pitch: 0 });
  near(north.z, 2000 + FP.camBack, 1e-9);
  // тряска и покачивание ограничены и не вращают взгляд
  const shaken = playerCamera(player, { yaw: 1, pitch: 0.2 }, { swayPhase: 1.3, sway: 1, shake: 8, t: 3 });
  assert.equal(shaken.yaw, 1);
  assert.equal(shaken.pitch, 0.2);
  assert.ok(Math.hypot(shaken.x - playerCamera(player, { yaw: 1, pitch: 0 }).x, shaken.z - playerCamera(player, { yaw: 1, pitch: 0 }).z) < 2, "shake stays under 2 world units");
  const off = playerCamera(player, { yaw: 0, pitch: 0 }, { swayPhase: 1.3, sway: 0, shake: 0, t: 3 });
  near(off.y, FP.eyeHeight, 1e-9, "sway off → steady height");
  for (const aspect of [0.46, 0.75, 1, 1.6, 2, 2.4]) {
    const fov = fovForAspect(aspect);
    assert.ok(fov >= FP.vfovMin && fov <= FP.vfovMax);
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * (180 / Math.PI);
    if (aspect >= 1.6) assert.ok(hfov < 95, `no fish-eye on wide screens: ${hfov}`);
  }
  for (const quality of ["high", "medium", "low"]) {
    const s = internalSize({ W: 1280, H: 800, DPR: 2, PX: 6 }, quality);
    assert.ok(Number.isInteger(s.px) && s.px >= 6, "integer pixel scale");
    assert.equal(s.w, Math.ceil((1280 * 2) / s.px));
  }
  const mid = blendCamera({ x: 0, y: 0, z: 0, yaw: 3, pitch: 0 }, { x: 10, y: 10, z: 10, yaw: -3, pitch: 0.2 }, 0.5);
  near(mid.x, 5);
  assert.ok(Math.abs(angleDiff(mid.yaw, Math.PI)) < 0.2, "yaw blends along the short arc");
});

test("first-person input: keys turn the view, vector is relative, one keyboard owner", () => {
  const keys = new Set();
  const base = { isDown: (c) => keys.has(c), vector: ({ arrows = true } = {}) => ({ x: keys.has("KeyD") - keys.has("KeyA"), y: keys.has("KeyS") - keys.has("KeyW") + (arrows ? 0 : 0) }) };
  const input = createFirstPersonInput({ base, getSettings: () => ({ sensitivity: 1 }) });
  input.setLook(0, 0);
  keys.add("KeyW");
  let v = input.vector();
  near(v.x, 1);
  near(v.y, 0);
  keys.delete("KeyW");
  keys.add("KeyE");
  input.update(0.5);
  assert.ok(input.look.yaw > 1, "E turns right");
  keys.delete("KeyE");
  keys.add("KeyQ");
  input.update(0.5);
  near(input.look.yaw, 0, 1e-9);
  keys.delete("KeyQ");
  keys.add("ArrowUp");
  input.update(0.4);
  assert.ok(input.look.pitch > 0, "arrow up looks up");
  const st = input.state();
  assert.equal(st.locked, false);
  input.detach(); // без attach — безопасно
});

// ── Переключатель видов ──
function harness({ stored, failLoad = false } = {}) {
  const store = memory();
  if (stored) store.setItem("dark_soup_view", stored);
  const prefs = createPreferences(store);
  const c = { mounts: 0, unmounts: 0, attaches: 0, detaches: 0, shows: 0, hides: 0, loads: 0, creates: 0, rendered: [], topRendered: 0, locks: 0, releases: 0 };
  let mountedCount = 0;
  const renderer = {
    setSettings() {},
    mount(host, { onContextLost }) {
      c.mounts++;
      mountedCount++;
      renderer.lose = onContextLost;
      return { canvas: {}, render: (snap) => (c.rendered.push(snap.time), { threats: [] }), unmount: () => (c.unmounts++, mountedCount--) };
    },
  };
  let state = "play",
    lockLost = () => {};
  const ctl = createViewController({
    preferences: prefs,
    host: {},
    input: { vector: () => ({ x: 0, y: -1 }), clearPointer() {} },
    firstPersonInput: {
      attach: (_, { onLockLost }) => (c.attaches++, (lockLost = onLockLost)),
      detach: () => c.detaches++,
      update() {},
      vector: () => ({ x: 1, y: 0 }),
      setLook() {},
      look: { yaw: 0, pitch: 0 },
      state: () => ({}),
      requestLock: () => c.locks++,
      releaseLock: () => c.releases++,
    },
    getState: () => state,
    top: { show: () => c.shows++, hide: () => c.hides++, render: () => c.topRendered++ },
    loadFirstPerson: async () => {
      c.loads++;
      if (failLoad) throw new Error("no webgl");
      return { create: async () => (c.creates++, renderer) };
    },
  });
  return { ctl, c, store, prefs, renderer, setState: (s) => (state = s), get mounted() { return mountedCount; }, lockLost: () => lockLost() };
}

test("the saved view is applied at start; without a saved value the top view is used", async () => {
  const a = harness();
  assert.equal(await a.ctl.init(), VIEWS.top);
  assert.equal(a.c.mounts, 0);
  assert.equal(a.c.loads, 0, "Three.js is not loaded for top-view players");
  const b = harness({ stored: "first" });
  assert.equal(await b.ctl.init(), VIEWS.first);
  assert.equal(b.c.mounts, 1);
  assert.equal(b.c.hides, 1);
});

test("repeated switching balances mount/unmount, input handlers and listeners", async () => {
  const h = harness();
  await h.ctl.init();
  for (let i = 0; i < 9; i++) {
    const r = await h.ctl.toggle();
    assert.equal(r.ok, true);
    assert.equal(h.ctl.mode, i % 2 === 0 ? VIEWS.first : VIEWS.top);
    assert.equal(h.mounted, i % 2 === 0 ? 1 : 0, "never more than one first-person renderer");
    assert.equal(h.c.attaches - h.c.detaches, i % 2 === 0 ? 1 : 0, "input handlers attached only while the view is on");
  }
  assert.equal(h.c.creates, 1, "the renderer object (baked sprites) is created once");
  assert.equal(h.c.mounts, 5);
  assert.equal(h.c.unmounts, 4);
  assert.equal(h.store.map.get("dark_soup_view"), "first");
  await h.ctl.toggle();
  assert.equal(h.store.map.get("dark_soup_view"), "top");
});

test("a failed switch keeps the previous view and does not save it", async () => {
  const h = harness({ failLoad: true });
  await h.ctl.init();
  const r = await h.ctl.toggle();
  assert.equal(r.ok, false);
  assert.equal(h.ctl.mode, VIEWS.top);
  assert.equal(h.store.map.get("dark_soup_view"), undefined);
  assert.equal(h.mounted, 0);
  assert.equal(h.c.hides, 0, "the top view stays visible");
  const startup = harness({ stored: "first", failLoad: true });
  assert.equal(await startup.ctl.init(), VIEWS.top, "saved first-person view falls back to top when it cannot start");
  assert.equal(startup.store.map.get("dark_soup_view"), "first", "the saved choice is not erased by a device failure");
});

test("a lost WebGL context returns to the top view and reports it", async () => {
  const h = harness();
  await h.ctl.toggle();
  assert.equal(h.ctl.mode, VIEWS.first);
  h.renderer.lose();
  assert.equal(h.ctl.mode, VIEWS.top);
  assert.equal(h.mounted, 0);
  assert.equal(h.c.shows, 1, "the top canvas is shown again");
  assert.equal(h.c.detaches, 1, "first-person input handlers are removed");
});

test("the view controller renders with the active renderer and moves relative to view", async () => {
  const h = harness();
  await h.ctl.init();
  assert.deepEqual(h.ctl.moveVector(0.016), { x: 0, y: -1 }, "top view: raw vector");
  h.ctl.render({ state: "play", time: 1 }, { dt: 0.016, view: {} });
  assert.equal(h.c.topRendered, 1);
  await h.ctl.toggle();
  assert.deepEqual(h.ctl.moveVector(0.016), { x: 1, y: 0 }, "first-person: view-relative vector");
  h.ctl.render({ state: "play", time: 2 }, { dt: 0.016, view: {} });
  assert.equal(h.c.topRendered, 1);
  assert.deepEqual(h.c.rendered, [2]);
  // курсор освобождается вне игры и запрашивается только во время игры
  h.ctl.render({ state: "pause", time: 2 }, { dt: 0, view: {} });
  h.ctl.render({ state: "levelup", time: 2, firstPick: false }, { dt: 0, view: {} });
  h.ctl.render({ state: "over", time: 2 }, { dt: 0, view: {} });
  assert.ok(h.c.releases >= 3);
  h.setState("pause");
  h.ctl.requestLock();
  assert.equal(h.c.locks, 0);
  h.setState("play");
  h.ctl.requestLock();
  assert.equal(h.c.locks, 1);
  let paused = 0;
  h.ctl.onLockLost(() => paused++);
  h.lockLost();
  assert.equal(paused, 1, "losing mouse capture is reported (the app pauses)");
});

test("switching the view never touches the run: state, time, position, enemies, stats and cooking count", async () => {
  const world = undefined;
  const g = createGame(world);
  g.setViewport(1200, 800);
  const store = createStatsStore(memory());
  g.start();
  g.choose(0);
  for (let i = 0; i < 600; i++) g.step(1 / 60, { x: Math.cos(i / 40), y: Math.sin(i / 40) });
  g.pause(true);
  const before = g.snapshot(),
    statsBefore = g.runStats();
  const h = harness();
  await h.ctl.init();
  // Контроллер не получает игру вовсе, поэтому повлиять на неё не может; проверяем это на деле.
  for (let i = 0; i < 6; i++) {
    await h.ctl.toggle();
    h.ctl.render(g.snapshot(), { dt: 0.016, view: {} });
    h.ctl.clearPointer();
  }
  assert.equal(g.state, "pause", "the game stays paused until an explicit resume");
  assert.deepEqual(g.snapshot(), before);
  assert.deepEqual(g.runStats(), statsBefore);
  // Готовка завершается ровно один раз — независимо от числа переключений.
  const finish = () => {
    const r = g.finishRun();
    if (r) store.recordRun(r);
    return r;
  };
  assert.ok(finish());
  assert.equal(finish(), null);
  g.toMenu();
  assert.equal(finish(), null);
  assert.equal(store.load().runs, 1);
});

test("both views feed the same simulation: facing north, first-person input equals top-view input", () => {
  // Взгляд на север совпадает с экраном вида сверху: те же векторы (с точностью до float).
  for (let i = 0; i <= 40; i++) {
    const v = { x: Math.cos(i), y: Math.sin(i * 1.7) },
      m = moveRelativeToView(v, -Math.PI / 2),
      len = Math.hypot(v.x, v.y),
      want = len > 1 ? { x: v.x / len, y: v.y / len } : v;
    near(m.x, want.x, 1e-12);
    near(m.y, want.y, 1e-12);
  }
  // и в игре: тот же путь котла на первых секундах (дальше хаос толпы усиливает float-шум)
  const play = (map) => {
    const g = createGame();
    g.setViewport(1200, 800);
    g.start();
    g.choose(0);
    for (let f = 0; f < 120; f++) g.step(1 / 60, map({ x: Math.cos(f / 30) * 0.7, y: -Math.abs(Math.sin(f / 50)) * 0.7 })); // ввод длиной ≤ 1, как у клавиатуры/джойстика
    return g.snapshot().player;
  };
  const top = play((v) => v),
    first = play((v) => moveRelativeToView(v, -Math.PI / 2));
  near(first.x, top.x, 1e-6);
  near(first.y, top.y, 1e-6);
});

// ── Существа-«куклы» ──
test("baked creature sprites: silhouette, feet on the ground, distinct directions", () => {
  const cell = [80, 76];
  const frame = (type, dir, clip = "walk", k = 0) => bakeFrame({ parts: creatureParts(type, clip, k), w: cell[0], h: cell[1], scale: 0.8, azimuth: (dir * Math.PI) / 4, anchorY: 3 });
  const bounds = (f) => {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++)
        if (f.data[(y * f.w + x) * 4 + 3]) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          n++;
        }
    return { x0, x1, y0, y1, n };
  };
  const front = frame("goblin", 0),
    back = frame("goblin", 4),
    side = frame("goblin", 2);
  const bf = bounds(front);
  assert.ok(bf.n > 500, "sprite is not empty");
  assert.ok(bf.y1 >= cell[1] - 6 && bf.y1 <= cell[1] - 1, `feet touch the bottom (${bf.y1})`);
  assert.ok(bf.x0 > 0 && bf.x1 < cell[0] - 1, "nothing is clipped at the sides");
  assert.ok(bf.y0 > 0, "nothing is clipped at the top");
  const px = (f, i) => [...f.data.slice(i * 4, i * 4 + 4)].join();
  let diff = 0;
  for (let i = 0; i < front.w * front.h; i++) if (px(front, i) !== px(back, i)) diff++;
  assert.ok(diff > 300, "the back view differs from the front view (no face on the back)");
  let diff2 = 0;
  for (let i = 0; i < front.w * front.h; i++) if (px(front, i) !== px(side, i)) diff2++;
  assert.ok(diff2 > 300);
  // детерминированность: те же входы — те же пиксели
  assert.deepEqual([...frame("goblin", 1).data], [...frame("goblin", 1).data]);
  // мёртвый гоблин лежит: ниже ростом, чем идущий
  const dead = bounds(frame("goblin", 2, "death", 3)),
    walk = bounds(side);
  assert.ok(dead.y1 - dead.y0 < (walk.y1 - walk.y0) * 0.7, "lying body is lower than a walking one");
  assert.ok(dead.y1 >= cell[1] - 7, "a fallen body rests on the ground");
  // у каждого типа врага есть все клипы
  for (const type of ["goblin", "runner", "brute"])
    for (const [clip, n] of Object.entries(CLIPS)) for (let k = 0; k < n; k++) assert.ok(creatureParts(type, clip, k).length > 20, `${type}/${clip}/${k}`);
  assert.ok(wardenParts("walk", 0).length > 40 && wardenParts("death", 3).length > 40);
});

test("full sprite sheet: 8 directions × every clip frame, with transparent margins", () => {
  const s = bakeCreature("runner");
  assert.equal(s.height, s.cell[1] * 8);
  assert.equal(s.width, s.cell[0] * Object.values(CLIPS).reduce((a, b) => a + b, 0));
  assert.equal(s.index.death.count, 4);
  let opaque = 0;
  for (let i = 3; i < s.data.length; i += 4) if (s.data[i]) opaque++;
  assert.ok(opaque > 10000);
  assert.ok(opaque < s.data.length / 4 / 2, "most of the sheet is transparent background");
});
