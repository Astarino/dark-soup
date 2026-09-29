import { createGame } from "./core/game.js";
import { createWorld } from "./world/world.js";
import { createPreferences } from "./storage/preferences.js";
import { createTranslator } from "./data/translations.js";
import { createInput } from "./input/browser-input.js";
import { createViewport } from "./render/viewport.js";
import { createRenderer } from "./render/renderer.js";
import { createUI } from "./ui/screens.js";
import { PFONT } from "./render/style.js";
import { createAudio } from "./audio/audio.js";
import { createStatsStore } from "./storage/stats.js";
import { createFirstPersonInput } from "./input/fp-input.js";
import { createViewController } from "./view-controller.js";
import { VIEWS } from "./data/view-mode.js";

const canvas = document.getElementById("game");
let storage;
try {
  storage = localStorage;
} catch {} // Access itself may throw in private/sandboxed contexts.
const preferences = createPreferences(storage);
const translator = createTranslator(preferences.language());
const world = createWorld();
const game = createGame(world, { translate: translator.tr });
const viewport = createViewport(canvas);
const render = createRenderer(canvas, world, translator.tr);
const audio = createAudio({ enabled: preferences.sound(), volumes: preferences.volumes() });
const statsStore = createStatsStore(storage);
// Браузер разрешает звук только после жеста игрока.
for (const type of ["pointerdown", "keydown", "touchend"])
  addEventListener(type, audio.unlock, { passive: true });
let ui,
  lastTime = performance.now();
const input = createInput(canvas, {
  onKey: (code) => ui.handleKey(code),
  onHidden: () => ui.pause(),
});
// Второй вид — от первого лица: отдельный рендер той же симуляции. Он грузится
// лениво (Three.js — только для тех, кто его включил) и целиком выгружается при
// возврате к виду сверху.
const fpInput = createFirstPersonInput({ base: input, getSettings: () => views.fpSettings() });
const views = createViewController({
  preferences,
  host: document.body,
  input,
  firstPersonInput: fpInput,
  getState: () => game.state,
  reducedMotion: !!matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  top: {
    show: () => (canvas.style.display = "block"),
    hide: () => (canvas.style.display = "none"),
    render: (snapshot, ctx) => render(snapshot, ctx.view, input.snapshot()),
  },
  loadFirstPerson: () =>
    import("./render3d/fp-renderer.js").then((m) => ({
      create: async (settings) => {
        const renderer = m.createFirstPersonRenderer({ world, tr: translator.tr, settings });
        await renderer.prepare?.();
        return renderer;
      },
    })),
  onChange: (mode, { failed }) => {
    input.releaseKeys();
    if (failed) ui.pause();
  },
});
// Захват мыши потерян (Esc или браузер): игра встаёт на паузу.
views.onLockLost(() => {
  if (game.state === "play") ui.pause();
});
ui = createUI(
  game,
  { clearPointer: () => views.clearPointer() },
  translator,
  preferences,
  () => {
    lastTime = performance.now();
    views.requestLock(); // вызывается из клика «продолжить»/выбора — жест пользователя есть
  },
  {
    enabled: () => audio.enabled,
    set: (on) => {
      audio.setEnabled(on);
      preferences.saveSound(on);
    },
    volumes: () => audio.volumes,
    setVolumes: (v) => audio.setVolumes(v),
    preview: (category) => audio.preview(category),
  },
  statsStore,
  {
    current: () => views.mode,
    toggle: () => views.toggle(),
    fp: () => views.fpSettings(),
    setFp: (patch) => views.setFpSettings(patch),
  },
);
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  const size = viewport.worldSize();
  game.setViewport(size.width, size.height);
  game.step(dt, game.state === "play" ? views.moveVector(dt) : undefined);
  const snapshot = game.snapshot();
  ui.sync(snapshot);
  const sounds = game.takeSounds();
  let frameInfo = null;
  try {
    frameInfo = views.render(snapshot, { dt, view: viewport.snapshot(), events: sounds });
  } catch (error) {
    console.error(error);
  }
  audio.update(snapshot, sounds, views.listenerYaw());
  if (game.state === "play" && frameInfo?.threats) audio.threatCues(frameInfo.threats);
  requestAnimationFrame(frame);
}
if (document.fonts?.load) document.fonts.load(`8px ${PFONT}`).catch(() => {});
// Игра стартует сразу видом сверху; сохранённый вид от первого лица подключается,
// когда готов (лениво загружается Three.js и запекаются спрайты).
requestAnimationFrame(frame);
views.init();
// Explicit opt-in diagnostics; no mutable entity references or gameplay cheats.
if (new URLSearchParams(location.search).has("debug"))
  window.__game = Object.freeze({ snapshot: game.snapshot, view: () => views.mode, renderer: () => views.renderer, look: (yaw, pitch = 0) => (yaw === undefined ? { ...fpInput.look } : fpInput.setLook(yaw, pitch)) });
