import { TAU, clamp, rand, fmtTime } from "../shared/math.js";
import { K, ABILITY_STATS } from "../data/balance.js";
import { PFONT, OUT } from "./style.js";
import {
  ICON,
  FALL_CARROT,
  GEM,
  LEAF_H,
  LEAF_V,
  SKULL,
  HEART,
  GOB,
  GOB_CHARMED,
  POT,
  POTATO_SHOT,
  PELLETS,
  FALL_TOMATO,
  PEPPER_SLICE,
  FIRE_LOGS,
  onionSprite,
  logSprite,
} from "./sprites.js";
import * as sprites from "./sprites.js";
import { GROUND } from "./ground.js";
import { UPG } from "../systems/upgrades.js";
import { onionBalls } from "../abilities/onion-orbit.js";
import { JOY_MAX } from "../data/input.js";
export function createRenderer(cvs, world, tr) {
  const ctx = cvs.getContext("2d");
  function asset(descriptor) {
    if (descriptor.family === "LOG")
      return { ...descriptor, img: logSprite(descriptor.len, descriptor.vert) };
    const family = sprites[descriptor.family];
    return descriptor.index === undefined ? family : family[descriptor.index];
  }
  const trees = world.trees.map((t) => ({ ...t, spr: asset(t.spr) }));
  const props = world.props.map((p) => ({ ...p, s: asset(p.s) }));
  return function render(snapshot, view, joy) {
    const {
      player,
      enemies,
      gems,
      strikes,
      waves,
      parts,
      texts,
      drops,
      time,
      state,
      kills,
      cam,
      shake,
      potatoes = [],
      beetPools = [],
      tomatoDrops = [],
      tomatoPuddles = [],
      pepperSlices = [],
      cooldowns = {},
    } = snapshot;
    const { W, H, DPR, PX, LW, LH, SAFE } = view;
    const orbitBalls = (offset = 0) => onionBalls(player, time, offset);
    let camL = 0,
      camT = 0;
    const sx = (wx) => Math.round(wx / K) - camL;
    const sy = (wy) => Math.round(wy / K) - camT;
    function blit(img, wx, wy, ax, ay) {
      ctx.drawImage(img, sx(wx) - ax, sy(wy) - ay);
    }
    function pRect(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }
    function pEll(cx, cy, rx, ry, c) {
      cx = Math.round(cx);
      cy = Math.round(cy);
      ry = Math.max(1, Math.round(ry));
      ctx.fillStyle = c;
      for (let y = -ry; y <= ry; y++) {
        const k = 1 - (y * y) / (ry * ry);
        if (k < 0) continue;
        const hw = Math.round(rx * Math.sqrt(k));
        ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
      }
    }
    function pRing(cx, cy, rx, ry, c, dash = 0, phase = 0) {
      const n = Math.max(12, Math.round((rx + ry) * 3.3));
      ctx.fillStyle = c;
      for (let i = 0; i < n; i++) {
        if (dash && (i + phase) % (dash * 2) >= dash) continue;
        const a = (i / n) * TAU;
        ctx.fillRect(
          Math.round(cx + Math.cos(a) * rx),
          Math.round(cy + Math.sin(a) * ry),
          1,
          1,
        );
      }
    }
    function ptext(str, x, y, col, size = 8, align = "left") {
      ctx.font = `${size}px ${PFONT}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = OUT;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [1, 1],
      ])
        ctx.fillText(str, Math.round(x) + dx, Math.round(y) + dy);
      ctx.fillStyle = col;
      ctx.fillText(str, Math.round(x), Math.round(y));
    }

    function drawGround() {
      ctx.fillStyle = "#070906";
      ctx.fillRect(0, 0, LW, LH);
      const x0 = Math.max(0, camL),
        y0 = Math.max(0, camT),
        x1 = Math.min(GROUND.width, camL + LW),
        y1 = Math.min(GROUND.height, camT + LH);
      if (x1 > x0 && y1 > y0)
        ctx.drawImage(
          GROUND,
          x0,
          y0,
          x1 - x0,
          y1 - y0,
          x0 - camL,
          y0 - camT,
          x1 - x0,
          y1 - y0,
        );
    }
    function drawTree(t) {
      const s = t.spr,
        X = sx(t.x),
        Y = sy(t.y);
      pEll(X + 3, Y + 1, s.img.width * 0.35, 3, "rgba(0,0,0,.35)");
      const px = sx(player.x),
        py = sy(player.y) - 20;
      const behind =
        player.y < t.y &&
        px > X - s.ax &&
        px < X - s.ax + s.img.width &&
        py > Y - s.ay &&
        py < Y - 8;
      if (behind) ctx.globalAlpha = 0.45;
      ctx.drawImage(s.img, X - s.ax, Y - s.ay);
      ctx.globalAlpha = 1;
    }
    function drawBurning(e, fr, X, Y) {
      const phase = Math.floor(time * 13) + Math.floor(e.anim);
      const base = Y - Math.max(4, Math.round(fr.ay * 0.16));
      const spread = Math.max(5, Math.round(fr.w * 0.28));
      for (let i = 0; i < 5; i++) {
        const h = Math.round(fr.ay * 0.28) + 4 + ((phase + i * 7) % 6);
        const root = X + Math.round((i - 2) * spread * 0.5);
        for (let y = 0; y < h; y++) {
          const tip = y / h,
            sway = Math.round(
              Math.sin(phase * 0.7 + i * 2 + y * 0.5) * tip * 2,
            );
          const width = tip < 0.35 ? 3 : tip < 0.75 ? 2 : 1;
          const color =
            tip > 0.8 ? "#ffca55" : (i + y + phase) % 4 ? "#ee7620" : "#ffd36a";
          pRect(root + sway - Math.floor(width / 2), base - y, width, 1, color);
        }
      }
      for (let i = 0; i < 3; i++) {
        const x = X + ((phase * (i + 2) + i * 13) % (spread * 2 + 1)) - spread;
        const y = base - Math.round(fr.ay * 0.35) - ((phase + i * 5) % 9);
        pRect(x, y, 1, 1, i === 0 ? "#fff0a0" : "#ffad3a");
      }
    }
    function drawGoblin(e) {
      // Обращённые свёклой — в свекольных тонах; перед концом обращения мигают.
      const charmed =
        e.charm > 0 && (e.charm > 1.5 || Math.floor(time * 8) % 2 === 0);
      const fr = (charmed ? GOB_CHARMED : GOB)[e.type][Math.floor(e.anim) % 2],
        X = sx(e.x),
        Y = sy(e.y);
      pEll(
        X,
        Y,
        Math.round(e.r / K) + 1,
        e.type === "brute" ? 3 : 2,
        "rgba(0,0,0,.4)",
      );
      const fl = e.flash > 0,
        img = e.face > 0 ? (fl ? fr.rw : fr.r) : fl ? fr.lw : fr.l;
      const ax = e.face > 0 ? fr.ax : fr.w - 1 - fr.ax;
      ctx.drawImage(img, X - ax, Y - fr.ay);
      if (e.type === "brute" && e.hp < e.max) {
        const bw = 16,
          by = Y - fr.ay - 3;
        pRect(X - bw / 2 - 1, by - 1, bw + 2, 4, OUT);
        pRect(X - bw / 2, by, bw, 2, "#3a1210");
        pRect(
          X - bw / 2,
          by,
          Math.round(bw * Math.max(0, e.hp / e.max)),
          2,
          "#e0452e",
        );
      }
    }
    function drawFire(X, Y) {
      const t = Math.floor(time * 12) / 12;
      for (let x = -7; x <= 7; x++) {
        const h = Math.max(
          1,
          Math.round(
            (8 - Math.abs(x)) * 1.1 +
              2 +
              Math.sin(t * 12 + x * 1.7) * 1.6 +
              Math.sin(t * 7.3 + x * 0.9) * 1.2,
          ),
        );
        for (let i = 0; i < h; i++) {
          const f = i / h;
          ctx.fillStyle =
            f < 0.28
              ? "#fff3b0"
              : f < 0.55
                ? "#ffc247"
                : f < 0.8
                  ? "#f07a1e"
                  : "#c83a14";
          if (f >= 0.8 && (x + i + Math.floor(t * 12)) % 2) continue;
          ctx.fillRect(X + x, Y - 1 - i, 1, 1);
        }
      }
    }
    function drawPot() {
      const X = sx(player.x),
        Y = sy(player.y),
        dead = state === "over";
      const bob =
        Math.hypot(player.vx, player.vy) > 20
          ? Math.floor(player.walk * 10) % 2
          : 0;
      pEll(X, Y + 1, 24, 4, "rgba(0,0,0,.4)");
      ctx.drawImage(FIRE_LOGS, X - 16, Y - 6);
      if (!dead) drawFire(X, Y - 1);
      const hit = player.iframe > 0 && Math.floor(player.iframe * 20) % 2 === 0;
      ctx.drawImage(hit ? POT.hit : POT.img, X - POT.ax, Y - POT.ay - bob);
      // суп: ингредиенты и пузыри
      const SX = X,
        SY = Y + POT.soupDy - bob;
      const items = [];
      for (let k = 0; k < Math.min(3, player.lv.carrot); k++)
        items.push(["#f08a2a", "#ffb04a"]);
      for (let k = 0; k < Math.min(3, player.lv.cabbage); k++)
        items.push(["#6fae3f", "#a6d86a"]);
      for (let k = 0; k < Math.min(3, player.lv.onion); k++)
        items.push(["#e8c890", "#fff0c8"]);
      for (const [id, colors] of [
        ["potato", ["#c8a878", "#e8d0a0"]],
        ["beet", ["#8a1a4a", "#c2266a"]],
        ["tomato", ["#d8312a", "#ff7a5a"]],
        ["bellPepper", ["#c42a22", "#f7c0a8"]],
      ])
        for (let k = 0; k < Math.min(2, player.lv[id] || 0); k++) items.push(colors);
      items.forEach((c, i) => {
        const a = time * 0.6 + i * 2.4,
          ix = Math.round(SX + Math.cos(a) * (3 + (i % 3) * 2.5)),
          iy = Math.round(SY + Math.sin(a) * 1.2);
        pRect(ix, iy, 2, 1, c[0]);
        pRect(ix, iy, 1, 1, c[1]);
      });
      if (!dead)
        for (let k = 0; k < 3; k++) {
          const ph = (time * 1.3 + k * 0.37) % 1,
            bx = Math.round(
              SX +
                Math.sin(k * 5.1 + Math.floor(time * 1.3 + k * 0.37) * 3.7) * 7,
            );
          if (ph < 0.7)
            pRect(bx, SY - (ph > 0.4 ? 1 : 0), ph > 0.4 ? 2 : 1, 1, "#ffd08a");
        }
      for (const d of drops) {
        const k = Math.min(1, d.t / 0.45);
        ctx.drawImage(
          ICON[d.id],
          SX - 6,
          Math.round(SY - 12 - (1 - k * k) * 60),
        );
      }
    }
    function fade(t, life, tail) {
      return Math.max(0, Math.min(1, (life - t) / tail));
    }
    function drawPuddles() {
      for (const p of beetPools) {
        const grow = Math.min(1, p.t / 0.3),
          a = fade(p.t, p.life, 1),
          r = (p.r / K) * grow,
          X = sx(p.x),
          Y = sy(p.y);
        if (a < 0.35 && Math.floor(time * 10) % 2) continue;
        pEll(X, Y, r + 1, (r + 1) * 0.6, "rgba(40,4,20,.55)");
        pEll(X, Y, r, r * 0.6, "rgba(110,16,58,.85)");
        pEll(X - r * 0.15, Y - r * 0.08, r * 0.7, r * 0.38, "rgba(154,26,80,.9)");
        pRing(X, Y, r, r * 0.6, "rgba(226,70,140,.8)", 3, Math.floor(time * 4));
        for (let i = 0; i < 4; i++) {
          const ph = (time * 0.9 + i * 0.29) % 1,
            bx = Math.round(X + Math.sin(i * 7.3 + Math.floor(time * 0.9 + i * 0.29) * 5.1) * r * 0.6),
            by = Math.round(Y + Math.cos(i * 3.1 + Math.floor(time * 0.9 + i * 0.29) * 2.3) * r * 0.3);
          if (ph < 0.6) pRect(bx, by, ph > 0.35 ? 2 : 1, 1, "#e0609a");
        }
      }
      for (const p of tomatoPuddles) {
        const a = fade(p.t, p.life, 0.6),
          r = p.r / K,
          X = sx(p.x),
          Y = sy(p.y);
        if (r < 1 || (a < 0.5 && Math.floor(time * 10) % 2)) continue;
        pEll(X, Y, r, r * 0.6, "rgba(90,14,10,.7)");
        pEll(X, Y, r - 2, r * 0.6 - 1, "rgba(200,40,30,.75)");
        pEll(X - r * 0.2, Y - r * 0.1, r * 0.45, r * 0.22, "rgba(255,110,80,.6)");
        for (let i = 0; i < 6; i++) {
          const an = i * 2.4 + p.x * 0.01;
          pRect(Math.round(X + Math.cos(an) * r * 0.55), Math.round(Y + Math.sin(an) * r * 0.3), 1, 1, "#f4e0a0");
        }
      }
    }
    function drawEffectsGround() {
      drawPuddles();
      for (const d of tomatoDrops) {
        if (d.t < 0) continue;
        const k = d.t / d.fall,
          r = d.r / K;
        pRing(sx(d.x), sy(d.y), r, r * 0.55, `rgba(255,80,60,${0.35 + 0.5 * k})`, 3, Math.floor(time * 20));
        pEll(sx(d.x), sy(d.y), 1 + 5 * k, 1 + 2 * k, `rgba(0,0,0,${0.45 * k})`);
      }
      for (const s of strikes) {
        if (s.t < 0) continue;
        const X = sx(s.x),
          Y = sy(s.y),
          r = s.r / K;
        if (!s.hit) {
          const k = s.t / s.fall;
          pRing(
            X,
            Y,
            r,
            r * 0.55,
            `rgba(255,150,60,${0.35 + 0.5 * k})`,
            3,
            Math.floor(time * 20),
          );
          pEll(X, Y, 1 + 6 * k, 1 + 2.5 * k, `rgba(0,0,0,${0.45 * k})`);
        } else {
          const k = (s.t - s.fall) / 0.5,
            rr = r * (0.6 + k * 0.6);
          pRing(X, Y, rr, rr * 0.55, `rgba(255,200,120,${1 - k})`);
          pRing(
            X,
            Y,
            rr - 1,
            rr * 0.55 - 1,
            `rgba(255,120,40,${0.8 * (1 - k)})`,
          );
          pEll(X, Y, 8, 3, `rgba(20,12,6,${0.6 * (1 - k)})`);
        }
      }
      for (const w of waves) {
        const k = Math.min(1, w.t / w.dur),
          cur = (w.R * (1 - Math.pow(1 - k, 3))) / K,
          a = w.t > w.dur ? 1 - (w.t - w.dur) / 0.3 : 1;
        const X = sx(player.x),
          Y = sy(player.y);
        pRing(X, Y, cur, cur * 0.8, `rgba(150,220,90,${0.35 * a})`);
        pRing(X, Y, cur - 2, cur * 0.8 - 2, `rgba(110,190,70,${0.2 * a})`, 2);
        const n = Math.max(8, Math.floor(cur / 5));
        ctx.globalAlpha = a;
        for (let i = 0; i < n; i++) {
          const an = (i / n) * TAU + w.t * 0.8,
            lx = Math.round(X + Math.cos(an) * cur),
            ly = Math.round(Y + Math.sin(an) * cur * 0.8);
          const img = Math.abs(Math.sin(an)) > 0.6 ? LEAF_H : LEAF_V;
          ctx.drawImage(img, lx - (img.width >> 1), ly - (img.height >> 1));
        }
        ctx.globalAlpha = 1;
      }
      if (player.lv.cabbage > 0 && player.cd.cabbage <= 0 && state !== "over") {
        const s = ABILITY_STATS.cabbage(player.lv.cabbage),
          pulse = 0.5 + 0.5 * Math.sin(time * 4),
          r = s.trig / K;
        pRing(
          sx(player.x),
          sy(player.y),
          r,
          r * 0.8,
          `rgba(150,220,90,${0.25 + 0.2 * pulse})`,
          2,
          Math.floor(time * 6),
        );
      }
      for (const g of gems) {
        const img = GEM[g.v > 1 ? 1 : 0],
          bob = Math.floor(time * 4 + g.x) % 2;
        pEll(sx(g.x), sy(g.y) + 3, 2, 1, "rgba(0,0,0,.35)");
        ctx.drawImage(
          img,
          sx(g.x) - (img.width >> 1),
          sy(g.y) - img.height + 2 - bob,
        );
      }
    }
    function drawEffectsAir() {
      for (const e of enemies)
        if (
          e.effects.burning &&
          e.x > (camL - 40) * K &&
          e.x < (camL + LW + 40) * K &&
          e.y > (camT - 40) * K &&
          e.y < (camT + LH + 40) * K
        ) {
          const fr = GOB[e.type][Math.floor(e.anim) % 2];
          drawBurning(e, fr, sx(e.x), sy(e.y));
        }
      if (player.lv.onion > 0 && state !== "over") {
        for (let k = 6; k >= 1; k--)
          for (const b of orbitBalls(k * 0.035))
            pRect(
              sx(b.x),
              sy(b.y),
              k < 3 ? 2 : 1,
              1,
              `rgba(255,214,140,${0.5 * (1 - k / 7)})`,
            );
        for (const b of orbitBalls()) {
          const o = onionSprite(Math.round(b.r / K) + 1);
          pEll(sx(b.x), sy(b.y) + 16, o.ax - 1, 1, "rgba(0,0,0,.3)");
          ctx.drawImage(o.img, sx(b.x) - o.ax, sy(b.y) - o.ay);
        }
      }
      for (const d of tomatoDrops) {
        if (d.t < 0) continue;
        const k = d.t / d.fall,
          h = (1 - k) * (1 - k) * 620;
        ctx.drawImage(FALL_TOMATO, sx(d.x) - 4, sy(d.y - h) - 9);
      }
      const LIFT = 16; // снаряды летят над землёй, тень — на земле
      for (const p of potatoes) {
        const X = sx(p.x),
          Y = sy(p.y);
        pEll(X, Y, p.kind === "potato" ? 3 : 1, 1, "rgba(0,0,0,.35)");
        if (p.kind === "potato") ctx.drawImage(POTATO_SHOT, X - 3, Y - LIFT / K - 3);
        else {
          const img = PELLETS[Math.abs(Math.round(p.x + p.y)) % PELLETS.length];
          ctx.drawImage(img, X - 1, Y - LIFT / K - 1);
        }
      }
      for (const p of pepperSlices) {
        const X = sx(p.x),
          Y = sy(p.y),
          img = PEPPER_SLICE[Math.floor(p.spin) % 8];
        pEll(X, Y, 4, 1, "rgba(0,0,0,.35)");
        if (p.spent) ctx.globalAlpha = 0.55;
        ctx.drawImage(img, X - 6, Y - LIFT / K - 6);
        ctx.globalAlpha = 1;
      }
      for (const s of strikes) {
        if (s.t < 0) continue;
        if (!s.hit) {
          const k = s.t / s.fall,
            h = (1 - k) * (1 - k) * 620;
          ctx.drawImage(FALL_CARROT, sx(s.x) - 4, sy(s.y - h) - 15);
        } else {
          const k = (s.t - s.fall) / 0.5;
          ctx.globalAlpha = 1 - k * k;
          ctx.drawImage(
            FALL_CARROT,
            sx(s.x) - 4,
            sy(s.y) - 11,
            9,
            11,
            sx(s.x) - 4,
            sy(s.y) - 11,
            9,
            11,
          );
          ctx.globalAlpha = 1;
        }
      }
      for (const p of parts) {
        const k = p.t / p.life,
          X = sx(p.x),
          Y = sy(p.y);
        if (p.c === "steam") {
          const r = Math.max(1, Math.round((p.r / K) * (1 + k)));
          ctx.fillStyle = `rgba(210,205,195,${0.28 * (1 - k)})`;
          ctx.fillRect(X - r, Y - r, r * 2, r * 2);
        } else if (p.c === "ember") {
          ctx.fillStyle = k < 0.5 ? "#ffe08a" : "#ff8a2a";
          if (k < 0.9) ctx.fillRect(X, Y, 1, 1);
        } else {
          const r = Math.max(1, Math.round((p.r / K) * (1 - k * 0.5)));
          ctx.fillStyle = p.c;
          ctx.fillRect(X, Y, r, r);
        }
      }
      for (const t of texts) {
        const k = t.t / t.life;
        if (k > 0.75 && Math.floor(t.t * 30) % 2) continue;
        ptext(t.txt, sx(t.x), sy(t.y), t.col, t.size, "center");
      }
    }
    const DARK_BANDS = (() => {
      const b = [[0, 0]];
      const n = 10;
      for (let i = 0; i < n; i++) {
        const r0 = 0.14 + i * 0.075,
          a0 = (i / n) * 0.74,
          a1 = ((i + 1) / n) * 0.74;
        b.push([r0, a0], [r0, a1]);
      }
      b.push([1, 0.74]);
      return b;
    })();
    function drawLighting() {
      const X = sx(player.x),
        Y = sy(player.y) - 20,
        dead = state === "over";
      const fl = dead ? 0.6 : 1 + ((Math.floor(time * 8) % 3) - 1) * 0.02;
      const R = Math.max(LW, LH) * 0.95 * fl;
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
      for (const [s, a] of DARK_BANDS) g.addColorStop(s, `rgba(6,4,10,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LW, LH);
      if (!dead) {
        ctx.globalCompositeOperation = "lighter";
        const w = ctx.createRadialGradient(X, Y + 12, 0, X, Y + 12, 110 * fl);
        for (const [s, a] of [
          [0, 0.18],
          [0.25, 0.18],
          [0.25, 0.13],
          [0.45, 0.13],
          [0.45, 0.08],
          [0.7, 0.08],
          [0.7, 0.04],
          [1, 0.04],
          [1, 0],
        ])
          w.addColorStop(s, `rgba(255,130,40,${a})`);
        ctx.fillStyle = w;
        ctx.fillRect(0, 0, LW, LH);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    function drawHUD() {
      const s = DPR / PX,
        top = Math.round(SAFE.t * s) + 3,
        left = Math.round(SAFE.l * s) + 3,
        right = LW - Math.round(SAFE.r * s) - 3;
      // опыт
      const bw = right - left;
      pRect(left, top, bw, 6, OUT);
      pRect(left + 1, top + 1, bw - 2, 4, "#2a1e12");
      const xw = Math.round(((bw - 2) * player.xp) / player.need);
      if (xw > 0) {
        pRect(left + 1, top + 1, xw, 4, "#e8962a");
        pRect(left + 1, top + 1, xw, 1, "#ffe07a");
      }
      // здоровье
      const hy = top + 9,
        hw = Math.min(72, Math.round(LW * 0.3));
      ctx.drawImage(HEART, left, hy + 1);
      const hx = left + 9;
      pRect(hx, hy, hw, 8, OUT);
      pRect(hx + 1, hy + 1, hw - 2, 6, "#3a1210");
      const hpw = Math.round(((hw - 2) * player.hp) / player.maxHp);
      if (hpw > 0) {
        pRect(
          hx + 1,
          hy + 1,
          hpw,
          6,
          player.hp / player.maxHp < 0.3 ? "#ff3a2a" : "#d8452e",
        );
        pRect(hx + 1, hy + 1, hpw, 1, "#ff8a6a");
      }
      ptext(`${tr("levelShort")}${player.lvl}`, hx + hw + 4, hy, "#ffd98a");
      // время и убийства
      ptext(fmtTime(time), LW / 2, hy + 12, "#fff4e0", 8, "center");
      const pw = Math.round(48 * s);
      ctx.drawImage(SKULL, right - pw - 32, hy);
      ptext(String(kills), right - pw - 22, hy, "#e8d2b0");
      // иконки добавок
      let ix = left,
        iy = hy + 24;
      for (const u of UPG) {
        const lv = player.lv[u.id];
        if (!lv) continue;
        pRect(ix, iy, 16, 16, OUT);
        pRect(ix + 1, iy + 1, 14, 14, "#241a10");
        ctx.drawImage(ICON[u.id], ix + 2, iy + 2);
        let cdk = 0;
        if (u.id === "carrot")
          cdk = clamp(player.cd.carrot / ABILITY_STATS.carrot(lv).cd, 0, 1);
        if (u.id === "cabbage")
          cdk = clamp(player.cd.cabbage / ABILITY_STATS.cabbage(lv).cd, 0, 1);
        if (u.id in cooldowns) cdk = cooldowns[u.id];
        if (cdk > 0)
          pRect(ix + 1, iy + 1, 14, Math.round(14 * cdk), "rgba(0,0,0,.6)");
        ptext(String(lv), ix + 11, iy + 10, "#ffd98a");
        ix += 18;
        if (ix > LW * 0.6) {
          ix = left;
          iy += 18;
        }
      }
      if (joy.active && state === "play") {
        const k = DPR / PX,
          ox = joy.ox * k,
          oy = joy.oy * k,
          r = JOY_MAX * k;
        pRing(ox, oy, r, r, "rgba(255,230,190,.5)");
        pEll(joy.x * k, joy.y * k, 6, 6, "rgba(255,200,140,.6)");
      }
    }
    function draw() {
      const shx = shake > 0 ? Math.round(rand(-shake, shake) / K) : 0,
        shy = shake > 0 ? Math.round(rand(-shake, shake) / K) : 0;
      camL = Math.round(cam.x / K - LW / 2) + shx;
      camT = Math.round(cam.y / K - LH / 2) + shy;
      const vx0 = camL * K,
        vy0 = camT * K,
        vx1 = vx0 + LW * K,
        vy1 = vy0 + LH * K;
      drawGround();
      drawEffectsGround();
      const list = [];
      for (const t of trees)
        if (
          t.x > vx0 - 90 &&
          t.x < vx1 + 90 &&
          t.y > vy0 - 10 &&
          t.y < vy1 + 200
        )
          list.push(t);
      for (const p of props)
        if (
          p.x > vx0 - 150 &&
          p.x < vx1 + 150 &&
          p.y > vy0 - 20 &&
          p.y < vy1 + 120
        )
          list.push(p);
      for (const e of enemies)
        if (
          e.x > vx0 - 50 &&
          e.x < vx1 + 50 &&
          e.y > vy0 - 10 &&
          e.y < vy1 + 80
        )
          list.push(e);
      list.push(player);
      list.sort((a, b) => a.y - b.y);
      for (const o of list) {
        if (o === player) drawPot();
        else if (o.kind === "tree") drawTree(o);
        else if (o.kind === "spr") blit(o.s.img, o.x, o.y, o.s.ax, o.s.ay);
        else drawGoblin(o);
      }
      drawEffectsAir();
      drawLighting();
      if (state !== "menu") drawHUD();
      if (
        player.hp / player.maxHp < 0.3 &&
        state === "play" &&
        Math.floor(time * 3) % 2
      ) {
        ctx.fillStyle = "rgba(200,20,10,.35)";
        ctx.fillRect(0, 0, LW, 2);
        ctx.fillRect(0, LH - 2, LW, 2);
        ctx.fillRect(0, 0, 2, LH);
        ctx.fillRect(LW - 2, 0, 2, LH);
      }
    }

    draw();
  };
}
