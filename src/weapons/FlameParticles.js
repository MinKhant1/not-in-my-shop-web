import * as THREE from 'three';

const MAX_PARTICLES = 22;

const vertexShader = `
  attribute float aAge;
  attribute float aLife;
  attribute float aSize;
  attribute float aSeed;
  attribute float aKind;
  varying float vLife;
  varying float vSeed;
  varying float vKind;
  void main() {
    float life = max(aLife, 0.001);
    vLife = clamp(aAge / life, 0.0, 1.0);
    vSeed = aSeed;
    vKind = aKind;
    float swell = smoothstep(0.0, 0.18, vLife) * (1.0 - smoothstep(0.62, 1.0, vLife));
    float flicker = 0.92 + 0.08 * sin(aSeed * 12.0 + aAge * 18.0);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    float perspective = 42.0 / max(1.0, -view.z);
    gl_PointSize = clamp(aSize * flicker * (0.82 + swell * 0.28) * perspective, 3.0, 56.0);
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = `
  uniform sampler2D uFlame;
  varying float vLife;
  varying float vSeed;
  varying float vKind;
  void main() {
    float fade = 1.0 - smoothstep(0.72, 1.0, vLife);
    vec2 uv = gl_PointCoord - vec2(0.5);
    if (vKind < 0.5) {
      float spin = vSeed * 6.28318 + vLife * 0.7;
      float s = sin(spin);
      float c = cos(spin);
      uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    }
    uv += vec2(0.5);
    if (vKind > 0.5) {
      vec2 spark = gl_PointCoord - vec2(0.5);
      float dist = length(spark);
      if (dist > 0.46) discard;
      float core = smoothstep(0.46, 0.12, dist);
      vec3 color = mix(vec3(0.86, 0.28, 0.08), vec3(1.0, 0.93, 0.55), core);
      gl_FragColor = vec4(color, fade * core);
      return;
    }
    vec4 tex = texture2D(uFlame, uv);
    if (tex.a < 0.12) discard;
    gl_FragColor = vec4(tex.rgb, tex.a * fade);
  }
`;

let sharedMaterial = null;
let sharedTexture = null;

function flamePath(ctx, x, tipY, halfWidth, baseY) {
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.bezierCurveTo(
    x + halfWidth * 0.15, tipY + (baseY - tipY) * 0.18,
    x + halfWidth, tipY + (baseY - tipY) * 0.42,
    x + halfWidth * 0.72, baseY - (baseY - tipY) * 0.18
  );
  ctx.quadraticCurveTo(x, baseY + 6, x - halfWidth * 0.72, baseY - (baseY - tipY) * 0.18);
  ctx.bezierCurveTo(
    x - halfWidth, tipY + (baseY - tipY) * 0.42,
    x - halfWidth * 0.15, tipY + (baseY - tipY) * 0.18,
    x, tipY
  );
  ctx.closePath();
}

function paintFlame(ctx, x, tipY, halfWidth, baseY, color) {
  flamePath(ctx, x, tipY, halfWidth, baseY);
  ctx.fillStyle = color;
  ctx.fill();
}

function createFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintFlame(ctx, 64, 10, 46, 148, '#6a1d0c');
  paintFlame(ctx, 64, 18, 38, 142, '#e23a12');
  paintFlame(ctx, 62, 36, 26, 128, '#ff8a1c');
  paintFlame(ctx, 64, 58, 15, 112, '#ffe14a');
  paintFlame(ctx, 64, 78, 7, 102, '#fff7d2');
  paintFlame(ctx, 78, 46, 12, 108, '#ffb03a');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function flameMaterial() {
  if (!sharedMaterial) {
    sharedTexture = createFlameTexture();
    sharedMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uFlame: { value: sharedTexture }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
  }
  return sharedMaterial;
}

// Cartoon flame tongues. Points stay world-up and follow the anchor.
export class FlameParticles {
  constructor(scene, anchor, options = {}) {
    this.scene = scene;
    this.anchor = anchor;
    this.count = Math.min(MAX_PARTICLES, options.count ?? 18);
    this.height = options.height ?? 1.1;
    this.spread = options.spread ?? 0.16;
    this.baseSize = options.size ?? 18;
    this.enabled = true;
    this.time = 0;
    this.world = new THREE.Vector3();
    this.worldScale = new THREE.Vector3(1, 1, 1);
    this.ages = new Float32Array(this.count);
    this.lives = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count);
    this.sizes = new Float32Array(this.count);
    this.kinds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      this.respawn(i, Math.random());
    }

    const positions = new Float32Array(this.count * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    this.geometry.setAttribute('aKind', new THREE.BufferAttribute(this.kinds, 1));
    this.points = new THREE.Points(this.geometry, flameMaterial());
    this.points.name = 'flame-particles';
    this.points.frustumCulled = false;
    this.points.userData.editorIgnore = true;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  respawn(index, ageRatio = 0) {
    const spark = index % 5 === 0;
    const life = spark ? 0.22 + Math.random() * 0.18 : 0.48 + Math.random() * 0.28;
    this.lives[index] = life;
    this.ages[index] = ageRatio * life;
    this.seeds[index] = Math.random();
    this.kinds[index] = spark ? 1 : 0;
    this.sizes[index] = spark ? this.baseSize * 0.42 : this.baseSize * (0.85 + Math.random() * 0.3);
  }

  burst() {
    const sparks = Math.min(6, this.count);
    for (let i = 0; i < sparks; i += 1) {
      this.respawn(i, 0);
      this.kinds[i] = 1;
      this.sizes[i] = this.baseSize * 0.42;
    }
  }

  update(dt) {
    if (!this.anchor) {
      return;
    }
    this.time += dt;
    this.anchor.updateWorldMatrix(true, false);
    this.anchor.getWorldPosition(this.world);
    this.anchor.getWorldScale(this.worldScale);
    this.points.position.copy(this.world);
    this.points.quaternion.identity();

    const unit = (Math.abs(this.worldScale.x) + Math.abs(this.worldScale.y) + Math.abs(this.worldScale.z)) / 3;
    const height = THREE.MathUtils.clamp(this.height * unit, 0.16, 0.42);
    const spread = THREE.MathUtils.clamp(this.spread * unit, 0.02, 0.12);
    const positions = this.geometry.attributes.position.array;
    let alive = 0;
    for (let i = 0; i < this.count; i += 1) {
      this.ages[i] += dt;
      if (this.enabled && this.ages[i] >= this.lives[i]) {
        this.respawn(i, 0);
      }
      const life = this.lives[i];
      const fade = life <= 0 ? 1 : this.ages[i] / life;
      if (fade < 1) {
        alive += 1;
      }
      const spark = this.kinds[i] > 0.5;
      const rise = height * 0.28 + Math.pow(Math.min(fade, 1), spark ? 0.65 : 0.82) * height * (spark ? 0.85 : 0.72);
      const sway = Math.sin(this.time * (spark ? 9 : 5.5) + this.seeds[i] * 12) * spread * (0.25 + fade * 0.75);
      const side = (this.seeds[i] - 0.5) * spread * (spark ? 1.4 : 0.55);
      positions[i * 3] = side + sway;
      positions[i * 3 + 1] = rise;
      positions[i * 3 + 2] = Math.cos(this.seeds[i] * 9 + this.time * 3) * spread * 0.35;
    }
    this.points.visible = alive > 0;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAge.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aSeed.needsUpdate = true;
    this.geometry.attributes.aKind.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.anchor = null;
  }
}
