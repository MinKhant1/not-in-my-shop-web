import * as THREE from 'three';
import { applyToonOutfit } from '../shoppers/ShopperVisuals.js';

const ROOT_POSITION_TRACKS = new Set([
  'Bone.position',
  'CharacterArmature.position'
]);

function withoutRootMotion(clip) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => !ROOT_POSITION_TRACKS.has(track.name));
  return copy;
}

function findIdle(clips) {
  return clips.find((clip) => clip.name.toLowerCase() === 'idle')
    ?? clips.find((clip) => clip.name.toLowerCase().includes('idle'))
    ?? null;
}

export class HiredCashier {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.toonFactory = options.toonFactory;
    this.stationId = options.stationId;
    const config = options.config ?? {};
    this.modelUrl = config.model;
    this.modelScale = config.modelScale ?? 0.36;
    this.modelYOffset = config.modelYOffset ?? 0.03;
    this.hired = false;
    this.loading = false;
    this.ready = false;
    this.group = null;
    this.mixer = null;
    this.standX = 0;
    this.standZ = 0;
    this.faceX = 0;
    this.faceZ = 1;
  }

  hire() {
    if (this.hired && (this.ready || this.loading)) {
      return;
    }
    this.hired = true;
    if (this.group) {
      this.group.visible = true;
      this.ready = true;
      this.snap();
      return;
    }
    if (!this.modelUrl || this.loading) {
      return;
    }
    this.loading = true;
    this.loader.load(this.modelUrl).then((asset) => {
      this.loading = false;
      if (this.group) {
        return;
      }
      this.spawn(asset);
    }).catch((error) => {
      this.loading = false;
      console.error('Failed to load cashier', error);
    });
  }

  dismiss() {
    this.hired = false;
    this.ready = false;
    if (this.group) {
      this.group.visible = false;
    }
  }

  place(x, z, faceX, faceZ) {
    this.standX = x;
    this.standZ = z;
    this.faceX = faceX;
    this.faceZ = faceZ;
    this.snap();
  }

  update(dt) {
    if (!this.ready) {
      return;
    }
    this.snap();
    this.mixer?.update(dt);
  }

  spawn(asset) {
    const group = new THREE.Group();
    group.name = `cashier-${this.stationId}`;
    group.userData.editorIgnore = true;
    const visual = new THREE.Group();
    visual.name = 'cashier-visual';
    visual.scale.setScalar(this.modelScale);
    visual.position.y = this.modelYOffset;
    applyToonOutfit(asset.scene, this.toonFactory);
    visual.add(asset.scene);
    group.add(visual);
    this.scene.add(group);
    this.group = group;
    this.mixer = new THREE.AnimationMixer(asset.scene);
    const idle = findIdle(asset.animations ?? []);
    if (idle) {
      const action = this.mixer.clipAction(withoutRootMotion(idle));
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    }
    this.ready = true;
    this.snap();
  }

  snap() {
    if (!this.group) {
      return;
    }
    this.group.position.set(this.standX, 0, this.standZ);
    const dx = this.faceX - this.standX;
    const dz = this.faceZ - this.standZ;
    if (dx * dx + dz * dz > 0.0001) {
      this.group.rotation.y = Math.atan2(dx, dz);
    }
  }
}
