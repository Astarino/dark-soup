import * as THREE from "./three.js";
// Материалы вида от первого лица. Стандартные PBR-материалы Three.js не
// используются намеренно: одно общее освещение (луна + костёр + туман) и одни
// правила дизеринга дают единую «пиксельную» картинку, где спрайты, объёмные
// модели и лужи на земле не спорят по стилю.
// Цвета — как в палитрах игры, без перевода между цветовыми пространствами.
THREE.ColorManagement.enabled = false;

const COMMON = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uAmbient; uniform vec3 uMoonColor; uniform vec3 uMoonDir;
uniform vec3 uFireColor; uniform vec3 uFirePos; uniform float uFireRadius; uniform float uFireOn;
uniform float uTime;
float bayer4(vec2 p){
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[x + y * 4] + 0.5) / 16.0;
}
float fireLight(vec3 wp, vec3 n){
  vec3 to = uFirePos - wp; float d = length(to);
  float fall = clamp(1.0 - d / uFireRadius, 0.0, 1.0); fall *= fall;
  float wrap = 0.5 + 0.5 * max(dot(n, to / max(d, 0.001)), 0.0);
  return fall * wrap * uFireOn;
}
vec3 applyLight(vec3 albedo, vec3 wp, vec3 n, float floorLight){
  float moon = 0.28 + 0.72 * max(dot(n, uMoonDir), 0.0);
  vec3 light = uAmbient + uMoonColor * moon + uFireColor * fireLight(wp, n);
  return albedo * max(light, vec3(floorLight));
}
float fogAmount(vec3 wp){
  float d = length(wp - cameraPosition);
  float f = smoothstep(uFogNear, uFogFar, d);
  float haze = 1.0 - smoothstep(0.0, 70.0, wp.y);   // у земли дымка гуще
  return clamp(f + f * haze * 0.35, 0.0, 1.0);
}
`;

const LIT_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
void main(){
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  p = modelMatrix * p; n = mat3(modelMatrix) * n;
  vWorld = p.xyz; vNormal = normalize(n); vUv = uv;
  #ifdef USE_COLOR
    vColor = color;
  #else
    vColor = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * p;
}`;
const LIT_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D map; uniform float uEmissive; uniform float uAlphaTest; uniform vec3 uTint; uniform vec2 uNearFade; uniform float uOpacity;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
void main(){
  vec4 t = texture2D(map, vUv);
  if (t.a < uAlphaTest) discard;
  if (uOpacity < bayer4(gl_FragCoord.xy + 1.0)) discard;   // «стекло» по сетке Байера (листья капусты)
  // Близкие предметы (луковицы, дольки) растворяются по сетке Байера: без крупных пятен.
  if (smoothstep(uNearFade.x, uNearFade.y, length(vWorld - cameraPosition)) < bayer4(gl_FragCoord.xy)) discard;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 albedo = t.rgb * vColor * uTint;
  vec3 col = applyLight(albedo, vWorld, n, 0.0) + albedo * uEmissive;
  col = mix(col, uFogColor, fogAmount(vWorld));
  gl_FragColor = vec4(col, 1.0);
}`;

const SPRITE_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iUv; attribute vec4 iTint; attribute vec4 iExtra;
varying vec2 vUv; varying vec3 vWorld; varying vec4 vTint; varying vec4 vExtra;
void main(){
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  right = normalize(vec3(right.x, 0.0, right.z));
  vec3 wp = iPos + right * (position.x * iSize.x) + vec3(0.0, (position.y + 0.5) * iSize.y, 0.0);
  vUv = iUv.xy + vec2(uv.x, 1.0 - uv.y) * iUv.zw;
  vWorld = wp; vTint = iTint; vExtra = iExtra;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SPRITE_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D map; uniform vec2 uNearFade; uniform float uSpriteFloor; uniform vec3 uCharm[5];
varying vec2 vUv; varying vec3 vWorld; varying vec4 vTint; varying vec4 vExtra;
void main(){
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  float dist = length(vWorld - cameraPosition);
  // Близкий крупный спрайт растворяется по сетке Байера, а не пропадает рывком.
  float vis = smoothstep(uNearFade.x, uNearFade.y, dist) * vTint.z;
  if (vis < bayer4(gl_FragCoord.xy)) discard;
  vec3 albedo = t.rgb;
  float lum = dot(albedo, vec3(0.3, 0.55, 0.15));
  float glow = smoothstep(0.62, 0.9, max(albedo.r, max(albedo.g, albedo.b)));   // глаза, блики клинка, шары
  if (vTint.y > 0.5) {   // обращён свёклой: тот же силуэт в свекольных тонах
    float k = clamp(lum * 1.35, 0.0, 1.0) * 4.0;
    int i = int(min(floor(k), 3.0));
    albedo = mix(uCharm[i], uCharm[i + 1], fract(k) > 0.5 ? 1.0 : 0.0);
    glow = max(glow, 0.0);
  }
  vec3 n = normalize(vec3(0.0, 0.55, 0.85));
  vec3 col = applyLight(albedo, vWorld, n, uSpriteFloor);
  col = mix(col, albedo, glow * 0.85);
  col += albedo * vTint.w;                              // собственное свечение (горение, союзники)
  col = mix(col, vec3(1.0, 0.82, 0.55), vTint.x * 0.3);   // вспышка попадания: тёплая и мягкая — толпа не превращается в светлое пятно
  col = mix(col, uFogColor, fogAmount(vWorld) * 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;

const DECAL_VERT = /* glsl */ `
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
varying vec2 vLocal; varying vec4 vB; varying vec4 vC; varying float vR; varying vec3 vWorld;
void main(){
  float m = 1.2;
  vec2 loc = position.xz * 2.0 * m;
  vec3 wp = vec3(iA.x, iA.y, iA.z) + vec3(loc.x, 0.0, loc.y) * iA.w;
  vLocal = loc; vB = iB; vC = iC; vR = iA.w; vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const DECAL_FRAG = /* glsl */ `
${COMMON}
varying vec2 vLocal; varying vec4 vB; varying vec4 vC; varying float vR; varying vec3 vWorld;
float ring(float r, float R, float w){ return step(abs(r - R), w); }
float dashes(vec2 q, float n, float phase, float duty){
  float a = atan(q.y, q.x) / 6.2831853 + 0.5;
  return step(fract(a * n + phase), duty);
}
void main(){
  vec2 w = vLocal * vR;
  vec2 q = (floor(w / 2.0) + 0.5) * 2.0;     // пиксель лужи = пиксель земли (2 ед.)
  float r = length(q);
  float kind = vB.x, k = vB.y, seed = vB.w;
  vec3 col = vC.rgb; float a = 0.0;
  float px = bayer4(floor(w / 2.0));
  if (kind < 0.5) {            // морковь: предупреждение о падении
    float edge = ring(r, vR, 1.6) * dashes(q, max(10.0, vR * 0.5), uTime * 0.6, 0.62);
    float fill = step(r, vR) * 0.10;
    float shadow = step(r, 3.0 + 9.0 * k) * (0.35 + 0.35 * k);
    a = max(max(edge * (0.55 + 0.4 * k), fill), shadow);
    col = mix(vC.rgb, vec3(0.05, 0.03, 0.02), step(0.05, shadow) * step(edge, 0.5));
  } else if (kind < 1.5) {     // удар: расширяющееся кольцо и воронка
    float R2 = vR * (0.6 + 0.6 * k);
    float e1 = ring(r, R2, 1.6), e2 = ring(r, R2 - 3.0, 1.4);
    float crater = step(r, 9.0) * 0.6 * (1.0 - k);
    a = max(max(e1 * (1.0 - k), e2 * 0.8 * (1.0 - k)), crater);
    col = e1 > 0.5 ? vec3(1.0, 0.8, 0.47) : (e2 > 0.5 ? vec3(1.0, 0.47, 0.16) : vec3(0.08, 0.05, 0.03));
  } else if (kind < 2.5) {     // томатная лужа: полупрозрачная, чтобы земля и враги читались
    float edge = ring(r, vR, 1.7);
    float fill = step(r, vR);
    float speck = step(0.93, fract(sin(dot(q, vec2(12.9898, 78.233)) + seed) * 43758.5453));
    float hi = step(length(q - vec2(-vR * 0.25, -vR * 0.12)), vR * 0.32);
    a = max(edge * 0.75, fill * (0.30 + 0.08 * hi + 0.12 * speck));
    col = edge > 0.5 ? vec3(0.95, 0.27, 0.2) : (speck > 0.5 ? vec3(0.96, 0.88, 0.63) : mix(vec3(0.6, 0.08, 0.06), vec3(0.85, 0.2, 0.14), hi));
  } else if (kind < 3.5) {     // свекольная лужа: плотная, лежит на земле
    float edge = ring(r, vR, 1.7) * dashes(q, max(12.0, vR * 0.6), -uTime * 0.25, 0.7);
    float fill = step(r, vR);
    float hi = step(length(q - vec2(-vR * 0.2, -vR * 0.1)), vR * 0.6);
    float bub = step(0.97, fract(sin(dot(floor(w / 4.0), vec2(4.1, 19.7)) + seed + floor(uTime * 1.1)) * 9371.13));
    a = max(fill * 0.88, edge);
    col = edge > 0.5 ? vec3(0.9, 0.28, 0.55) : (bub > 0.5 ? vec3(0.88, 0.38, 0.6) : mix(vec3(0.43, 0.06, 0.23), vec3(0.6, 0.1, 0.31), hi));
  } else if (kind < 4.5) {     // помидор: место падения
    float edge = ring(r, vR, 1.6) * dashes(q, max(10.0, vR * 0.5), uTime * 0.8, 0.6);
    float fill = step(r, vR) * 0.10;
    float shadow = step(r, 3.0 + 8.0 * k) * (0.3 + 0.4 * k);
    a = max(max(edge * (0.55 + 0.4 * k), fill), shadow);
    col = mix(vec3(1.0, 0.3, 0.24), vec3(0.06, 0.02, 0.02), step(0.05, shadow) * step(edge, 0.5));
  } else if (kind < 5.5) {     // граница поля капусты
    float edge = ring(r, vR, 1.4) * dashes(q, max(16.0, vR * 0.4), uTime * 0.3, 0.5);
    a = max(edge * 0.55, step(r, vR) * 0.045);
    col = vec3(0.67, 0.9, 0.43);
  } else if (kind < 6.5) {     // тень под предметом: мягкий диск
    float d = r / vR;
    a = step(px * 0.9, (1.0 - d) * 1.4) * step(d, 1.0) * 0.5;
    col = vec3(0.0);
  } else if (kind < 7.5) {     // гравитация Стража: пунктир и сжимающееся кольцо
    float edge = ring(r, vR, 1.8) * dashes(q, max(18.0, vR * 0.3), uTime * 0.5, 0.55);
    float inner = ring(r, vR * k, 1.6);
    a = max(edge * (0.3 + 0.45 * k), inner * 0.5) + step(r, vR) * 0.035;
    col = inner > 0.5 ? vec3(0.1, 0.03, 0.18) : vec3(0.6, 0.35, 0.86);
  } else if (kind < 8.5) {     // замах клинка Стража
    float edge = ring(r, vR, 1.6) * dashes(q, max(14.0, vR * 0.6), uTime * 1.2, 0.5);
    a = max(edge * (0.35 + 0.6 * k), step(r, vR) * 0.08 * k);
    col = vec3(1.0, 0.24, 0.2);
  } else if (kind < 9.5) {     // союзник (свёкла): розовое кольцо под ногами
    a = ring(r, vR, 1.4) * (0.55 + 0.35 * sin(uTime * 6.0 + seed));
    col = vec3(0.95, 0.45, 0.7);
  } else {                     // опыт: тёплый блик на земле
    float d = r / vR; a = step(px, (1.0 - d) * 1.2) * step(d, 1.0) * 0.35; col = vec3(1.0, 0.8, 0.3);
  }
  a *= vC.w;
  if (a <= 0.01) discard;
  float f = fogAmount(vWorld) * 0.5;           // предупреждения читаются и издалека
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, a * (1.0 - f * 0.4));
}`;

const PARTICLE_VERT = /* glsl */ `
attribute vec4 iP; attribute vec4 iCol;
varying vec4 vCol; varying vec3 vWorld; varying vec2 vQ;
void main(){
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  // Близкие к камере частицы уменьшаются до нуля (а не превращаются в крупные квадраты).
  float shrink = smoothstep(14.0, 62.0, length(iP.xyz - cameraPosition));
  vec3 wp = iP.xyz + (right * position.x + up * position.y) * iP.w * shrink;
  vCol = iCol; vWorld = wp; vQ = position.xy * 2.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const PARTICLE_FRAG = /* glsl */ `
${COMMON}
varying vec4 vCol; varying vec3 vWorld; varying vec2 vQ;
void main(){
  if (vCol.a < bayer4(gl_FragCoord.xy)) discard;
  vec3 col = mix(vCol.rgb, uFogColor, fogAmount(vWorld) * 0.7);
  gl_FragColor = vec4(col, 1.0);
}`;

const POST_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform float uLevels; uniform float uVignette; uniform vec3 uGrade; uniform float uExposure;
varying vec2 vUv;
float bayer4(vec2 p){
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[x + y * 4] + 0.5) / 16.0;
}
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  vec2 v = vUv - 0.5;
  c *= 1.0 - uVignette * dot(v, v) * 2.2;
  c *= uGrade;
  c = 1.0 - exp(-c * uExposure);   // мягкая «плёночная» кривая: тёмные тона поднимаются, света не выгорают
  // Ограниченная палитра: квантование каналов с упорядоченным дизерингом.
  float b = bayer4(gl_FragCoord.xy);
  c = floor(c * uLevels + b) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;

export const LIGHTING = {
  fog: "#0b1211",
  ambient: "#34444c",
  moon: "#5a7098",
  moonDir: [-0.45, 0.8, 0.4],
  fire: "#ff9a48",
  fireRadius: 340,
  spriteFloor: 0.34,
};
export const CHARM_RAMP = ["#3a0a24", "#5e1238", "#8a1c50", "#b8306e", "#e0609a"];

export function createMaterials(tracker) {
  const c = (hex) => new THREE.Color(hex);
  const md = LIGHTING.moonDir,
    U = {
      uFogColor: { value: c(LIGHTING.fog) },
      uFogNear: { value: 240 },
      uFogFar: { value: 820 },
      uAmbient: { value: c(LIGHTING.ambient) },
      uMoonColor: { value: c(LIGHTING.moon) },
      uMoonDir: { value: new THREE.Vector3(md[0], md[1], md[2]).normalize() },
      uFireColor: { value: c(LIGHTING.fire).multiplyScalar(2.2) },
      uFirePos: { value: new THREE.Vector3(0, 30, 0) },
      uFireRadius: { value: LIGHTING.fireRadius },
      uFireOn: { value: 1 },
      uTime: { value: 0 },
    };
  const make = (params) => tracker.track(new THREE.ShaderMaterial(params));
  return {
    uniforms: U,
    lit({ map, side = THREE.FrontSide, alphaTest = 0, vertexColors = false, emissive = 0, tint = "#ffffff", nearFade = [0, 0.001], opacity = 1 }) {
      return make({
        vertexShader: LIT_VERT,
        fragmentShader: LIT_FRAG,
        uniforms: { ...U, map: { value: map }, uEmissive: { value: emissive }, uAlphaTest: { value: alphaTest }, uTint: { value: c(tint) }, uNearFade: { value: new THREE.Vector2(nearFade[0], nearFade[1]) }, uOpacity: { value: opacity } },
        side,
        vertexColors,
      });
    },
    sprite(map) {
      return make({
        vertexShader: SPRITE_VERT,
        fragmentShader: SPRITE_FRAG,
        uniforms: {
          ...U,
          map: { value: map },
          uNearFade: { value: new THREE.Vector2(12, 34) },
          uSpriteFloor: { value: LIGHTING.spriteFloor },
          uCharm: { value: CHARM_RAMP.map(c) },
        },
        side: THREE.DoubleSide,
      });
    },
    decal() {
      return make({
        vertexShader: DECAL_VERT,
        fragmentShader: DECAL_FRAG,
        uniforms: { ...U },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      });
    },
    particle() {
      return make({ vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, uniforms: { ...U }, side: THREE.DoubleSide });
    },
    post(target) {
      return make({
        vertexShader: POST_VERT,
        fragmentShader: POST_FRAG,
        uniforms: { tScene: { value: target.texture }, uLevels: { value: 14 }, uVignette: { value: 0.5 }, uExposure: { value: 2.1 }, uGrade: { value: new THREE.Vector3(1.02, 1.0, 1.04) } },
        depthTest: false,
        depthWrite: false,
      });
    },
  };
}
