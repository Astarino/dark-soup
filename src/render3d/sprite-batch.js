import * as THREE from "./three.js";
// Пачка спрайтов-«плакатов»: один InstancedBufferGeometry на материал, экземпляры
// пишутся в общие типизированные массивы каждый кадр. Ничего не создаётся на
// каждый кадр: массивы и атрибуты живут, пока вид включён.
export function createSpriteBatch(tracker, material, capacity) {
  const geo = tracker.track(new THREE.InstancedBufferGeometry());
  const plane = new THREE.PlaneGeometry(1, 1);
  geo.setIndex(plane.index);
  geo.setAttribute("position", plane.attributes.position);
  geo.setAttribute("uv", plane.attributes.uv);
  const make = (size) => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attr.setUsage(THREE.DynamicDrawUsage);
    return attr;
  };
  const pos = make(3),
    sizeA = make(2),
    uvA = make(4),
    tint = make(4),
    extra = make(4);
  geo.setAttribute("iPos", pos);
  geo.setAttribute("iSize", sizeA);
  geo.setAttribute("iUv", uvA);
  geo.setAttribute("iTint", tint);
  geo.setAttribute("iExtra", extra);
  const mesh = tracker.track(new THREE.Mesh(geo, material));
  mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh,
    get count() {
      return n;
    },
    begin() {
      n = 0;
    },
    // x,y,z — низ по центру; w,h — размер в мире; u,v,du,dv — прямоугольник в атласе.
    push(x, y, z, w, h, u, v, du, dv, flash = 0, charm = 0, fade = 1, glow = 0) {
      if (n >= capacity) return false;
      pos.setXYZ(n, x, y, z);
      sizeA.setXY(n, w, h);
      uvA.setXYZW(n, u, v, du, dv);
      tint.setXYZW(n, flash, charm, fade, glow);
      n++;
      return true;
    },
    end() {
      geo.instanceCount = n;
      for (const a of [pos, sizeA, uvA, tint, extra]) a.needsUpdate = true;
      mesh.visible = n > 0;
    },
  };
}
