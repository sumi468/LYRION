/**
 * GLSL 文字列。three.js の ShaderMaterial(GLSL ES 3.00 へ自動変換される)で使う。
 * 重い処理(ノイズによる地表生成)は起動時に 1 度だけテクスチャへベイクし、
 * 毎フレームのシェーダーは「テクスチャ参照 + 簡易ライティング」だけにしている。
 */

export const NOISE_GLSL = /* glsl */ `
const float PI = 3.14159265359;
const float TAU = 6.28318530718;

vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    s += a * snoise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}

vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Worley: x = F1, y = F2
vec2 voronoi(vec3 p){
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(ip + g);
    float d = length(g + o - fp);
    if (d < f1){ f2 = f1; f1 = d; }
    else if (d < f2){ f2 = d; }
  }
  return vec2(f1, f2);
}

// クレーター: セルごとにランダムな円形窪地 + リム
float craters(vec3 p, float seed){
  vec3 ip = floor(p);
  float res = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec3 g = ip + vec3(float(x), float(y), float(z));
    vec3 h = hash33(g + seed * 7.13);
    if (h.x < 0.35) continue;
    vec3 c = g + 0.15 + h * 0.7;
    float r = mix(0.10, 0.46, h.z * h.z);
    float d = length(p - c) / r;
    float bowl = d < 1.0 ? -(1.0 - d * d) : 0.0;
    float rim = exp(-pow((d - 1.05) * 5.5, 2.0)) * 0.42;
    res += bowl * 0.9 + rim;
  }
  return res;
}
`;

/** ベイク用の全画面パス(頂点) */
export const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 地表ベイクのフラグメント。#define PROGRAM で分岐(0..6, 10=sky) */
export const BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uSea;

${NOISE_GLSL}

vec3 dirFromUv(vec2 uv){
  float phi = uv.x * TAU;
  float theta = (1.0 - uv.y) * PI;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}

// ---- 0: 岩石惑星 ----
vec4 progRocky(vec3 d){
  vec3 p = d * 2.2 + uSeed * 3.7;
  float base = fbm(p, 6) * 0.5 + 0.5;
  float ridge = 1.0 - abs(snoise(p * 2.0 + 7.0));
  ridge *= ridge;
  float h = base * 0.75 + ridge * 0.25 * smoothstep(0.35, 0.7, base);
  float cr = craters(d * 3.0, uSeed) + craters(d * 8.0, uSeed + 5.0) * 0.7 + craters(d * 21.0, uSeed + 9.0) * 0.5;
  h += cr * 0.12;
  float plains = smoothstep(0.38, 0.5, base);
  vec3 col = mix(uC0, uC1, smoothstep(0.30, 0.62, h));
  col = mix(col, uC2, smoothstep(0.58, 0.88, h) * plains);
  float fine = snoise(d * 60.0) * 0.5 + 0.5;
  col *= 0.82 + 0.3 * fine;
  col *= 1.0 + cr * 0.12;
  return vec4(col, clamp(h, 0.0, 1.0));
}

// ---- 1: 海洋惑星 ----
vec4 progTerran(vec3 d){
  vec3 p = d * 1.7 + uSeed * 1.3;
  float h = fbm(p, 6) * 0.5 + 0.5 + 0.10 * snoise(d * 6.0 + 1.0);
  h = clamp(h, 0.0, 1.0);
  float lat = abs(d.y);
  float land = smoothstep(uSea - 0.012, uSea + 0.012, h);
  float elev = max(h - uSea, 0.0) / (1.0 - uSea);
  float depth = clamp((uSea - h) / uSea, 0.0, 1.0);
  vec3 ocean = mix(uC0 * 2.6, uC0 * 0.45, smoothstep(0.0, 0.55, depth));
  float moist = fbm(d * 3.0 + uSeed * 7.0, 4) * 0.5 + 0.5;
  float arid = smoothstep(0.1, 0.45, 1.0 - abs(d.y - 0.18) * 2.6) * 0.5 + (1.0 - moist) * 0.7;
  vec3 landCol = mix(uC1, uC2, smoothstep(0.45, 0.8, arid));
  landCol *= 0.8 + 0.4 * (snoise(d * 30.0) * 0.5 + 0.5);
  landCol = mix(landCol, vec3(0.30, 0.27, 0.24), smoothstep(0.5, 0.85, elev));
  float snow = smoothstep(0.80, 0.9, lat + 0.07 * snoise(d * 9.0));
  snow = max(snow, smoothstep(0.62, 0.95, elev) * smoothstep(0.35, 0.7, lat + 0.15));
  vec3 col = mix(ocean, landCol, land);
  col = mix(col, vec3(0.86, 0.9, 0.95), clamp(snow, 0.0, 1.0));
  float outH = max(mix(uSea, h, land), uSea + 0.05 * snow);
  return vec4(col, outH);
}

// ---- 2: 氷 ----
vec4 progIce(vec3 d){
  float base = fbm(d * 3.0 + uSeed, 5) * 0.5 + 0.5;
  vec3 col = mix(uC2, uC1, smoothstep(0.3, 0.7, base));
  col = mix(col, uC0, 0.35 + 0.2 * snoise(d * 14.0));
  // 大きな縞(自転軸が傾いた巨大氷惑星のゆるい帯)
  float bands = snoise(vec3(d.y * 5.0, uSeed, 0.5)) * 0.5 + 0.5;
  col = mix(col, uC2, bands * 0.25 * step(30.0, uSeed));
  vec2 v = voronoi(d * 5.0 + uSeed);
  float edge = v.y - v.x;
  float crack = (1.0 - smoothstep(0.0, 0.07, edge)) * smoothstep(0.30, 0.6, fbm(d * 7.0, 3) * 0.5 + 0.5);
  crack *= step(uSeed, 30.0);
  col = mix(col, uC2 * 0.45, crack * 0.6);
  float cr = craters(d * 6.0, uSeed) * 0.5;
  col *= 1.0 + cr * 0.1;
  float h = base * 0.5 + cr * 0.15 - crack * 0.2 + 0.25;
  return vec4(col, clamp(h, 0.0, 1.0));
}

// ---- 3: ガス惑星 ----
vec4 progGas(vec3 d){
  float warp = fbm(vec3(d.x * 2.5, d.y * 0.9, d.z * 2.5) + uSeed, 5) * 0.14;
  float y = d.y + warp;
  float bands = sin(y * 24.0 + 0.9 * sin(y * 7.3)) * 0.5 + 0.5;
  float fine = snoise(vec3(d.x * 5.0, y * 52.0, d.z * 5.0) + uSeed) * 0.5 + 0.5;
  float turb = fbm(d * vec3(5.0, 15.0, 5.0) + uSeed, 5) * 0.5 + 0.5;
  float v = mix(bands, fine, 0.22) + (turb - 0.5) * 0.30;
  vec3 col = mix(uC1, uC0, smoothstep(0.28, 0.72, v));
  col = mix(col, uC2, smoothstep(0.58, 1.0, turb * 0.85 + (1.0 - bands) * 0.2) * 0.6);
  // 巨大な嵐(南半球)
  float lon = atan(d.z, d.x);
  float dl = lon - 2.2;
  dl = atan(sin(dl), cos(dl));
  float dla = asin(clamp(d.y, -1.0, 1.0)) + 0.36;
  float st = exp(-(pow(dl / 0.26, 2.0) + pow(dla / 0.12, 2.0)));
  float swirl = snoise(vec3(dl * 9.0 + dla * 14.0, dla * 12.0 - dl * 7.0, uSeed)) * 0.5 + 0.5;
  col = mix(col, mix(vec3(0.62, 0.27, 0.16), vec3(0.88, 0.62, 0.4), swirl), clamp(st * 1.15, 0.0, 1.0));
  col *= mix(1.0, 0.68, smoothstep(0.72, 1.0, abs(d.y)));
  return vec4(col, v);
}

// ---- 4: 月(レゴリス+マリア) ----
vec4 progMoon(vec3 d){
  float base = fbm(d * 3.2 + uSeed, 6) * 0.5 + 0.5;
  float cr = craters(d * 3.0, uSeed) + craters(d * 7.5, uSeed + 3.0) * 0.8 + craters(d * 19.0, uSeed + 6.0) * 0.6 + craters(d * 44.0, uSeed + 8.0) * 0.4;
  float mare = smoothstep(0.52, 0.64, fbm(d * 1.4 + uSeed * 2.0, 4) * 0.5 + 0.5);
  float h = base * 0.55 + cr * 0.11 + 0.2;
  vec3 col = mix(uC1, uC2, smoothstep(0.35, 0.75, base + cr * 0.1));
  col = mix(col, uC0, mare * 0.85);
  col *= 0.85 + 0.25 * (snoise(d * 70.0) * 0.5 + 0.5);
  col *= 1.0 + cr * 0.10;
  return vec4(col, clamp(h, 0.0, 1.0));
}

// ---- 5: 溶岩衛星 ----
vec4 progLava(vec3 d){
  float base = fbm(d * 4.0 + uSeed, 5) * 0.5 + 0.5;
  vec3 crust = mix(uC0, uC1, smoothstep(0.35, 0.7, base));
  float sulfur = smoothstep(0.58, 0.75, fbm(d * 2.2 + uSeed * 3.0, 4) * 0.5 + 0.5);
  crust = mix(crust, vec3(0.34, 0.26, 0.06), sulfur * 0.7);
  vec2 v1 = voronoi(d * 4.5 + uSeed);
  vec2 v2 = voronoi(d * 11.0 + uSeed * 2.0);
  float e1 = v1.y - v1.x;
  float e2 = v2.y - v2.x;
  float crack = max(1.0 - smoothstep(0.0, 0.055, e1), (1.0 - smoothstep(0.0, 0.07, e2)) * 0.8);
  float lakes = smoothstep(0.66, 0.74, fbm(d * 3.0 + uSeed * 5.0, 4) * 0.5 + 0.5);
  float lava = clamp(max(crack, lakes), 0.0, 1.0);
  float h = mix(0.35 + base * 0.45, 0.05, lava);
  vec3 col = mix(crust, uC2, lava);
  return vec4(col, h);
}

// ---- 6: 雲(アルファに密度) ----
vec4 progCloud(vec3 d){
  float lat = d.y;
  float ang = sin(lat * 6.0) * 0.8 + lat * 0.6;
  float c = cos(ang);
  float s = sin(ang);
  vec3 p = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
  float n = fbm(p * vec3(2.4, 4.6, 2.4) + uSeed, 6) * 0.5 + 0.5;
  float sw = fbm(p * 5.5 + uSeed * 2.0, 5) * 0.5 + 0.5;
  float v = n * 0.72 + sw * 0.36;
  float dens = smoothstep(1.0 - uSea - 0.12, 1.0 - uSea + 0.22, v);
  return vec4(1.0, 1.0, 1.0, dens);
}

// ---- 10: 背景(天の川+星雲) 等距円筒 ----
vec4 progSky(vec3 d){
  vec3 n = normalize(vec3(0.35, 1.0, 0.18));
  float off = dot(d, n);
  float band = exp(-pow(off / 0.2, 2.0));
  float cloudy = fbm(d * 3.5 + 2.0, 6) * 0.5 + 0.5;
  float core = exp(-pow(dot(d, normalize(vec3(0.85, 0.1, -0.5))) * 1.0 - 1.0, 2.0) * 9.0);
  float mw = band * (0.30 + 0.55 * cloudy) * (0.7 + 0.8 * core);
  float lanes = smoothstep(0.52, 0.72, fbm(d * 7.0 + 3.0, 5) * 0.5 + 0.5) * band;
  mw *= 1.0 - 0.75 * lanes;
  vec3 mwCol = mix(vec3(0.42, 0.50, 0.75), vec3(0.95, 0.80, 0.62), clamp(core * 0.8 + cloudy * 0.2, 0.0, 1.0));
  vec3 col = mwCol * mw * 0.34;

  // 星雲 2 つ
  vec3 a = normalize(vec3(-0.55, 0.25, 0.8));
  float na = smoothstep(0.55, 0.97, dot(d, a));
  float fa = fbm(d * 5.0 + 9.0, 6) * 0.5 + 0.5;
  col += vec3(0.65, 0.12, 0.30) * na * smoothstep(0.35, 0.8, fa) * 0.38;
  col += vec3(0.12, 0.25, 0.7) * na * smoothstep(0.5, 0.9, fbm(d * 8.0 + 4.0, 5) * 0.5 + 0.5) * 0.25;

  vec3 b = normalize(vec3(0.6, -0.45, -0.6));
  float nb = smoothstep(0.7, 0.98, dot(d, b));
  float fb = fbm(d * 6.0 + 21.0, 6) * 0.5 + 0.5;
  col += vec3(0.08, 0.5, 0.58) * nb * smoothstep(0.4, 0.8, fb) * 0.30;
  col += vec3(0.35, 0.18, 0.55) * nb * smoothstep(0.55, 0.9, fbm(d * 10.0 + 8.0, 4) * 0.5 + 0.5) * 0.22;

  // 全体にごく淡い宇宙背景光(暗さは保つ)
  col += vec3(0.004, 0.006, 0.012);
  // 8bit のバンディング対策
  col += (hash13(vec3(gl_FragCoord.xy, uSeed)) - 0.5) / 255.0;
  return vec4(col, 1.0);
}

void main(){
  vec3 d = dirFromUv(vUv);
  vec4 r;
#if PROGRAM == 0
  r = progRocky(d);
#elif PROGRAM == 1
  r = progTerran(d);
#elif PROGRAM == 2
  r = progIce(d);
#elif PROGRAM == 3
  r = progGas(d);
#elif PROGRAM == 4
  r = progMoon(d);
#elif PROGRAM == 5
  r = progLava(d);
#elif PROGRAM == 6
  r = progCloud(d);
#else
  r = progSky(d);
#endif
  gl_FragColor = r;
}
`;

// ------------------------------------------------------------------ 惑星本体

export const PLANET_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorldRel;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  vWorldRel = mat3(modelMatrix) * position;
  gl_Position = projectionMatrix * mv;
}
`;

export const PLANET_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorldRel;

uniform sampler2D uMap;
uniform vec3 uSunDirV;
uniform vec3 uSunDirW;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uBump;
uniform float uSea;
uniform float uSpec;
uniform float uLava;
uniform float uTwilight;
#ifdef USE_RING
uniform sampler2D uRingTex;
uniform float uRingIn;
uniform float uRingOut;
uniform mat3 uRingInv;
#endif
#ifdef USE_CLOUDSHADOW
uniform sampler2D uCloudTex;
uniform float uCloudOffset;
#endif

vec3 bumpNormal(vec3 N, float h, float scale){
  vec3 dpdx = dFdx(vViewPos);
  vec3 dpdy = dFdy(vViewPos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - scale * grad);
}

void main(){
  vec4 t = texture2D(uMap, vUv);
  vec3 albedo = t.rgb;
  float h = t.a;
  vec3 Ng = normalize(vNormalV);
  vec3 N = Ng;
  if (uBump > 0.0) N = bumpNormal(Ng, h, uBump);
  vec3 L = normalize(uSunDirV);
  float ndlGeo = dot(Ng, L);
  float diff = max(dot(N, L), 0.0) * smoothstep(-0.04, 0.10, ndlGeo);

  float shadow = 1.0;
#ifdef USE_CLOUDSHADOW
  float cs = texture2D(uCloudTex, vec2(vUv.x + uCloudOffset, vUv.y)).a;
  shadow *= 1.0 - 0.5 * cs;
#endif
#ifdef USE_RING
  {
    vec3 pr = uRingInv * vWorldRel;
    vec3 ls = normalize(uRingInv * uSunDirW);
    if (abs(ls.y) > 0.001){
      float tt = -pr.y / ls.y;
      if (tt > 0.0){
        vec3 hit = pr + ls * tt;
        float r = length(hit.xz);
        float u = (r - uRingIn) / (uRingOut - uRingIn);
        if (u > 0.0 && u < 1.0){
          float a = texture2D(uRingTex, vec2(u, 0.5)).a;
          shadow *= 1.0 - 0.85 * a;
        }
      }
    }
  }
#endif

  vec3 V = normalize(-vViewPos);
  vec3 col = albedo * (uSunColor * diff * shadow + uAmbient);

  // 薄明(大気のある惑星のターミネーター付近)
  if (uTwilight > 0.0){
    float tw = smoothstep(-0.30, 0.0, ndlGeo) * (1.0 - smoothstep(0.0, 0.22, ndlGeo));
    col += albedo * vec3(1.0, 0.42, 0.18) * tw * 0.35 * uTwilight;
  }

  // 海面の鏡面反射
  if (uSea >= 0.0 && uSpec > 0.0){
    float water = 1.0 - smoothstep(uSea + 0.002, uSea + 0.016, h);
    vec3 H = normalize(L + V);
    float sp = pow(max(dot(N, H), 0.0), 120.0) * water * uSpec * smoothstep(0.0, 0.2, ndlGeo);
    col += uSunColor * sp * 0.8 * shadow;
    // フレネル的な縁の反射(海面を少し明るく)
    float fres = pow(1.0 - max(dot(Ng, V), 0.0), 4.0);
    col += water * fres * uSpec * vec3(0.05, 0.09, 0.16) * smoothstep(-0.1, 0.4, ndlGeo);
  }

  // 溶岩の自己発光
  if (uLava > 0.0){
    float lv = 1.0 - smoothstep(0.08, 0.2, h);
    col += albedo * lv * uLava;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ 雲

export const CLOUD_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorldRel;
uniform sampler2D uMap;
uniform vec3 uSunDirV;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uOffset;
uniform float uBump;

vec3 bumpNormal(vec3 N, float h, float scale){
  vec3 dpdx = dFdx(vViewPos);
  vec3 dpdy = dFdy(vViewPos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - scale * grad);
}

void main(){
  float dens = texture2D(uMap, vec2(vUv.x + uOffset, vUv.y)).a;
  vec3 Ng = normalize(vNormalV);
  vec3 N = uBump > 0.0 ? bumpNormal(Ng, dens, uBump) : Ng;
  vec3 L = normalize(uSunDirV);
  float ndlGeo = dot(Ng, L);
  float diff = max(dot(N, L), 0.0) * smoothstep(-0.05, 0.12, ndlGeo);
  vec3 col = vec3(0.96, 0.97, 1.0) * (uSunColor * diff + uAmbient);
  float tw = smoothstep(-0.25, 0.0, ndlGeo) * (1.0 - smoothstep(0.0, 0.2, ndlGeo));
  col += vec3(1.0, 0.45, 0.2) * tw * 0.22;
  gl_FragColor = vec4(col, dens * 0.72);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ 大気光

export const ATMO_VERT = /* glsl */ `
varying vec3 vWorld;
void main(){
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * 大気を球殻内のレイ積分(4 サンプル)で近似。
 * カメラが殻の内側/外側どちらでも連続的に見える。
 */
export const ATMO_FRAG = /* glsl */ `
precision highp float;
const float ATMO_THIN = 0.075;
varying vec3 vWorld;
uniform vec3 uCenter;
uniform float uRp;
uniform float uRa;
uniform vec3 uSunDirW;
uniform vec3 uColor;
uniform vec3 uSunset;
uniform float uStrength;

void main(){
  vec3 oc = cameraPosition - uCenter;
  vec3 rd = normalize(vWorld - cameraPosition);
  float tc = -dot(oc, rd);
  float b2 = dot(oc, oc) - tc * tc;
  float Ra = uRa;
  float Rp = uRp;
  if (b2 >= Ra * Ra) discard;
  float half_ = sqrt(Ra * Ra - b2);
  float t0 = max(tc - half_, 0.0);
  float t1 = tc + half_;
  if (b2 < Rp * Rp) t1 = min(t1, tc - sqrt(Rp * Rp - b2));
  float len = max(t1 - t0, 0.0);
  if (len <= 0.0) discard;

  float H = (Ra - Rp) * 0.38;
  float dt = len / 4.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++){
    float t = t0 + (float(i) + 0.5) * dt;
    vec3 P = oc + rd * t;
    float hgt = max(length(P) - Rp, 0.0);
    float dens = exp(-hgt / H);
    float mu = dot(normalize(P), uSunDirW);
    float lit = smoothstep(-0.22, 0.35, mu);
    float twi = 1.0 - smoothstep(0.0, 0.45, abs(mu + 0.04));
    vec3 c = mix(uColor, uSunset, twi * 0.85);
    acc += c * dens * lit * dt;
  }
  // 真上から見た経路の光学的厚みを小さく(ATMO_THIN)保ち、長い接線方向(縁)でだけ強く発光させる。
  // 以前は 1.0 相当で、円盤の中心まで大気色で白く塗りつぶされていた。
  acc *= uStrength * ATMO_THIN / H;
  vec3 col = 1.0 - exp(-acc);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ リング

export const RING_VERT = /* glsl */ `
varying vec2 vPos;
varying vec3 vNormalW;
void main(){
  vPos = position.xy;
  vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAG = /* glsl */ `
precision highp float;
varying vec2 vPos;
varying vec3 vNormalW;
uniform sampler2D uRingTex;
uniform float uRingIn;
uniform float uRingOut;
uniform float uPlanetR;
uniform vec3 uSunDirW;
uniform mat3 uRingInv;
uniform vec3 uSunColor;

void main(){
  float r = length(vPos);
  float u = (r - uRingIn) / (uRingOut - uRingIn);
  vec4 tex = texture2D(uRingTex, vec2(clamp(u, 0.0, 1.0), 0.5));
  // リング座標系(リング面=XZ)での位置と太陽方向
  vec3 P = vec3(vPos.x, 0.0, -vPos.y);
  vec3 Ls = normalize(uRingInv * uSunDirW);
  float tc = -dot(P, Ls);
  float shadow = 1.0;
  if (tc > 0.0){
    float d2 = dot(P, P) - tc * tc;
    float d = sqrt(max(d2, 0.0));
    shadow = smoothstep(uPlanetR * 0.985, uPlanetR * 1.02, d);
  }
  // 太陽高度による明るさ(薄い粒子層なので斜めからだと暗い)
  float elev = abs(Ls.y);
  float lit = mix(0.35, 1.0, smoothstep(0.0, 0.5, elev));
  vec3 col = tex.rgb * uSunColor * lit * mix(0.06, 1.0, shadow);
  gl_FragColor = vec4(col, tex.a * 0.95);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ 恒星

export const SUN_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main(){
  vObj = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

export const SUN_FRAG = /* glsl */ `
precision highp float;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
uniform float uTime;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform int uOct;

${NOISE_GLSL}

void main(){
  vec3 p = normalize(vObj);
  float t = uTime * 0.04;
  float gran = fbm(p * 7.0 + vec3(t, -t * 0.7, t * 0.5), uOct) * 0.5 + 0.5;
  float cell = snoise(p * 18.0 + vec3(0.0, t * 2.0, 0.0)) * 0.5 + 0.5;
  float spots = smoothstep(0.58, 0.72, snoise(p * 2.6 + vec3(5.0, t * 0.3, 1.0)) * 0.5 + 0.5);
  float heat = mix(gran, cell, 0.3);
  vec3 col = mix(uEdge, uCore, smoothstep(0.25, 0.8, heat));
  col *= 1.0 - spots * 0.55;
  float mu = clamp(dot(normalize(vNormalV), normalize(-vViewPos)), 0.0, 1.0);
  col *= 0.32 + 0.68 * pow(mu, 0.6);
  gl_FragColor = vec4(col * 1.75, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ 背景

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform sampler2D uSky;
uniform float uBright;
const float PI = 3.14159265359;
void main(){
  vec3 d = normalize(vDir);
  float phi = atan(d.z, -d.x);
  float u = fract(phi / (2.0 * PI));
  float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI;
  vec3 c = texture2D(uSky, vec2(u, v)).rgb * uBright;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export const STAR_VERT = /* glsl */ `
attribute float aMag;
attribute vec3 aColor;
uniform float uScale;
varying float vMag;
varying vec3 vColor;
void main(){
  vMag = aMag;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.2 + aMag * 2.6) * uScale;
}
`;

export const STAR_FRAG = /* glsl */ `
precision highp float;
varying float vMag;
varying vec3 vColor;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 c = vColor * (0.25 + vMag * 1.15) * a;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ 宇宙塵(速度感)

export const DUST_VERT = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform vec3 uCamMod;
uniform float uBox;
uniform vec3 uVel;
uniform float uStreak;
varying float vFade;
void main(){
  vec3 base = aSeed * uBox;
  vec3 p = mod(base - uCamMod, uBox) - 0.5 * uBox;
  float edge = length(p) / (0.5 * uBox);
  vFade = (1.0 - smoothstep(0.55, 1.0, edge)) * smoothstep(2.0, 14.0, length(p));
  // 船から見ると塵は -vel で動く。尾は過去の位置(+vel 側)へ伸ばす
  p += uVel * uStreak * aEnd;
  vFade *= (1.0 - 0.8 * aEnd);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const DUST_FRAG = /* glsl */ `
precision highp float;
varying float vFade;
uniform float uAlpha;
void main(){
  gl_FragColor = vec4(vec3(0.72, 0.84, 1.0) * vFade * uAlpha, 1.0);
  #include <colorspace_fragment>
}
`;
