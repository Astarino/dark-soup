import { TAU, clamp, mulberry32, hash2, vnoise } from "../shared/math.js";
import { K, WORLD, CX, CY } from "../data/balance.js";
import { mk, rgb, dith } from "./pixels.js";
import { OUT } from "./style.js";
import { BUSHES } from "./sprites.js";
// Земля запекается один раз без кустов: кусты записываются как точки (BUSH_SPOTS)
// и рисуются поверх копии для вида сверху (GROUND), а вид от первого лица ставит на
// эти же точки объёмные кусты (GROUND_BASE).
export const BUSH_SPOTS = [];
export const GROUND_BASE = (() => {
  const GW = WORLD.w / K,
    GH = WORLD.h / K,
    c = mk(GW, GH),
    g = c.getContext("2d");
  const im = g.createImageData(GW, GH),
    D = im.data;
  const MUD = [
    "#120e09",
    "#1a150e",
    "#221b12",
    "#2b2216",
    "#352a1b",
    "#40331f",
  ].map(rgb);
  const GRS = [
    "#121a0d",
    "#172211",
    "#1d2b14",
    "#243518",
    "#2c411c",
    "#364e21",
  ].map(rgb);
  const ccx = CX / K,
    ccy = CY / K;
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const n1 = vnoise(x / 70, y / 70, 1),
        n2 = vnoise(x / 20, y / 20, 2),
        n3 = hash2(x, y, 3);
      const dc = Math.hypot(x - ccx, y - ccy);
      const grass = n1 * 0.65 + n2 * 0.35 - Math.max(0, 1 - dc / 200) * 0.55;
      const isG = grass > 0.47 + (n3 - 0.5) * 0.06;
      const r = isG ? GRS : MUD;
      let v =
        n2 * 0.55 +
        n3 * 0.35 +
        (isG ? 0.05 : 0.1 + Math.max(0, 1 - dc / 240) * 0.3);
      const t = clamp(v, 0, 1) * (r.length - 1);
      let i = Math.floor(t);
      if (t - i > dith(x, y)) i++;
      i = Math.min(i, r.length - 1);
      const col = r[i],
        o = (y * GW + x) * 4;
      D[o] = col[0];
      D[o + 1] = col[1];
      D[o + 2] = col[2];
      D[o + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  const R = mulberry32(4242),
    ri = (n) => Math.floor(R() * n);
  const px = (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  for (let k = 0; k < 9000; k++) {
    const x = ri(GW),
      y = ri(GH),
      c1 = R() < 0.5 ? "#3f5a22" : "#4a6a28",
      c2 = "#2a3c18";
    px(x, y, c2);
    px(x, y - 1, c1);
    px(x - 1, y - 2, c1);
    px(x + 1, y - 1, c1);
    if (R() < 0.5) px(x + 2, y - 3, c1);
  }
  for (let k = 0; k < 2500; k++) {
    const x = ri(GW),
      y = ri(GH);
    px(x, y, "#4e473a");
    px(x + 1, y, "#3a342a");
    px(x, y - 1, "#6a6150");
  }
  for (let k = 0; k < 1400; k++) {
    const x = ri(GW),
      y = ri(GH);
    g.fillStyle = ["#5e3e1c", "#7a4e22", "#4a3216"][ri(3)];
    g.fillRect(x, y, 2, 1);
  }
  for (let k = 0; k < 200; k++) {
    const x = ri(GW),
      y = ri(GH);
    px(x, y, "#d8ccb0");
    px(x, y - 1, "#a8321e");
    px(x - 1, y - 1, "#a8321e");
    px(x + 1, y - 1, "#7a2014");
  }
  for (let k = 0; k < 300; k++) {
    const x = ri(GW),
      y = ri(GH);
    px(x, y, ["#c8b870", "#b08aa0", "#9ab0c8"][ri(3)]);
  }
  for (let k = 0; k < 260; k++) {
    const b = BUSHES[ri(3)],
      x = ri(GW),
      y = ri(GH);
    if (Math.hypot(x - ccx, y - ccy) < 150) continue;
    BUSH_SPOTS.push({ variant: BUSHES.indexOf(b), x, y, w: b.width, h: b.height });
  }
  // старое кострище у палатки
  const fx = Math.round((CX - 110) / K),
    fy = Math.round((CY - 20) / K);
  for (let yy = -6; yy <= 6; yy++)
    for (let xx = -12; xx <= 12; xx++) {
      const q = (xx * xx) / 144 + (yy * yy) / 36;
      if (q < 0.55)
        px(fx + xx, fy + yy, hash2(xx, yy, 5) < 0.5 ? "#141210" : "#201c18");
    }
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU,
      x = fx + Math.round(Math.cos(a) * 12),
      y = fy + Math.round(Math.sin(a) * 6);
    g.fillStyle = OUT;
    g.fillRect(x - 2, y - 1, 5, 4);
    g.fillStyle = "#5a5750";
    g.fillRect(x - 1, y - 1, 3, 2);
    g.fillStyle = "#7a766c";
    g.fillRect(x - 1, y - 1, 2, 1);
  }
  return c;
})();
export const GROUND = (() => {
  const c = mk(GROUND_BASE.width, GROUND_BASE.height),
    g = c.getContext("2d");
  g.drawImage(GROUND_BASE, 0, 0);
  for (const b of BUSH_SPOTS) g.drawImage(BUSHES[b.variant], b.x, b.y);
  return c;
})();
