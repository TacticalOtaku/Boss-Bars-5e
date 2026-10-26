import { TIME_PERIOD, type LiveFill } from "../../core/look/live";

/** Attribute-less full-screen triangle (WebGL2 `gl_VertexID`). */
export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Shared part of every fill: the palette (2–5 colours), value noise and fbm, and the HP share — pixels past
 * `u_fill` stay transparent so the meter's empty colour shows. Motion runs along circles in noise space with a
 * whole number of turns per TIME_PERIOD, so the wrap of `u_time` never jumps.
 */
const HEAD = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_fill;
uniform vec3 u_colors[5];
uniform int u_count;
out vec4 o;

const float TAU = 6.28318530718;
float turn(float k) { return u_time * TAU * k / ${TIME_PERIOD.toFixed(1)}; }
vec2 orbit(float k, float r) { float a = turn(k); return vec2(cos(a), sin(a)) * r; }

vec3 pal(float t) {
  float x = clamp(t, 0.0, 1.0) * float(u_count - 1);
  int i = min(int(floor(x)), u_count - 2);
  return mix(u_colors[i], u_colors[i + 1], x - float(i));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

vec3 fill(vec2 uv, vec2 px);

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  if (uv.x > u_fill) { o = vec4(0.0); return; }
  // Bars are wide and short: noise runs in square pixels, scaled to the bar's height.
  vec2 px = vec2(uv.x * u_res.x / u_res.y, uv.y);
  vec3 c = fill(uv, px);
  // The fill's front edge glows a little.
  float edge = smoothstep(0.035, 0.0, u_fill - uv.x);
  o = vec4(c + edge * 0.35, 1.0);
}
`;

/** Each type: a fill(uv, px) body on top of HEAD. */
const BODIES: Record<LiveFill, string> = {
  // Waves on the surface and slow bubbles rising.
  liquid: `
vec3 fill(vec2 uv, vec2 px) {
  float wave = 0.06 * sin(px.x * 6.0 + turn(40.0)) + 0.04 * sin(px.x * 11.0 - turn(56.0));
  float body = fbm(px * 2.5 + orbit(12.0, 2.0));
  float depth = clamp(uv.y + wave, 0.0, 1.0);
  float bubbles = smoothstep(0.82, 0.95, noise(px * 7.0 + orbit(30.0, 3.0)));
  return pal(1.0 - depth * 0.8 + body * 0.3) + bubbles * 0.25;
}`,
  // Bright bands of plasma streaming along the bar.
  energy: `
vec3 fill(vec2 uv, vec2 px) {
  vec2 q = px * vec2(1.5, 3.0) + orbit(36.0, 4.0);
  float n = fbm(q + fbm(q + orbit(24.0, 1.5)));
  float bands = pow(abs(sin((n + uv.y * 0.4) * 9.0)), 6.0);
  return pal(n) + bands * 0.6;
}`,
  // Flame tongues licking upward; hottest at the bottom.
  flame: `
vec3 fill(vec2 uv, vec2 px) {
  vec2 q = vec2(px.x * 3.0, uv.y * 2.0) + orbit(48.0, 2.5);
  float n = fbm(q + vec2(0.0, fbm(q * 1.7 + orbit(60.0, 1.0))));
  float heat = clamp(n * 1.3 - uv.y * 0.55 + 0.2, 0.0, 1.0);
  return pal(heat) * (0.6 + 0.6 * heat);
}`,
  // Frozen cells that barely move, with glints.
  ice: `
vec3 fill(vec2 uv, vec2 px) {
  vec2 g = floor(px * 4.0), f = fract(px * 4.0);
  float d = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o2 = vec2(x, y);
    vec2 r = o2 + vec2(hash(g + o2), hash(g + o2 + 7.0)) - f;
    d = min(d, dot(r, r));
  }
  float frost = fbm(px * 3.0 + orbit(6.0, 0.6));
  float glint = smoothstep(0.93, 1.0, noise(px * 9.0 + orbit(20.0, 2.0)));
  return pal(0.25 + sqrt(d) * 0.6 + frost * 0.25) + glint * 0.5;
}`,
  // A slow, dark swirl folding into itself.
  void: `
vec3 fill(vec2 uv, vec2 px) {
  vec2 q = px * 1.8;
  vec2 warp = vec2(fbm(q + orbit(8.0, 1.2)), fbm(q + vec2(5.2, 1.3) - orbit(10.0, 1.2)));
  float n = fbm(q + warp * 2.5);
  return pal(n * n * 1.4) * (0.55 + 0.45 * n);
}`,
};

export const fragmentSource = (type: LiveFill) => HEAD + BODIES[type];
