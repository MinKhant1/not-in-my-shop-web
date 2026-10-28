import { ToonMaterialFactory } from '../rendering/ToonMaterial.js';
import { CheckoutLanes } from './CheckoutLanes.js';
import { CheckoutQueueManager } from './CheckoutQueueManager.js';
import { customersPerDay } from './customerQuota.js';
import { ShopperAI } from './ShopperAI.js';
import { ShopperNavigation } from './ShopperNavigation.js';
import { fixtureById } from '../world/StoreSections.js';
import { ShopperState } from './ShopperState.js';

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export class ShopperManager {
  constructor(scene, loader, collision, config) {
    this.scene = scene;
    this.loader = loader;
    this.collision = collision;
    this.config = config.shoppers;
    this.checkoutConfig = config.checkout;
    this.weaponsConfig = config.weapons;
    this.debug = this.config.debugNavigation === true;
    this.navigation = new ShopperNavigation(config.checkout);
    this.checkoutQueue = new CheckoutQueueManager(this.navigation.queueSlotIds, config.checkout);
    this.lanes = new CheckoutLanes(this.checkoutQueue);
    this.openedRegisters = new Set();
    this.toonFactory = config.graphics?.toonShading
      ? new ToonMaterialFactory(config.graphics.toonSteps ?? 4)
      : null;
    this.shoppers = [];
    this.spawnTimer = this.config.firstSpawnDelay;
    this.spawning = false;
    this.spawningEnabled = true;
    this.spawnGeneration = 0;
    this.spawnedToday = 0;
    this.pendingSpawns = 0;
    this.customerSources = null;
    this.dayStats = null;
    this.audio = null;
    this.trashRules = null;
    this.shelfRules = config.shelfThief ?? {};
    this.store = null;
    this.shelfClaims = new Map();
    this.shelfPlanDay = null;
    this.shelfThiefMinute = null;
    this.shelfThiefDoneDay = 0;
    this.rackRules = config.rackGuide ?? {};
    this.rackGuideDoneDay = 0;
    this.rackGuidePlan = null;
    this.rackGuidePending = false;
    this.problemRules = config.problemCustomer ?? {};
    this.problemDoneDay = 0;
    this.problemPlan = null;
    this.problemPending = false;
    this.onProblemSpawned = null;
    this.playerPosition = null;
    this.playerSpeed = null;
    this.ownsFixture = null;
    this.onRackGuideSpawned = null;
    this.onShelfThiefSpawned = null;
    this.onShelfReturned = null;
    this.isInsideShop = null;
    this.onDropTrash = null;
    this.ready = false;
    if (this.debug) {
      window.__shoppers = this;
    }
  }

  syncSections(maxUnlocked) {
    const before = this.navigation.openSections;
    this.navigation.setUnlocked(maxUnlocked);
    if (this.navigation.openSections < before) {
      this.dropExpansionRegisters();
    }
  }

  // Register lines in a locked expansion are rebuilt the next time that counter opens.
  dropExpansionRegisters() {
    const ids = [...this.openedRegisters];
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      if (id === 'cash-register') {
        continue;
      }
      this.openedRegisters.delete(id);
      this.lanes.remove(id);
      this.checkoutDesk?.removeLane(id);
    }
  }

  addShelf(id) {
    this.navigation.enableShelf(id);
    this.dodgeFixtures([id]);
  }

  syncShelfPicks(ids) {
    this.navigation.syncShelfPicks(ids);
    this.dodgeFixtures(ids);
  }

  dodgeFixtures(ids) {
    const list = Array.isArray(ids) ? ids : [];
    for (let i = 0; i < list.length; i += 1) {
      const parts = this.store?.shelfPartIds?.(list[i]) ?? [list[i]];
      for (let p = 0; p < parts.length; p += 1) {
        this.dodgeCollision(parts[p]);
      }
    }
  }

  dodgeCollision(id) {
    if (!id || !this.collision) {
      return;
    }
    const moved = this.navigation.releaseBlocked(this.collision, id, 0.26);
    const pushed = new Set();
    for (let i = 0; i < this.shoppers.length; i += 1) {
      const shopper = this.shoppers[i];
      if (shopper.state === ShopperState.DESPAWNED) {
        continue;
      }
      const freed = this.navigation.escapePoint(
        shopper.group.position.x,
        shopper.group.position.z,
        this.collision,
        id,
        shopper.radius
      );
      if (!freed) {
        continue;
      }
      shopper.group.position.x = freed.x;
      shopper.group.position.z = freed.z;
      pushed.add(shopper);
    }
    this.repathAround(moved, pushed);
  }

  repathAround(moved, pushed) {
    if ((!moved || moved.size === 0) && (!pushed || pushed.size === 0)) {
      return;
    }
    for (let i = 0; i < this.shoppers.length; i += 1) {
      const shopper = this.shoppers[i];
      if (!this.shouldRepath(shopper, moved, pushed)) {
        continue;
      }
      shopper.goTo(shopper.destinationId, shopper.route.avoidQueue === true);
    }
  }

  shouldRepath(shopper, moved, pushed) {
    if (!shopper.destinationId || shopper.wait > 0) {
      return false;
    }
    const state = shopper.state;
    if (
      state === ShopperState.KNOCKED_OUT
      || state === ShopperState.DESPAWNED
      || state === ShopperState.WAITING_IN_QUEUE
      || state === ShopperState.WAITING_FOR_CHECKOUT
      || state === ShopperState.CHECKING_OUT
      || state === ShopperState.ANGRY
    ) {
      return false;
    }
    if (pushed?.has(shopper)) {
      return true;
    }
    if (moved?.has(shopper.destinationId)) {
      return true;
    }
    const path = shopper.route?.path ?? [];
    const start = shopper.route?.index ?? 0;
    for (let i = start; i < path.length; i += 1) {
      if (moved?.has(path[i].id)) {
        return true;
      }
    }
    return false;
  }

  async load() {
    const models = this.config.models;
    try {
      await Promise.all(models.map((url) => this.loader.preload(url)));
      this.ready = true;
      if (this.debug) {
        this.navigation.createDebug(this.scene);
      }
    } catch (error) {
      console.error('Failed to preload shopper models', error);
    }
  }

  update(dt) {
    if (!this.ready) {
      return;
    }

    if (this.spawningEnabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && !this.spawning) {
        const quota = this.customerQuota();
        if (this.spawnedToday + this.pendingSpawns >= quota) {
          this.spawnTimer = 0.5;
        } else if (this.spawn()) {
          this.spawnTimer = this.nextSpawnDelay();
        } else {
          this.spawnTimer = 0.4;
        }
      }
    }

    for (let i = 0; i < this.shoppers.length; i += 1) {
      this.shoppers[i].update(dt);
    }
    this.lanes.update(dt);

    for (let i = this.shoppers.length - 1; i >= 0; i -= 1) {
      if (this.shoppers[i].state === ShopperState.DESPAWNED) {
        this.releaseShelf(this.shoppers[i].shelfFixtureId, this.shoppers[i].shelfClaim);
        this.shoppers[i].dispose();
        this.shoppers.splice(i, 1);
      }
    }
  }

  setSpawningEnabled(enabled) {
    if (this.spawningEnabled === enabled) {
      return;
    }
    this.spawningEnabled = enabled;
    if (!enabled) {
      this.spawning = false;
      this.spawnGeneration += 1;
    }
  }

  setCustomerSources(sources) {
    this.customerSources = sources;
  }

  theftAllowed() {
    const day = this.customerSources?.day?.() ?? 1;
    if (day > 2) {
      return true;
    }
    const minutes = this.customerSources?.gameMinutes?.();
    return Number.isFinite(minutes) && minutes >= 14 * 60;
  }

  customerQuota() {
    const sources = this.customerSources;
    const day = sources?.day?.() ?? 1;
    const shelves = sources?.shelves?.() ?? 0;
    return customersPerDay(day, shelves);
  }

  dayRemaining() {
    const remaining = this.customerSources?.dayRemaining?.();
    if (Number.isFinite(remaining) && remaining > 0) {
      return remaining;
    }
    const duration = this.customerSources?.dayDuration?.();
    return Number.isFinite(duration) && duration > 0 ? duration : 120;
  }

  nextSpawnDelay() {
    const remainingCustomers = this.customerQuota() - this.spawnedToday - this.pendingSpawns;
    if (remainingCustomers <= 0) {
      return this.config.spawnInterval;
    }
    // Leave a few seconds so the last arrival is not walking in as the doors lock.
    const window = Math.max(0.75, this.dayRemaining() - 6);
    const gap = window / remainingCustomers;
    return Math.max(0.75, gap) * randomBetween(0.85, 1.15);
  }

  prepareNextDay() {
    this.spawning = false;
    this.spawnedToday = 0;
    this.pendingSpawns = 0;
    this.shelfClaims.clear();
    this.rackGuidePending = false;
    this.problemPending = false;
    this.spawnTimer = this.config.firstSpawnDelay;
    this.setSpawningEnabled(true);
  }

  // Opens a fresh customer wave. A previous day can leave the quota full, or a
  // model load stuck, which keeps the shop empty after New Shop or Continue.
  armShift() {
    this.clearLive();
  }

  setDayStats(stats) {
    this.dayStats = stats;
  }

  resolveOpenThieves() {
    for (let i = 0; i < this.shoppers.length; i += 1) {
      this.shoppers[i].recordEscape();
    }
  }

  openRegisters(stations, checkout) {
    if (!checkout) {
      return;
    }
    this.checkoutDesk = checkout;
    const live = new Set();
    for (let i = 0; i < stations.length; i += 1) {
      const station = stations[i];
      const register = station.register;
      if (!register?.visible || station.servesMainQueue) {
        continue;
      }
      const id = register.userData?.editorId || register.name;
      if (!id) {
        continue;
      }
      live.add(id);
      if (!this.openedRegisters.has(id)) {
        const built = this.navigation.addCheckoutLane(
          id,
          station.registerX ?? station.standX,
          station.registerZ ?? station.standZ
        );
        if (!built) {
          continue;
        }
        const slots = built.slotIds.length;
        const queue = new CheckoutQueueManager(built.slotIds, {
          ...this.checkoutConfig,
          maxComfortableQueue: Math.max(1, slots - 1)
        });
        this.lanes.add(id, queue);
        checkout.addLane({
          id,
          queue,
          x: built.zoneX,
          z: built.zoneZ,
          register
        });
        this.openedRegisters.add(id);
      }
      this.lanes.setOpen(id, true);
      checkout.setLaneOpen(id, true);
    }
    const known = this.lanes.lanes;
    for (let i = 0; i < known.length; i += 1) {
      const id = known[i].id;
      if (id === 'cash-register' || live.has(id)) {
        continue;
      }
      this.lanes.setOpen(id, false);
      checkout.setLaneOpen(id, false);
    }
  }

  dismissForClosing() {
    this.lanes.clear();
    for (let i = 0; i < this.shoppers.length; i += 1) {
      this.shoppers[i].leaveBecauseShopClosed();
    }
  }

  clearLive() {
    this.lanes.clear();
    this.spawning = false;
    this.spawnGeneration += 1;
    this.pendingSpawns = 0;
    for (let i = this.shoppers.length - 1; i >= 0; i -= 1) {
      this.shoppers[i].dispose();
    }
    this.shoppers = [];
    this.shelfClaims.clear();
    this.prepareNextDay();
  }

  rollCustomerRole() {
    const honest = { thiefChance: 0, shelf: null };
    if (this.theftAllowed() === false) {
      return { thiefChance: this.config.thiefChance, shelf: null };
    }
    if (Math.random() >= (this.config.thiefChance ?? 0)) {
      return honest;
    }
    const rules = this.shelfRules ?? {};
    const day = this.customerSources?.day?.() ?? 1;
    const startDay = rules.startDay ?? 2;
    const share = rules.share ?? 0.3;
    if (day < startDay || Math.random() >= share) {
      return { thiefChance: 1, shelf: null };
    }
    const shelf = this.claimShelf();
    if (!shelf) {
      return { thiefChance: 1, shelf: null };
    }
    return { thiefChance: 0, shelf };
  }

  rollShelfForCustomer() {
    const rules = this.shelfRules ?? {};
    const day = this.customerSources?.day?.() ?? 1;
    if (day < (rules.startDay ?? 2) || Math.random() >= (rules.share ?? 0.3)) {
      return null;
    }
    const claimed = this.claimShelf();
    if (!claimed) {
      return null;
    }
    return {
      id: claimed.target.id,
      nodeId: claimed.node.id,
      x: claimed.target.x,
      z: claimed.target.z,
      claim: claimed.claim,
      health: rules.health ?? 180,
      slow: rules.speedScale ?? 0.4
    };
  }

  claimShelf() {
    if (!this.store) {
      return null;
    }
    const targets = this.store.availableShelfTargets().filter((entry) => !this.shelfClaims.has(entry.id));
    if (targets.length === 0) {
      return null;
    }
    const target = targets[Math.floor(Math.random() * targets.length)];
    const node = this.navigation.nearest(target.x, target.z, true);
    if (!node) {
      return null;
    }
    this.shelfClaims.set(target.id, this.spawnGeneration);
    return { target, node, claim: this.spawnGeneration };
  }

  releaseShelf(id, claim) {
    if (!id || this.shelfClaims.get(id) !== claim) {
      return;
    }
    this.shelfClaims.delete(id);
  }

  rackIsOpen(fixture) {
    if (!fixture || !this.store?.isUnlocked?.(fixture.sectionId)) {
      return false;
    }
    if (this.store.isShelfStolen?.(fixture.id)) {
      return false;
    }
    if (this.ownsFixture?.(fixture.id) === true) {
      return true;
    }
    return this.store.spawnedFixtures?.has(fixture.id) === true;
  }

  openRackGuides() {
    const specs = this.rackRules?.racks ?? [];
    const open = [];
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      const fixture = fixtureById.get(spec.id);
      if (!this.rackIsOpen(fixture)) {
        continue;
      }
      this.navigation.enableShelf(fixture);
      const spot = this.navigation.shelfNode(fixture.id);
      if (!spot) {
        continue;
      }
      open.push({
        kind: spec.kind,
        icon: spec.icon,
        fixtureId: fixture.id,
        x: fixture.position[0],
        z: fixture.position[2],
        nodeId: spot.id
      });
    }
    return open;
  }

  claimRackGuide() {
    if (this.rackGuidePending) {
      return null;
    }
    const day = this.customerSources?.day?.() ?? 1;
    const rules = this.rackRules ?? {};
    if (day < (rules.startDay ?? 3) || this.rackGuideDoneDay === day) {
      return null;
    }
    const open = this.openRackGuides();
    if (open.length === 0) {
      return null;
    }
    const quota = Math.max(1, this.customerQuota());
    let rack = this.rackGuidePlan?.day === day
      ? open.find((entry) => entry.fixtureId === this.rackGuidePlan.fixtureId)
      : null;
    if (!this.rackGuidePlan || this.rackGuidePlan.day !== day || !Number.isInteger(this.rackGuidePlan.slot)) {
      rack = rack ?? open[Math.floor(Math.random() * open.length)];
      let slot = Math.floor(Math.random() * quota);
      const problemSlot = this.problemPlan?.day === day ? this.problemPlan.slot : null;
      if (problemSlot === slot && quota > 1) {
        slot = (slot + 1) % quota;
      }
      this.rackGuidePlan = {
        day,
        fixtureId: rack.fixtureId,
        slot
      };
    }
    if (!rack) {
      rack = open[Math.floor(Math.random() * open.length)];
      this.rackGuidePlan.fixtureId = rack.fixtureId;
    }
    const lastChance = this.spawnedToday + 1 >= quota;
    if (this.spawnedToday < this.rackGuidePlan.slot && !lastChance) {
      return null;
    }
    this.rackGuidePending = true;
    return {
      kind: rack.kind,
      icon: rack.icon,
      fixtureId: rack.fixtureId,
      x: rack.x,
      z: rack.z,
      nodeId: rack.nodeId,
      phase: 'approach',
      timer: rules.waitTime ?? 30,
      waitTime: rules.waitTime ?? 30,
      approach: rules.approachRadius ?? 1.55,
      rackRadius: rules.rackRadius ?? 1.85,
      followDistance: rules.followDistance ?? 1.15,
      waitNode: rules.waitNode ?? 'westLower'
    };
  }

  finishRackGuideSpawn(day) {
    this.rackGuidePending = false;
    this.rackGuideDoneDay = day;
    this.onRackGuideSpawned?.(day);
  }

  cancelRackGuideSpawn() {
    this.rackGuidePending = false;
  }

  claimProblem() {
    if (this.problemPending) {
      return false;
    }
    const day = this.customerSources?.day?.() ?? 1;
    const rules = this.problemRules ?? {};
    if (day < (rules.startDay ?? 5) || this.problemDoneDay === day) {
      return false;
    }
    const quota = Math.max(1, this.customerQuota());
    if (!this.problemPlan || this.problemPlan.day !== day || !Number.isInteger(this.problemPlan.slot)) {
      const chance = rules.chance ?? 0.5;
      if (Math.random() >= chance) {
        this.problemPlan = { day, slot: 0, skip: true };
        this.finishProblemSpawn(day);
        return false;
      }
      let slot = Math.floor(Math.random() * quota);
      const guideSlot = this.rackGuidePlan?.day === day ? this.rackGuidePlan.slot : null;
      if (guideSlot === slot && quota > 1) {
        slot = (slot + 1) % quota;
      }
      this.problemPlan = { day, slot, skip: false };
    }
    if (this.problemPlan.skip) {
      return false;
    }
    const lastChance = this.spawnedToday + 1 >= quota;
    if (this.spawnedToday < this.problemPlan.slot && !lastChance) {
      return false;
    }
    this.problemPending = true;
    return true;
  }

  finishProblemSpawn(day) {
    this.problemPending = false;
    this.problemDoneDay = day;
    this.onProblemSpawned?.(day);
  }

  cancelProblemSpawn() {
    this.problemPending = false;
  }

  spawn() {
    if (!this.spawningEnabled || this.shoppers.length + this.pendingSpawns >= this.config.maxActive) {
      return false;
    }
    if (this.spawnedToday + this.pendingSpawns >= this.customerQuota()) {
      return false;
    }

    const door = this.navigation.nodes.get('entranceOutside');
    for (let i = 0; i < this.shoppers.length; i += 1) {
      const position = this.shoppers[i].group.position;
      const dx = position.x - door.x;
      const dz = position.z - door.z;
      if (dx * dx + dz * dz < 0.64) {
        return false;
      }
    }

    const models = this.config.models;
    const inUse = new Set();
    for (let i = 0; i < this.shoppers.length; i += 1) {
      inUse.add(this.shoppers[i].modelUrl);
    }
    const unused = models.filter((url) => !inUse.has(url));
    const pool = unused.length ? unused : models;
    const modelUrl = pool[Math.floor(Math.random() * pool.length)];
    const problem = this.claimProblem();
    const guide = problem ? null : this.claimRackGuide();
    const role = (guide || problem) ? { thiefChance: 0, shelf: null } : this.rollCustomerRole();
    const generation = this.spawnGeneration;
    this.spawning = true;
    this.pendingSpawns += 1;
    let pending;
    try {
      pending = this.loader.load(modelUrl);
    } catch (error) {
      this.spawning = false;
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      this.releaseShelf(role.shelf?.target.id, role.shelf?.claim);
      if (guide) {
        this.cancelRackGuideSpawn();
      }
      if (problem) {
        this.cancelProblemSpawn();
      }
      console.error('Failed to spawn shopper', error);
      return false;
    }
    pending.then((asset) => {
      if (generation === this.spawnGeneration) {
        this.spawning = false;
      }
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      if (!this.spawningEnabled || generation !== this.spawnGeneration || this.shoppers.length >= this.config.maxActive) {
        this.releaseShelf(role.shelf?.target.id, role.shelf?.claim);
        if (guide) {
          this.cancelRackGuideSpawn();
        }
        if (problem) {
          this.cancelProblemSpawn();
        }
        return;
      }
      const day = this.customerSources?.day?.() ?? 1;
      const trashRules = this.trashRules ?? {};
      const trashStart = trashRules.startDay ?? 3;
      const chance = day >= trashStart ? (trashRules.chance ?? 0.1) : 0;
      const shelf = role.shelf;
      const shelfRules = this.shelfRules ?? {};
      const config = role.thiefChance === this.config.thiefChance
        ? this.config
        : { ...this.config, thiefChance: role.thiefChance };
      let shelfClaim = shelf?.claim ?? null;
      const shopper = new ShopperAI({
        asset,
        modelUrl,
        config,
        navigation: this.navigation,
        collision: this.collision,
        checkoutQueue: this.checkoutQueue,
        checkoutLanes: this.lanes,
        checkoutConfig: this.checkoutConfig,
        weaponsConfig: this.weaponsConfig,
        toonFactory: this.toonFactory,
        theftAllowed: () => (problem || shelf ? false : this.theftAllowed()),
        dropsTrash: !problem && !shelf && chance > 0 && Math.random() < chance,
        isInsideShop: (x, z) => this.isInsideShop?.(x, z) === true,
        onDropTrash: (x, z) => this.onDropTrash?.(x, z),
        debug: this.debug || this.checkoutConfig?.debugCheckout === true || this.weaponsConfig?.debugWeapons === true,
        shelfThief: Boolean(shelf),
        shelfFixtureId: shelf?.target.id,
        shelfNodeId: shelf?.node.id,
        shelfX: shelf?.target.x,
        shelfZ: shelf?.target.z,
        shelfHealth: shelfRules.health ?? 180,
        shelfSlow: shelfRules.speedScale ?? 0.4,
        onTakeShelf: (id) => {
          this.releaseShelf(id, shelfClaim);
          return this.store?.takeShelf(id) ?? null;
        },
        onReturnShelf: (id) => {
          this.store?.returnShelf(id);
          if (this.onShelfReturned) {
            this.onShelfReturned(id);
          } else {
            this.store?.setShelfCollision(id, true);
          }
        },
        onLoseShelf: (id) => this.store?.loseShelf(id),
        rackGuide: guide,
        playerPosition: () => this.playerPosition?.() ?? null,
        playerSpeed: () => this.playerSpeed?.() ?? null,
        onRackTip: () => {
          const tip = this.rackRules?.tip ?? 50;
          this.dayStats?.money.addMoney(tip);
          this.audio?.coin();
        },
        restoreThiefChance: this.config.thiefChance,
        problem: problem
          ? {
            icon: this.problemRules?.icon || '/assets/ui/hud/problem.webp',
            health: this.problemRules?.health ?? 80,
            speedScale: this.problemRules?.speedScale ?? 2
          }
          : null
      });
      shopper.shelfClaim = shelfClaim;
      shopper.assignShelfClaim = (claim) => {
        shelfClaim = claim;
        shopper.shelfClaim = claim;
      };
      shopper.rollShelfTheft = () => (shopper.thiefChance >= 1 ? null : this.rollShelfForCustomer());
      const z = door.z + randomBetween(-0.22, 0.22);
      shopper.spawn(door.x, z);
      shopper.onCaught = () => {
        if (shopper.outcomeCounted) {
          return;
        }
        shopper.outcomeCounted = true;
        if (shopper.problem) {
          const reward = this.problemRules?.reward ?? 50;
          this.dayStats?.money.addMoney(reward);
          this.audio?.coin();
          return;
        }
        this.dayStats?.recordCaught();
        if (shopper.shelfThief) {
          const reward = this.shelfRules?.reward ?? 30;
          this.dayStats?.money.addMoney(reward);
        }
      };
      shopper.onDrops = (drops) => this.onThiefDrops?.(drops);
      shopper.onScream = () => this.audio?.scream();
      shopper.onEscaped = () => {
        if (shopper.outcomeCounted || !shopper.isThief || shopper.isDefeated) {
          return;
        }
        shopper.outcomeCounted = true;
        this.dayStats?.recordEscape(shopper.inventory.count);
      };
      this.scene.add(shopper.group);
      this.shoppers.push(shopper);
      if (guide) {
        this.finishRackGuideSpawn(day);
      }
      if (problem) {
        this.finishProblemSpawn(day);
      }
      this.spawnedToday += 1;
      this.dayStats?.recordCustomer();
    }).catch((error) => {
      if (generation === this.spawnGeneration) {
        this.spawning = false;
      }
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      this.releaseShelf(role.shelf?.target.id, role.shelf?.claim);
      if (guide) {
        this.cancelRackGuideSpawn();
      }
      if (problem) {
        this.cancelProblemSpawn();
      }
      console.error('Failed to spawn shopper', error);
    });
    return true;
  }

  getShoppers() {
    return this.shoppers;
  }

  // Active thieves only. Customers are left alone. Escapes are not recorded here.
  fleeThieves() {
    let fled = 0;
    for (let i = 0; i < this.shoppers.length; i += 1) {
      if (this.shoppers[i].fleeFromIntercom()) {
        fled += 1;
      }
    }
    return fled;
  }

  describe() {
    let thieves = 0;
    for (let i = 0; i < this.shoppers.length; i += 1) {
      if (this.shoppers[i].isThief) {
        thieves += 1;
      }
    }
    return `shoppers ${this.shoppers.length} thieves ${thieves} today ${this.spawnedToday}/${this.customerQuota()}`;
  }
}
