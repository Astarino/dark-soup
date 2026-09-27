import { JOY_MAX } from "../data/input.js";
export function createInput(cvs, { onKey, onHidden }) {
  const keys = new Set();
  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  addEventListener("keydown", (e) => {
    keys.add(e.code);
    onKey(e.code);
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => {
    keys.clear();
    joy.active = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onHidden();
  });
  cvs.addEventListener("pointerdown", (e) => {
    if (joy.active) return;
    joy.active = true;
    joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX;
    joy.oy = joy.y = e.clientY;
    try {
      cvs.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  cvs.addEventListener("pointermove", (e) => {
    if (joy.active && e.pointerId === joy.id) {
      joy.x = e.clientX;
      joy.y = e.clientY;
    }
  });
  const joyEnd = (e) => {
    if (e.pointerId === joy.id) joy.active = false;
  };
  cvs.addEventListener("pointerup", joyEnd);
  cvs.addEventListener("pointercancel", joyEnd);
  cvs.addEventListener("contextmenu", (e) => e.preventDefault());

  function inputVec() {
    let x = 0,
      y = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    if (joy.active) {
      let dx = joy.x - joy.ox,
        dy = joy.y - joy.oy;
      const m = Math.hypot(dx, dy);
      if (m > JOY_MAX) {
        joy.ox = joy.x - (dx / m) * JOY_MAX;
        joy.oy = joy.y - (dy / m) * JOY_MAX;
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
    return { x, y };
  }

  return {
    vector: inputVec,
    clearPointer: () => {
      joy.active = false;
    },
    snapshot: () => ({ ...joy }),
  };
}
