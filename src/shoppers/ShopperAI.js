import * as THREE from 'three';
import { ShopperState } from './ShopperState.js';
import { ThiefHealth } from '../combat/ThiefHealth.js';
import { ShopperInventory } from './ShopperInventory.js';
import { ShopperRoute } from './ShopperNavigation.js';
import { ShopperVisuals, applyToonOutfit } from './ShopperVisuals.js';
import { FlamingBroomVFX } from '../weapons/FlamingBroomVFX.js';

const ROOT_POSITION_TRACKS = new Set([
  'Bone.position',
  'CharacterArmature.position'
]);
const FADE_SECONDS = 0.18;

const CLIP_ALIASES = {
  idle: ['idle'],
  walk: ['walk', 'walking'],
  carry: ['walk_carry', 'walkcarry'],
  pickup: ['pickup', 'pick_up', 'pick']
};

function findClip(clips, aliases, reject) {
  for (let i = 0; i < aliases.length; i += 1) {
    const exact = clips.find((clip) => clip.name.toLowerCase() === aliases[i]);
    if (exact) {
      return exact;
    }
  }
  return clips.find((clip) => {
    const name = clip.name.toLowerCase();
    if (reject && reject(name)) {
      return false;
    }
    return aliases.some((alias) => name.includes(alias));
  }) ?? null;
}

function withoutRootMotion(clip) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => !ROOT_POSITION_TRACKS.has(track.name));
  return copy;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

let nextShopperId = 1;

export class ShopperAI {
  constructor({ asset, modelUrl, config, navigation, collision, checkoutQueue, checkoutConfig, weaponsConfig, toonFactory, debug }) {
    this.id = nextShopperId;
    nextShopperId += 1;
    this.modelUrl = modelUrl;
    this.config = config;
    this.navigation = navigation;
    this.collision = collision;
    this.checkoutQueue = checkoutQueue;
    this.checkoutConfig = checkoutConfig;
    this.weaponsConfig = weaponsConfig;
    this.debug = debug;
    this.thiefChance = config.thiefChance;
    this.radius = config.radius;
    this.groceryTarget = randomInt(config.minItems, config.maxItems);

    this.state = ShopperState.ENTERING;
    this.isThief = false;
    // Kept by SecurityCameraSystem while a stealing thief is spotted. Cleared when they are caught or leave.
    this.trackedByCCTV = false;
    this.isDefeated = false;
    this.burning = false;
    this.burnDps = 0;
    this.burnLeft = 0;
    this.burnFlames = null;
    this.burnAnchor = null;
    this.shopClosed = false;
    this.health = null;
    this.destinationId = null;
    this.pending = null;
    this.wait = 0;
    this.afterWait = null;
    this.moving = false;
    this.lastPickId = null;
    this.queueIndex = -1;
    this.hasReachedQueueSlot = false;
    this.payment = 0;
    this.impatient = false;
    this.angerTimer = 0;
    this.angerReact = 0;
    this.lookTarget = null;
    this.actionLock = null;

    this.route = new ShopperRoute(navigation, {
      moveSpeed: config.moveSpeed + randomBetween(-config.speedJitter, config.speedJitter),
      rotationSpeed: config.rotationSpeed,
      waypointReachDistance: config.waypointReachDistance,
      stuckDistance: config.stuckDistance,
      stuckTimeout: config.stuckTimeout,
      maxRecoveryAttempts: config.maxRecoveryAttempts
    }, this.id);

    this.group = new THREE.Group();
    this.group.name = `shopper-${this.id}`;
    this.group.userData.shopper = this;

    const model = asset.scene;
    model.name = modelUrl.split('/').pop().replace('.gltf', '');
    this.modelName = model.name;
    this.shortName = model.name.replace(/_Male$/, '');
    this.visual = new THREE.Group();
    this.visual.name = 'shopper-visual';
    this.visual.scale.setScalar(config.modelScale);
    this.visual.position.y = config.modelYOffset;
    this.visual.add(model);
    this.group.add(this.visual);

    applyToonOutfit(model, toonFactory);

    this.hold = new THREE.Group();
    this.hold.name = 'grocery-hold';
    this.hold.position.set(0.02, 0.78, 0.22);
    this.group.add(this.hold);
    this.inventory = new ShopperInventory(this.hold, toonFactory ? toonFactory.gradientMap : null);
    this.visuals = new ShopperVisuals(this.group, model, debug);

    this.mixer = null;
    this.actions = { idle: null, walk: null, carry: null, pickup: null };
    this.currentAction = null;
    this.setupAnimations(model, asset.animations ?? []);
    this.refreshDebug();
  }

  get position() {
    return this.group.position;
  }

  spawn(x, z) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.PI / 2;
    this.state = ShopperState.ENTERING;
    this.goTo('entranceInside');
  }

  update(dt) {
    if (this.state === ShopperState.DESPAWNED) {
      this.stopBurn(true);
      return;
    }
    if (this.updateBurn(dt)) {
      return;
    }
    this.visuals.tick(dt);

    if (this.wait > 0) {
      this.wait -= dt;
      this.moving = false;
      this.faceLook(dt);
      this.updateAnimation(false, dt);
      if (this.wait <= 0) {
        this.finishWait();
      }
      this.refreshDebug();
      return;
    }

    if (
      this.state === ShopperState.WAITING_IN_QUEUE
      || this.state === ShopperState.WAITING_FOR_CHECKOUT
      || this.state === ShopperState.CHECKING_OUT
      || this.state === ShopperState.ANGRY
    ) {
      this.moving = false;
      this.faceLook(dt);
      this.updateAnimation(false, dt);
      if (this.state === ShopperState.ANGRY) {
        this.angerReact -= dt;
        if (this.angerReact <= 0) {
          this.beginThiefEscape();
        }
      }
      this.syncCountdown();
      this.refreshDebug();
      return;
    }

    const result = this.route.update(dt, this.group, this.collision, this.radius);
    this.moving = result === 'moving';
    this.updateAnimation(this.moving, dt);
    if (result === 'arrived') {
      this.onArrived();
    }
    this.syncCountdown();
    this.refreshDebug();
  }

  goTo(targetId, avoidQueue = false) {
    this.destinationId = targetId;
    this.lookTarget = null;
    const position = this.group.position;
    this.route.setTarget(position.x, position.z, targetId, avoidQueue);
    this.refreshDebug();
  }

  goPick() {
    if (this.shopClosed) {
      this.leaveBecauseShopClosed();
      return;
    }
    const pickId = this.navigation.randomPick(this.lastPickId);
    this.lastPickId = pickId;
    this.pending = 'pick';
    const leave = () => this.goTo(pickId);
    if (Math.random() < 0.4) {
      this.pause(randomBetween(this.config.pauseMin, this.config.pauseMax), leave);
    } else {
      leave();
    }
  }

  pause(seconds, next) {
    this.wait = seconds;
    this.afterWait = next;
    this.moving = false;
  }

  finishWait() {
    const next = this.afterWait;
    this.afterWait = null;
    this.actionLock = null;
    if (next) {
      next();
    }
  }

  onArrived() {
    const destination = this.navigation.nodes.get(this.destinationId);

    if (this.state === ShopperState.ENTERING) {
      this.state = ShopperState.ROAMING;
      this.goPick();
      return;
    }

    if (this.state === ShopperState.ROAMING && this.pending === 'pick') {
      this.pending = null;
      this.state = ShopperState.PICKING_ITEM;
      this.faceNode(destination);
      this.playPickup();
      this.pause(this.config.pickupWait, () => this.collectAndContinue());
      this.refreshDebug();
      return;
    }

    if (this.state === ShopperState.ROAMING && this.pending === 'decide') {
      this.pending = null;
      this.decide();
      return;
    }

    if (this.state === ShopperState.GOING_TO_QUEUE) {
      this.arriveAtQueueSlot(destination);
      return;
    }

    if (
      this.state === ShopperState.THIEF
      || this.state === ShopperState.EXITING
      || this.state === ShopperState.DEFEATED_FLEEING
    ) {
      this.despawn();
    }
  }

  collectAndContinue() {
    if (this.shopClosed) {
      this.leaveBecauseShopClosed();
      return;
    }
    this.inventory.addRandom();
    this.refreshDebug();
    if (this.inventory.count < this.groceryTarget) {
      this.state = ShopperState.ROAMING;
      this.goPick();
      return;
    }
    this.state = ShopperState.ROAMING;
    this.pending = 'decide';
    this.goTo(this.navigation.randomLane());
  }

  decide() {
    if (this.shopClosed) {
      this.leaveBecauseShopClosed();
      return;
    }
    if (this.isThief) {
      this.leaveAsThief();
      return;
    }
    if (Math.random() < this.thiefChance) {
      this.becomeThief();
      return;
    }
    this.payment = randomInt(
      this.checkoutConfig.minCustomerPayment,
      this.checkoutConfig.maxCustomerPayment
    );
    const index = this.checkoutQueue.join(this);
    if (index < 0) {
      this.pause(0.4, () => this.decide());
    }
  }

  becomeAngryThief() {
    if (this.shopClosed) {
      return;
    }
    if (
      this.isThief
      || this.state === ShopperState.ANGRY
      || this.state !== ShopperState.WAITING_IN_QUEUE
      || !this.hasReachedQueueSlot
    ) {
      return;
    }
    this.state = ShopperState.ANGRY;
    this.impatient = false;
    this.angerTimer = 0;
    this.visuals.hideCountdown();
    this.isThief = true;
    this.visuals.revealThief();
    this.ensureCombatant();
    this.angerReact = this.checkoutConfig.angerReactTime ?? 0.65;
    this.moving = false;
    this.refreshDebug();
  }

  beginThiefEscape() {
    if (this.state !== ShopperState.ANGRY) {
      return;
    }
    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    this.queueIndex = -1;
    this.hasReachedQueueSlot = false;
    this.route.config.moveSpeed *= 1.45;
    this.state = ShopperState.THIEF;
    this.goTo(this.thiefExitId(), true);
  }

  becomeThief() {
    if (this.shopClosed) {
      this.leaveBecauseShopClosed();
      return;
    }
    this.impatient = false;
    this.visuals.hideCountdown();
    this.isThief = true;
    this.state = ShopperState.THIEF;
    this.visuals.revealThief();
    this.ensureCombatant();
    this.leaveAsThief();
  }

  ensureCombatant() {
    if (this.health) {
      return;
    }
    const maxHP = this.weaponsConfig?.thiefMaxHP ?? 100;
    this.health = new ThiefHealth(maxHP);
    this.visuals.showHealth(1);
  }

  isAttackable() {
    return this.isThief
      && !this.isDefeated
      && this.state !== ShopperState.DESPAWNED
      && this.state !== ShopperState.DEFEATED_FLEEING;
  }

  takeDamage(amount, flash = true) {
    if (!this.isAttackable()) {
      return false;
    }
    this.ensureCombatant();
    const defeated = this.health.takeDamage(amount);
    if (flash) {
      this.visuals.flashHit();
    }
    this.visuals.showHealth(this.health.ratio);
    this.refreshDebug();
    return defeated;
  }

  // One burn at a time. Another flaming hit only restarts the 3 second timer.
  applyBurn(dps, duration) {
    if (!this.isAttackable() || dps <= 0 || duration <= 0) {
      return;
    }
    this.burning = true;
    this.burnDps = dps;
    this.burnLeft = duration;
    if (!this.burnFlames) {
      this.burnAnchor = new THREE.Object3D();
      this.burnAnchor.name = 'thief-flame-anchor';
      this.burnAnchor.position.y = 1.02;
      this.burnAnchor.userData.bristleRadius = 0.24;
      this.group.add(this.burnAnchor);
      const scene = this.group.parent ?? this.burnAnchor;
      this.burnFlames = new FlamingBroomVFX(scene, this.burnAnchor, {
        quality: this.weaponsConfig?.flameQuality,
        seed: this.id * 0.37,
        enableTrail: false,
        enableAttack: false
      });
    }
    this.burnFlames.setActive(true);
  }

  updateBurn(dt) {
    if (!this.burning) {
      this.burnFlames?.update(dt);
      return false;
    }
    this.burnLeft -= dt;
    const defeated = this.takeDamage(this.burnDps * dt, false);
    this.burnFlames?.update(dt);
    if (defeated) {
      this.stopBurn(true);
      const drops = this.dieOrFlee(this.weaponsConfig?.defeatedThiefRunSpeed ?? 2.4);
      this.onDrops?.(drops);
      return true;
    }
    if (this.burnLeft <= 0) {
      this.stopBurn(false);
    }
    return false;
  }

  stopBurn(immediate) {
    this.burning = false;
    this.burnDps = 0;
    this.burnLeft = 0;
    if (!this.burnFlames) {
      return;
    }
    if (immediate) {
      this.burnFlames.dispose();
      this.burnFlames = null;
      this.burnAnchor?.removeFromParent();
      this.burnAnchor = null;
      return;
    }
    this.burnFlames.setActive(false);
  }

  dieOrFlee(runSpeed) {
    if (this.isDefeated) {
      return [];
    }
    this.isDefeated = true;
    this.stopBurn(true);
    this.onCaught?.();
    if (this.health) {
      this.health.isDefeated = true;
      this.health.currentHP = 0;
    }
    this.visuals.hideThiefIcon();
    this.visuals.hideHealth();
    this.visuals.hideCountdown();
    this.impatient = false;
    this.angerTimer = 0;

    const origin = new THREE.Vector3();
    this.group.getWorldPosition(origin);
    const released = this.inventory.releaseAll();
    const drops = [];
    for (let i = 0; i < released.length; i += 1) {
      const angle = released.length === 1 ? 0 : (i / released.length) * Math.PI * 2;
      drops.push({
        mesh: released[i],
        x: origin.x + Math.cos(angle) * 0.28,
        z: origin.z + Math.sin(angle) * 0.28,
        angle,
        value: released[i].userData.value
      });
    }

    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    this.queueIndex = -1;
    this.hasReachedQueueSlot = false;
    this.state = ShopperState.DEFEATED_FLEEING;
    this.route.config.moveSpeed = runSpeed;
    this.goTo(this.thiefExitId(), true);
    this.refreshDebug();
    return drops;
  }

  leaveAsThief() {
    this.state = ShopperState.THIEF;
    this.goTo(this.thiefExitId(), true);
  }

  thiefExitId() {
    return Math.random() < 0.5 ? 'thiefVanishWest' : 'thiefVanishFar';
  }

  isThiefExit(id) {
    return id === 'thiefVanishWest' || id === 'thiefVanishFar';
  }

  setQueueIndex(index) {
    const previous = this.queueIndex;
    this.queueIndex = index;
    if (
      this.state === ShopperState.CHECKING_OUT
      || this.state === ShopperState.ANGRY
      || this.state === ShopperState.EXITING
      || this.state === ShopperState.DESPAWNED
      || this.state === ShopperState.THIEF
      || this.state === ShopperState.DEFEATED_FLEEING
    ) {
      return;
    }
    if (
      previous === index
      && (
        this.state === ShopperState.GOING_TO_QUEUE
        || this.state === ShopperState.WAITING_IN_QUEUE
        || this.state === ShopperState.WAITING_FOR_CHECKOUT
      )
    ) {
      this.refreshDebug();
      return;
    }
    const slotId = this.checkoutQueue.slotId(index);
    if (!slotId) {
      return;
    }
    const slot = this.navigation.nodes.get(slotId);
    const dx = slot.x - this.group.position.x;
    const dz = slot.z - this.group.position.z;
    const arrival = this.checkoutConfig.queueArrivalDistance ?? 0.45;
    this.hasReachedQueueSlot = false;
    this.visuals.hideCountdown();
    if (dx * dx + dz * dz <= arrival * arrival) {
      this.arriveAtQueueSlot(slot);
      return;
    }
    this.state = ShopperState.GOING_TO_QUEUE;
    this.goTo(slotId);
  }

  arriveAtQueueSlot(slot) {
    const assigned = this.navigation.nodes.get(this.checkoutQueue.slotId(this.queueIndex));
    const target = assigned ?? slot;
    if (target) {
      const dx = target.x - this.group.position.x;
      const dz = target.z - this.group.position.z;
      const arrival = Math.max(
        this.checkoutConfig.queueArrivalDistance ?? 0.45,
        this.config.waypointReachDistance
      );
      if (dx * dx + dz * dz > arrival * arrival) {
        this.hasReachedQueueSlot = false;
        this.state = ShopperState.GOING_TO_QUEUE;
        this.goTo(target.id);
        return;
      }
    }
    this.hasReachedQueueSlot = true;
    this.moving = false;
    if (this.queueIndex === 0) {
      this.waitForPlayer();
      return;
    }
    this.state = ShopperState.WAITING_IN_QUEUE;
    this.faceNode(target);
    this.refreshDebug();
  }

  setImpatient(active, timer) {
    const standing = this.state === ShopperState.WAITING_IN_QUEUE && this.hasReachedQueueSlot && !this.isThief;
    this.angerTimer = timer ?? 0;
    this.impatient = active === true && standing;
    this.syncCountdown();
    this.refreshDebug();
  }

  syncCountdown() {
    if (
      this.impatient
      && this.hasReachedQueueSlot
      && this.state === ShopperState.WAITING_IN_QUEUE
      && this.angerTimer > 0
      && !this.isThief
    ) {
      this.visuals.showCountdown(this.angerTimer);
      return;
    }
    this.visuals.hideCountdown();
  }

  waitForPlayer() {
    this.hasReachedQueueSlot = true;
    this.state = ShopperState.WAITING_FOR_CHECKOUT;
    this.faceNode(this.navigation.nodes.get('queue0'));
    this.moving = false;
    this.refreshDebug();
  }

  startCheckoutService() {
    if (this.state === ShopperState.DESPAWNED || this.isThief) {
      return;
    }
    this.state = ShopperState.CHECKING_OUT;
    this.faceNode(this.navigation.nodes.get('queue0'));
    this.moving = false;
    this.refreshDebug();
  }

  leaveBecauseShopClosed() {
    this.shopClosed = true;
    this.wait = 0;
    this.afterWait = null;
    this.pending = null;
    this.impatient = false;
    this.angerTimer = 0;
    this.visuals.hideCountdown();
    if (this.state === ShopperState.DESPAWNED) {
      return;
    }
    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    this.queueIndex = -1;
    this.hasReachedQueueSlot = false;
    if (
      this.state === ShopperState.EXITING
      || this.state === ShopperState.DEFEATED_FLEEING
      || (this.state === ShopperState.THIEF && this.isThiefExit(this.destinationId))
    ) {
      this.refreshDebug();
      return;
    }
    if (this.isThief || this.state === ShopperState.ANGRY || this.state === ShopperState.THIEF) {
      this.state = ShopperState.THIEF;
      this.leaveAsThief();
      this.refreshDebug();
      return;
    }
    this.state = ShopperState.EXITING;
    this.goTo('despawn', true);
    this.refreshDebug();
  }

  finishCheckout() {
    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    this.queueIndex = -1;
    this.state = ShopperState.EXITING;
    this.goTo('despawn', true);
  }

  recordEscape() {
    this.onEscaped?.();
  }

  despawn() {
    this.recordEscape();
    if (this.checkoutQueue.queue.includes(this)) {
      this.queueIndex = -1;
      this.checkoutQueue.complete(this);
    }
    this.state = ShopperState.DESPAWNED;
    this.moving = false;
    this.route.clear();
  }

  faceNode(node) {
    if (!node?.look) {
      return;
    }
    this.lookTarget = { x: node.look[0], z: node.look[1] };
  }

  faceLook(dt) {
    if (!this.lookTarget) {
      return;
    }
    const dx = this.lookTarget.x - this.group.position.x;
    const dz = this.lookTarget.z - this.group.position.z;
    if (dx * dx + dz * dz < 0.0001) {
      return;
    }
    const targetYaw = Math.atan2(dx, dz);
    const currentYaw = this.group.rotation.y;
    const deltaYaw = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
    const step = Math.max(
      -this.config.rotationSpeed * dt,
      Math.min(this.config.rotationSpeed * dt, deltaYaw)
    );
    this.group.rotation.y = currentYaw + step;
  }

  setupAnimations(model, clips) {
    const idleClip = findClip(clips, CLIP_ALIASES.idle);
    const walkClip = findClip(clips, CLIP_ALIASES.walk, (name) => name.includes('carry'));
    const carryClip = findClip(clips, CLIP_ALIASES.carry);
    const pickupClip = findClip(clips, CLIP_ALIASES.pickup);
    if (!idleClip && !walkClip) {
      return;
    }

    this.mixer = new THREE.AnimationMixer(model);
    if (idleClip) {
      this.actions.idle = this.mixer.clipAction(withoutRootMotion(idleClip));
    }
    if (walkClip) {
      this.actions.walk = this.mixer.clipAction(withoutRootMotion(walkClip));
    }
    if (carryClip) {
      this.actions.carry = this.mixer.clipAction(withoutRootMotion(carryClip));
    }
    if (pickupClip) {
      const action = this.mixer.clipAction(withoutRootMotion(pickupClip));
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.pickup = action;
    }

    const starting = this.actions.idle ?? this.actions.walk;
    if (starting) {
      starting.play();
      this.currentAction = this.actions.idle ? 'idle' : 'walk';
    }
  }

  playPickup() {
    if (!this.actions.pickup) {
      return;
    }
    this.actionLock = 'pickup';
    const action = this.actions.pickup;
    action.reset().fadeIn(0.1).play();
    if (this.currentAction && this.actions[this.currentAction]) {
      this.actions[this.currentAction].fadeOut(0.1);
    }
    this.currentAction = 'pickup';
  }

  updateAnimation(moving, dt) {
    if (!this.mixer) {
      return;
    }

    if (this.actionLock !== 'pickup') {
      let next = 'idle';
      if (moving) {
        next = this.inventory.count > 0 && this.actions.carry ? 'carry' : 'walk';
        if (!this.actions[next]) {
          next = this.actions.walk ? 'walk' : 'idle';
        }
      }
      if (this.actions[next] && next !== this.currentAction) {
        this.actions[next].reset().fadeIn(FADE_SECONDS).play();
        if (this.currentAction && this.actions[this.currentAction]) {
          this.actions[this.currentAction].fadeOut(FADE_SECONDS);
        }
        this.currentAction = next;
      }
    }

    this.mixer.update(dt);
  }

  refreshDebug() {
    if (!this.debug) {
      return;
    }
    const lines = [this.shortName];
    if (
      this.state === ShopperState.GOING_TO_QUEUE
      || this.state === ShopperState.WAITING_IN_QUEUE
      || this.state === ShopperState.WAITING_FOR_CHECKOUT
      || this.state === ShopperState.CHECKING_OUT
      || this.state === ShopperState.ANGRY
    ) {
      lines.push(`State: ${this.state}`);
      lines.push(`Queue Index: ${this.queueIndex}`);
      lines.push(`Reached Slot: ${this.hasReachedQueueSlot}`);
      lines.push(`Timer Active: ${this.impatient}`);
      lines.push(`Timer: ${this.angerTimer.toFixed(1)}`);
    } else if (this.isThief || this.state === ShopperState.DEFEATED_FLEEING || this.isThiefExit(this.destinationId) || this.destinationId === 'despawn') {
      lines.push(`State: ${this.state}`);
      lines.push('Target: Exit');
    } else {
      lines.push(this.state);
      lines.push(`Target: ${this.destinationId ?? '-'}`);
    }
    if (this.health) {
      lines.push(`HP: ${this.health.currentHP} / ${this.health.maxHP}`);
    }
    lines.push(`Items: ${this.inventory.count}`);
    const point = this.route.point;
    if (point && this.moving) {
      lines.push(`Node: ${point.id}`);
    }
    this.visuals.setDebugLines(lines);
  }

  dispose() {
    this.stopBurn(true);
    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.route.clear();
    this.inventory.dispose();
    this.visuals.dispose();
    this.group.removeFromParent();
    this.group.userData.shopper = null;
  }
}
