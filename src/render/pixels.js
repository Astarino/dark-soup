import { clamp } from "../shared/math.js";
export const mk = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const HEXC = {};
export const rgb = (h) =>
  HEXC[h] ||
  (HEXC[h] = [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]);
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dith = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
export function ramp(r, v, x, y) {
  v = clamp(v, 0, 1) * (r.length - 1);
  let i = Math.floor(v);
  if (v - i > dith(x, y)) i++;
  return r[Math.min(i, r.length - 1)];
}
const LIGHT = (() => {
  const l = [-0.5, -0.68, 0.55],
    m = Math.hypot(...l);
  return l.map((v) => v / m);
})();
export function sphereV(nx, ny) {
  const q = 1 - nx * nx - ny * ny;
  if (q < 0) return 0;
  return clamp(nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(q) * LIGHT[2], 0, 1);
}

// Пиксельный буфер для генерации спрайтов
export class PB {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Array(w * h).fill(null);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h)
      this.d[y * this.w + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
      ? this.d[y * this.w + x]
      : null;
  }
  ell(cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx,
          ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1)
          this.set(x, y, typeof fn === "string" ? fn : fn(nx, ny, x, y));
      }
  }
  poly(pts, fn) {
    let x0 = 1e9,
      x1 = -1e9,
      y0 = 1e9,
      y1 = -1e9;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const px = x + 0.5,
          py = y + 0.5;
        let ins = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i],
            [xj, yj] = pts[j];
          if (
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
          )
            ins = !ins;
        }
        if (ins) this.set(x, y, typeof fn === "string" ? fn : fn(x, y));
      }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1,
      dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, typeof c === "string" ? c : c(x0, y0));
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  rows(ox, oy, rows, pal) {
    rows.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        if (pal[ch]) this.set(ox + x, oy + y, pal[ch]);
      }),
    );
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (
          !this.get(x, y) &&
          (this.get(x - 1, y) ||
            this.get(x + 1, y) ||
            this.get(x, y - 1) ||
            this.get(x, y + 1))
        )
          add.push(x, y);
    for (let i = 0; i < add.length; i += 2)
      this.d[add[i + 1] * this.w + add[i]] = c;
    return this;
  }
  canvas() {
    const c = mk(this.w, this.h),
      g = c.getContext("2d"),
      im = g.createImageData(this.w, this.h);
    this.d.forEach((col, i) => {
      if (!col) return;
      const [r, gg, b] = rgb(col);
      im.data.set([r, gg, b, 255], i * 4);
    });
    g.putImageData(im, 0, 0);
    return c;
  }
}
export function flipC(c) {
  const o = mk(c.width, c.height),
    g = o.getContext("2d");
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return o;
}
export function tintC(c, col) {
  const o = mk(c.width, c.height),
    g = o.getContext("2d");
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = col;
  g.fillRect(0, 0, c.width, c.height);
  return o;
}
export function rotC(c) {
  const o = mk(c.height, c.width),
    g = o.getContext("2d");
  g.translate(o.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(c, 0, 0);
  return o;
}
