import { TAU, clamp, fmtTime, vnoise } from "../shared/math.js";
import { ABILITY_STATS, WARDEN } from "../data/balance.js";
import { angleDiff } from "../shared/view-math.js";
import { JOY_MAX } from "../data/input.js";
import { PFONT, OUT } from "../render/style.js";
import { ICON, HEART, SKULL } from "../render/sprites.js";
import { UPG } from "../systems/upgrades.js";
import { ramp, dith } from "../render/pixels.js";

// Оверлей вида от первого лица: край железного котла с супом и паром внизу,
// интерфейс (здоровье, опыт, время, ингредиенты, существо-1), указатели
// полученного урона, подсказки управления. Рисуется в том же низком
// разрешении, что и сцена, поэтому пиксели одинакового размера.
const IRON = ["#0d0d12", "#1a1a22", "#282832", "#3a3a48", "#565666", "#7a7a8c"];
const RIM = ["#1a1a22", "#3a3a48", "#5a5a6a", "#8a8a9c", "#b4b4c4"];
const SOUP = ["#8a2e10", "#c24e1c", "#e07b2f", "#f5a64a", "#ffd08a"];
const SOUP_COLD = ["#1c1a1a", "#2a2626", "#3a3434", "#4a4444", "#5a5454"];
const ITEM = {
  carrot: ["#f08a2a", "#ffb04a"], cabbage: ["#6fae3f", "#a6d86a"], onion: ["#e8c890", "#fff0c8"],
  potato: ["#c8a878", "#e8d0a0"], beet: ["#8a1a4a", "#c2266a"], tomato: ["#d8312a", "#ff7a5a"], bellPepper: ["#c42a22", "#f7c0a8"],
};

export function createHud(ctx, tr) {
  let prevHp = null,
    prevRunTime = 0,
    indicators = [],
    hurtFlash = 0,
    seenNoLock = 0;
  const drops = new Map(); // ингредиент, брошенный в суп: анимация падения

  const rect = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const text = (str, x, y, col, size = 8, align = "left") => {
    ctx.font = `${size}px ${PFONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillStyle = OUT;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(str, Math.round(x) + dx, Math.round(y) + dy);
    ctx.fillStyle = col;
    ctx.fillText(str, Math.round(x), Math.round(y));
  };

  // ── Котёл: дальний край, внутренняя стенка, суп, пар ──
  function drawCauldron(W, H, snap, t, sway, cold) {
    const { player, drops: dropList = [] } = snap;
    const top = Math.round(H * 0.885), // высота дуги по центру
      cx = W / 2,
      rx = W * 0.74,
      ry = H * 0.4,
      cy = top + ry,
      dy = Math.round(sway);
    const arcY = (x) => cy - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)) + dy;
    const hit = player.iframe > 0.4 && Math.floor(player.iframe * 24) % 2 === 0;
    const soupRamp = cold ? SOUP_COLD : SOUP;
    const heat = cold ? 0 : 1;
    for (let x = 0; x < W; x++) {
      const y0 = Math.round(arcY(x)),
        u = (x - cx) / (W / 2); // −1…1 поперёк экрана
      // губа обода: светлая полоса с бликом слева-сверху
      for (let k = 0; k < 4; k++) {
        const light = k === 0 ? 0.95 : k === 1 ? 0.7 : k === 2 ? 0.45 : 0.25;
        ctx.fillStyle = hit ? "#d8483a" : ramp(RIM, light - u * 0.12 + (x % 7 === 0 && k === 1 ? -0.2 : 0), x, y0 + k);
        ctx.fillRect(x, y0 + k, 1, 1);
      }
      // внутренняя стенка: тёмное железо, снизу подсвечено супом
      const wall = 8;
      for (let k = 0; k < wall; k++) {
        const glow = (k / wall) * 0.55 * heat;
        ctx.fillStyle = hit ? ramp(["#4a1210", "#7a2018"], k / wall, x, y0 + 4 + k) : ramp(IRON, 0.16 + glow + (u < 0 ? 0.03 : 0), x, y0 + 4 + k);
        ctx.fillRect(x, y0 + 4 + k, 1, 1);
      }
      // поверхность супа: шум и мерцание
      const s0 = y0 + 4 + wall;
      for (let y = s0; y < H; y++) {
        const depth = (y - s0) / Math.max(1, H - s0),
          n = vnoise(x / 6 + t * 0.4, y / 3 - t * 0.25, 3) - 0.5,
          hi = vnoise(x / 2.5 - t * 0.7, y / 2, 9) > 0.86 ? 0.22 : 0,
          v = 0.33 + n * 0.55 + hi - depth * 0.3 - Math.abs(u) * 0.14;
        ctx.fillStyle = ramp(soupRamp, v, x, y);
        ctx.fillRect(x, y, 1, 1);
      }
      // пена у стенки
      if (!cold && (x + Math.floor(t * 2)) % 5 === 0) {
        ctx.fillStyle = SOUP[4];
        ctx.fillRect(x, s0, 1, 1);
      }
    }
    // плавающие овощи и пузыри
    const soupTop = Math.round(top + 4 + 8 + dy);
    const items = [];
    for (const [id, colors] of Object.entries(ITEM)) {
      const lv = player.lv[id] || 0;
      for (let k = 0; k < Math.min(id === "carrot" || id === "cabbage" || id === "onion" ? 3 : 2, lv); k++) items.push(colors);
    }
    if (snap.state === "menu" || snap.state === "intro") items.push(ITEM.carrot, ITEM.cabbage, ITEM.onion);
    items.forEach((c, i) => {
      const a = t * 0.35 + i * 2.4,
        ix = cx + Math.cos(a) * (W * 0.22 + (i % 3) * W * 0.05),
        iy = soupTop + 6 + (Math.sin(a) * 0.5 + 0.5) * (H - soupTop - 8);
      rect(ix, iy, 5, 3, c[0]);
      rect(ix, iy, 3, 1, c[1]);
    });
    if (!cold)
      for (let k = 0; k < 9; k++) {
        const ph = (t * 0.9 + k * 0.29) % 1,
          bx = cx + Math.sin(k * 5.3 + Math.floor(t * 0.9 + k * 0.29) * 3.1) * W * 0.34,
          by = soupTop + 4 + (k % 3) * 6 - (ph > 0.5 ? 1 : 0);
        if (ph < 0.7) {
          rect(bx, by, ph > 0.4 ? 3 : 2, ph > 0.4 ? 2 : 1, SOUP[4]);
          rect(bx, by, 1, 1, "#fff5d8");
        }
      }
    // отсвет костра над кромкой: снизу котёл подсвечен огнём (мерцает, кадры по 8 в секунду)
    if (!cold) {
      const flick = 0.85 + 0.15 * Math.sin(Math.floor(t * 8) * 2.7);
      for (let x = 0; x < W; x += 1) {
        const y0 = Math.round(arcY(x)),
          k = Math.max(0, 1 - Math.abs((x - cx) / (W * 0.7)));
        for (let r = 1; r <= 4; r++) {
          ctx.fillStyle = `rgba(255,140,50,${(0.16 * flick * k * (1 - r / 5)).toFixed(3)})`;
          ctx.fillRect(x, y0 - r, 1, 1);
        }
      }
    }
    // добавка падает в суп (карточка выбрана)
    for (const d of dropList) {
      const k = Math.min(1, d.t / 0.45),
        y = -20 + (soupTop + 4 - -20) * k * k;
      ctx.drawImage(ICON[d.id], Math.round(cx - 12), Math.round(y - 12 * (1 - k * 0.3)), 24, 24);
      if (d.t > 0.42)
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI,
            r = (d.t - 0.42) * 260;
          rect(cx + Math.cos(a) * r * 1.6, soupTop + 3 - Math.sin(a) * r * 0.5, 2, 2, SOUP[3]);
        }
    }
    // пар: лёгкие струйки над супом из мелких дизеринговых точек (не сплошные квадраты);
    // невысоко и бледно, чтобы не закрывать ближайших врагов
    if (!cold) {
      for (let i = 0; i < 9; i++) {
        const base = cx + (Math.sin(i * 7.3 + 1) * 0.5) * W * 0.55;
        for (let j = 0; j < 7; j++) {
          const ph = (t * 0.2 + i * 0.618 - j * 0.045 + 10) % 1,
            age = ph,
            x = base + Math.sin(ph * 6.5 + i * 2.1) * 5 + Math.sin(t * 0.8 + i) * 2,
            y = top - 3 - ph * H * 0.2 + dy,
            alpha = Math.min(0.5, (1 - age) * age * 3.2) * (1 - j / 8);
          if (alpha <= dith(Math.round(x), Math.round(y))) continue;
          ctx.fillStyle = age < 0.5 ? "rgba(226,220,208,.85)" : "rgba(196,192,184,.7)";
          ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
      }
    }
  }

  function drawBars(W, H, view, snap, size) {
    const { player, time, kills, enemies } = snap,
      s = view.DPR / size.px,
      SAFE = view.SAFE,
      top = Math.round(SAFE.t * s) + 3,
      left = Math.round(SAFE.l * s) + 3,
      right = W - Math.round(SAFE.r * s) - 3;
    const bw = right - left;
    rect(left, top, bw, 6, OUT);
    rect(left + 1, top + 1, bw - 2, 4, "#2a1e12");
    const xw = Math.round(((bw - 2) * player.xp) / player.need);
    if (xw > 0) {
      rect(left + 1, top + 1, xw, 4, "#e8962a");
      rect(left + 1, top + 1, xw, 1, "#ffe07a");
    }
    const hy = top + 9,
      hw = Math.min(72, Math.round(W * 0.3));
    ctx.drawImage(HEART, left, hy + 1);
    const hx = left + 9;
    rect(hx, hy, hw, 8, OUT);
    rect(hx + 1, hy + 1, hw - 2, 6, "#3a1210");
    const hpw = Math.round(((hw - 2) * player.hp) / player.maxHp);
    if (hpw > 0) {
      rect(hx + 1, hy + 1, hpw, 6, player.hp / player.maxHp < 0.3 ? "#ff3a2a" : "#d8452e");
      rect(hx + 1, hy + 1, hpw, 1, "#ff8a6a");
    }
    text(`${tr("levelShort")}${player.lvl}`, hx + hw + 4, hy, "#ffd98a");
    text(fmtTime(time), W / 2, hy + 12, "#fff4e0", 8, "center");
    const pw = Math.round(48 * s);
    ctx.drawImage(SKULL, right - pw - 32, hy);
    text(String(kills), right - pw - 22, hy, "#e8d2b0");
    // иконки добавок с перезарядкой
    const boss = enemies.find((e) => e.type === "warden");
    let ix = left,
      iy = hy + 24;
    for (const u of UPG) {
      const lv = player.lv[u.id];
      if (!lv) continue;
      rect(ix, iy, 16, 16, OUT);
      rect(ix + 1, iy + 1, 14, 14, "#241a10");
      ctx.drawImage(ICON[u.id], ix + 2, iy + 2);
      let cdk = 0;
      if (u.id === "carrot") cdk = clamp(player.cd.carrot / ABILITY_STATS.carrot(lv).cd, 0, 1);
      if (u.id in (snap.cooldowns || {})) cdk = snap.cooldowns[u.id];
      if (boss && boss.adapted.includes(u.id)) rect(ix + 1, iy + 7, 14, 2, "#f0e0a8");
      if (cdk > 0) rect(ix + 1, iy + 1, 14, Math.round(14 * cdk), "rgba(0,0,0,.6)");
      text(String(lv), ix + 11, iy + 10, "#ffd98a");
      ix += 18;
      if (ix > W * 0.6) {
        ix = left;
        iy += 18;
      }
    }
    // существо-1: имя и полоса под временем (внизу — край котла)
    if (boss) {
      const bwid = Math.min(150, Math.round(W * 0.5)),
        bx = Math.round((W - bwid) / 2),
        by = hy + 34;
      text(tr("mob_warden"), W / 2, by - 10, "#ece8da", 8, "center");
      rect(bx - 1, by - 1, bwid + 2, 7, OUT);
      rect(bx, by, bwid, 5, "#2a0a10");
      const f = Math.round((bwid * Math.max(0, boss.hp)) / boss.max);
      rect(bx, by, f, 5, "#b0182a");
      rect(bx, by, f, 1, "#ff6a6a");
      for (let d = WARDEN.adaptEvery; d < boss.max; d += WARDEN.adaptEvery) rect(bx + Math.round((bwid * (boss.max - d)) / boss.max), by, 1, 5, "rgba(0,0,0,.55)");
      boss.adapted.forEach((id, i) => {
        const x2 = Math.round(W / 2 - (boss.adapted.length * 14) / 2 + i * 14);
        rect(x2, by + 8, 13, 13, OUT);
        rect(x2 + 1, by + 9, 11, 11, "#3a2e18");
        ctx.globalAlpha = 0.6;
        ctx.drawImage(ICON[id], x2 + 1, by + 9, 11, 11);
        ctx.globalAlpha = 1;
      });
    }
    // объявления («ОРДА!», «СУЩЕСТВО-1», «ОСВОЕНО…»): крупный текст по центру сверху
    let my = top + 34 + (boss ? 26 : 0);
    for (const t of snap.texts || []) {
      // числа урона не показываем; объявления («ОРДА!», «СУЩЕСТВО-1», «ОСВОЕНО…») — да
      if (t.size <= 8 && t.col !== "#f0e0a8") continue;
      const k = t.t / t.life;
      if (k > 0.75 && Math.floor(t.t * 30) % 2) continue;
      text(t.txt, W / 2, my, t.col, Math.min(12, t.size), "center");
      my += 16;
    }
  }

  // Указатели урона: жирная дуга у края экрана в сторону источника (относительно
  // взгляда) и стрелка внутрь; гаснут за ~1,2 с. Взгляд не поворачивается.
  function drawIndicators(W, H, dt) {
    const cx = W / 2,
      cy = H * 0.47,
      rx = W * 0.47,
      ry = H * 0.42;
    indicators = indicators.filter((i) => (i.age += dt) < 1.25);
    for (const i of indicators) {
      const a = 1 - i.age / 1.25;
      if (i.all) continue;
      const ang = i.bearing - Math.PI / 2; // 0 — вперёд (вверх экрана), > 0 — вправо
      ctx.fillStyle = `rgba(255,64,44,${Math.min(1, a * 1.3).toFixed(2)})`;
      for (let d = -0.4; d <= 0.4; d += 0.02) {
        const aa = ang + d,
          fall = 1 - Math.abs(d) / 0.45,
          th = Math.max(1, Math.round(5 * fall));
        const x = cx + Math.cos(aa) * rx,
          y = cy + Math.sin(aa) * ry;
        ctx.fillRect(Math.round(x - Math.cos(aa) * th), Math.round(y - Math.sin(aa) * th), Math.ceil(th * 0.8) + 1, Math.ceil(th * 0.8) + 1);
      }
      // стрелка внутрь экрана
      const tx = cx + Math.cos(ang) * (rx - 10),
        ty = cy + Math.sin(ang) * (ry - 10);
      for (let k = 0; k < 6; k++) {
        const w = 6 - k;
        ctx.fillRect(Math.round(tx - Math.cos(ang) * k * 1.4 - w / 2), Math.round(ty - Math.sin(ang) * k * 1.4 - 0.5), w, 2);
      }
    }
  }
  function drawScreenFx(W, H, snap, t) {
    const { player, state } = snap;
    if (hurtFlash > 0) {
      const a = Math.min(0.5, hurtFlash * 0.9);
      ctx.fillStyle = `rgba(200,20,10,${a.toFixed(2)})`;
      ctx.fillRect(0, 0, W, 3);
      ctx.fillRect(0, H - 3, W, 3);
      ctx.fillRect(0, 0, 3, H);
      ctx.fillRect(W - 3, 0, 3, H);
    }
    if (state === "play" && player.hp / player.maxHp < 0.3 && Math.floor(t * 3) % 2) {
      ctx.fillStyle = "rgba(200,20,10,.35)";
      ctx.fillRect(0, 0, W, 2);
      ctx.fillRect(0, H - 2, W, 2);
      ctx.fillRect(0, 0, 2, H);
      ctx.fillRect(W - 2, 0, 2, H);
    }
    // гравитация Стража: лиловая рамка и мелкие вихревые точки, обзор не теряется
    if (player.slowT > 0 && state === "play") {
      ctx.fillStyle = "rgba(120,70,200,.35)";
      ctx.fillRect(0, 0, W, 2);
      ctx.fillRect(0, H - 2, W, 2);
      ctx.fillRect(0, 0, 2, H);
      ctx.fillRect(W - 2, 0, 2, H);
      for (let i = 0; i < 14; i++) {
        const a = i * 0.9 + t * 1.8,
          r = 0.5 - ((t * 0.35 + i * 0.07) % 0.35);
        rect(W / 2 + Math.cos(a) * W * r, H * 0.5 + Math.sin(a) * H * r * 0.9, 1, 1, i % 2 ? "#2a1440" : "#8a5ad0");
      }
    }
    if (snap.slowmo > 0) {
      ctx.fillStyle = `rgba(240,224,168,${Math.min(0.25, snap.slowmo * 0.4).toFixed(2)})`;
      ctx.fillRect(0, 0, W, 3);
      ctx.fillRect(0, H - 3, W, 3);
      ctx.fillRect(0, 0, 3, H);
      ctx.fillRect(W - 3, 0, 3, H);
    }
    if (state === "over") {
      ctx.fillStyle = "rgba(10,12,18,.35)";
      ctx.fillRect(0, 0, W, H);
    }
  }
  function drawTouch(W, H, view, inp, size) {
    if (!inp.touch) return;
    const s = view.DPR / size.px,
      SAFE = view.SAFE;
    const jx = inp.joy.id !== null ? inp.joy.ox * s : Math.round(SAFE.l * s) + 34,
      jy = inp.joy.id !== null ? inp.joy.oy * s : H - Math.round(SAFE.b * s) - 42,
      r = JOY_MAX * s;
    const ring = (cx, cy, rad, col) => {
      ctx.fillStyle = col;
      const n = Math.max(16, Math.round(rad * 4));
      for (let i = 0; i < n; i++) ctx.fillRect(Math.round(cx + Math.cos((i / n) * TAU) * rad), Math.round(cy + Math.sin((i / n) * TAU) * rad), 1, 1);
    };
    ring(jx, jy, r, inp.joy.id !== null ? "rgba(255,230,190,.55)" : "rgba(255,230,190,.22)");
    if (inp.joy.id !== null) {
      const dx = clamp(inp.joy.x - inp.joy.ox, -JOY_MAX, JOY_MAX) * s,
        dy = clamp(inp.joy.y - inp.joy.oy, -JOY_MAX, JOY_MAX) * s;
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) rect(jx + dx + x, jy + dy + y, 1, 1, "rgba(255,200,140,.6)");
    }
  }
  function drawPrompts(W, H, view, snap, inp, t) {
    if (snap.state !== "play") return;
    if (inp.touch || inp.locked) return;
    if (inp.dragging) return;
    const cy = Math.round(H * 0.3);
    if (!inp.lockFailed) {
      rect(W / 2 - 92, cy - 8, 184, 30, "rgba(10,6,4,.72)");
      text(tr("fpCapture"), W / 2, cy - 3, "#ffe0b0", 8, "center");
      text(tr("fpCaptureSub"), W / 2, cy + 9, "#bfa98a", 8, "center");
    } else {
      seenNoLock = seenNoLock || t;
      if (t - seenNoLock < 9) {
        const lines = wrap(tr("fpNoLock"), Math.max(12, Math.floor((W * 0.8) / 9)));
        rect(W / 2 - W * 0.42, cy - 6, W * 0.84, lines.length * 11 + 8, "rgba(10,6,4,.72)");
        lines.forEach((l, i) => text(l, W / 2, cy + i * 11, "#ffe0b0", 8, "center"));
      }
    }
  }
  const wrap = (str, n) => {
    const words = str.split(" "),
      out = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > n) {
        out.push(line);
        line = w;
      } else line = (line + " " + w).trim();
    }
    if (line) out.push(line);
    return out;
  };

  return {
    draw(snap, frame, size) {
      const { W, H } = size,
        { dt, look, input: inp, view } = frame,
        t = snap.time;
      ctx.clearRect(0, 0, W, H);
      const state = snap.state,
        inRun = state !== "menu" && state !== "intro";
      // получение урона: сравнение здоровья с прошлым кадром той же игры
      const runTime = snap.time;
      if (runTime < prevRunTime - 0.5) {
        prevHp = null;
        indicators = [];
      }
      prevRunTime = runTime;
      if (state === "play") {
        if (prevHp !== null && snap.player.hp < prevHp - 0.01) {
          hurtFlash = 0.3;
          const p = snap.player;
          let best = null,
            bd = Infinity;
          for (const e of snap.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
            const reach = e.type === "warden" ? WARDEN.slash.reach + 30 : p.r + 46;
            if (d < reach && d < bd) {
              best = e;
              bd = d;
            }
          }
          if (best) indicators.push({ bearing: angleDiff(Math.atan2(best.y - p.y, best.x - p.x), look.yaw), age: 0, all: false });
          else indicators.push({ bearing: 0, age: 0, all: true });
        }
        prevHp = snap.player.hp;
      } else if (state === "pause" || state === "levelup") {
        // без смены здоровья на паузе
      } else prevHp = null;
      hurtFlash = Math.max(0, hurtFlash - dt);
      if (inRun) {
        const moving = Math.hypot(snap.player.vx, snap.player.vy) > 20;
        drawCauldron(W, H, snap, t, frame.sway ? (moving ? Math.sin(t * 9) * 0.9 : Math.sin(t * 1.5) * 0.4) : 0, state === "over");
        drawScreenFx(W, H, snap, t);
        drawIndicators(W, H, dt);
        drawBars(W, H, view, snap, size);
        drawTouch(W, H, view, inp, size);
        drawPrompts(W, H, view, snap, inp, t);
      }
    },
  };
}
