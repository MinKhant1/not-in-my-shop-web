import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ShopperState } from '../shoppers/ShopperState.js';
import { INTERIOR_Z_MAX, INTERIOR_Z_MIN, STORE_WEST, sectionEast } from '../world/StoreSections.js';
import { SECURITY_CAMERA_SPOTS } from './securityCameraSpots.js';
import { CctvAlertUI } from './CctvAlertUI.js';

// Local Z where the rotating head meets the end of the wall arm.
const HEAD_PIVOT_Z = 0.5;

// Each camera sweeps at its own speed and starting angle so the row never turns together.
const SWEEP_BY_ID = {
  1: { period: 6.2, phase: 0.4 },
  2: { period: 8.8, phase: 2.5 },
  3: { period: 7.1, phase: 4.3 },
  4: { period: 9.6, phase: 1.2 },
  5: { period: 5.7, phase: 3.4 }
};

// Purchased CCTV cameras for unlocked shop sections, plus thief spotting.
// Cameras only inform the player. They never stop or damage a thief.
export class SecurityCameraSystem {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.shoppers = options.shoppers;
    this.toonFactory = options.toonFactory ?? null;
    this.getUnlockedIndex = options.getUnlockedIndex;
    const config = options.config ?? {};
    this.baseUrl = config.baseModel;
    this.headUrl = config.headModel;
    this.mountHeight = config.mountHeight ?? 0.84;
    this.modelScale = config.modelScale ?? 0.5;
    this.sweepRadians = config.sweepRadians ?? 0.48;
    this.sweepPeriod = config.sweepPeriod > 0 ? config.sweepPeriod : 7.5;
    this.purchased = false;
    this.loading = false;
    this.ready = false;
    this.baseTemplate = null;
    this.headTemplate = null;
    this.rigs = [];
    this.time = 0;
    this.alerts = new CctvAlertUI(options.app);
  }

  // Called once when the upgrade is bought, and again on load if it was already owned.
  activate() {
    this.purchased = true;
    if (this.ready) {
      this.syncCameras();
      return;
    }
    if (this.loading || !this.baseUrl || !this.headUrl) {
      return;
    }
    this.loading = true;
    Promise.all([
      this.loader.load(this.baseUrl),
      this.loader.load(this.headUrl)
    ]).then(([base, head]) => {
      this.loading = false;
      this.baseTemplate = base.scene;
      this.headTemplate = head.scene;
      this.applyToon(this.baseTemplate);
      this.applyToon(this.headTemplate);
      this.ready = true;
      this.syncCameras();
    }).catch((error) => {
      this.loading = false;
      console.error('Failed to load security cameras', error);
    });
  }

  // Show a camera for every spot whose section is unlocked. Locked spots stay unbuilt.
  syncCameras() {
    if (!this.purchased || !this.ready) {
      return;
    }
    const unlocked = this.getUnlockedIndex();
    for (let i = 0; i < SECURITY_CAMERA_SPOTS.length; i += 1) {
      const spot = SECURITY_CAMERA_SPOTS[i];
      if (unlocked < spot.requiredSection - 1) {
        continue;
      }
      if (this.rigs.some((rig) => rig.id === spot.id)) {
        continue;
      }
      this.rigs.push(this.createRig(spot));
    }
  }

  update(dt, camera, width, height) {
    this.sweep(dt);
    const tracked = this.refreshTracking();
    this.alerts.update(tracked, camera, width, height);
  }

  describe() {
    let tracked = 0;
    const list = this.shoppers?.getShoppers?.() ?? [];
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].trackedByCCTV) {
        tracked += 1;
      }
    }
    return `Security cameras purchased: ${this.purchased} placed: ${this.rigs.length} tracked: ${tracked}`;
  }

  createRig(spot) {
    const root = new THREE.Group();
    root.name = `cctv-${spot.id}`;
    root.userData.editorIgnore = true;
    const anchor = spot.position;
    // Face +Z, from the north wall into the shop. Lift the plate onto the wall.
    root.position.set(anchor.x, anchor.y + this.mountHeight, anchor.z);
    root.scale.setScalar(this.modelScale);

    const base = SkeletonUtils.clone(this.baseTemplate);
    base.name = 'cctv-base';
    const head = new THREE.Group();
    head.name = 'cctv-head';
    head.position.z = HEAD_PIVOT_Z;
    head.add(SkeletonUtils.clone(this.headTemplate));
    root.add(base, head);
    this.scene.add(root);
    const sweep = SWEEP_BY_ID[spot.id] ?? { period: this.sweepPeriod, phase: spot.id * 1.7 };
    return {
      id: spot.id,
      head,
      period: sweep.period,
      phase: sweep.phase
    };
  }

  sweep(dt) {
    if (this.rigs.length === 0) {
      return;
    }
    this.time += dt;
    for (let i = 0; i < this.rigs.length; i += 1) {
      const rig = this.rigs[i];
      const cycle = (this.time / rig.period) * Math.PI * 2;
      rig.head.rotation.y = Math.sin(cycle + rig.phase) * this.sweepRadians;
    }
  }

  // Spot thieves who have started stealing inside the unlocked shop.
  // A spotted thief stays tracked until the player catches them or they escape.
  refreshTracking() {
    const list = this.shoppers?.getShoppers?.() ?? [];
    const tracked = [];
    if (!this.purchased) {
      for (let i = 0; i < list.length; i += 1) {
        list[i].trackedByCCTV = false;
      }
      return tracked;
    }
    for (let i = 0; i < list.length; i += 1) {
      const shopper = list[i];
      if (this.isFinished(shopper)) {
        shopper.trackedByCCTV = false;
        continue;
      }
      if (!shopper.trackedByCCTV && this.isStealing(shopper) && this.inCoverage(shopper)) {
        shopper.trackedByCCTV = true;
      }
      if (shopper.trackedByCCTV) {
        tracked.push(shopper);
      }
    }
    return tracked;
  }

  isStealing(shopper) {
    return shopper.isThief === true
      && !shopper.isDefeated
      && (shopper.state === ShopperState.THIEF || shopper.state === ShopperState.ANGRY);
  }

  isFinished(shopper) {
    return shopper.isDefeated === true
      || shopper.state === ShopperState.KNOCKED_OUT
      || shopper.state === ShopperState.DEFEATED_FLEEING
      || shopper.state === ShopperState.DESPAWNED;
  }

  inCoverage(shopper) {
    const unlocked = this.getUnlockedIndex();
    const x = shopper.group.position.x;
    const z = shopper.group.position.z;
    return x >= STORE_WEST
      && x <= sectionEast(Math.max(0, unlocked))
      && z >= INTERIOR_Z_MIN
      && z <= INTERIOR_Z_MAX;
  }

  applyToon(root) {
    if (!this.toonFactory) {
      return;
    }
    root.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      const geometry = child.geometry;
      if (geometry && !geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }
      const sources = Array.isArray(child.material) ? child.material : [child.material];
      const next = sources.map((source) => this.toonFactory.fromImported(source));
      child.material = Array.isArray(child.material) ? next : next[0];
    });
  }
}
