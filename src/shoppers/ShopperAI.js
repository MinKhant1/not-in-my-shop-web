import * as THREE from 'three';
import { ShopperState } from './ShopperState.js';
import { ShopperInventory } from './ShopperInventory.js';
import { ShopperRoute } from './ShopperNavigation.js';
import { ShopperVisuals, applyToonOutfit } from './ShopperVisuals.js';

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
  constructor({ asset, modelUrl, config, navigation, collision, checkoutQueue, toonFactory, debug }) {
    this.id = nextShopperId;
    nextShopperId += 1;
    this.modelUrl = modelUrl;
    this.config = config;
    this.navigation = navigation;
    this.collision = collision;
    this.checkoutQueue = checkoutQueue;
    this.debug = debug;
    this.thiefChance = config.thiefChance;
    this.radius = config.radius;
    this.groceryTarget = randomInt(config.minItems, config.maxItems);

    this.state = ShopperState.ENTERING;
    this.isThief = false;
    this.destinationId = null;
    this.pending = null;
    this.wait = 0;
    this.afterWait = null;
    this.moving = false;
    this.lastPickId = null;
    this.queueIndex = -1;
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
      return;
    }

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

    if (this.state === ShopperState.WAITING_IN_QUEUE) {
      this.moving = false;
      this.faceLook(dt);
      this.updateAnimation(false, dt);
      this.refreshDebug();
      return;
    }

    const result = this.route.update(dt, this.group, this.collision, this.radius);
    this.moving = result === 'moving';
    this.updateAnimation(this.moving, dt);
    if (result === 'arrived') {
      this.onArrived();
    }
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
      if (this.queueIndex === 0) {
        this.beginCheckout();
      } else {
        this.state = ShopperState.WAITING_IN_QUEUE;
        this.faceNode(destination);
        this.moving = false;
        this.refreshDebug();
      }
      return;
    }

    if (this.state === ShopperState.THIEF || this.state === ShopperState.EXITING) {
      this.despawn();
    }
  }

  collectAndContinue() {
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
    if (this.isThief) {
      this.leaveAsThief();
      return;
    }
    if (Math.random() < this.thiefChance) {
      this.becomeThief();
      return;
    }
    const index = this.checkoutQueue.join(this);
    if (index < 0) {
      this.pause(0.4, () => this.decide());
    }
  }

  becomeThief() {
    this.isThief = true;
    this.state = ShopperState.THIEF;
    this.visuals.revealThief();
    this.leaveAsThief();
  }

  leaveAsThief() {
    this.state = ShopperState.THIEF;
    this.goTo('despawn', true);
  }

  setQueueIndex(index) {
    this.queueIndex = index;
    if (
      this.state === ShopperState.CHECKING_OUT
      || this.state === ShopperState.EXITING
      || this.state === ShopperState.DESPAWNED
      || this.state === ShopperState.THIEF
    ) {
      return;
    }
    const slotId = this.checkoutQueue.slotId(index);
    if (!slotId) {
      return;
    }
    const slot = this.navigation.nodes.get(slotId);
    const dx = slot.x - this.group.position.x;
    const dz = slot.z - this.group.position.z;
    const reach = this.config.waypointReachDistance;
    if (index === 0 && dx * dx + dz * dz <= reach * reach) {
      this.beginCheckout();
      return;
    }
    this.state = ShopperState.GOING_TO_QUEUE;
    this.goTo(slotId);
  }

  beginCheckout() {
    this.state = ShopperState.CHECKING_OUT;
    this.faceNode(this.navigation.nodes.get('queue0'));
    this.pause(this.config.checkoutDuration, () => this.finishCheckout());
    this.refreshDebug();
  }

  finishCheckout() {
    this.checkoutQueue.complete(this);
    this.queueIndex = -1;
    this.state = ShopperState.EXITING;
    this.goTo('despawn', true);
  }

  despawn() {
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
    const lines = [this.shortName, this.state];
    if (
      this.state === ShopperState.GOING_TO_QUEUE
      || this.state === ShopperState.WAITING_IN_QUEUE
      || this.state === ShopperState.CHECKING_OUT
    ) {
      lines.push(`Queue: ${this.queueIndex}`);
    } else if (this.isThief || this.destinationId === 'despawn') {
      lines.push('Target: Exit');
    } else {
      lines.push(`Target: ${this.destinationId ?? '-'}`);
    }
    lines.push(`Items: ${this.inventory.count}`);
    const point = this.route.point;
    if (point && this.moving) {
      lines.push(`Node: ${point.id}`);
    }
    this.visuals.setDebugLines(lines);
  }

  dispose() {
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
