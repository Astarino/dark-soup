import { FP } from "../data/first-person.js";
import { JOY_MAX } from "../data/input.js";
import { applyLook, moveRelativeToView } from "../shared/view-math.js";
// Управление видом от первого лица. Клавиатуру читает общий модуль (одна
// подписка на keydown/keyup), а здесь — только мышь с захватом курсора и
// касания. Все обработчики вешаются в attach() и снимаются одним AbortController
// в detach(), поэтому переключения вида не накапливают подписки.
export function createFirstPersonInput({ base, getSettings }) {
  let canvas = null,
    ac = null,
    look = { yaw: FP.startYaw, pitch: 0 },
    lockFailed = false,
    dragId = null;
  const touch = { joy: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look: { id: null, x: 0, y: 0 }, used: false };
  const callbacks = { onLockLost: () => {} };
  const lockApi = () => typeof document !== "undefined" && "pointerLockElement" in document && !!document.documentElement.requestPointerLock;
  const locked = () => !!canvas && document.pointerLockElement === canvas;
  const sens = () => getSettings().sensitivity;

  function turn(dx, dy, scale) {
    look = applyLook(look, dx, dy, scale * sens());
  }

  function attach(el, { onLockLost } = {}) {
    if (ac) detach();
    canvas = el;
    callbacks.onLockLost = onLockLost || (() => {});
    ac = new AbortController();
    const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: ac.signal });
    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(canvas, "pointerdown", (e) => {
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        // Явное действие пользователя: клик по игре захватывает мышь.
        if (!locked() && lockApi() && !lockFailed) requestLock();
        else if (!locked()) dragId = e.pointerId; // запасной обзор перетаскиванием
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {}
        return;
      }
      touch.used = true;
      const half = canvas.clientWidth * 0.42;
      if (e.clientX - canvas.getBoundingClientRect().left < half) {
        if (touch.joy.id !== null) return;
        touch.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      } else {
        if (touch.look.id !== null) return;
        touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
    });
    on(canvas, "pointermove", (e) => {
      if (e.pointerType === "mouse") {
        if (dragId === e.pointerId && !locked()) turn(e.movementX ?? 0, e.movementY ?? 0, FP.lookBase * 1.4);
        return;
      }
      if (e.pointerId === touch.joy.id) {
        touch.joy.x = e.clientX;
        touch.joy.y = e.clientY;
      } else if (e.pointerId === touch.look.id) {
        turn(e.clientX - touch.look.x, e.clientY - touch.look.y, FP.touchLook);
        touch.look.x = e.clientX;
        touch.look.y = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === dragId) dragId = null;
      if (e.pointerId === touch.joy.id) touch.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
      if (e.pointerId === touch.look.id) touch.look = { id: null, x: 0, y: 0 };
    };
    on(canvas, "pointerup", end);
    on(canvas, "pointercancel", end);
    // Захваченная мышь присылает относительные смещения на документ.
    on(document, "mousemove", (e) => {
      if (locked()) turn(e.movementX, e.movementY, FP.lookBase);
    });
    on(document, "pointerlockchange", () => {
      if (!locked() && callbacks.onLockLost) callbacks.onLockLost();
    });
    on(document, "pointerlockerror", () => {
      lockFailed = true;
      // Запасной способ обзора включается сам: перетаскивание и Q/E.
    });
    on(window, "blur", () => {
      dragId = null;
      touch.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
      touch.look = { id: null, x: 0, y: 0 };
    });
  }
  function detach() {
    if (!ac) return;
    ac.abort();
    ac = null;
    releaseLock();
    dragId = null;
    touch.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    touch.look = { id: null, x: 0, y: 0 };
    canvas = null;
  }
  function requestLock() {
    if (!canvas || locked() || !lockApi()) return false;
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      // Некоторые браузеры не знают опции и возвращают отказ — пробуем без неё.
      if (p && p.catch)
        p.catch(() => {
          try {
            const q = canvas?.requestPointerLock();
            if (q && q.catch) q.catch(() => (lockFailed = true));
          } catch {
            lockFailed = true;
          }
        });
      return true;
    } catch {
      lockFailed = true;
      return false;
    }
  }
  function releaseLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {}
  }
  // Клавиши Q/E и стрелки поворачивают камеру (запасной способ обзора и удобство).
  function update(dt) {
    let yaw = 0,
      pitch = 0;
    if (base.isDown("KeyQ") || base.isDown("ArrowLeft")) yaw -= 1;
    if (base.isDown("KeyE") || base.isDown("ArrowRight")) yaw += 1;
    if (base.isDown("ArrowUp")) pitch -= 1;
    if (base.isDown("ArrowDown")) pitch += 1;
    if (yaw || pitch) look = applyLook(look, yaw * FP.keyTurn * dt, pitch * FP.keyTurn * 0.6 * dt, sens());
  }
  // Вектор движения в мире: клавиши + левый джойстик, относительно взгляда.
  function vector() {
    const k = base.vector({ arrows: false });
    let x = k.x,
      y = k.y;
    const j = touch.joy;
    if (j.id !== null) {
      let dx = j.x - j.ox,
        dy = j.y - j.oy;
      const m = Math.hypot(dx, dy);
      if (m > JOY_MAX) {
        j.ox = j.x - (dx / m) * JOY_MAX;
        j.oy = j.y - (dy / m) * JOY_MAX;
        dx = (dx / m) * JOY_MAX;
        dy = (dy / m) * JOY_MAX;
      }
      if (m > 6) {
        x += dx / JOY_MAX;
        y += dy / JOY_MAX;
      }
    }
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return moveRelativeToView({ x, y }, look.yaw);
  }
  return {
    attach,
    detach,
    update,
    vector,
    requestLock,
    releaseLock,
    get look() {
      return look;
    },
    setLook: (yaw, pitch = 0) => (look = { yaw, pitch }),
    state: () => ({
      locked: locked(),
      lockFailed: lockFailed || !lockApi(),
      touch: touch.used,
      joy: { ...touch.joy },
      looking: touch.look.id !== null,
      dragging: dragId !== null,
    }),
  };
}
