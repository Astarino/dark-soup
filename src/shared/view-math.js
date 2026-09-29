import { TAU, clamp } from "./math.js";
// Математика вида от первого лица. Мир: x — на восток, y — на юг (как на карте).
// yaw — угол направления взгляда на горизонтальной плоскости, forward = (cos, sin).
// Правая рука наблюдателя = forward, повёрнутый на +90°: (−fy, fx).
export const lookVector = (yaw) => ({ x: Math.cos(yaw), y: Math.sin(yaw) });
export const rightVector = (yaw) => ({ x: -Math.sin(yaw), y: Math.cos(yaw) });

// input: экранные оси, как у клавиатуры/джойстика: x > 0 — вправо, y < 0 — вперёд
// (клавиша W = y −1). Результат — вектор движения в мире; длина не растёт.
export function moveRelativeToView(input, yaw) {
  const f = lookVector(yaw),
    r = rightVector(yaw),
    fwd = -input.y;
  // «+ 0» превращает −0 в 0: нулевой ввод — ровно нулевой вектор
  let x = r.x * input.x + f.x * fwd + 0,
    y = r.y * input.x + f.y * fwd + 0;
  const m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
  }
  return { x, y };
}

export const wrapAngle = (a) => {
  a %= TAU;
  return a < 0 ? a + TAU : a;
};
// Разница углов в диапазоне (−π, π].
export const angleDiff = (a, b) => {
  let d = wrapAngle(a - b);
  if (d > Math.PI) d -= TAU;
  return d;
};
export const PITCH_LIMIT = 1.05; // ≈ 60° вверх/вниз
// dx > 0 — мышь вправо (поворот вправо), dy > 0 — мышь вниз (взгляд вниз, pitch < 0).
export const applyLook = (look, dx, dy, sensitivity) => ({
  yaw: wrapAngle(look.yaw + dx * sensitivity),
  pitch: clamp(look.pitch - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT),
});

// Положение цели относительно взгляда: bearing > 0 — справа, < 0 — слева,
// |bearing| > π/2 — за спиной. Расстояние на плоскости.
export function bearingTo(from, yaw, tx, ty) {
  const dx = tx - from.x,
    dy = ty - from.y;
  return { bearing: angleDiff(Math.atan2(dy, dx), yaw), dist: Math.hypot(dx, dy) };
}

// Номер спрайта из 8 направлений: 0 — существо смотрит на камеру, 2 — боком,
// 4 — спиной. facing — куда смотрит существо в мире, cam — позиция камеры.
export function spriteDirection(facing, ex, ey, cx, cy, count = 8) {
  const toCam = Math.atan2(cy - ey, cx - ex);
  return Math.round(wrapAngle(facing - toCam) / (TAU / count)) % count;
}
