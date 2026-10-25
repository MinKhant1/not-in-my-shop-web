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
  pickup: ['pickup', 'pick_up', 'pick'],
  run: ['run'],
  death: ['death', 'defeat']
};

const KNOCKOUT_FALL_ANGLE = 1.4;
const KNOCKOUT_FALL_SCALE = 1.3;
const KNOCKOUT_GET_UP_SCALE = 1.45;

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

// Some death clips lower the hips through the road, so the thief vanishes on impact.
function withoutDropping(clip) {
  const copy = withoutRootMotion(clip);
  copy.tracks = copy.tracks.filter((track) => !track.name.toLowerCase().endsWith('hips.position'));
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
  constructor({ asset, modelUrl, config, navigation, collision, checkoutQueue, checkoutLanes, checkoutConfig, weaponsConfig, toonFactory, debug, theftAllowed, dropsTrash, isInsideShop, onDropTrash, shelfThief, shelfFixtureId, shelfNodeId, shelfX, shelfZ, shelfHealth, shelfSlow, onTakeShelf, onReturnShelf, onLoseShelf }) {
    this.id = nextShopperId;
    nextShopperId += 1;
    this.modelUrl = modelUrl;
    this.config = config;
    this.navigation = navigation;
    this.collision = collision;
    this.checkoutQueue = checkoutQueue;
    this.checkoutLanes = checkoutLanes ?? null;
    this.checkoutConfig = checkoutConfig;
    this.weaponsConfig = weaponsConfig;
    this.debug = debug;
    this.thiefChance = config.thiefChance;
    this.theftAllowed = theftAllowed ?? null;
    this.radius = config.radius;
    this.groceryTarget = randomInt(config.minItems, config.maxItems);

    this.state = ShopperState.ENTERING;
    this.isThief = false;
    // Kept by SecurityCameraSystem while a stealing thief is spotted. Cleared when they are caught or leave.
    this.trackedByCCTV = false;
    this.isDefeated = false;
    this.screamPlayed = false;
    this.knockout = null;
    this.fleeSpeed = 0;
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
    this.dropsTrash = dropsTrash === true;
    this.shelfThief = shelfThief === true;
    this.shelfFixtureId = shelfFixtureId ?? null;
    this.shelfNodeId = shelfNodeId ?? null;
    this.shelfX = shelfX ?? 0;
    this.shelfZ = shelfZ ?? 0;
    this.shelfHealth = shelfHealth ?? 150;
    this.shelfSlow = shelfSlow ?? 0.4;
    this.onTakeShelf = onTakeShelf ?? null;
    this.onReturnShelf = onReturnShelf ?? null;
    this.onLoseShelf = onLoseShelf ?? null;
    this.carryingShelf = false;
    this.shelfSettled = false;
    this.carryRig = null;
    this.combatMaxHP = 0;
    this.trashDropped = false;
    this.wasInside = false;
    this.lastInsideX = 0;
    this.lastInsideZ = 0;
    this.isInsideShop = isInsideShop ?? null;
    this.onDropTrash = onDropTrash ?? null;

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
    model.name = modelUrl.split('/').pop().replace(/\.(gltf|glb)$/i, '');
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
    this.actions = { idle: null, walk: null, carry: null, pickup: null, run: null, death: null };
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
    this.trackTrash();
    if (this.state === ShopperState.KNOCKED_OUT) {
      this.updateKnockout(dt);
      if (this.state === ShopperState.KNOCKED_OUT) {
        this.visuals.tick(dt);
        this.refreshDebug();
        return;
      }
    }
    if (this.updateBurn(dt)) {
      if (this.state === ShopperState.KNOCKED_OUT) {
        this.visuals.tick(dt);
        this.refreshDebug();
      }
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
    this.trackTrash();
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
      if (this.shelfThief && this.shelfNodeId) {
        this.pending = 'shelf';
        this.goTo(this.shelfNodeId);
        return;
      }
      this.goPick();
      return;
    }

    if (this.shelfThief && this.pending === 'shelf' && !this.carryingShelf) {
      this.pending = null;
      this.lookTarget = { x: this.shelfX, z: this.shelfZ };
      this.playPickup();
      this.pause(this.config.pickupWait, () => this.grabShelf());
      this.refreshDebug();
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
    if (this.isDefeated || this.state === ShopperState.DEFEATED_FLEEING) {
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
    if (this.isDefeated || this.state === ShopperState.DEFEATED_FLEEING) {
      return;
    }
    if (this.shopClosed) {
      this.leaveBecauseShopClosed();
      return;
    }
    if (this.isThief) {
      this.leaveAsThief();
      return;
    }
    if (this.theftAllowed?.() !== false && Math.random() < this.thiefChance) {
      this.becomeThief();
      return;
    }
    this.payment = randomInt(
      this.checkoutConfig.minCustomerPayment,
      this.checkoutConfig.maxCustomerPayment
    );
    const index = this.checkoutLanes ? this.checkoutLanes.join(this) : this.checkoutQueue.join(this);
    if (index < 0) {
      this.pause(0.4, () => this.decide());
    }
  }

  becomeAngryThief() {
    if (this.shopClosed) {
      return;
    }
    if (this.theftAllowed?.() === false) {
      this.setImpatient(false, 0);
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
    const maxHP = this.combatMaxHP > 0 ? this.combatMaxHP : (this.weaponsConfig?.thiefMaxHP ?? 100);
    this.health = new ThiefHealth(maxHP);
    this.visuals.showHealth(1);
  }

  isAttackable() {
    return this.isThief
      && !this.isDefeated
      && this.state !== ShopperState.DESPAWNED
      && this.state !== ShopperState.KNOCKED_OUT
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
    this.settleShelf(false);
    this.isDefeated = true;
    this.stopBurn(true);
    this.onCaught?.();
    if (this.health) {
      this.health.isDefeated = true;
      this.health.currentHP = 0;
    }
    this.visuals.hideThiefIcon();
    this.visuals.showHealth(0);
    this.visuals.hideCountdown();
    this.impatient = false;
    this.angerTimer = 0;

    const drops = this.releaseDrops();

    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    this.queueIndex = -1;
    this.hasReachedQueueSlot = false;
    this.route.clear();
    this.startKnockout(runSpeed);
    this.refreshDebug();
    return drops;
  }

  // Death plays forward into the fall, holds on the ground, then reverses so they stand back up.
  startKnockout(runSpeed) {
    this.fleeSpeed = runSpeed;
    this.state = ShopperState.KNOCKED_OUT;
    this.moving = false;
    this.actionLock = 'knockout';
    this.lookTarget = null;
    const action = this.actions.death;
    const duration = action ? action.getClip().duration : 0;
    if (action && duration > 0.05) {
      this.knockout = {
        phase: 'fall',
        time: 0,
        phaseDuration: duration / KNOCKOUT_FALL_SCALE,
        procedural: false
      };
      this.playDeath(KNOCKOUT_FALL_SCALE);
    } else {
      this.knockout = {
        phase: 'fall',
        time: 0,
        phaseDuration: 0.42,
        procedural: true
      };
    }
    this.visuals.showKnockedOut();
  }

  playDeath(timeScale) {
    const action = this.actions.death;
    const fade = 0.1;
    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    action.fadeIn(fade).play();
    if (this.currentAction && this.currentAction !== 'death' && this.actions[this.currentAction]) {
      this.actions[this.currentAction].fadeOut(fade);
    }
    this.currentAction = 'death';
  }

  updateKnockout(dt) {
    const ko = this.knockout;
    if (!ko) {
      this.beginDefeatedFlee();
      return;
    }
    ko.time += dt;
    if (ko.procedural) {
      this.applyKnockoutTilt(ko);
    } else if (this.mixer) {
      this.mixer.update(dt);
    }
    if (ko.time < ko.phaseDuration) {
      return;
    }
    if (ko.phase === 'fall') {
      this.holdKnockout();
      return;
    }
    if (ko.phase === 'down') {
      this.riseFromKnockout();
      return;
    }
    this.beginDefeatedFlee();
  }

  applyKnockoutTilt(ko) {
    const t = ko.phaseDuration <= 0 ? 1 : Math.min(1, ko.time / ko.phaseDuration);
    let angle = KNOCKOUT_FALL_ANGLE;
    if (ko.phase === 'fall') {
      angle *= 1 - (1 - t) * (1 - t);
    } else if (ko.phase === 'rise') {
      const smooth = t * t * (3 - 2 * t);
      angle *= 1 - smooth;
    }
    this.visual.rotation.x = angle;
  }

  holdKnockout() {
    const action = this.actions.death;
    if (action && !this.knockout.procedural) {
      action.paused = true;
      action.time = action.getClip().duration;
    }
    this.knockout.phase = 'down';
    this.knockout.time = 0;
    this.knockout.phaseDuration = Math.max(0.35, this.weaponsConfig?.knockoutLieTime ?? 0.8);
  }

  riseFromKnockout() {
    const ko = this.knockout;
    ko.phase = 'rise';
    ko.time = 0;
    this.visuals.hideKnockedOut();
    if (ko.procedural || !this.actions.death) {
      ko.procedural = true;
      ko.phaseDuration = 0.48;
      return;
    }
    const action = this.actions.death;
    const duration = action.getClip().duration;
    ko.phaseDuration = duration / KNOCKOUT_GET_UP_SCALE;
    action.enabled = true;
    action.paused = false;
    action.timeScale = -KNOCKOUT_GET_UP_SCALE;
    action.time = duration;
    action.setEffectiveWeight(1);
    action.play();
    this.currentAction = 'death';
  }

  // Intercom: health is exactly 0 and they run for the exit. Skips the knockout so they are not removed early.
  fleeFromIntercom() {
    if (!this.isThief || this.state === ShopperState.DESPAWNED) {
      return false;
    }
    if (this.state === ShopperState.DEFEATED_FLEEING) {
      if (this.health) {
        this.health.currentHP = 0;
        this.health.isDefeated = true;
      }
      return false;
    }
    this.ensureCombatant();
    this.health.currentHP = 0;
    this.health.isDefeated = true;
    this.isDefeated = true;
    this.stopBurn(true);
    this.wait = 0;
    this.afterWait = null;
    this.pending = null;
    this.impatient = false;
    this.angerTimer = 0;
    this.angerReact = 0;
    this.actionLock = null;
    this.knockout = null;
    this.lookTarget = null;
    this.visual.rotation.x = 0;
    if (this.actions.death) {
      this.actions.death.stop();
      this.actions.death.paused = true;
    }
    if (this.currentAction === 'death') {
      this.currentAction = null;
    }
    this.visuals.hideThiefIcon();
    this.visuals.showHealth(0);
    this.visuals.hideCountdown();
    this.visuals.hideKnockedOut();
    if (this.checkoutQueue.queue.includes(this)) {
      this.checkoutQueue.complete(this);
    }
    this.queueIndex = -1;
    this.hasReachedQueueSlot = false;
    this.route.clear();
    this.settleShelf(false);
    const drops = this.releaseDrops();
    if (drops.length > 0) {
      this.onDrops?.(drops);
    }
    this.fleeSpeed = this.weaponsConfig?.defeatedThiefRunSpeed ?? 3.6;
    this.beginDefeatedFlee();
    this.refreshDebug();
    return true;
  }

  releaseDrops() {
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
    return drops;
  }

  beginDefeatedFlee() {
    if (!this.screamPlayed) {
      this.screamPlayed = true;
      this.onScream?.();
    }
    this.visual.rotation.x = 0;
    this.actionLock = null;
    this.knockout = null;
    if (this.actions.death) {
      this.actions.death.paused = true;
    }
    this.visuals.hideKnockedOut();
    this.visuals.hideHealth();
    this.state = ShopperState.DEFEATED_FLEEING;
    this.route.config.moveSpeed = this.fleeSpeed || this.weaponsConfig?.defeatedThiefRunSpeed || 3.6;
    if (this.actions.run) {
      this.actions.run.timeScale = 1.25;
    }
    this.goTo(this.thiefExitId(), true);
  }

  leaveAsThief() {
    this.state = ShopperState.THIEF;
    this.goTo(this.thiefExitId(), true);
  }

  thiefExitId() {
    return this.group.position.z < -3.6 ? 'thiefVanishNorth' : 'thiefVanishSouth';
  }

  isThiefExit(id) {
    return id === 'thiefVanishNorth' || id === 'thiefVanishSouth';
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
      || this.state === ShopperState.KNOCKED_OUT
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
      if (dx * dx + dz * dz > 1.15 * 1.15) {
        this.hasReachedQueueSlot = false;
        this.state = ShopperState.GOING_TO_QUEUE;
        this.goTo(target.id);
        return;
      }
      if (dx * dx + dz * dz > arrival * arrival) {
        this.group.position.x = target.x;
        this.group.position.z = target.z;
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
    this.faceQueueFront();
    this.moving = false;
    this.refreshDebug();
  }

  startCheckoutService() {
    if (this.state === ShopperState.DESPAWNED || this.isThief) {
      return;
    }
    this.state = ShopperState.CHECKING_OUT;
    this.faceQueueFront();
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
      || this.state === ShopperState.KNOCKED_OUT
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

  trackTrash() {
    if (!this.dropsTrash || this.trashDropped) {
      return;
    }
    const x = this.group.position.x;
    const z = this.group.position.z;
    if (this.isInsideShop?.(x, z) === true) {
      this.wasInside = true;
      this.lastInsideX = x;
      this.lastInsideZ = z;
      return;
    }
    if (this.wasInside) {
      this.releaseTrash();
    }
  }

  releaseTrash() {
    if (!this.dropsTrash || this.trashDropped || !this.wasInside) {
      return;
    }
    this.trashDropped = true;
    this.onDropTrash?.(this.lastInsideX, this.lastInsideZ);
  }

  grabShelf() {
    if (this.shelfSettled || this.carryingShelf || this.state === ShopperState.DESPAWNED || this.shopClosed || this.isDefeated) {
      return;
    }
    const sources = this.onTakeShelf?.(this.shelfFixtureId);
    if (!sources || sources.length === 0) {
      this.state = ShopperState.EXITING;
      this.goTo('despawn', true);
      return;
    }
    this.attachShelf(sources);
    this.carryingShelf = true;
    this.isThief = true;
    this.visuals.revealThief();
    this.combatMaxHP = this.shelfHealth;
    this.ensureCombatant();
    this.route.config.moveSpeed *= this.shelfSlow;
    this.state = ShopperState.THIEF;
    this.goTo(this.thiefExitId(), true);
    this.refreshDebug();
  }

  attachShelf(sources) {
    this.clearCarryVisual();
    const rig = new THREE.Group();
    rig.name = 'carried-shelf';
    rig.userData.editorIgnore = true;
    const clones = [];
    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      source.updateWorldMatrix(true, true);
      const clone = source.clone(true);
      clone.matrix.copy(source.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      clone.matrixAutoUpdate = true;
      clone.visible = true;
      clone.traverse((child) => {
        child.visible = true;
        child.userData.editorIgnore = true;
        child.castShadow = false;
        child.receiveShadow = false;
      });
      rig.add(clone);
      clones.push(clone);
    }
    rig.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    for (let i = 0; i < clones.length; i += 1) {
      clones[i].position.sub(center);
    }
    rig.scale.set(1, 1, 1);
    rig.rotation.y = Math.PI / 2;
    rig.position.set(0, 0.2 + size.y * 0.5, 0.45);
    this.group.add(rig);
    this.carryRig = rig;
  }

  clearCarryVisual() {
    if (!this.carryRig) {
      return;
    }
    this.carryRig.removeFromParent();
    this.carryRig = null;
  }

  // Escaped thieves lose the shelf. Every other ending puts it back.
  settleShelf(escaped) {
    if (!this.carryingShelf || this.shelfSettled) {
      return;
    }
    this.shelfSettled = true;
    this.carryingShelf = false;
    this.clearCarryVisual();
    if (escaped) {
      this.onLoseShelf?.(this.shelfFixtureId);
    } else {
      this.onReturnShelf?.(this.shelfFixtureId);
    }
  }

  despawn() {
    const escaped = this.carryingShelf && !this.isDefeated && this.isThiefExit(this.destinationId);
    this.settleShelf(escaped);
    this.releaseTrash();
    this.recordEscape();
    if (this.checkoutQueue.queue.includes(this)) {
      this.queueIndex = -1;
      this.checkoutQueue.complete(this);
    }
    this.state = ShopperState.DESPAWNED;
    this.moving = false;
    this.route.clear();
  }

  faceQueueFront() {
    const id = this.checkoutQueue?.slotId(0);
    const slot = id ? this.navigation.nodes.get(id) : null;
    if (slot) {
      this.faceNode(slot);
    }
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
    const runClip = findClip(clips, CLIP_ALIASES.run, (name) => name.includes('carry'));
    const deathClip = findClip(clips, CLIP_ALIASES.death);
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
    if (runClip) {
      const action = this.mixer.clipAction(withoutRootMotion(runClip));
      action.timeScale = 1.25;
      this.actions.run = action;
    }
    if (deathClip) {
      const action = this.mixer.clipAction(withoutDropping(deathClip));
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.death = action;
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
        if (this.carryingShelf && this.state === ShopperState.THIEF) {
          next = this.actions.carry ? 'carry' : 'walk';
        } else if (this.state === ShopperState.DEFEATED_FLEEING && this.actions.run) {
          next = 'run';
        } else {
          next = (this.inventory.count > 0 || this.carryingShelf) && this.actions.carry ? 'carry' : 'walk';
        }
        if (!this.actions[next]) {
          next = this.actions.walk ? 'walk' : 'idle';
        }
      }
      if (this.actions[next] && next !== this.currentAction) {
        const action = this.actions[next].reset().fadeIn(FADE_SECONDS);
        if (next === 'run') {
          action.timeScale = 1.25;
        }
        action.play();
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
    this.settleShelf(false);
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
