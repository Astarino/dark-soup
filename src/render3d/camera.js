import { FP } from "../data/first-person.js";
import { clamp, lerp } from "../shared/math.js";
import { lookVector } from "../shared/view-math.js";
import { CX, CY } from "../data/balance.js";
// Чистая математика камеры от первого лица (без Three.js): положение глаз
// относительно котла, покачивание, поле зрения под форму экрана и кинематографичные
// кадры для меню и вступления.

// Камера сидит на заднем краю котла, чуть выше обода, и смотрит по yaw/pitch.
// swayPhase/shake — необязательное мягкое покачивание и тряска.
export function playerCamera(player, look, { swayPhase = 0, sway = 0, shake = 0, t = 0 } = {}) {
  const f = lookVector(look.yaw);
  const bob = Math.sin(swayPhase * FP.bobFreq) * FP.bobAmp * sway;
  const roll = Math.sin(swayPhase * FP.bobFreq * 0.5) * FP.rollAmp * sway;
  // тряска ограничена и не поворачивает взгляд принудительно
  const sx = Math.sin(t * 71) * shake * FP.shakeScale,
    sy = Math.cos(t * 83) * shake * FP.shakeScale;
  return {
    x: player.x - f.x * FP.camBack + sx,
    z: player.y - f.y * FP.camBack + sy,
    y: FP.eyeHeight + bob + Math.abs(sy) * 0.5,
    yaw: look.yaw,
    pitch: look.pitch,
    roll,
  };
}
// Вертикальное поле зрения: около 82° по горизонтали на широком экране, без
// сильного «рыбьего глаза»; на узком (телефон, портрет) вертикаль ограничена.
export function fovForAspect(aspect) {
  const hfov = (FP.hfovTarget * Math.PI) / 180,
    v = 2 * Math.atan(Math.tan(hfov / 2) / Math.max(0.3, aspect));
  return clamp((v * 180) / Math.PI, FP.vfovMin, FP.vfovMax);
}
// Внутреннее разрешение вида: целое число экранных пикселей на пиксель картинки.
export function internalSize(view, quality) {
  const add = FP.quality[quality]?.pxAdd ?? 0,
    px = view.PX + add;
  return { px, w: Math.ceil((view.W * view.DPR) / px), h: Math.ceil((view.H * view.DPR) / px) };
}
export const drawDistance = (quality) => FP.quality[quality]?.far ?? FP.far;

// Меню: медленный облёт лагеря вокруг котла; панель меню справа, поэтому котёл
// смещён влево (камера чуть довёрнута).
export function menuCamera(t, aspect) {
  // Камера с юго-западной стороны: котёл впереди, палатка за ним в глубине.
  const a = 1.78 + Math.sin(t * 0.1) * 0.22,
    d = 300 + Math.sin(t * 0.07) * 20,
    cz = CY + 20;
  const px = CX + Math.cos(a) * d,
    pz = cz + Math.sin(a) * d,
    yaw = Math.atan2(cz - pz, CX - px) + (aspect > 1 ? 0.2 : 0);
  // на узком экране меню занимает нижнюю половину — котёл поднимается вверх кадра
  return { x: px, z: pz, y: 84 + Math.sin(t * 0.13) * 5, yaw, pitch: aspect > 1 ? -0.1 : -0.36, roll: 0 };
}
// Вступление: k ∈ [0, 1] — от кадра меню к взгляду из котла.
export function blendCamera(a, b, k) {
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  let dy = b.yaw - a.yaw;
  dy = ((((dy + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e), yaw: a.yaw + dy * e, pitch: lerp(a.pitch, b.pitch, e), roll: 0 };
}
