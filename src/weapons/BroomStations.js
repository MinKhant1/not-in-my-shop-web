import * as THREE from 'three';
import { UpgradePad } from '../economy/UpgradePad.js';
import { findSceneObject } from '../core/findSceneObject.js';
import { storeLayout } from '../world/StoreLayout.js';
import { SECTION_WIDTH, sectionEast, storeSections } from '../world/StoreSections.js';
import { WEAPON_PLACEHOLDER_LOCAL } from '../world/SectionShell.js';
import { applyBroomMaterials } from './BroomWeapon.js';
import { placeBristleAnchor } from './bristleAnchor.js';
import { FlamingBroomVFX } from './FlamingBroomVFX.js';
import { nextBroom } from './broomUpgrades.js';

// Same local pose WeaponStation uses for an upgraded broom on the grocery stand.
const STAND_BROOM = {
  position: [0, 0.12, -2],
  rotation: [Math.PI / 2, 0, 0],
  scale: 1
};

function groceryStand() {
  for (let i = 0; i < storeLayout.length; i += 1) {
    if (storeLayout[i].id === 'weapon-station') {
      return storeLayout[i];
    }
  }
  return null;
}

function expansionSpots() {
  const spots = [];
  for (let i = 0; i < storeSections.length; i += 1) {
    const section = storeSections[i];
    if (section.index <= 0) {
      continue;
    }
    const west = sectionEast(section.index) - SECTION_WIDTH;
    spots.push({
      id: `broom-station-${section.id}`,
      sectionId: section.id,
      sectionIndex: section.index,
      x: west + WEAPON_PLACEHOLDER_LOCAL[0],
      z: WEAPON_PLACEHOLDER_LOCAL[1]
    });
  }
  return spots;
}

function snapToFloor(model) {
  model.position.set(0, 0, 0);
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  if (!box.isEmpty() && Math.abs(box.min.y) > 0.001) {
    model.position.y -= box.min.y;
  }
}

// Extra broom stands on the weapon placeholders. Grocery is already free.
// Each other stand is bought at night for a flat cost, then upgrades the same broom.
export class BroomStationSet {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.collision = options.collision;
    this.money = options.money;
    this.upgrades = options.upgrades;
    this.save = options.save;
    this.upgradeManager = options.upgradeManager;
    this.broomUpgrade = options.broomUpgrade;
    this.player = options.player;
    this.toonFactory = options.toonFactory ?? null;
    this.getUnlocked = options.getUnlocked;
    this.onSpawn = options.onSpawn ?? null;
    const weapons = options.weapons ?? {};
    const stationConfig = options.stationConfig ?? {};
    const grocery = groceryStand();
    const groceryX = grocery?.position?.[0] ?? 2.92;
    const groceryZ = grocery?.position?.[2] ?? 1.2;
    const zone = weapons.zonePosition ?? [1.9, 1.25];
    this.modelUrl = grocery?.model ?? '/models/objects/broom_with_stand.glb';
    this.modelScale = grocery?.scale ?? 0.4;
    this.offsetX = zone[0] - groceryX;
    this.offsetZ = zone[1] - groceryZ;
    this.zoneRadius = weapons.zoneRadius ?? 0.42;
    this.cost = stationConfig.cost ?? 200;
    this.halfSize = stationConfig.halfSize ?? 0.72;
    this.interval = options.interval ?? 0.15;
    this.upgradeOpen = false;
    this.stations = expansionSpots().map((spot) => new BroomStation(this, spot));
  }

  syncUnlocked() {
    for (let i = 0; i < this.stations.length; i += 1) {
      this.stations[i].syncUnlocked();
    }
  }

  syncFromUpgrade() {
    const def = this.broomUpgrade.current;
    for (let i = 0; i < this.stations.length; i += 1) {
      const station = this.stations[i];
      station.setLevel(def);
      station.syncOffer();
    }
  }

  setUpgradeMode(active) {
    this.upgradeOpen = active === true;
    for (let i = 0; i < this.stations.length; i += 1) {
      this.stations[i].syncZone();
    }
  }

  playerInside() {
    if (this.upgradeOpen) {
      return false;
    }
    for (let i = 0; i < this.stations.length; i += 1) {
      if (this.stations[i].playerInside()) {
        return true;
      }
    }
    return false;
  }

  update(dt) {
    const held = this.player?.hasBroomEquipped === true;
    for (let i = 0; i < this.stations.length; i += 1) {
      this.stations[i].update(dt, held);
    }
  }
}

class BroomStation {
  constructor(set, spot) {
    this.set = set;
    this.id = spot.id;
    this.sectionId = spot.sectionId;
    this.sectionIndex = spot.sectionIndex;
    this.x = spot.x;
    this.z = spot.z;
    this.zoneX = spot.x + set.offsetX;
    this.zoneZ = spot.z + set.offsetZ;
    this.owned = false;
    this.pauseOffer = false;
    this.active = false;
    this.waitingForSection = false;
    this.ready = false;
    this.held = false;
    this.level = 1;
    this.loading = false;
    this.builtInMeshes = [];
    this.standUpgrade = null;
    this.standFlames = null;
    this.standFlameAnchor = null;
    this.standBroom = null;
    this.root = null;
    this.zone = null;
    this.ring = null;
    this.time = 0;

    this.pad = new UpgradePad(set.scene, set.money, set.upgrades, {
      id: this.id,
      name: 'BROOM STATION',
      cost: set.cost,
      position: [this.zoneX, this.zoneZ],
      halfSize: set.halfSize,
      circular: true,
      manual: true,
      showFloorTitle: true,
      retainWhenOwned: true,
      banner: false,
      onPurchase: () => this.handlePurchase()
    }, set.interval);
    set.upgradeManager.pads.push(this.pad);

    if (set.upgrades.owns(this.id)) {
      this.owned = true;
      this.activate();
      this.syncOffer();
    }
  }

  handlePurchase() {
    if (!this.owned) {
      this.owned = true;
      const bought = this.set.upgrades.markPurchased(this.id);
      if (bought) {
        this.set.save.write({
          purchasedUpgrades: [...this.set.upgrades.purchased],
          money: this.set.money.getMoney()
        });
      }
      this.activate();
      // Keep the paid circle idle until they step off, so the next broom tier does not start charging.
      this.pauseOffer = true;
      this.pad.configure({
        name: 'BROOM STATION',
        cost: this.set.cost,
        hired: true
      });
      return 'again';
    }
    this.set.broomUpgrade.purchase();
    return nextBroom(this.set.broomUpgrade.level) ? 'again' : undefined;
  }

  syncUnlocked() {
    if (this.owned && !this.active) {
      this.activate();
      this.syncOffer();
    }
  }

  activate() {
    if (this.active) {
      return;
    }
    if (this.sectionIndex > this.set.getUnlocked()) {
      this.waitingForSection = true;
      return;
    }
    this.waitingForSection = false;
    this.active = true;
    this.hidePlaque();
    this.buildRoot();
    this.loadStand();
  }

  hidePlaque() {
    const plaque = findSceneObject(this.set.scene, `decor-reserved-${this.sectionId}-weapon`);
    if (plaque) {
      plaque.visible = false;
    }
  }

  buildRoot() {
    const root = new THREE.Group();
    root.name = this.id;
    root.position.set(this.x, 0, this.z);
    root.userData.editorIgnore = true;
    this.zone = this.createZone();
    this.zone.position.set(this.set.offsetX, 0.035, this.set.offsetZ);
    root.add(this.zone);
    this.set.scene.add(root);
    this.root = root;
    this.syncZone();
  }

  createZone() {
    const radius = this.set.zoneRadius;
    const group = new THREE.Group();
    group.name = `${this.id}-zone`;
    group.userData.editorIgnore = true;

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffca45,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.78, radius, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffca45,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(disc, ring);
    this.ring = ring;
    return group;
  }

  loadStand() {
    if (this.loading || this.ready) {
      return;
    }
    this.loading = true;
    this.set.loader.load(this.set.modelUrl).then((asset) => {
      this.loading = false;
      if (!this.root) {
        return;
      }
      const model = asset.scene;
      model.name = 'broom-stand';
      model.scale.setScalar(this.set.modelScale);
      applyBroomMaterials(model, this.set.toonFactory);
      this.root.add(model);
      snapToFloor(model);
      this.standBroom = model.getObjectByName('Broom') ?? null;
      if (this.standBroom) {
        this.standBroom.traverse((child) => {
          if (child.isMesh) {
            this.builtInMeshes.push(child);
          }
        });
      }
      this.ready = true;
      this.set.collision.addObject(model, { id: this.id });
      this.set.collision.rebuildDebug();
      this.set.onSpawn?.(model, this.id);
      this.applyLevel(this.set.broomUpgrade.current);
      this.syncVisibility();
    }).catch((error) => {
      this.loading = false;
      console.error('Failed to place broom station', error);
    });
  }

  syncOffer() {
    if (!this.owned || this.pauseOffer) {
      return;
    }
    const next = nextBroom(this.set.broomUpgrade.level);
    if (!next) {
      this.pad.configure({
        name: 'BROOM',
        cost: 0,
        hired: true
      });
      return;
    }
    this.pad.configure({
      name: next.name.toUpperCase(),
      cost: next.cost,
      hired: false
    });
  }

  setLevel(def) {
    this.level = def?.level ?? this.level;
    if (!this.ready) {
      return;
    }
    this.applyLevel(def);
  }

  applyLevel(def) {
    const level = def?.level ?? 1;
    this.level = level;
    const upgraded = level > 1;
    if (!upgraded) {
      if (this.standUpgrade) {
        this.standUpgrade.visible = false;
      }
      if (this.standFlames) {
        this.standFlames.setActive(false);
      }
      this.syncVisibility();
      return;
    }
    if (!this.standUpgrade) {
      this.createStandUpgrade(def.model);
      return;
    }
    if (this.standFlameAnchor) {
      placeBristleAnchor(this.standUpgrade, this.standFlameAnchor);
      this.standFlames?.syncAnchor();
    }
    this.syncFlames(def);
    this.syncVisibility();
  }

  createStandUpgrade(url) {
    if (this.loadingUpgrade) {
      return;
    }
    this.loadingUpgrade = true;
    this.set.loader.load(url).then((asset) => {
      this.loadingUpgrade = false;
      if (!this.standBroom || this.standUpgrade) {
        return;
      }
      const model = asset.scene;
      model.name = 'stand-broom';
      applyBroomMaterials(model, this.set.toonFactory);
      model.position.set(STAND_BROOM.position[0], STAND_BROOM.position[1], STAND_BROOM.position[2]);
      model.rotation.set(STAND_BROOM.rotation[0], STAND_BROOM.rotation[1], STAND_BROOM.rotation[2]);
      model.scale.setScalar(STAND_BROOM.scale);
      this.standFlameAnchor = new THREE.Object3D();
      this.standFlameAnchor.name = 'stand-flame-anchor';
      model.add(this.standFlameAnchor);
      placeBristleAnchor(model, this.standFlameAnchor);
      this.standUpgrade = model;
      this.standBroom.add(model);
      this.syncFlames(this.set.broomUpgrade.current);
      this.syncVisibility();
    }).catch((error) => {
      this.loadingUpgrade = false;
      console.error('Failed to show upgraded broom', error);
    });
  }

  syncFlames(def) {
    if (def.level >= 3) {
      this.ensureStandFlames();
      this.standFlames?.setPower(def.flameIntensity, def.flameScale, def.flameParticles);
    } else if (this.standFlames) {
      this.standFlames.setActive(false);
    }
  }

  ensureStandFlames() {
    if (this.standFlames || !this.standFlameAnchor) {
      return;
    }
    this.standFlames = new FlamingBroomVFX(this.set.scene, this.standFlameAnchor, {
      quality: this.set.broomUpgrade.station?.config?.flameQuality,
      seed: 0.41 + this.sectionIndex * 0.17,
      enableTrail: false,
      enableAttack: false,
      enableLight: false
    });
  }

  syncVisibility() {
    const show = this.ready && !this.held;
    const upgraded = this.level > 1;
    for (let i = 0; i < this.builtInMeshes.length; i += 1) {
      this.builtInMeshes[i].visible = show && !upgraded;
    }
    if (this.standUpgrade) {
      this.standUpgrade.visible = show && upgraded;
    }
    if (this.standFlames) {
      this.standFlames.setActive(show && this.level >= 3 && this.standUpgrade?.visible === true);
    }
  }

  syncZone() {
    if (this.zone) {
      this.zone.visible = this.active && !this.set.upgradeOpen;
    }
  }

  playerInside() {
    if (!this.active || this.set.upgradeOpen) {
      return false;
    }
    const position = this.set.player.group.position;
    const dx = position.x - this.zoneX;
    const dz = position.z - this.zoneZ;
    const radius = this.set.zoneRadius;
    return dx * dx + dz * dz <= radius * radius;
  }

  update(dt, held) {
    if (this.pauseOffer) {
      const position = this.set.player.group.position;
      const dx = position.x - this.zoneX;
      const dz = position.z - this.zoneZ;
      const half = this.set.halfSize;
      if (dx * dx + dz * dz > half * half) {
        this.pauseOffer = false;
        this.syncOffer();
      }
    }
    if (this.held !== held) {
      this.held = held;
      this.syncVisibility();
    }
    this.syncZone();
    if (this.zone?.visible && this.ring) {
      this.time += dt;
      const pulse = 1 + Math.sin(this.time * 3) * 0.035;
      this.ring.scale.set(pulse, pulse, 1);
      const inside = this.playerInside();
      this.ring.material.color.setHex(inside ? 0xffe29a : 0xffca45);
    }
    if (this.standFlames) {
      const show = this.level >= 3 && this.standUpgrade?.visible === true;
      this.standFlames.setActive(show);
      this.standFlames.update(dt, false);
    }
  }
}
