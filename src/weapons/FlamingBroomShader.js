import * as THREE from 'three';

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const flameVertexShader = `
attribute float aSeed;
attribute float aAngle;
uniform float uTime;
uniform float uIntensity;
uniform float uFlickerSpeed;
varying vec2 vUv;
varying float vSeed;

void main() {
  vUv = uv;
  vSeed = aSeed;
  float tip = uv.y * uv.y;
  float wave = sin(uTime * uFlickerSpeed * 5.0 + aSeed * 17.0 + uv.y * 8.0);
  float x = position.x + wave * tip * 0.07;
  float stretch = mix(0.9, 1.22, clamp((uIntensity - 0.75) / 0.9, 0.0, 1.0));
  float y = position.y * stretch;
  float c = cos(aAngle);
  float s = sin(aAngle);
  vec3 pos = vec3(c * x, y, -s * x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const flameFragmentShader = `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uBaseColor;
uniform vec3 uMidColor;
uniform vec3 uTipColor;
uniform float uNoiseScale;
uniform float uFlickerSpeed;
uniform float uOpacity;
uniform float uSeed;
uniform float uQuality;
varying vec2 vUv;
varying float vSeed;
${NOISE}

void main() {
  float seed = uSeed + vSeed;
  float t = uTime * uFlickerSpeed;
  float y = vUv.y;
  float rise = y * uNoiseScale * 0.85 - t * 1.4;
  float n1 = valueNoise(vec2(vUv.x * uNoiseScale + seed * 6.2, rise));
  float n2 = n1;
  if (uQuality > 0.5) {
    n2 = valueNoise(vec2(vUv.x * uNoiseScale * 2.1 - seed * 3.1, rise * 1.7 + 4.2));
  }

  float tip = smoothstep(0.05, 1.0, y);
  float x = vUv.x + (n1 - 0.5) * (0.08 + tip * 0.55);
  float yWarp = y + (n2 - 0.5) * tip * 0.12;
  float nEdge = abs(x) + (n2 - 0.5) * tip * 0.28;
  float edge = 1.0 - smoothstep(0.28, 0.96, nEdge);
  float tongues = 0.66 + n1 * 0.42;
  float tipMask = 1.0 - smoothstep(tongues - 0.14, tongues + 0.06, yWarp);
  float baseMask = smoothstep(0.0, 0.045, y);
  float flicker = 0.86 + 0.14 * sin(t * 6.4 + seed * 13.0 + n1 * 4.0);
  float alpha = edge * tipMask * baseMask * uOpacity * flicker;
  alpha *= mix(0.8, 1.0, clamp(uIntensity, 0.0, 1.3));
  if (alpha < 0.03) discard;

  float radial = 1.0 - smoothstep(0.0, 0.85, abs(x));
  float along = 1.0 - smoothstep(0.08, 0.95, yWarp);
  float heat = clamp(radial * 0.74 + along * 0.5, 0.0, 1.0);
  heat *= 0.92 + 0.08 * n2;
  vec3 color = mix(uTipColor, uMidColor, smoothstep(0.02, 0.42, heat));
  color = mix(color, uBaseColor, smoothstep(0.4, 0.78, heat));
  float core = smoothstep(0.7, 0.96, heat) * smoothstep(0.0, 0.45, along);
  color = mix(color, vec3(1.0, 0.98, 0.88), core * clamp(uIntensity, 0.7, 1.5));
  color *= mix(0.94, 1.2, clamp(uIntensity - 0.8, 0.0, 0.75));
  color *= flicker;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

const trailVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const trailFragmentShader = `
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
uniform float uQuality;
uniform vec3 uBaseColor;
uniform vec3 uMidColor;
uniform vec3 uTipColor;
varying vec2 vUv;
${NOISE}

void main() {
  float across = abs(vUv.x * 2.0 - 1.0);
  float along = vUv.y;
  float n1 = valueNoise(vec2(vUv.x * 2.4 + uSeed * 3.0, along * 5.5 - uTime * 7.0));
  float n2 = n1;
  if (uQuality > 0.5) {
    n2 = valueNoise(vec2(along * 4.0 - uTime * 5.0, vUv.x * 3.0 + 2.0));
  }
  float edge = 1.0 - smoothstep(0.28 + n1 * 0.22, 0.96, across + (n2 - 0.5) * 0.18);
  float head = 1.0 - smoothstep(0.45, 1.0, along);
  float alpha = edge * head * uOpacity * (0.9 + 0.1 * n1);
  if (alpha < 0.03) discard;
  float heat = clamp(head * 0.65 + (1.0 - across) * 0.45, 0.0, 1.0);
  vec3 color = mix(uTipColor, uMidColor, smoothstep(0.0, 0.45, heat));
  color = mix(color, uBaseColor, smoothstep(0.45, 0.85, heat));
  color = mix(color, vec3(1.0, 0.96, 0.75), smoothstep(0.75, 1.0, heat) * head);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

function premulState() {
  return {
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
    side: THREE.DoubleSide,
    fog: false
  };
}

export function createFlameMaterial(options = {}) {
  const glow = options.glow === true;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: glow ? 0.85 : 1 },
      uBaseColor: { value: new THREE.Color(glow ? 0xffc14a : 0xffee8a) },
      uMidColor: { value: new THREE.Color(glow ? 0xff7a18 : 0xff6a0c) },
      uTipColor: { value: new THREE.Color(glow ? 0xe23a08 : 0xc41f04) },
      uNoiseScale: { value: glow ? 2.6 : 3.15 },
      uFlickerSpeed: { value: 1.55 },
      uOpacity: { value: glow ? 0.28 : 0.94 },
      uSeed: { value: options.seed ?? 0 },
      uQuality: { value: options.quality ?? 1 }
    },
    vertexShader: flameVertexShader,
    fragmentShader: flameFragmentShader,
    ...premulState()
  });
}

export function createTrailMaterial(options = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: options.seed ?? 0 },
      uQuality: { value: options.quality ?? 1 },
      uBaseColor: { value: new THREE.Color(0xffe38a) },
      uMidColor: { value: new THREE.Color(0xff6a12) },
      uTipColor: { value: new THREE.Color(0xd42806) }
    },
    vertexShader: trailVertexShader,
    fragmentShader: trailFragmentShader,
    ...premulState()
  });
}

export function createPointMaterial(additive) {
  const vertexShader = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uFocal;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  if (aAlpha < 0.001) {
    gl_PointSize = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  gl_PointSize = clamp(aSize * uFocal / max(1.0, -view.z), 1.5, 22.0);
  gl_Position = projectionMatrix * view;
}
`;
  const fragmentShader = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float dist = length(p);
  if (dist > 0.5 || vAlpha < 0.01) discard;
  float soft = smoothstep(0.5, 0.05, dist);
  float alpha = soft * vAlpha;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;
  return new THREE.ShaderMaterial({
    uniforms: {
      uFocal: { value: 2100 }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor
  });
}
