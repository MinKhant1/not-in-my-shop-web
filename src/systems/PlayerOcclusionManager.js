import * as THREE from 'three';

// Layer 1 is the occluder mask. Layer 0 stays enabled so the mesh still draws.
const OCCLUDER_LAYER = 1;
const SETTLE_EPSILON = 0.01;

const slabRange = { tmin: 0, tmax: 1 };

function isEnvironmentOccluder(id) {
  return Boolean(id) && !id.startsWith('floor-') && !id.startsWith('decor-');
}

function axisSlab(origin, delta, min, max, range) {
  if (Math.abs(delta) < 1e-8) {
    return origin >= min && origin <= max;
  }
  let t1 = (min - origin) / delta;
  let t2 = (max - origin) / delta;
  if (t1 > t2) {
    const swap = t1;
    t1 = t2;
    t2 = swap;
  }
  range.tmin = Math.max(range.tmin, t1);
  range.tmax = Math.min(range.tmax, t2);
  return range.tmin <= range.tmax;
}

export function segmentHitsExpandedAabb(x0, y0, z0, x1, y1, z1, box, radius) {
  slabRange.tmin = 0;
  slabRange.tmax = 1;
  return axisSlab(x0, x1 - x0, box.minX - radius, box.maxX + radius, slabRange)
    && axisSlab(y0, y1 - y0, box.minY - radius, box.maxY + radius, slabRange)
    && axisSlab(z0, z1 - z0, box.minZ - radius, box.maxZ + radius, slabRange);
}

function prepareOccluder(occluder) {
  if (occluder.slots) {
    return;
  }
  const slots = [];
  for (let i = 0; i < occluder.meshes.length; i += 1) {
    const mesh = occluder.meshes[i];
    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clones = [];
    for (let s = 0; s < sources.length; s += 1) {
      const source = sources[s];
      const material = source.clone();
      clones.push(material);
      slots.push({
        material,
        opacity: source.opacity ?? 1,
        transparent: source.transparent === true,
        depthWrite: source.depthWrite !== false,
        alphaHash: source.alphaHash === true,
        current: source.opacity ?? 1
      });
    }
    mesh.material = clones.length === 1 ? clones[0] : clones;
  }
  occluder.slots = slots;
}

function applySlot(slot, blocking) {
  const material = slot.material;
  material.opacity = slot.current;
  const faded = blocking || slot.current < slot.opacity - SETTLE_EPSILON;
  if (faded) {
    if (!material.transparent || material.depthWrite !== false || material.alphaHash) {
      material.alphaHash = false;
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
    return;
  }
  if (
    material.alphaHash !== slot.alphaHash
    || material.transparent !== slot.transparent
    || material.depthWrite !== slot.depthWrite
  ) {
    material.alphaHash = slot.alphaHash;
    material.transparent = slot.transparent;
    material.depthWrite = slot.depthWrite;
    material.opacity = slot.opacity;
    material.needsUpdate = true;
  }
}

export class PlayerOcclusionManager {
  constructor(scene, config) {
    const settings = config.occlusion ?? {};
    this.scene = scene;
    this.radius = settings.occlusionRadius ?? 0.2;
    this.fadeOpacity = settings.fadeOpacity ?? 0.25;
    this.fadeSpeed = settings.fadeSpeed ?? 8;
    this.restoreSpeed = settings.restoreSpeed ?? 6;
    this.targetHeight = settings.targetHeight ?? 1.2;
    this.debug = settings.debugOcclusion === true;
    this.camera = null;
    this.player = null;
    this.occluders = [];
    this.active = [];
    this.blockerNames = [];
    this.debugLine = null;
    this.debugHelpers = null;
    this._box = new THREE.Box3();
  }

  attach(camera, player) {
    this.camera = camera;
    this.player = player;
  }

  collect(store) {
    const records = store.records ?? [];
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      if (!isEnvironmentOccluder(record.entry?.id)) {
        continue;
      }
      this.track(record.object, record.entry.id);
    }
    if (this.debug) {
      this.createDebug();
      if (typeof window !== 'undefined') {
        window.__occlusion = this;
      }
    }
  }

  forgetPrefix(prefix) {
    this.occluders = this.occluders.filter((item) => !String(item.id).startsWith(prefix));
  }

  track(object, id) {
    if (!object || !id || this.occluders.some((item) => item.id === id)) {
      return;
    }
    object.updateWorldMatrix(true, true);
    this._box.setFromObject(object);
    if (this._box.isEmpty()) {
      return;
    }
    const meshes = [];
    object.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      child.layers.enable(OCCLUDER_LAYER);
      meshes.push(child);
    });
    if (meshes.length === 0) {
      return;
    }
    this.occluders.push({
      id,
      object,
      meshes,
      slots: null,
      blocking: false,
      tracked: false,
      minX: this._box.min.x,
      maxX: this._box.max.x,
      minY: this._box.min.y,
      maxY: this._box.max.y,
      minZ: this._box.min.z,
      maxZ: this._box.max.z
    });
  }

  createDebug() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.debugLine = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xff4d4d, toneMapped: false })
    );
    this.debugLine.name = 'occlusion-ray';
    this.debugLine.frustumCulled = false;
    this.scene.add(this.debugLine);

    this.debugHelpers = new THREE.Group();
    this.debugHelpers.name = 'occlusion-bounds';
    this.scene.add(this.debugHelpers);
  }

  update(dt) {
    if (!this.camera || !this.player) {
      return;
    }

    const origin = this.camera.position;
    const playerPosition = this.player.group.position;
    const targetX = playerPosition.x;
    const targetY = playerPosition.y + this.targetHeight;
    const targetZ = playerPosition.z;
    this.blockerNames.length = 0;

    for (let i = 0; i < this.occluders.length; i += 1) {
      const item = this.occluders[i];
      if (item.object && item.object.visible === false) {
        item.blocking = false;
        continue;
      }
      const hit = segmentHitsExpandedAabb(
        origin.x,
        origin.y,
        origin.z,
        targetX,
        targetY,
        targetZ,
        item,
        this.radius
      );
      item.blocking = hit;
      if (!hit) {
        continue;
      }
      this.blockerNames.push(item.id);
      if (!item.tracked) {
        prepareOccluder(item);
        item.tracked = true;
        this.active.push(item);
        if (this.debug) {
          console.log(`Occlusion blocker: ${item.id}`);
        }
      }
    }

    const fadeTarget = this.fadeOpacity;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const item = this.active[i];
      const speed = item.blocking ? this.fadeSpeed : this.restoreSpeed;
      const step = Math.min(1, dt * speed);
      let settled = !item.blocking;
      const slots = item.slots;
      for (let s = 0; s < slots.length; s += 1) {
        const slot = slots[s];
        const target = item.blocking ? Math.min(slot.opacity, fadeTarget) : slot.opacity;
        slot.current += (target - slot.current) * step;
        if (Math.abs(slot.current - target) < SETTLE_EPSILON) {
          slot.current = target;
        }
        applySlot(slot, item.blocking);
        if (item.blocking || slot.current < slot.opacity - SETTLE_EPSILON) {
          settled = false;
        }
      }
      if (settled) {
        item.tracked = false;
        this.active.splice(i, 1);
      }
    }

    if (this.debug) {
      this.updateDebug(origin.x, origin.y, origin.z, targetX, targetY, targetZ);
    }
  }

  updateDebug(x0, y0, z0, x1, y1, z1) {
    const positions = this.debugLine.geometry.attributes.position;
    positions.setXYZ(0, x0, y0, z0);
    positions.setXYZ(1, x1, y1, z1);
    positions.needsUpdate = true;

    let helperIndex = 0;
    for (let i = 0; i < this.occluders.length; i += 1) {
      const item = this.occluders[i];
      if (!item.blocking) {
        continue;
      }
      let helper = this.debugHelpers.children[helperIndex];
      if (!helper) {
        helper = new THREE.Box3Helper(new THREE.Box3(), 0xffcc33);
        helper.name = 'occlusion-bounds';
        this.debugHelpers.add(helper);
      }
      helper.box.min.set(item.minX, item.minY, item.minZ);
      helper.box.max.set(item.maxX, item.maxY, item.maxZ);
      helper.visible = true;
      helperIndex += 1;
    }
    for (let i = helperIndex; i < this.debugHelpers.children.length; i += 1) {
      this.debugHelpers.children[i].visible = false;
    }
  }

  describe() {
    return this.blockerNames.join(', ');
  }
}
