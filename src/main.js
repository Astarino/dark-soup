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
ui = createUI(
  game,
  input,
  translator,
  preferences,
  () => {
    lastTime = performance.now();
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
);
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  const size = viewport.worldSize();
  game.setViewport(size.width, size.height);
  game.step(dt, game.state === "play" ? input.vector() : undefined);
  const snapshot = game.snapshot();
  ui.sync(snapshot);
  render(snapshot, viewport.snapshot(), input.snapshot());
  audio.update(snapshot, game.takeSounds());
  requestAnimationFrame(frame);
}
if (document.fonts?.load) document.fonts.load(`8px ${PFONT}`).catch(() => {});
requestAnimationFrame(frame);
// Explicit opt-in diagnostics; no mutable entity references or gameplay cheats.
if (new URLSearchParams(location.search).has("debug"))
  window.__game = Object.freeze({ snapshot: game.snapshot });
