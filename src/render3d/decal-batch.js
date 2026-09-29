import * as THREE from "./three.js";
// Пятна на земле: предупреждения, лужи, тени, кольца. Один InstancedBufferGeometry
// на все; форма рисуется в шейдере по номеру вида (kind), пиксель = 2 ед. земли.
export const DECAL = { warn: 0, impact: 1, tomatoPuddle: 2, beetPool: 3, tomatoWarn: 4, field: 5, shadow: 6, gravity: 7, slash: 8, ally: 9, glow: 10 };
export function createDecalBatch(tracker, material, capacity = 1400) {
  const geo = tracker.track(new THREE.InstancedBufferGeometry());
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  geo.setIndex(plane.index);
  geo.setAttribute("position", plane.attributes.position);
  geo.setAttribute("uv", plane.attributes.uv);
  const make = () => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const A = make(),
    B = make(),
    C = make();
  geo.setAttribute("iA", A);
  geo.setAttribute("iB", B);
  geo.setAttribute("iC", C);
  const mesh = tracker.track(new THREE.Mesh(geo, material));
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  let n = 0;
  const push = (kind, x, z, r, k, life, seed, rgb, alpha, y = 0.4) => {
    if (n >= capacity) return;
    A.setXYZW(n, x, y, z, r);
    B.setXYZW(n, kind, k, life, seed);
    C.setXYZW(n, rgb[0], rgb[1], rgb[2], alpha);
    n++;
  };
  const DEFAULT = [1, 1, 1];
  return {
    mesh,
    begin() {
      n = 0;
    },
    // Мягкая тень предмета на земле.
    shadow: (x, z, r, alpha = 0.5) => push(DECAL.shadow, x, z, r, 0, 1, 0, DEFAULT, alpha, 0.25),
    // Круг заданного вида: r — реальный радиус в мире; k — прогресс 0…1.
    add: (kind, x, z, r, { k = 0, seed = 0, color = DEFAULT, alpha = 1 } = {}) => push(kind, x, z, r, k, 1, seed, color, alpha),
    ring: (kind, x, z, r, opts = {}) => push(kind, x, z, r, opts.k ?? 0, 1, opts.seed ?? 0, opts.color ?? DEFAULT, opts.alpha ?? 1),
    end() {
      geo.instanceCount = n;
      for (const a of [A, B, C]) a.needsUpdate = true;
      mesh.visible = n > 0;
    },
    get count() {
      return n;
    },
  };
}
