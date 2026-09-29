import * as THREE from "./three.js";
import { FP } from "../data/first-person.js";
import { mulberry32 } from "../shared/math.js";
import { createTracker } from "./geometry-kit.js";
import { createMaterials, LIGHTING } from "./materials.js";
import { createWorldScene, createTextureFactory } from "./world-scene.js";
import { createDecalBatch } from "./decal-batch.js";
import { createParticles } from "./particles.js";
import { createEnemyRenderer, prepareSprites } from "./enemies-fp.js";
import { createEffects } from "./effects-fp.js";
import { createHud } from "./hud-fp.js";
import { playerCamera, menuCamera, blendCamera, fovForAspect, internalSize, drawDistance } from "./camera.js";

// Рендер от первого лица. Читает тот же снимок игры, что и вид сверху, и ничего
// в игре не меняет. Всё, что нужно WebGL, создаётся в mount() и полностью
// освобождается в unmount(): повторные переключения не копят ресурсы.
// Дорогое и не зависящее от WebGL (запечённые спрайты существ) считается один раз.
const INTRO_TIME = 1.4; // как в core/game.js: пролёт камеры перед первой добавкой

export function createFirstPersonRenderer({ world, tr, settings }) {
  let s = { ...settings };
  let mounted = null,
    sheets = null;

  async function prepare(onProgress) {
    sheets = await prepareSprites(onProgress);
  }

  function mount(host, { onContextLost } = {}) {
    if (mounted) return mounted.api;
    if (!sheets) throw new Error("First-person sprites are not prepared");
    const glCanvas = document.createElement("canvas"),
      hudCanvas = document.createElement("canvas");
    glCanvas.id = "fpGL";
    hudCanvas.id = "fpHUD";
    for (const c of [glCanvas, hudCanvas]) c.style.cssText = "position:fixed;left:0;top:0;display:block;image-rendering:pixelated;image-rendering:crisp-edges;";
    hudCanvas.style.touchAction = "none";
    glCanvas.style.pointerEvents = "none";
    host.append(glCanvas, hudCanvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch (e) {
      glCanvas.remove();
      hudCanvas.remove();
      throw e;
    }
    renderer.info.autoReset = false; // суммарная статистика кадра: сцена + постобработка
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(LIGHTING.fog);
    let lost = false;
    const onLost = (e) => {
      e.preventDefault();
      lost = true;
      onContextLost?.();
    };
    glCanvas.addEventListener("webglcontextlost", onLost);

    const tracker = createTracker();
    const tex = createTextureFactory(tracker);
    const materials = createMaterials(tracker);
    const scene = new THREE.Scene();
    const rng = mulberry32((Date.now() ^ 0x5eed) >>> 0);
    const worldScene = createWorldScene({ scene, tracker, materials, world, maxAnisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
    const decals = createDecalBatch(tracker, tracker.track(materials.decal()), 1600);
    scene.add(decals.mesh);
    const particles = createParticles(tracker, tracker.track(materials.particle()), 700, rng);
    scene.add(particles.mesh);
    const enemyRenderer = createEnemyRenderer({ scene, tracker, materials, sheets, decals, tex });
    const effects = createEffects({ scene, tracker, materials, tex, decals, particles, rng });
    const camera = new THREE.PerspectiveCamera(70, 1, FP.near, FP.far);
    camera.rotation.order = "YXZ";
    const hudCtx = hudCanvas.getContext("2d");
    const hud = createHud(hudCtx, tr);

    let rt = null,
      postScene = null,
      postCam = null,
      postMat = null,
      size = { w: 0, h: 0, px: 4 };
    let timings = { update: 0, submit: 0, hud: 0 };
    let swayPhase = 0,
      introT = 0,
      prevState = "menu",
      introFrom = null;
    function resize(view) {
      const next = internalSize(view, s.quality);
      if (next.w === size.w && next.h === size.h && next.px === size.px && rt) return;
      size = next;
      renderer.setSize(size.w, size.h, false);
      hudCanvas.width = size.w;
      hudCanvas.height = size.h;
      for (const c of [glCanvas, hudCanvas]) {
        c.style.width = (size.w * size.px) / view.DPR + "px";
        c.style.height = (size.h * size.px) / view.DPR + "px";
      }
      hudCtx.imageSmoothingEnabled = false;
      rt?.dispose();
      rt = new THREE.WebGLRenderTarget(size.w, size.h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
      if (!postScene) {
        postScene = new THREE.Scene();
        postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        postMat = materials.post(rt);
        const quad = new THREE.Mesh(tracker.track(new THREE.PlaneGeometry(2, 2)), postMat);
        quad.frustumCulled = false;
        postScene.add(quad);
      }
      postMat.uniforms.tScene.value = rt.texture;
      camera.aspect = size.w / size.h;
      camera.fov = fovForAspect(camera.aspect);
      camera.updateProjectionMatrix();
    }

    const U = materials.uniforms;
    function render(snapshot, frame) {
      if (lost) return null;
      renderer.info.reset();
      const { player, state, time } = snapshot,
        { look, dt, view, events = [] } = frame;
      resize(view);
      const far = drawDistance(s.quality);
      camera.far = far + 100;
      camera.updateProjectionMatrix();
      U.uFogNear.value = far * 0.26;
      U.uFogFar.value = far * 0.82;
      particles.setBudget(FP.quality[s.quality]?.particles ?? 1);
      const aspect = camera.aspect;
      let pose;
      const speed = Math.hypot(player.vx, player.vy),
        moving = speed > 20;
      if (moving && state === "play") swayPhase += dt * Math.min(1.2, speed / Math.max(1, player.speed));
      const inPlay = playerCamera(player, look, { swayPhase, sway: s.sway ? (moving ? 1 : 0.25) : 0, shake: s.sway ? snapshot.shake || 0 : 0, t: time });
      if (state === "menu") pose = menuCamera(time, aspect);
      else if (state === "intro") {
        if (prevState !== "intro") {
          introT = 0;
          introFrom = menuCamera(time, aspect);
        }
        introT += dt;
        pose = blendCamera(introFrom || menuCamera(time, aspect), inPlay, Math.min(1, introT / INTRO_TIME));
      } else pose = inPlay;
      prevState = state;
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, -pose.yaw - Math.PI / 2, pose.roll || 0);
      const flick = 1 + ((Math.floor(time * 9) % 3) - 1) * 0.03;
      U.uFirePos.value.set(player.x, 34, player.y);
      U.uFireRadius.value = LIGHTING.fireRadius * flick * (state === "over" ? 0.4 : 1);
      U.uFireOn.value = state === "over" ? 0.25 : 1;
      U.uTime.value = time;
      worldScene.cullTrees(pose.x, pose.z, far);
      worldScene.updateGrass(pose.x, pose.z, Math.min(300, far * 0.35));
      worldScene.followCamera(pose.x, pose.y, pose.z);
      // Котёл снаружи виден только в меню и в начале пролёта; дальше камера уже «в котле».
      const exterior = state === "menu" || (state === "intro" && introT / INTRO_TIME < 0.72);
      worldScene.setPot(exterior, player.x, player.y, time, { fire: true });
      // враги, способности, частицы
      const tA = performance.now();
      decals.begin();
      const halfFov = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
      // на паузе и в выборе улучшения анимации падения и частицы стоят вместе с игрой
      const simDt = state === "pause" || state === "levelup" ? 0 : dt;
      const einfo = enemyRenderer.update(snapshot, pose, simDt, { far, yaw: state === "play" ? pose.yaw : null, halfFov });
      effects.update(snapshot, simDt, events, { ...einfo, pose });
      decals.end();
      const tB = performance.now();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
      const tC = performance.now();
      hud.draw(snapshot, { ...frame, sway: s.sway }, { W: size.w, H: size.h, px: size.px });
      timings = { update: tB - tA, submit: tC - tB, hud: performance.now() - tC };
      return { pose, threats: einfo.threats };
    }

    function unmount() {
      if (!mounted) return null;
      glCanvas.removeEventListener("webglcontextlost", onLost);
      enemyRenderer.dispose();
      const before = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
      tracker.dispose();
      rt?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      glCanvas.remove();
      hudCanvas.remove();
      mounted = null;
      return before;
    }
    const api = {
      canvas: hudCanvas,
      render,
      unmount,
      get info() {
        return renderer.info;
      },
      get lost() {
        return lost;
      },
      size: () => size,
      // для лаборатории и отладки: части сцены, которые можно скрывать
      debug: { scene, decals, particles },
      stats: () => ({ timings, ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, particles: particles.count, decals: decals.count, ...worldScene.stats() }),
    };
    mounted = { api };
    return api;
  }
  return {
    prepare,
    mount,
    setSettings(next) {
      s = { ...s, ...next };
    },
    get mounted() {
      return !!mounted;
    },
  };
}
