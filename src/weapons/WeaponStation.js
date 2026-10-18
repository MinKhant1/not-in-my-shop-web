import * as THREE from 'three';
import { PlayerActivity, WeaponId } from '../player/PlayerActivity.js';
import { BroomWeapon } from './BroomWeapon.js';

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
    const station = this.scene.getObjectByName('weapon-station');
    if (station) {
      station.add(this.mount);
    } else {
      this.mount.position.set(2.92, 0, 1.2);
      this.scene.add(this.mount);
    }
    await this.broom.load(loader, toonFactory);
    this.broom.unequip(this.mount);
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
    this.player.currentWeapon = WeaponId.BROOM;
    this.player.hasBroomEquipped = true;
  }

  unequip() {
    if (!this.broom.model || !this.broom.equipped) {
      return;
    }
    this.broom.unequip(this.mount);
    this.player.endAttack();
    this.player.currentWeapon = WeaponId.NONE;
    this.player.hasBroomEquipped = false;
  }

  playerInside() {
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
  }
}
