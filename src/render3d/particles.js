import * as THREE from "./three.js";
// Частицы: один пул фиксированного размера, один InstancedBufferGeometry.
// Постепенное исчезновение — дизерингом в шейдере, поэтому пиксельно и без
// полупрозрачности. Число частиц ограничено настройкой качества.
export function createParticles(tracker, material, capacity, rng) {
  const geo = tracker.track(new THREE.InstancedBufferGeometry());
  const plane = new THREE.PlaneGeometry(1, 1);
  geo.setIndex(plane.index);
  geo.setAttribute("position", plane.attributes.position);
  geo.setAttribute("uv", plane.attributes.uv);
  const P = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4),
    Cc = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  P.setUsage(THREE.DynamicDrawUsage);
  Cc.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("iP", P);
  geo.setAttribute("iCol", Cc);
  const mesh = tracker.track(new THREE.Mesh(geo, material));
  mesh.frustumCulled = false;
  const list = [];
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  let budget = 1;
  return {
    mesh,
    setBudget: (b) => (budget = b),
    get budgetRate() {
      return budget;
    },
    get count() {
      return list.length;
    },
    // color — «#rrggbb»; g — ускорение вниз; grow — рост размера за жизнь.
    emit({ x, y, z, vx = 0, vy = 0, vz = 0, g = 0, life = 0.6, size = 2, color = "#ffffff", grow = 0, drag = 0, priority = 1 }) {
      if (list.length >= capacity * budget) return;
      if (priority < 1 && rng() > budget) return;
      list.push({ x, y, z, vx, vy, vz, g, life, t: 0, size, color: hex(color), grow, drag });
    },
    burst(n, make) {
      for (let i = 0; i < n; i++) this.emit(make(i));
    },
    update(dt) {
      let j = 0;
      for (const p of list) {
        p.t += dt;
        if (p.t >= p.life) continue;
        p.vy -= p.g * dt;
        if (p.drag) {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vz *= k;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.6) {
          p.y = 0.6;
          p.vy *= -0.25;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        list[j++] = p;
      }
      list.length = j;
      for (let i = 0; i < j; i++) {
        const p = list[i],
          k = p.t / p.life;
        P.setXYZW(i, p.x, p.y, p.z, Math.max(0.6, p.size * (1 + p.grow * k)));
        Cc.setXYZW(i, p.color[0], p.color[1], p.color[2], k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      }
      geo.instanceCount = j;
      P.needsUpdate = Cc.needsUpdate = true;
      mesh.visible = j > 0;
    },
    clear() {
      list.length = 0;
    },
  };
}
