import { d2, mulberry32 } from "../shared/math.js";
import { K, WORLD, CX, CY } from "../data/balance.js";
export function createWorld() {
  const trees = [],
    props = [];
  const variants = (family) =>
    Array.from({ length: 5 }, (_, index) => ({ family, index }));
  const OAKS = variants("OAKS"),
    PINES = variants("PINES"),
    OAKS_B = variants("OAKS_B"),
    PINES_B = variants("PINES_B");
  const TENT = { family: "TENT" },
    STUMP = { family: "STUMP" };
  const ROCKS = [0, 1, 2].map((index) => ({
    family: "ROCKS",
    index,
    width: 18 + index * 4,
  }));
  const GRID = 200,
    cgrid = new Map();
  const gkey = (i, j) => i * 1000 + j;
  function addCollider(x, y, r) {
    const c = { x, y, r };
    for (
      let i = Math.floor((x - r) / GRID);
      i <= Math.floor((x + r) / GRID);
      i++
    )
      for (
        let j = Math.floor((y - r) / GRID);
        j <= Math.floor((y + r) / GRID);
        j++
      ) {
        const k = gkey(i, j);
        if (!cgrid.has(k)) cgrid.set(k, []);
        cgrid.get(k).push(c);
      }
  }
  function pushOut(ent) {
    const r = ent.r;
    for (
      let i = Math.floor((ent.x - r) / GRID);
      i <= Math.floor((ent.x + r) / GRID);
      i++
    )
      for (
        let j = Math.floor((ent.y - r) / GRID);
        j <= Math.floor((ent.y + r) / GRID);
        j++
      ) {
        const arr = cgrid.get(gkey(i, j));
        if (!arr) continue;
        for (const c of arr) {
          const dx = ent.x - c.x,
            dy = ent.y - c.y,
            rs = r + c.r,
            dd = dx * dx + dy * dy;
          if (dd < rs * rs) {
            const d = Math.sqrt(dd) || 0.01,
              p = rs - d;
            ent.x += (dx / d) * p;
            ent.y += (dy / d) * p;
          }
        }
      }
  }
  (function genWorld() {
    const R = mulberry32(1337),
      rr = (a, b) => a + R() * (b - a);
    const mkTree = (x, y, big) => {
      const pine = R() < 0.4,
        set = big ? (pine ? PINES_B : OAKS_B) : pine ? PINES : OAKS;
      trees.push({
        kind: "tree",
        x: Math.round(x / K) * K,
        y: Math.round(y / K) * K,
        spr: set[Math.floor(R() * set.length)],
      });
      addCollider(x, y - 4, pine ? 9 : 11);
    };
    for (let side = 0; side < 4; side++)
      for (let s = 0; s <= WORLD.w; s += rr(45, 70))
        for (let row = 0; row < 2; row++) {
          const off = rr(-10, 50) + row * 70;
          const [x, y] =
            side === 0
              ? [s, off]
              : side === 1
                ? [s, WORLD.h - off]
                : side === 2
                  ? [off, s]
                  : [WORLD.w - off, s];
          mkTree(x, y, true);
        }
    let tries = 0;
    while (trees.length < 950 && tries++ < 30000) {
      const x = rr(150, WORLD.w - 150),
        y = rr(150, WORLD.h - 150);
      if (Math.hypot(x - CX, y - CY) < 340) continue;
      const dens =
        0.5 + 0.5 * Math.sin(x * 0.004 + 1.3) * Math.cos(y * 0.0035 - 0.7);
      if (R() > dens * 0.9 + 0.1) continue;
      let ok = true;
      for (const t of trees)
        if (d2(x, y, t.x, t.y) < 80 * 80) {
          ok = false;
          break;
        }
      if (ok) mkTree(x, y, false);
    }
    props.push({ kind: "spr", x: CX - 180, y: CY - 130, s: TENT });
    addCollider(CX - 180, CY - 150, 58);
    const logs = [
      [CX + 160, CY - 80, 0, 84],
      [CX - 70, CY + 175, 0, 104],
      [CX + 230, CY + 150, 0, 76],
      [CX - 250, CY + 60, 0, 66],
    ];
    for (const [x, y, v, len] of logs) {
      const img = {
        width: v ? 11 : Math.round(len / K) + 2,
        height: v ? Math.round(len / K) + 2 : 11,
      };
      props.push({
        kind: "spr",
        x,
        y,
        s: {
          family: "LOG",
          len: len / K,
          vert: !!v,
          ax: Math.floor(img.width / 2),
          ay: v ? img.height - 2 : 8,
        },
      });
      for (let k = -1; k <= 1; k++)
        addCollider(
          v ? x : x + k * len * 0.33,
          v ? y - len * (0.5 + k * 0.33) : y - 4,
          12,
        );
    }
    for (let k = 0; k < 70; k++) {
      const x = rr(200, WORLD.w - 200),
        y = rr(200, WORLD.h - 200);
      if (Math.hypot(x - CX, y - CY) < 300) continue;
      if (R() < 0.45) {
        props.push({ kind: "spr", x, y, s: STUMP });
        addCollider(x, y - 6, 14);
      } else {
        const s = ROCKS[Math.floor(R() * 3)];
        props.push({ kind: "spr", x, y, s });
        addCollider(x, y - 6, s.width * 0.8);
      }
    }
  })();

  return { trees, props, pushOut };
}
