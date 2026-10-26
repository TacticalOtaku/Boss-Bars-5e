import { TIME_PERIOD } from "../../core/look/live";
import { VFX_SLOTS } from "../../core/look/vfx";

/** Attribute-less full-screen triangle (WebGL2 `gl_VertexID`). */
export const BAR_VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The whole body of a boss bar in one pass, on a canvas larger than the bar so light and particles reach past it:
 * a bevelled metal frame, the fill's material with glass lighting, the HP front, trail, shield and ticks, outer
 * glow, flames above a flame fill, and the running effects. Output is premultiplied alpha. Every motion turns in
 * whole cycles of TIME_PERIOD, so the wrap of `u_time` never jumps.
 */
const SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_res;
/**
 * Always 0. FXC (ANGLE on Direct3D 11) unrolls every loop with a constant bound and inlines all calls into each copy:
 * this shader took 55 s to compile there. A uniform bound keeps loops as loops.
 */
uniform int u_zero;
/** Where this bar's strip starts in the shared GL canvas (GL px). */
uniform vec2 u_origin;
uniform vec4 u_box;
uniform float u_time;
uniform float u_fill;
uniform float u_trail;
uniform float u_shield;
uniform float u_defeat;
uniform float u_low;
uniform float u_ticks[8];
uniform int u_tickCount;

uniform int u_fillType;
uniform vec3 u_colors[5];
uniform int u_count;
uniform vec3 u_empty;
uniform vec3 u_frameColor;
uniform vec3 u_glowColor;
uniform vec3 u_trailColor;
uniform vec3 u_shieldColor;
uniform vec3 u_spark;
uniform float u_frameW;
/** FRAME_STYLES: 0 classic, 1 double, 2 inset, 3 none. */
uniform int u_frameStyle;
uniform float u_frameGlow;
uniform float u_shieldOn;
uniform float u_edgeGlow;
uniform float u_shine;
/** FILL_PATTERNS (0 none, 1 runes, 2 scales, 3 damask) and FILL_MOTES (0 none, 1 fireflies, 2 embers, 3 sparkles). */
uniform int u_pattern;
uniform int u_motes;
/** Hit effects the look plays (0 or 1): x sparks and rays, y the white flash, z big cracks. */
uniform vec3 u_hit;
/** How a phase change plays (0 or 1): x the bright flash and light pillars, y cracks through the fill. */
uniform vec2 u_phase;

uniform vec4 u_fxA[${VFX_SLOTS}];
uniform vec4 u_fxB[${VFX_SLOTS}];
uniform int u_fxCount;
/** Elite cards: 1 (rank strip on the left) or 2 (on top), the plate (canvas px), the rank colour; 0 for bars. */
uniform float u_card;
uniform vec4 u_panel;
uniform vec3 u_rank;
/** An elite card's icon (GL px; empty when it has no frame), its frame colour + frame switch, glow colour + strength. */
uniform vec4 u_icon;
/** A boss bar's name and title (GL px; empty when none): flames and embers die down behind the text. */
uniform vec4 u_text;
uniform vec4 u_iconColor;
uniform vec4 u_iconGlow;
/** Portraits (u_card 3): the shape, as in PORTRAIT_SHAPES. */
uniform int u_shape;

out vec4 o;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
float turn(float k) { return u_time * TAU * k / ${TIME_PERIOD.toFixed(1)}; }
float cyc(float k) { return fract(u_time * k / ${TIME_PERIOD.toFixed(1)}); }

vec3 pal(float t) {
  float x = clamp(t, 0.0, 1.0) * float(u_count - 1);
  int i = min(int(floor(x)), u_count - 2);
  return mix(u_colors[i], u_colors[i + 1], smoothstep(0.0, 1.0, x - float(i)));
}

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash1(float n) { return fract(sin(n) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5 + u_zero; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}
float fbm3(vec2 p) {
  float v = 0.0, a = 0.55;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3 + u_zero; i++) { v += a * noise(p); p = r * p * 2.1; a *= 0.45; }
  return v / 0.9;
}
/**
 * Noise drifting along dir (noise units per cycle, k cycles per TIME_PERIOD) for ever: two phases half a
 * cycle apart cross-fade, each fading out where it jumps back, so neither the drift nor the wrap of u_time shows.
 */
float flow(vec2 p, vec2 dir, float k) {
  float f1 = cyc(k), f2 = fract(f1 + 0.5);
  float w = abs(2.0 * f1 - 1.0);
  float n = mix(fbm3(p + dir * f1), fbm3(p + dir * f2 + vec2(17.3, 9.1)), w);
  return clamp((n - 0.5) * 1.5 + 0.5, 0.0, 1.0);
}
/** Ember palette by temperature: the look's colours from cold to hot, then white-hot. */
vec3 fire(float T) {
  vec3 c = pal(clamp(T * 1.05, 0.0, 1.0)) * (0.35 + 1.25 * T);
  return c + vec3(1.0, 0.93, 0.8) * smoothstep(0.82, 1.0, T) * 0.9;
}

/** Cell distance (x) and distance to the nearest cell edge (y). */
vec2 voronoi(vec2 p) {
  vec2 g = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1 + u_zero; y++) for (int x = -1; x <= 1 + u_zero; x++) {
    vec2 c = vec2(x, y);
    vec2 r = c + vec2(hash(g + c), hash(g + c + 17.0)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
/** Distance to the edge of the hexagon cell around p (0 at the edge, ~0.5 at the centre). */
float hexEdge(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  g = abs(g);
  return 0.5 - max(dot(g, normalize(r)), g.x);
}
/** Signed distance to a polygon of up to 6 corners (Inigo Quilez). */
float sdPolygon(vec2 p, vec2 v[6], int n) {
  float d = dot(p - v[0], p - v[0]);
  float sgn = 1.0;
  for (int i = 0; i < 6 + u_zero; i++) {
    if (i >= n) break;
    int j = i == 0 ? n - 1 : i - 1;
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) sgn = -sgn;
  }
  return sgn * sqrt(d);
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Premultiplied layers: "over" covers what is below, "add" is light.
vec3 C = vec3(0.0);
float A = 0.0;
void over(vec3 c, float a) { C = c * a + C * (1.0 - a); A = a + A * (1.0 - a); }
void add(vec3 c, float k) { C += c * k; A = clamp(A + k * luma(c) * 0.9, 0.0, 1.0); }

float aspectOf(vec2 px, vec2 uv) { return uv.x > 0.0 ? px.x / uv.x : 1.0; }

// ---- fill materials: base colour and how much it glows ----
vec4 materialOf(vec2 uv, vec2 px) {
  float t1 = turn(6.0);
  if (u_fillType == 3) { // liquid: a sloshing surface, depth, caustic light and rising bubbles
    float wave = 0.045 * sin(px.x * 3.2 + turn(30.0)) + 0.025 * sin(px.x * 7.0 - turn(44.0)) + 0.02 * (flow(vec2(px.x * 1.5, 0.3), vec2(-2.0, 0.0), 20.0) - 0.5);
    float surface = 0.84 + wave;
    if (uv.y > surface + 0.03) return vec4(pal(0.0) * 0.25 + 0.04, 0.1);
    float depth = clamp((surface - uv.y) / surface, 0.0, 1.0);
    vec3 c = pal(1.0 - depth * 0.85) * (0.7 + 0.25 * flow(px * vec2(0.8, 1.2), vec2(-1.0, 0.4), 16.0));
    // offset from the origin: the net divides by the position and blows up near zero
    vec2 cq = px * vec2(3.2, 4.0) + vec2(13.7, 7.3);
    vec2 ci = cq;
    float cs = 0.0;
    for (int k = 0; k < 3 + u_zero; k++) {
      float tk = turn(6.0 + float(k) * 2.0);
      ci = cq + vec2(cos(tk - ci.x) + sin(tk + ci.y), sin(tk - ci.y) + cos(tk + ci.x));
      cs += 1.0 / length(vec2(cq.x / (sin(ci.x + tk) / 0.02), cq.y / (cos(ci.y + tk) / 0.02)));
    }
    cs = 1.17 - pow(cs / 3.0, 1.4);
    float caustic = pow(clamp(cs, 0.0, 1.0), 6.0) * (1.0 - depth * 0.6);
    float rays = pow(max(0.0, sin(px.x * 2.2 - uv.y * 1.4 + turn(10.0))), 6.0) * (1.0 - depth) * 0.5;
    c += (caustic * 0.28 + rays * 0.18) * mix(pal(1.0), vec3(1.0), 0.45);
    float meniscus = exp(-abs(uv.y - surface) * 40.0);
    c += meniscus * mix(pal(1.0), vec3(1.0), 0.6) * 0.8;
    for (int j = 0; j < 7 + u_zero; j++) {
      float fj = float(j);
      float bx = hash1(fj * 3.7) * aspectOf(px, uv);
      float by = fract(cyc(20.0 + fj * 4.0) * 4.0 + hash1(fj * 9.1)) * surface;
      vec2 bp = vec2(bx + sin(by * 9.0 + fj) * 0.06, by);
      float r = 0.06 + 0.05 * hash1(fj * 1.3);
      float d = length((px - bp) * vec2(1.0, 1.0));
      float ring = smoothstep(r, r - 0.025, d) * smoothstep(r - 0.05, r - 0.02, d);
      c += ring * 0.5 + smoothstep(r * 0.6, 0.0, length(px - bp - vec2(-r * 0.3, r * 0.3))) * 0.25;
    }
    return vec4(c, 0.35);
  }
  if (u_fillType == 4) { // energy: plasma streaming along the bar around a crackling bolt
    vec2 q = px * vec2(0.8, 1.4);
    vec2 warp = vec2(flow(q * 0.7, vec2(-1.5, 0.0), 12.0), flow(q * 0.7 + 4.3, vec2(-1.5, 0.5), 14.0));
    float n = flow(q + warp * 1.4, vec2(-3.5, 0.0), 30.0);
    float bands = pow(0.5 + 0.5 * sin((n * 5.0 + uv.y * 1.5) * PI), 4.0);
    float y = 0.5 + (flow(vec2(px.x * 1.4, 3.7), vec2(-5.0, 0.0), 90.0) - 0.5) * 0.9;
    float jag = (flow(vec2(px.x * 6.0, 9.1), vec2(-9.0, 0.0), 120.0) - 0.5) * 0.12;
    float dist = abs(uv.y - y - jag);
    float boltCore = exp(-dist * 38.0);
    float boltGlow = exp(-dist * 7.0);
    // now and then the whole charge flares, like lightning inside the bar
    float strike = pow(max(0.0, sin(turn(23.0)) * sin(turn(37.0) + 1.3)), 12.0);
    vec3 c = pal(n * 0.85) * (0.55 + 0.5 * bands) + pal(1.0) * boltGlow * (0.55 + strike) + vec3(1.0) * boltCore * 0.9;
    return vec4(c + pal(1.0) * strike * 0.5, 0.9);
  }
  if (u_fillType == 5) { // flame: molten rock under a dark crust, glowing seams drifting along the bar
    float n = flow(vec2(px.x * 0.55, uv.y * 0.7), vec2(-1.4, -0.5), 24.0);
    float ridge = 1.0 - abs(2.0 * flow(vec2(px.x * 0.75, uv.y * 1.3) + 3.1, vec2(-1.1, -0.3), 20.0) - 1.0);
    float seams = smoothstep(0.7, 0.96, ridge);
    float crust = smoothstep(0.35, 0.65, n);
    float core = 1.0 - pow(abs(uv.y - 0.4) * 2.0, 2.0);
    float T = clamp(0.1 + 0.52 * core * (0.45 + 0.55 * crust) + 0.28 * seams * (0.6 + 0.4 * core), 0.0, 1.0);
    return vec4(fire(T), 0.85);
  }
  if (u_fillType == 6) { // ice
    vec2 cell = voronoi(px * vec2(3.2, 2.4) + vec2(0.0, t1 * 0.02));
    float id = hash(floor(px * vec2(3.2, 2.4)));
    float facet = 0.25 + 0.5 * cell.x + 0.25 * fbm(px * 4.0 + turn(3.0));
    float crack = 1.0 - smoothstep(0.0, 0.05, cell.y);
    float streak = pow(max(0.0, sin((px.x - px.y * 1.7) * 1.3 + fbm(px * 0.7) * 3.0 + turn(8.0))), 40.0);
    float glint = smoothstep(0.985, 1.0, noise(px * 14.0 + turn(18.0) * 3.0));
    vec3 c = pal(facet + id * 0.15);
    return vec4(c + crack * 0.55 + streak * 0.25 + glint * 1.4, 0.3);
  }
  if (u_fillType == 7) { // void: deep space, a nebula drifting through it, stars near and far
    vec2 q = px * 0.9;
    vec2 w = vec2(flow(q * 0.8, vec2(-0.6, 0.2), 8.0), flow(q * 0.8 + 5.2, vec2(0.5, -0.3), 10.0));
    float n = flow(q + w * 1.6, vec2(-0.9, 0.0), 12.0);
    float neb = smoothstep(0.3, 0.95, n);
    vec3 c = mix(vec3(0.005, 0.0, 0.015), pal(0.3 + 0.55 * n), neb) * (0.4 + 0.95 * neb);
    c += pal(0.85) * smoothstep(0.62, 0.8, n) * smoothstep(1.0, 0.8, n) * 0.14;
    for (int layer = 0; layer < 2 + u_zero; layer++) {
      float sc = layer == 0 ? 18.0 : 42.0;
      vec2 sp = (px + vec2(-cyc(4.0 + float(layer) * 4.0) * 4.0 * (1.0 + float(layer)), 0.0)) * sc;
      vec2 cell = floor(sp), f = fract(sp) - 0.5;
      float h = hash(cell + float(layer) * 31.0);
      float star = step(0.93, h) * exp(-dot(f, f) * (layer == 0 ? 60.0 : 120.0));
      star *= 0.6 + 0.4 * sin(turn(50.0) + h * 60.0);
      c += star * mix(pal(1.0), vec3(1.0), 0.75) * (layer == 0 ? 1.4 : 0.7);
    }
    return vec4(c, 0.5);
  }
  // solid, gradient, texture: a deep gradient, a slow pulse of light inside, fine brushed grain
  float grain = flow(px * vec2(1.6, 6.0), vec2(-1.5, 0.0), 12.0);
  vec3 c = (u_fillType == 0 ? u_colors[0] : pal(1.0 - uv.y * 0.9)) * (0.85 + 0.2 * grain);
  float pulse = exp(-pow(px.x - (cyc(5.0) * (aspectOf(px, uv) + 8.0) - 4.0), 2.0) * 0.15);
  c *= 1.0 + 0.18 * pulse;
  c += 0.04 * noise(vec2(px.x * 3.0, uv.y * 40.0));
  return vec4(c, 0.2);
}

// ---- shards and motes of the running effects ----
void shards(vec2 p, vec2 origin, float spread, float t, float s, float seed, float H, vec3 tint) {
  for (int j = 0; j < 12 + u_zero; j++) {
    float fj = float(j);
    float h1 = hash1(seed + fj * 7.13), h2 = hash1(seed + fj * 3.71), h3 = hash1(seed + fj * 9.17);
    vec2 start = origin + vec2((h1 - 0.5) * spread, (h2 - 0.5) * H * 0.5);
    float ang = mix(0.35, 2.8, h3);
    vec2 vel = vec2(cos(ang), sin(ang)) * H * (2.0 + 2.6 * h2) * (0.7 + 0.5 * s);
    float tt = t * (0.8 + 0.4 * h1);
    vec2 pos = start + vel * tt - vec2(0.0, 1.0) * H * 4.2 * tt * tt;
    float rot = (h1 - 0.5) * 14.0 * tt + h2 * 6.0;
    vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * (p - pos);
    float size = H * (0.07 + 0.13 * h2) * (1.0 - 0.5 * tt);
    float d = max(abs(q.x) * 1.6 + abs(q.y) * 0.7, abs(q.y) * 1.3) - size;
    float fade = clamp(1.0 - tt, 0.0, 1.0);
    float body = smoothstep(1.0, -1.0, d);
    float rim = smoothstep(1.5, 0.0, abs(d)) * 0.8;
    vec3 c = pal(0.35 + 0.55 * h3) * 1.25;
    over(c + rim * mix(tint, vec3(1.0), 0.5), body * fade);
    add(tint, exp(-max(d, 0.0) / (H * 0.1)) * fade * fade * 0.3 * s);
  }
}

/** Thin bright streaks thrown out of a hit, fading as they fly. */
void sparks(vec2 p, vec2 origin, float spread, float t, float s, float seed, float H, vec3 tint) {
  for (int j = 0; j < 18 + u_zero; j++) {
    float fj = float(j);
    float h1 = hash1(seed + fj * 2.31), h2 = hash1(seed + fj * 5.77), h3 = hash1(seed + fj * 8.03);
    float life = 0.35 + 0.5 * h1;
    float tt = t / life;
    if (tt >= 1.0) continue;
    float ang = h3 < 0.8 ? mix(0.2, PI - 0.2, h3 / 0.8) : mix(PI + 0.4, TAU - 0.4, (h3 - 0.8) / 0.2);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 start = origin + vec2((h2 - 0.5) * spread, 0.0);
    vec2 head = start + dir * H * (3.0 + 5.0 * h2) * (1.0 - pow(1.0 - tt, 2.0)) - vec2(0.0, H * 1.2 * tt * tt);
    vec2 tail = head - dir * H * (0.35 + 0.5 * h1) * (1.0 - tt);
    vec2 pa = p - tail, ba = head - tail;
    float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
    float dist = length(pa - ba * k);
    float fade = (1.0 - tt) * (0.4 + 0.6 * k);
    add(mix(tint, vec3(1.0, 0.97, 0.9), 0.55), exp(-dist / (H * 0.022)) * fade * 1.6 * s);
  }
}

void motes(vec2 p, vec2 box0, float width, float t, float seed, float H, vec3 tint) {
  for (int j = 0; j < 16 + u_zero; j++) {
    float fj = float(j);
    float h1 = hash1(seed + fj * 5.3), h2 = hash1(seed + fj * 1.9);
    vec2 pos = vec2(box0.x + width * h1, box0.y + H * (0.2 + 0.6 * h2) + H * 2.2 * t * (0.6 + h2));
    pos.x += sin(t * 9.0 + fj) * H * 0.15;
    float r = H * (0.05 + 0.06 * h2);
    float d = length(p - pos);
    add(tint, exp(-d / r) * (1.0 - t) * 0.9);
  }
}

/** CSS clip-path corners (percent, y down) of the portrait shapes, as GL points in the box. */
float portraitShape(vec2 p, vec2 lo, vec2 hi, int shape, float squareR) {
  vec2 size = hi - lo;
  vec2 v[6];
  int n = 0;
  if (shape == 2) { v[0] = vec2(50, 0); v[1] = vec2(100, 50); v[2] = vec2(50, 100); v[3] = vec2(0, 50); n = 4; }
  else if (shape == 3) { v[0] = vec2(0, 0); v[1] = vec2(100, 0); v[2] = vec2(100, 60); v[3] = vec2(50, 100); v[4] = vec2(0, 60); n = 5; }
  else if (shape == 4) { v[0] = vec2(25, 2); v[1] = vec2(75, 2); v[2] = vec2(100, 50); v[3] = vec2(75, 98); v[4] = vec2(25, 98); v[5] = vec2(0, 50); n = 6; }
  else if (shape == 5) { v[0] = vec2(0, 0); v[1] = vec2(100, 0); v[2] = vec2(78, 100); v[3] = vec2(0, 100); n = 4; }
  if (n > 0) {
    for (int i = 0; i < 6 + u_zero; i++) v[i] = vec2(lo.x + v[i].x * 0.01 * size.x, hi.y - v[i].y * 0.01 * size.y);
    return sdPolygon(p, v, n);
  }
  vec2 c = (lo + hi) * 0.5;
  if (shape == 1) return sdRoundBox(p - c, size * 0.5, min(size.x, size.y) * squareR);
  return length((p - c) / (size * 0.5)) * min(size.x, size.y) * 0.5 - min(size.x, size.y) * 0.5;
}

/** A boss portrait's frame and light, drawn over the picture: transparent inside except shading and effects. */
void portrait(vec2 p) {
  vec2 lo = u_box.xy, hi = u_box.zw;
  vec2 center = (lo + hi) * 0.5;
  float S = min(hi.x - lo.x, hi.y - lo.y);
  float d = portraitShape(p, lo, hi, u_shape, 0.05);
  float T = max(u_frameW, S * 0.035);
  // u_shieldOn carries the look's portrait frame switch here; the notch shape fades out instead of a frame.
  float ringOn = u_shape == 5 ? 0.0 : step(0.5, u_shieldOn);
  float reveal = 1.0;
  for (int i = 0; i < u_fxCount; i++) {
    if (int(u_fxA[i].x) == 4) {
      float a = atan(p.x - center.x, p.y - center.y) / TAU + 0.5;
      reveal = smoothstep(u_fxA[i].y * 1.2, u_fxA[i].y * 1.2 - 0.05, a);
    }
  }
  // drop shadow and aura outside
  float outside = max(d, 0.0);
  float dShadow = portraitShape(p + vec2(0.0, S * 0.05), lo, hi, u_shape, 0.05);
  over(vec3(0.0), 0.6 * exp(-max(dShadow, 0.0) / (S * 0.07)) * step(0.0, d));
  float breathe = 0.7 + 0.3 * sin(turn(18.0));
  add(u_glowColor, u_frameGlow * exp(-outside / (S * 0.12)) * breathe * step(0.0, d) * 1.1);
  if (u_low > 0.5) add(vec3(1.0, 0.12, 0.08), exp(-outside / (S * 0.1)) * (0.5 + 0.5 * sin(turn(90.0))) * 0.6 * step(0.0, d));
  // inside: a soft inner shadow under the ring, the dimming of defeat, the red pulse of low HP
  float inner = -d - T;
  if (d < 0.0) {
    over(vec3(0.0), 0.55 * exp(-max(inner, 0.0) / (S * 0.06)) * step(0.0, inner));
    if (u_defeat > 0.0) {
      vec2 cell = voronoi((p - lo) / S * 3.0);
      float crack = (1.0 - smoothstep(0.0, 0.04, cell.y)) * step(cell.x * 0.9, u_defeat);
      over(vec3(0.05), u_defeat * 0.55);
      add(u_spark, crack * (1.0 - u_defeat) * 1.4);
      over(vec3(0.0), crack * u_defeat * 0.6);
    }
    if (u_low > 0.5) over(vec3(0.6, 0.0, 0.0), (0.5 + 0.5 * sin(turn(90.0))) * 0.35 * smoothstep(-S * 0.35, 0.0, d));
  }
  // the ring: bevelled metal with a groove and a travelling glint
  float ringA = smoothstep(0.75, -0.75, d) * smoothstep(-T - 0.75, -T + 0.75, d) * ringOn * reveal;
  if (ringA > 0.0) {
    float s = clamp(-d / T, 0.0, 1.0);
    vec2 g = normalize(vec2(
      portraitShape(p + vec2(1.0, 0.0), lo, hi, u_shape, 0.05) - portraitShape(p - vec2(1.0, 0.0), lo, hi, u_shape, 0.05),
      portraitShape(p + vec2(0.0, 1.0), lo, hi, u_shape, 0.05) - portraitShape(p - vec2(0.0, 1.0), lo, hi, u_shape, 0.05)) + 1e-5);
    vec3 n = normalize(vec3(-g * cos(s * PI) * 1.5, 1.0));
    vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    vec3 metal = u_frameColor * (0.28 + 0.95 * diff) + spec * mix(u_frameColor, vec3(1.0), 0.65) * 1.3;
    float a = atan(p.x - center.x, p.y - center.y) / TAU + 0.5;
    float glint = exp(-pow((fract(a - cyc(7.0)) - 0.5) * 12.0, 2.0)) * 0.6;
    metal += glint * mix(u_frameColor, vec3(1.0), 0.7) * smoothstep(0.2, 0.6, s) * smoothstep(1.0, 0.6, s);
    metal *= mix(0.3, 1.0, smoothstep(0.0, 0.15, s));
    metal *= 1.0 - 0.4 * exp(-pow((s - 0.55) * 14.0, 2.0));
    metal = mix(metal, vec3(luma(metal)) * 0.55, u_defeat);
    over(metal, ringA);
  }
  // running effects, sized to the portrait
  for (int i = 0; i < u_fxCount; i++) {
    int kind = int(u_fxA[i].x);
    float t = u_fxA[i].y, st = u_fxA[i].z;
    float inside = smoothstep(0.75, -0.75, d);
    if (kind == 0) {
      over(mix(vec3(1.0, 0.25, 0.15), vec3(1.0), pow(1.0 - t, 6.0)), inside * pow(1.0 - t, 2.0) * 0.55 * st);
      add(u_spark, exp(-outside / (S * 0.1)) * step(0.0, d) * pow(1.0 - t, 2.0) * 0.8 * st);
    } else if (kind == 1) {
      vec3 hc = mix(u_glowColor, vec3(1.0, 1.0, 0.85), 0.6);
      add(hc, inside * sin(t * PI) * 0.35 * st + exp(-outside / (S * 0.15)) * step(0.0, d) * sin(t * PI) * 0.6 * st);
    } else if (kind == 2) {
      float ring = abs(d - t * S * 0.6);
      add(mix(u_glowColor, vec3(1.0), 0.4), exp(-ring / (S * 0.03)) * (1.0 - t) * 1.2 * step(0.0, d));
      add(vec3(1.0), inside * pow(1.0 - t, 5.0) * 0.6);
    } else if (kind == 3) {
      add(u_spark, (inside + exp(-outside / (S * 0.12)) * step(0.0, d)) * pow(1.0 - t, 3.0) * 0.8);
    }
  }
  vec2 room = min(lo, u_res - hi);
  vec2 toEdge = min(p, u_res - p);
  o = vec4(C, A) * smoothstep(0.0, room.y * 0.5, toEdge.y) * smoothstep(0.0, room.x * 0.5, toEdge.x);
}

void main() {
  vec2 p = gl_FragCoord.xy - u_origin;
  if (u_card > 2.5) {
    portrait(p);
    return;
  }
  vec2 lo = u_box.xy, hi = u_box.zw;
  vec2 center = (lo + hi) * 0.5, hb = (hi - lo) * 0.5;
  float H = max(hi.y - lo.y, 1.0);
  float W = max(hi.x - lo.x, 1.0);
  // A card without a fill shows only its plate.
  float hasMeter = step(2.0, hi.x - lo.x) * step(1.0, hi.y - lo.y);
  float radius = min(H * 0.22, hb.y);
  float fw = max(u_frameW, 1.0);
  // The metal ring is thicker than the CSS border: it grows outward, the fill keeps the meter's inside.
  float ext = max(0.0, max(fw * 1.3, H * 0.2) - fw);
  vec2 ob = hb + ext;
  float oradius = radius + ext;
  float d = sdRoundBox(p - center, ob, oradius);
  float dIn = sdRoundBox(p - center, hb - fw, max(radius - fw, 0.5));
  float ringT = ext + fw;
  vec2 inner0 = lo + fw;
  vec2 innerSize = max(vec2(W, H) - 2.0 * fw, vec2(1.0));
  vec2 uv = (p - inner0) / innerSize;
  float aspect = innerSize.x / innerSize.y;
  vec2 px = vec2(uv.x * aspect, uv.y);
  float gx = (p.x - lo.x) / W;

  // Entrance: what lies right of the sweep is not there yet.
  float reveal = 1.0;
  float sweepEdge = -1.0;
  for (int i = 0; i < u_fxCount; i++) {
    if (int(u_fxA[i].x) == 4) {
      float t = u_fxA[i].y;
      sweepEdge = t * 1.3 - 0.1;
      reveal = smoothstep(sweepEdge + 0.04, sweepEdge - 0.04, gx);
    }
  }

  // ---- an elite card's plate: dark glass, a rank strip with its aura, a thin metal rim ----
  if (u_card > 0.5) {
    vec2 pc = (u_panel.xy + u_panel.zw) * 0.5, ph = (u_panel.zw - u_panel.xy) * 0.5;
    float pr = min(ph.y * 0.22, ph.x);
    float dp = sdRoundBox(p - pc, ph, pr);
    float ds = sdRoundBox(p + vec2(0.0, ph.y * 0.14) - pc, ph, pr);
    over(vec3(0.0), 0.55 * exp(-max(ds, 0.0) / (ph.y * 0.22)) * step(0.0, dp) * reveal);
    vec2 puv = (p - u_panel.xy) / (u_panel.zw - u_panel.xy);
    float plateA = smoothstep(0.75, -0.75, dp) * reveal;
    vec3 plate = mix(vec3(0.075, 0.07, 0.085), vec3(0.02, 0.018, 0.025), smoothstep(0.0, 1.0, puv.x));
    plate *= 0.9 + 0.2 * fbm((p - u_panel.xy) / ph.y * 1.6);
    bool topStrip = u_card > 1.5;
    float fromEdge = topStrip ? u_panel.w - p.y : p.x - u_panel.x;
    plate += u_rank * 0.32 * exp(-fromEdge / (ph.y * (topStrip ? 0.5 : 0.9)));
    plate += smoothstep(0.55, 1.0, puv.y) * 0.05;
    over(plate, plateA * 0.94);
    float stripW = max(ph.y * 0.09, 2.0);
    float strip = smoothstep(stripW + 0.75, stripW - 0.75, fromEdge) * plateA;
    float along = topStrip ? puv.x : puv.y;
    float stripLight = 0.75 + 0.35 * sin(along * PI) + 0.25 * sin(turn(30.0) + along * 3.0);
    over(u_rank * stripLight, strip);
    add(u_rank, exp(-max(dp, 0.0) / (ph.y * 0.35)) * step(0.0, dp) * 0.35 * reveal * smoothstep(0.5, 0.0, topStrip ? 1.0 - puv.y : puv.x));
    float rimLine = smoothstep(1.2, 0.0, abs(dp + 0.6)) * reveal;
    add(mix(u_frameColor, vec3(1.0), 0.25), rimLine * (0.25 + 0.3 * smoothstep(0.4, 1.0, puv.y)));
    // the icon's frame: a bevelled ring in the portrait's shape, outside the picture (the picture lies above)
    if (u_icon.z > u_icon.x && u_shape != 5) {
      vec2 ilo = u_icon.xy, ihi = u_icon.zw;
      int ishape = u_shape == 0 ? 1 : u_shape; // a round portrait is a rounded square on a small card icon
      float S = min(ihi.x - ilo.x, ihi.y - ilo.y);
      float T = max(S * 0.075, 2.0);
      float di = portraitShape(p, ilo, ihi, ishape, 0.12);
      float out_ = max(di, 0.0);
      over(vec3(0.0), 0.6 * exp(-out_ / (S * 0.08)) * step(0.0, di) * reveal);
      float breatheI = 0.7 + 0.3 * sin(turn(18.0));
      add(u_iconGlow.rgb, u_iconGlow.a * exp(-out_ / (S * 0.18)) * breatheI * step(0.0, di) * reveal);
      float ringA = smoothstep(-0.75, 0.75, di) * smoothstep(T + 0.75, T - 0.75, di) * u_iconColor.a * reveal;
      if (ringA > 0.0) {
        float s = clamp(di / T, 0.0, 1.0);
        vec2 g = normalize(vec2(
          portraitShape(p + vec2(1.0, 0.0), ilo, ihi, ishape, 0.12) - portraitShape(p - vec2(1.0, 0.0), ilo, ihi, ishape, 0.12),
          portraitShape(p + vec2(0.0, 1.0), ilo, ihi, ishape, 0.12) - portraitShape(p - vec2(0.0, 1.0), ilo, ihi, ishape, 0.12)) + 1e-5);
        vec3 n = normalize(vec3(g * cos(s * PI) * 1.5, 1.0));
        vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
        float diff = max(dot(n, L), 0.0);
        float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
        vec3 c = u_iconColor.rgb;
        vec3 metal = c * (0.3 + 0.95 * diff) + spec * mix(c, vec3(1.0), 0.65) * 1.3;
        vec2 ic = (ilo + ihi) * 0.5;
        float a = atan(p.x - ic.x, p.y - ic.y) / TAU + 0.5;
        metal += exp(-pow((fract(a - cyc(9.0)) - 0.5) * 12.0, 2.0)) * 0.5 * mix(c, vec3(1.0), 0.7);
        metal = mix(metal, vec3(luma(metal)) * 0.55, u_defeat);
        over(metal, ringA);
      }
    }
  }

  // ---- outer light: the frame's glow, the fill's bloom, low HP ----
  float outside = max(d, 0.0);
  float fillMask = smoothstep(u_fill + 0.01, u_fill - 0.01, clamp(gx, 0.0, 1.0));
  vec4 mat = materialOf(clamp(uv, 0.0, 1.0), vec2(clamp(uv.x, 0.0, 1.0) * aspect, clamp(uv.y, 0.0, 1.0)));
  float breathe = (0.75 + 0.25 * sin(turn(20.0))) * hasMeter;
  fillMask *= hasMeter;
  float dShadow = sdRoundBox(p + vec2(0.0, H * 0.18) - center, ob, oradius);
  over(vec3(0.0), 0.55 * exp(-max(dShadow, 0.0) / (H * 0.3)) * step(0.0, d) * reveal);
  add(u_glowColor, u_frameGlow * exp(-outside / (H * 0.55)) * 0.8 * breathe * step(0.0, d) * reveal);
  add(pal(0.7), mat.a * fillMask * exp(-outside / (H * 0.4)) * 0.45 * step(0.0, d) * (0.6 + 0.4 * u_edgeGlow) * reveal);
  if (u_low > 0.5) {
    float pulse = 0.5 + 0.5 * sin(turn(90.0));
    add(vec3(1.0, 0.12, 0.08), exp(-outside / (H * 0.7)) * pulse * 0.55 * step(0.0, d));
  }

  // behind the name and title: 1 inside the text, fading out around it
  float behindText = 0.0;
  if (u_text.z > u_text.x) {
    vec2 tc = (u_text.xy + u_text.zw) * 0.5, th = (u_text.zw - u_text.xy) * 0.5;
    behindText = smoothstep(th.y * 1.2, 0.0, sdRoundBox(p - tc, th, th.y * 0.8));
  }
  float textCalm = 1.0 - 0.85 * behindText;

  // ---- flames licking above a flame fill, embers drifting up ----
  if (u_fillType == 5 && u_card < 0.5 && p.y > hi.y - fw * 2.0) {
    float yy = (p.y - (hi.y - fw)) / (H * 1.9);
    float xs = gx * W / H;
    float mask = smoothstep(u_fill + 0.005, u_fill - 0.03, gx) * smoothstep(-0.01, 0.02, gx);
    float sway = (flow(vec2(xs * 0.4, yy * 0.8), vec2(0.0, -1.2), 20.0) - 0.5) * 0.5 * yy;
    // Tongue heights wander along the bar; ragged turbulence rises through them; white heat stays at the root.
    float heights = 0.25 + 0.75 * flow(vec2((xs + sway) * 1.3, yy * 0.35), vec2(0.0, -0.8), 18.0);
    float gust = 0.55 + 0.6 * flow(vec2(xs * 0.22, 1.7), vec2(1.2, 0.0), 6.0);
    float turb = flow(vec2((xs + sway) * 2.6, yy * 2.4) + 5.3, vec2(0.0, -4.5), 72.0);
    float shape = heights * gust * 0.95 + (turb - 0.5) * 0.6 - yy;
    float flame = smoothstep(0.0, 0.09, shape) * smoothstep(-0.08, 0.04, yy);
    float T = clamp(shape * 1.5 + 0.3 * (1.0 - yy) - 0.05, 0.0, 1.0) * 0.92;
    // smoke settles behind the text so it reads over the fire
    over(vec3(0.03, 0.015, 0.0), behindText * mask * reveal * 0.45 * step(0.0, yy));
    add(fire(T), flame * mask * reveal * 0.95 * textCalm);
    add(pal(0.65), exp(-max(yy, 0.0) * 3.5) * mask * reveal * 0.22 * step(0.0, yy) * textCalm);
    for (int j = 0; j < 10 + u_zero; j++) {
      float fj = float(j);
      float h1 = hash1(fj * 12.7), h2 = hash1(fj * 4.1);
      float life = fract(cyc(40.0 + fj * 3.0) * 6.0 + h2);
      vec2 pos = vec2(lo.x + W * min(h1, max(u_fill - 0.02, 0.0)), hi.y + life * H * 2.2);
      pos.x += sin(life * 8.0 + fj) * H * 0.25;
      float e = exp(-length(p - pos) / (H * 0.05)) * (1.0 - life) * step(0.02, u_fill);
      add(pal(1.0) * 1.5, e * 0.8 * reveal * textCalm);
    }
  }
  // fireflies drifting around a glowing plain fill, blinking in the look's light
  if (u_motes == 1 && u_card < 0.5) {
    for (int j = 0; j < 14 + u_zero; j++) {
      float fj = float(j);
      float h1 = hash1(fj * 7.7), h2 = hash1(fj * 3.1), h3 = hash1(fj * 5.9);
      float life = fract(cyc(6.0 + fj) * 3.0 + h3);
      vec2 pos = vec2(lo.x + W * min(h1, max(u_fill, 0.05)), center.y + (h2 - 0.5) * H * 2.6);
      pos += vec2(sin(life * TAU + fj) * H * 0.9, cos(life * TAU * 0.7 + fj * 2.0) * H * 0.6);
      float blink = smoothstep(0.0, 0.25, life) * smoothstep(1.0, 0.7, life) * (0.6 + 0.4 * sin(turn(80.0) + fj * 9.0));
      float glow = exp(-length(p - pos) / (H * 0.06)) + exp(-length(p - pos) / (H * 0.22)) * 0.25;
      add(mix(u_glowColor, vec3(1.0, 1.0, 0.8), 0.35), glow * blink * reveal * 0.9);
    }
  }
  // embers rising off the bar, swaying and fading as they climb
  if (u_motes == 2 && u_card < 0.5) {
    for (int j = 0; j < 16 + u_zero; j++) {
      float fj = float(j);
      float h1 = hash1(fj * 12.7 + 3.0), h2 = hash1(fj * 4.1 + 1.0);
      float life = fract(cyc(30.0 + fj * 2.0) * 5.0 + h2);
      vec2 pos = vec2(lo.x + W * min(h1, max(u_fill - 0.01, 0.0)), hi.y + life * H * 2.4);
      pos.x += sin(life * 7.0 + fj) * H * 0.3;
      float e = exp(-length(p - pos) / (H * 0.045)) * (1.0 - life) * step(0.02, u_fill);
      add(mix(pal(1.0), vec3(1.0, 0.75, 0.35), 0.5) * 1.6, e * reveal * textCalm);
    }
  }
  // twinkling sparkles: four-pointed stars around the bar, and soft beams of light above it
  if (u_motes == 3 && u_card < 0.5) {
    for (int j = 0; j < 18 + u_zero; j++) {
      float fj = float(j);
      float h1 = hash1(fj * 9.3), h2 = hash1(fj * 2.7), h3 = hash1(fj * 6.1);
      float life = fract(cyc(5.0 + fj) * 2.0 + h3);
      vec2 pos = vec2(lo.x + W * min(h1, max(u_fill, 0.05)), center.y + (h2 - 0.5) * H * 3.0);
      vec2 v = abs(p - pos) / H;
      float star = exp(-v.x * 40.0) * exp(-v.y * 6.0) + exp(-v.y * 40.0) * exp(-v.x * 6.0) + exp(-length(v) * 18.0);
      float twinkle = pow(sin(life * PI), 2.0);
      add(mix(u_glowColor, vec3(1.0), 0.5), star * twinkle * reveal * 1.2);
    }
    if (p.y > hi.y) {
      float yy = (p.y - hi.y) / (H * 2.0);
      float beams = pow(0.5 + 0.5 * sin(gx * aspect * 1.6 + sin(turn(6.0)) * 1.5), 6.0);
      add(u_glowColor, beams * exp(-yy * 2.2) * fillMask * reveal * 0.18);
    }
  }
  // vapour rising off a glowing liquid (toxic sludge)
  if (u_fillType == 3 && u_edgeGlow > 0.5 && p.y > hi.y - fw) {
    float yy = (p.y - hi.y) / (H * 1.6);
    float wisp = flow(vec2(gx * aspect * 0.9, yy * 1.1), vec2(0.0, -1.6), 24.0);
    float vapour = smoothstep(0.45, 0.85, wisp) * exp(-max(yy, 0.0) * 2.6) * step(-0.02, yy);
    add(pal(0.85), vapour * fillMask * reveal * 0.45);
  }
  // cold mist and glints around an ice fill
  if (u_fillType == 6 && d > 0.0) {
    float mist = fbm(vec2(gx * aspect * 0.6 + turn(4.0), (p.y - center.y) / H * 0.8 - turn(3.0)));
    add(pal(0.0), exp(-outside / (H * 0.5)) * mist * 0.35 * fillMask * reveal);
  }
  // arcs crackling off an energy fill
  if (u_fillType == 4 && d > 0.0) {
    float arc = abs(p.y - (p.y > center.y ? hi.y : lo.y) - sin(gx * 40.0 + turn(200.0)) * H * 0.15 * noise(vec2(gx * 9.0, turn(80.0))));
    float spark = (1.0 - smoothstep(0.0, H * 0.04, arc)) * step(0.82, noise(vec2(gx * 6.0, floor(cyc(60.0) * 300.0))));
    add(pal(1.0) * 1.6, spark * fillMask * step(0.0, gx) * exp(-outside / (H * 0.3)));
  }

  // ---- the frame: bevelled metal ----
  float frameA = smoothstep(0.75, -0.75, d) * reveal * hasMeter;
  if (u_frameStyle == 3 && frameA > 0.0) {
    // no metal: a thin line of light where the glass ends
    float line = smoothstep(1.6, 0.0, abs(d + ringT * 0.35));
    add(mix(u_glowColor, vec3(1.0), 0.35), line * reveal * hasMeter * (0.55 + 0.25 * sin(turn(20.0))));
    over(vec3(0.0), smoothstep(0.75, -0.75, d) * smoothstep(-0.75, 0.75, dIn) * 0.6 * reveal * hasMeter);
  }
  if (frameA > 0.0 && u_frameStyle != 3) {
    float s = clamp(-d / ringT, 0.0, 1.0);
    float e = 1.0;
    vec2 g = normalize(vec2(
      sdRoundBox(p + vec2(e, 0.0) - center, ob, oradius) - sdRoundBox(p - vec2(e, 0.0) - center, ob, oradius),
      sdRoundBox(p + vec2(0.0, e) - center, ob, oradius) - sdRoundBox(p - vec2(0.0, e) - center, ob, oradius)) + 1e-5);
    // classic: one rounded rim; double: two rims with a groove; inset: the rim sinks into the panel
    float profile = u_frameStyle == 1 ? cos(s * PI * 2.0) : cos(s * PI);
    if (u_frameStyle == 2) profile = -profile * 0.8;
    vec3 n = normalize(vec3(-g * profile * 1.4, 1.0));
    vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    float brushed = 0.88 + 0.12 * noise(vec2(p.x * 0.35, p.y * 6.0));
    vec3 metal = u_frameColor * (0.28 + 0.95 * diff) * brushed + spec * mix(u_frameColor, vec3(1.0), 0.65) * 1.35;
    // a travelling glint along the metal
    float glint = exp(-pow((gx - (cyc(9.0) * 1.6 - 0.3)) * 9.0, 2.0)) * 0.55;
    metal += glint * mix(u_frameColor, vec3(1.0), 0.7) * smoothstep(0.2, 0.6, s) * smoothstep(1.0, 0.6, s);
    metal *= mix(0.25, 1.0, smoothstep(0.0, 0.16, s)); // dark outer rim
    metal *= 1.0 - 0.45 * exp(-pow((s - 0.55) * 14.0, 2.0)); // engraved groove
    if (u_frameStyle == 1) metal *= 1.0 - 0.5 * exp(-pow((s - 0.5) * 9.0, 2.0));
    if (u_frameStyle == 2) metal *= 0.72;
    metal *= mix(1.0, 0.55, smoothstep(0.85, 1.0, s)); // shadow where the ring meets the well
    float defeatGrey = smoothstep(0.0, 1.0, u_defeat);
    metal = mix(metal, vec3(luma(metal)) * 0.55, defeatGrey);
    over(metal, frameA);
  }

  // ---- inside: material, HP front, trail, shield, ticks ----
  float insideA = smoothstep(0.75, -0.75, dIn) * reveal * hasMeter;
  if (insideA > 0.0) {
    float edgeDist = -dIn;
    float shade = smoothstep(0.0, H * 0.32, edgeDist);
    vec3 col;
    float fx = uv.x;
    if (fx < u_fill) {
      col = mat.rgb;
      // glass: inner shadow, a glossy band on top, a soft reflection below
      col *= mix(0.5, 1.0, shade) * (0.62 + 0.5 * pow(sin(clamp(uv.y, 0.0, 1.0) * PI), 0.6));
      float gloss = smoothstep(0.55, 0.72, uv.y) * smoothstep(0.97, 0.8, uv.y);
      col += gloss * (0.16 + 0.14 * u_shine);
      col += smoothstep(0.22, 0.0, uv.y) * 0.05;
      if (u_shine > 0.5) {
        float band = (px.x - (cyc(10.0) * (aspect + 6.0) - 3.0)) - (uv.y - 0.5) * 0.8;
        col += exp(-band * band * 6.0) * 0.4;
      }
    } else {
      // the empty well: recessed and dark, with a faint texture
      col = u_empty * (0.7 + 0.45 * fbm(px * vec2(3.0, 6.0)));
      col *= mix(0.45, 1.0, shade);
      col += smoothstep(0.3, 0.0, uv.y) * 0.03;
      if (fx < u_trail) {
        float k = (fx - u_fill) / max(u_trail - u_fill, 1e-3);
        float glowN = fbm(px * vec2(1.6, 2.4) + vec2(turn(30.0), -turn(22.0)));
        vec3 tc = u_trailColor * (0.7 + 0.45 * glowN);
        col = mix(col, tc * (0.75 + 0.25 * shade), 0.8 * (1.0 - 0.4 * k));
        col += u_trailColor * exp(-abs(fx - u_trail) * innerSize.x / (H * 0.18)) * 0.45;
      }
      if (u_shieldOn > 0.5 && fx < u_fill + u_shield) {
        float hex = hexEdge(px * vec2(2.6, 2.6) + vec2(0.0, turn(3.0) * 0.05));
        float cellLine = 1.0 - smoothstep(0.0, 0.07, hex);
        float fresnel = pow(1.0 - shade, 2.0);
        float sweep = exp(-pow(px.x - (cyc(12.0) * (aspect + 4.0) - 2.0) - (uv.y - 0.5) * 0.6, 2.0) * 6.0);
        float endLine = exp(-abs(fx - u_fill - u_shield) * innerSize.x / (H * 0.05));
        col = mix(col, u_shieldColor * 0.45, 0.55);
        col += u_shieldColor * (cellLine * 0.22 + fresnel * 0.5 + sweep * 0.35 + endLine * 0.9);
      }
    }
    // the HP front: a bright meniscus that bleeds light into the empty side
    float dx = (fx - u_fill) * innerSize.x;
    if (u_fill > 0.001 && u_fill < 0.999) {
      vec3 frontC = mix(pal(1.0), vec3(1.0), 0.5);
      col += frontC * exp(-abs(dx) / (H * 0.06)) * (0.9 + 0.6 * u_edgeGlow) * (u_pattern == 4 ? 0.0 : 1.0);
      col += pal(1.0) * exp(-max(dx, 0.0) / (H * 0.5)) * step(0.0, dx) * 0.25 * (0.5 + 0.5 * u_edgeGlow);
    }
    // runes carved into the fill: strokes between points of a 3x3 lattice, glowing in the look's light
    if (u_pattern == 1 && fx < u_fill) {
      float cellW = 0.62;
      vec2 gp = vec2(px.x / cellW, uv.y);
      float id = floor(gp.x);
      vec2 f = vec2(fract(gp.x) * 1.0, gp.y);
      vec2 q = (f - vec2(0.5)) * vec2(cellW / 0.62, 1.0) * 1.35 + vec2(0.5);
      float dRune = 9.0;
      for (int k = 0; k < 4 + u_zero; k++) {
        float hk = hash1(id * 13.1 + float(k) * 7.7);
        float ha = floor(hk * 9.0), hb = floor(fract(hk * 31.7) * 9.0);
        vec2 a = vec2(mod(ha, 3.0), floor(ha / 3.0)) * vec2(0.3, 0.32) + vec2(0.2, 0.18);
        vec2 b = vec2(mod(hb, 3.0), floor(hb / 3.0)) * vec2(0.3, 0.32) + vec2(0.2, 0.18);
        if (ha == hb) continue;
        vec2 pa = q - a, ba = b - a;
        float k2 = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        dRune = min(dRune, length(pa - ba * k2));
      }
      float stroke = 1.0 - smoothstep(0.035, 0.06, dRune);
      float halo = exp(-dRune * 18.0);
      float wave = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(px.x * 0.9 - turn(30.0)), 3.0);
      col = mix(col, col * 0.55, smoothstep(0.09, 0.05, dRune));
      col += u_glowColor * (stroke * 1.3 + halo * 0.35) * wave;
    }
    // dragon scales: overlapping plates in rows, each lit on its rim and dark at its root
    if (u_pattern == 2 && fx < u_fill) {
      vec2 sp = px * vec2(1.7, 2.1);
      sp.x += 0.5 * mod(floor(sp.y), 2.0);
      vec2 f = fract(sp);
      float d = length((f - vec2(0.5, 1.0)) * vec2(1.0, 0.95));
      float plate = smoothstep(0.8, 0.74, d);
      float rim = smoothstep(0.6, 0.72, d) * plate;
      float root = smoothstep(0.05, 0.72, d);
      col *= mix(0.45, 1.2, root) * mix(1.0, 0.55, 1.0 - plate);
      float sweep = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(px.x * 0.9 - turn(20.0)), 3.0);
      col += mix(pal(1.0), vec3(1.0, 0.9, 0.7), 0.4) * rim * 0.5 * sweep;
    }
    // gold damask: curling lines woven over velvet
    if (u_pattern == 3 && fx < u_fill) {
      vec2 dv = vec2(fract(px.x + uv.y) - 0.5, fract(px.x - uv.y) - 0.5);
      float edge = 0.5 - max(abs(dv.x), abs(dv.y));
      float lattice = 1.0 - smoothstep(0.018, 0.04, edge);
      float r = length(dv), th = atan(dv.y, dv.x);
      float foil = 1.0 - smoothstep(0.0, 0.025, abs(r - (0.13 + 0.05 * cos(4.0 * th))));
      float pip = 1.0 - smoothstep(0.03, 0.05, r);
      float glint = 0.6 + 0.6 * pow(0.5 + 0.5 * sin(px.x * 0.8 - turn(25.0)), 4.0);
      col *= 0.8 + 0.25 * smoothstep(0.0, 0.25, edge);
      col = mix(col, u_frameColor * glint, max(lattice * 0.8, max(foil * 0.7, pip * 0.9)));
    }
    // ink on paper: pooled and thin ink in the fill, paper fibres in the empty part, a ragged front soaking in
    if (u_pattern == 4) {
      float n = fbm(px * vec2(2.2, 3.5) + vec2(0.0, turn(40.0) * 0.05));
      float soak = (u_fill - fx) * aspect + (fbm(px * vec2(1.4, 2.6)) - 0.5) * 2.2 - 0.5;
      vec3 paper = u_empty * (0.88 + 0.22 * fbm(px * vec2(10.0, 40.0))) * mix(0.6, 1.0, shade);
      if (fx < u_fill) {
        // blotches of pooled ink, a darker line where it dried at its edge, paper showing through the ragged front
        col = mix(col, pal(0.35) * mix(0.5, 1.0, shade), 0.7);
        col *= 0.5 + 0.9 * n;
        col *= 1.0 - 0.45 * exp(-abs(soak - 0.04) * 40.0);
        col = mix(paper, col, smoothstep(-0.03, 0.1, soak));
      } else {
        col *= 0.88 + 0.22 * fbm(px * vec2(10.0, 40.0));
      }
    }
    // engraved ticks
    for (int i = 0; i < 8 + u_zero; i++) {
      if (i >= u_tickCount) break;
      float dist = (fx - u_ticks[i]) * innerSize.x;
      col *= 1.0 - 0.55 * (1.0 - smoothstep(0.6, 1.6, abs(dist)));
      col += 0.18 * (1.0 - smoothstep(0.0, 1.0, abs(dist - 1.5)));
    }
    // defeat: cracks spread, the light dies
    if (u_defeat > 0.0) {
      vec2 cell = voronoi(px * vec2(2.0, 1.6));
      float crack = (1.0 - smoothstep(0.0, 0.06, cell.y)) * step(cell.x * 0.8, u_defeat);
      col = mix(col, vec3(luma(col)) * 0.35, u_defeat * 0.85);
      col += crack * u_spark * (1.0 - u_defeat) * 2.0;
      col *= 1.0 - crack * 0.6 * u_defeat;
    }
    over(col, insideA);
  }

  // ---- running effects (sized to the card on a card: its meter is thin) ----
  float fxSize = u_card > 0.5 ? (u_panel.w - u_panel.y) * 0.26 : H;
  for (int i = 0; i < u_fxCount; i++) {
    if (hasMeter < 0.5) break;
    float H = fxSize;
    int kind = int(u_fxA[i].x);
    float t = u_fxA[i].y, s = u_fxA[i].z, x = u_fxA[i].w;
    bool big = u_fxB[i].x > 0.5, motion = u_fxB[i].y > 0.5;
    float share = u_fxB[i].z;
    float seed = u_fxB[i].w;
    vec2 hit = vec2(inner0.x + innerSize.x * x, center.y);
    if (kind == 0) {
      // the lost chunk: white-hot for an instant, then it burns away from its edges into embers
      float x0 = x, x1 = x + max(share, 0.004);
      float inside = smoothstep(0.75, -0.75, dIn);
      float inChunk = smoothstep(x0 - 0.002, x0, uv.x) * smoothstep(x1 + 0.002, x1, uv.x) * inside;
      float burn = fbm(px * vec2(3.0, 5.0) + seed);
      float gone = smoothstep(burn - 0.05, burn + 0.05, t * 1.4 - 0.15);
      float edge = smoothstep(0.12, 0.0, abs(burn - (t * 1.4 - 0.15)));
      add(vec3(1.0, 0.96, 0.9), inChunk * pow(1.0 - t, 8.0) * 1.6 * s * u_hit.y);
      add(mix(u_spark, vec3(1.0, 0.85, 0.6), 0.4), inChunk * edge * (1.0 - t) * 1.4);
      over(mix(u_trailColor, pal(0.8), 0.5) * 0.9, inChunk * (1.0 - gone) * (1.0 - pow(1.0 - t, 8.0)) * 0.55);
      // impact: a hot core and a burst of light rays
      vec2 v = p - hit;
      float r = length(v * vec2(0.75, 1.0));
      float a = atan(v.y, v.x);
      float rays = pow(max(0.0, sin(a * 7.0 + seed)), 14.0) + 0.7 * pow(max(0.0, sin(a * 12.0 + seed * 1.7)), 20.0);
      float reach = H * (0.5 + 2.4 * sqrt(t)) * (0.6 + 0.6 * s);
      add(mix(u_spark, vec3(1.0), 0.5), rays * exp(-r / reach) * pow(1.0 - t, 2.5) * 1.3 * s * u_hit.x);
      add(vec3(1.0, 0.97, 0.92), exp(-r / (H * 0.28)) * pow(1.0 - t, 3.0) * 1.4 * s * u_hit.y);
      if (motion && u_hit.x > 0.5) {
        vec2 origin = vec2(inner0.x + innerSize.x * (x + share * 0.5), center.y);
        float spread = innerSize.x * max(share, 0.01);
        sparks(p, hit, H * 0.3, t, s, seed + 5.0, H, u_spark);
        if (s > 0.5 || big) shards(p, origin, spread, t, s, seed, H, u_spark);
      }
      if (big) {
        // cracks run through the metal around the hit, a soft wave rolls out, the screen flinches
        vec2 cell = voronoi(v / H * 1.4 + seed);
        float near = exp(-length(v * vec2(0.3, 1.0)) / (H * 1.8));
        float crack = (1.0 - smoothstep(0.0, 0.045, cell.y)) * near * smoothstep(0.75, -0.75, d);
        add(vec3(1.0, 0.9, 0.75), crack * pow(1.0 - t, 1.3) * 1.8 * u_hit.z);
        float wave = abs(r - t * H * 3.2);
        add(mix(u_spark, vec3(1.0), 0.3), exp(-wave / (H * 0.35)) * pow(1.0 - t, 2.0) * 0.28);
        add(vec3(1.0), smoothstep(0.75, -0.75, d) * pow(1.0 - t, 14.0) * 0.3 * u_hit.y);
      }
    } else if (kind == 1) {
      // healing: a bright wave washes along the fill, the gained part glows, sparkles rise out of it
      vec3 hc = mix(pal(1.0), vec3(1.0, 1.0, 0.85), 0.6);
      float inside = smoothstep(0.75, -0.75, dIn);
      float b = t * 1.3 - 0.15;
      float wave = exp(-pow((uv.x - b) * aspect * 1.4, 2.0)) * step(uv.x, u_fill + 0.01) * inside;
      add(hc, wave * (1.0 - t * 0.6) * 1.5 * s);
      float gained = step(x - share, uv.x) * step(uv.x, x) * inside;
      add(hc, gained * sin(t * PI) * 0.6 * s);
      add(hc, exp(-outside / (H * 0.6)) * step(0.0, d) * fillMask * sin(t * PI) * 0.35 * s);
      if (motion) {
        motes(p, inner0, innerSize.x * u_fill, t, seed, H, hc);
        motes(p, inner0, innerSize.x * u_fill, fract(t + 0.5), seed + 3.0, H, hc);
      }
    } else if (kind == 2) {
      // phase change: a surge runs from the middle to both ends and the bar stays charged; a calm look (no flash)
      // keeps only a soft wave of its own light, a bright one adds white heat and light pillars
      float flash = u_phase.x;
      float inside = smoothstep(0.75, -0.75, d);
      float front = abs(gx - 0.5) - t * 0.62;
      float surge = exp(-abs(front) * W / (H * 0.45)) * (1.0 - t * 0.7);
      add(mix(u_glowColor, vec3(1.0), 0.45 * flash), surge * inside * mix(0.55, 1.4, flash));
      add(u_glowColor, step(front, 0.0) * inside * pow(1.0 - t, 1.5) * mix(0.2, 0.4, flash));
      add(u_glowColor, exp(-outside / (H * 0.9)) * step(0.0, d) * sin(t * PI) * mix(0.2, 0.45, flash));
      if (u_phase.y > 0.5) {
        // the old phase cracks open behind the surge and cools down
        vec2 cell = voronoi(px * 1.6 + seed);
        float crack = (1.0 - smoothstep(0.0, 0.05, cell.y)) * smoothstep(0.75, -0.75, dIn) * step(front, 0.0);
        add(mix(u_spark, vec3(1.0, 0.9, 0.7), 0.4), crack * pow(1.0 - t, 1.5) * 1.6);
      }
      if (motion && flash > 0.5) {
        float above = p.y - hi.y;
        float column = pow(noise(vec2(gx * aspect * 1.3, seed)), 5.0) * smoothstep(0.0, -0.08, front) * smoothstep(-0.4, -0.15, front) * smoothstep(0.0, 0.08, gx) * smoothstep(1.0, 0.92, gx);
        float rise = smoothstep(0.0, H * 0.2, above) * exp(-above / (H * (0.6 + 2.2 * t)));
        add(mix(u_glowColor, vec3(1.0), 0.35), column * rise * sin(t * PI) * 2.2 * step(0.0, above));
      }
      if (motion && u_hit.x > 0.5) {
        motes(p, inner0, innerSize.x, t, seed, H, mix(u_glowColor, vec3(1.0), 0.4));
        sparks(p, vec2(center.x - W * 0.5 * min(t * 1.24, 1.0), center.y), H * 0.2, fract(t * 3.0), 0.8, seed + floor(t * 3.0), H, u_glowColor);
        sparks(p, vec2(center.x + W * 0.5 * min(t * 1.24, 1.0), center.y), H * 0.2, fract(t * 3.0), 0.8, seed + 9.0 + floor(t * 3.0), H, u_glowColor);
      }
    } else if (kind == 3) {
      // defeat: the whole bar bursts
      add(u_spark, smoothstep(0.75, -0.75, d) * pow(1.0 - t, 5.0) * 0.45);
      add(u_spark, exp(-outside / (H * 0.8)) * step(0.0, d) * pow(1.0 - t, 2.0) * 0.5);
      if (motion) {
        shards(p, center, W, t, 1.0, seed, H, u_spark);
        shards(p, center, W, t, 1.0, seed + 31.0, H, mix(u_frameColor, u_spark, 0.5));
      }
    } else if (kind == 4) {
      // entrance: the sweep's leading edge burns bright
      float edge = exp(-abs(gx - sweepEdge) * W / (H * 0.15)) * step(-0.5, d + H) * (1.0 - smoothstep(H * 0.6, H * 1.2, abs(p.y - center.y)));
      add(mix(u_glowColor, vec3(1.0), 0.5), edge * (1.0 - t * 0.6) * 1.4);
      if (motion) motes(p, vec2(lo.x + W * clamp(sweepEdge, 0.0, 1.0) - H, lo.y), H * 2.0, fract(t * 4.0), seed + floor(t * 4.0), H, u_glowColor);
    }
  }

  // Light fades out before the canvas edge, so nothing is cut by a straight line.
  vec2 room = min(lo, u_res - hi);
  vec2 toEdge = min(p, u_res - p);
  float edgeFade = smoothstep(0.0, room.y * 0.45, toEdge.y) * smoothstep(0.0, room.x * 0.45, toEdge.x);
  o = vec4(C, A) * edgeFade;
}
`;

/** What one compiled program draws: the mode (0 bar, 1 card with a left strip, 2 with a top strip, 3 portrait) and the
 * look's FILL_TYPES, FILL_PATTERNS and FILL_MOTES indices. */
export interface BarVariant {
  mode: number;
  fill: number;
  pattern: number;
  motes: number;
}

export const variantKey = (v: BarVariant) => `${v.mode}.${v.fill}.${v.pattern}.${v.motes}`;

/**
 * The fragment shader for one variant (ADR 0003). Baking these in as constants lets the compiler drop the other
 * materials, modes and extras: a first compile on Direct3D 11 went from 55 s for the whole shader to about 3 s.
 */
export function barFragment(v: BarVariant): string {
  return SOURCE.replace("uniform float u_card;", `#define u_card ${v.mode.toFixed(1)}`)
    .replace("uniform int u_fillType;", `#define u_fillType ${v.fill}`)
    .replace("uniform int u_pattern;", `#define u_pattern ${v.pattern}`)
    .replace("uniform int u_motes;", `#define u_motes ${v.motes}`);
}
