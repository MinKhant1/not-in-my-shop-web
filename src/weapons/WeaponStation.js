import * as THREE from 'three';
import { findSceneObject } from '../core/findSceneObject.js';
import { PlayerActivity, WeaponId } from '../player/PlayerActivity.js';
import { applyBroomMaterials, BroomWeapon } from './BroomWeapon.js';
import { FlameParticles } from './FlameParticles.js';

// Local to the stand's original broom node, so the upgraded mesh sits in the same hooks.
const STAND_BROOM = {
  position: [0, 0.12, -2],
  rotation: [Math.PI / 2, 0, 0],
  scale: 1
};

export class WeaponStation {
  constructor(scene, player, config) {
    this.scene = scene;
    this.player = player;
    this.config = config;
    this.zoneX = config.zonePosition[0];
    this.zoneZ = config.zonePosition[1];
    this.zoneRadius = config.zoneRadius;
    this.time = 0;
    this.broom = new BroomWeapon(config);
    this.broom.scene = scene;
    this.level = 1;
    this.loader = null;
    this.toonFactory = null;
    this.builtInMeshes = [];
    this.standUpgrade = null;
    this.standFlames = null;
    this.standFlameAnchor = null;
    this.mount = new THREE.Group();
    this.mount.name = 'WeaponStationMount';
    this.zone = this.createZone();
    scene.add(this.zone);
  }

  createZone() {
    const group = new THREE.Group();
    group.name = 'WeaponStationZone';
    group.position.set(this.zoneX, 0.035, this.zoneZ);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.zoneRadius * 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffc56b,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.name = 'weapon-disc';

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.zoneRadius * 0.78, this.zoneRadius, 40),
      new THREE.MeshBasicMaterial({
        color: 0xe08a2c,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'weapon-ring';

    group.add(disc, ring);
    group.renderOrder = 2;
    this.ring = ring;
    return group;
  }

  async load(loader, toonFactory) {
    this.loader = loader;
    this.toonFactory = toonFactory;
    const station = findSceneObject(this.scene, 'weapon-station');
    if (station) {
      station.add(this.mount);
    } else {
      this.mount.position.set(2.92, 0, 1.2);
      this.scene.add(this.mount);
    }
    this.standBroom = station?.getObjectByName('Broom') ?? null;
    if (this.standBroom) {
      this.standBroom.traverse((child) => {
        if (child.isMesh) {
          this.builtInMeshes.push(child);
        }
      });
    }
    await this.broom.load(loader, toonFactory);
    this.broom.unequip(this.mount);
    this.syncRack();
  }

  async setBroomLevel(def) {
    this.level = def.level;
    await this.broom.useModel(def.model);
    this.broom.setFlames(def.level >= 3);
    await this.syncStand(def);
    this.syncRack();
  }

  async syncStand(def) {
    const upgraded = def.level > 1;
    if (!upgraded) {
      if (this.standUpgrade) {
        this.standUpgrade.visible = false;
      }
      if (this.standFlames) {
        this.standFlames.enabled = false;
      }
      return;
    }
    if (!this.standUpgrade) {
      await this.createStandUpgrade(def.model);
    }
    this.standUpgrade.visible = true;
    if (def.level >= 3) {
      this.ensureStandFlames();
      this.standFlames.enabled = true;
    } else if (this.standFlames) {
      this.standFlames.enabled = false;
    }
  }

  async createStandUpgrade(url) {
    const asset = await this.loader.load(url);
    const model = asset.scene;
    model.name = 'stand-broom';
    applyBroomMaterials(model, this.toonFactory);
    model.position.set(STAND_BROOM.position[0], STAND_BROOM.position[1], STAND_BROOM.position[2]);
    model.rotation.set(STAND_BROOM.rotation[0], STAND_BROOM.rotation[1], STAND_BROOM.rotation[2]);
    model.scale.setScalar(STAND_BROOM.scale);
    this.standFlameAnchor = new THREE.Object3D();
    this.standFlameAnchor.name = 'stand-flame-anchor';
    this.standFlameAnchor.position.set(0, 0.42, 0);
    model.add(this.standFlameAnchor);
    this.standUpgrade = model;
    if (this.standBroom) {
      this.standBroom.add(model);
    } else {
      this.mount.add(model);
    }
  }

  ensureStandFlames() {
    if (this.standFlames || !this.standFlameAnchor) {
      return;
    }
    this.standFlames = new FlameParticles(this.scene, this.standFlameAnchor, {
      count: 14,
      height: 1.05,
      spread: 0.14,
      size: 20
    });
  }

  syncRack() {
    const upgraded = this.level > 1;
    for (let i = 0; i < this.builtInMeshes.length; i += 1) {
      this.builtInMeshes[i].visible = !upgraded;
    }
    if (this.standUpgrade) {
      this.standUpgrade.visible = upgraded;
    }
    this.broom.holder.visible = this.broom.equipped;
  }

  bind(activity) {
    activity.onChange((next, previous) => {
      if (next === PlayerActivity.WEAPON) {
        this.equip();
        return;
      }
      if (previous === PlayerActivity.WEAPON) {
        this.unequip();
      }
    });
  }

  equip() {
    if (!this.broom.model || this.broom.equipped) {
      return;
    }
    this.broom.equip(this.player.weaponSocket);
    this.syncRack();
    this.player.currentWeapon = WeaponId.BROOM;
    this.player.hasBroomEquipped = true;
  }

  unequip() {
    if (!this.broom.model || !this.broom.equipped) {
      return;
    }
    this.broom.unequip(this.mount);
    this.syncRack();
    this.player.endAttack();
    this.player.currentWeapon = WeaponId.NONE;
    this.player.hasBroomEquipped = false;
  }

  setZone(x, z) {
    this.zoneX = x;
    this.zoneZ = z;
    this.zone.position.set(x, 0.035, z);
    this.onZoneMove?.(x, z);
  }

  setUpgradeMode(active) {
    this.upgradeOpen = active === true;
    this.zone.visible = !this.upgradeOpen;
  }

  playerInside() {
    if (this.upgradeOpen) {
      return false;
    }
    const position = this.player.group.position;
    const dx = position.x - this.zoneX;
    const dz = position.z - this.zoneZ;
    return dx * dx + dz * dz <= this.zoneRadius * this.zoneRadius;
  }

  update(dt) {
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 3) * 0.035;
    this.ring.scale.set(pulse, pulse, 1);
    this.ring.material.color.setHex(this.playerInside() ? 0xffd15c : 0xe08a2c);
    if (this.standFlames) {
      const show = this.level >= 3 && this.standUpgrade?.visible === true;
      this.standFlames.enabled = show;
      this.standFlames.update(dt);
    }
  }
}
