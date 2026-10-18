import * as THREE from 'three';
import { PlayerActivity } from '../player/PlayerActivity.js';
import { ShopperState } from '../shoppers/ShopperState.js';

export class PlayerWeaponController {
  constructor(player, shoppers, broom, drops, feedback, activity, config) {
    this.player = player;
    this.shoppers = shoppers;
    this.broom = broom;
    this.drops = drops;
    this.feedback = feedback;
    this.activity = activity;
    this.config = config;
    this.target = null;
    this.cooldown = 0;
    this.rangeRing = null;
    if (config.debugWeapons) {
      this.rangeRing = this.createRangeRing();
    }
  }

  createRangeRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.config.attackRange - 0.04, this.config.attackRange, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff8a5b,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.name = 'AttackRangeDebug';
    this.player.group.parent.add(ring);
    return ring;
  }

  update(dt) {
    if (this.broom.equipped) {
      this.broom.syncEquipPose();
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const armed = this.player.hasBroomEquipped && this.activity.activity === PlayerActivity.WEAPON;
    if (!armed) {
      this.target = null;
      if (this.broom.swingTime >= 0) {
        this.broom.resetSwing();
        this.player.endAttack();
      }
      this.syncRangeRing();
      return;
    }

    this.retainTarget();
    if (this.broom.swingTime < 0 && this.cooldown <= 0 && this.target) {
      this.broom.startSwing();
      this.cooldown = this.config.attackCooldown;
      const clipDuration = this.player.attackClipDuration;
      const timeScale = clipDuration > 0 ? clipDuration / this.config.attackSwingDuration : 1;
      this.player.playAttack(timeScale);
    }

    const swing = this.broom.updateSwing(dt);
    if (swing === 'hit') {
      this.resolveHit();
    }
    if (swing === 'done') {
      this.player.endAttack();
    }
    this.syncRangeRing();
  }

  retainTarget() {
    if (this.target && !this.isValidTarget(this.target)) {
      this.target = null;
    }
    if (this.target) {
      return;
    }
    const shoppers = this.shoppers.getShoppers();
    const origin = this.player.position;
    const rangeSq = this.config.attackRange * this.config.attackRange;
    let best = null;
    let bestDistance = rangeSq;
    for (let i = 0; i < shoppers.length; i += 1) {
      const shopper = shoppers[i];
      if (!this.isAttackable(shopper)) {
        continue;
      }
      const dx = shopper.group.position.x - origin.x;
      const dz = shopper.group.position.z - origin.z;
      const distance = dx * dx + dz * dz;
      if (distance <= bestDistance) {
        best = shopper;
        bestDistance = distance;
      }
    }
    this.target = best;
  }

  isValidTarget(shopper) {
    return this.isAttackable(shopper) && this.distanceSq(shopper) <= this.config.attackRange * this.config.attackRange;
  }

  isAttackable(shopper) {
    return Boolean(shopper)
      && shopper.isThief
      && !shopper.isDefeated
      && shopper.state !== ShopperState.DESPAWNED
      && shopper.state !== ShopperState.DEFEATED_FLEEING;
  }

  distanceSq(shopper) {
    const dx = shopper.group.position.x - this.player.position.x;
    const dz = shopper.group.position.z - this.player.position.z;
    return dx * dx + dz * dz;
  }

  resolveHit() {
    const target = this.target;
    if (!target || !this.isValidTarget(target)) {
      return;
    }
    const defeated = target.takeDamage(this.config.broomDamage);
    const position = target.group.position;
    this.feedback.spawn(position.x, 1.55, position.z);
    if (!defeated) {
      return;
    }
    this.target = null;
    const drops = target.dieOrFlee(this.config.defeatedThiefRunSpeed);
    this.drops.spawn(drops);
  }

  syncRangeRing() {
    if (!this.rangeRing) {
      return;
    }
    this.rangeRing.visible = this.player.hasBroomEquipped;
    this.rangeRing.position.x = this.player.position.x;
    this.rangeRing.position.z = this.player.position.z;
  }

  describe() {
    const target = this.target ? `Shopper_${this.target.id}` : 'none';
    const inRange = Boolean(this.target);
    return `Weapon: ${this.player.currentWeapon} Target: ${target} Attack Range: ${inRange}`;
  }
}
