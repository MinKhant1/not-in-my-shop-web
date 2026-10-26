import { ToonMaterialFactory } from '../rendering/ToonMaterial.js';
import { CheckoutLanes } from './CheckoutLanes.js';
import { CheckoutQueueManager } from './CheckoutQueueManager.js';
import { customersPerDay } from './customerQuota.js';
import { ShopperAI } from './ShopperAI.js';
import { ShopperNavigation } from './ShopperNavigation.js';
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
    this.navigation.syncUnlocked(maxUnlocked);
  }

  syncShelfPicks(ids) {
    this.navigation.syncShelfPicks(ids);
  }

  addShelf(id) {
    this.navigation.enableShelf(id);
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
    this.spawnedToday = 0;
    this.pendingSpawns = 0;
    this.shelfClaims.clear();
    this.spawnTimer = this.config.firstSpawnDelay;
    this.setSpawningEnabled(true);
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
    const role = this.rollCustomerRole();
    const generation = this.spawnGeneration;
    this.spawning = true;
    this.pendingSpawns += 1;
    this.loader.load(modelUrl).then((asset) => {
      this.spawning = false;
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      if (!this.spawningEnabled || generation !== this.spawnGeneration || this.shoppers.length >= this.config.maxActive) {
        this.releaseShelf(role.shelf?.target.id, role.shelf?.claim);
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
        theftAllowed: () => (shelf ? false : this.theftAllowed()),
        dropsTrash: !shelf && chance > 0 && Math.random() < chance,
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
        onLoseShelf: (id) => this.store?.loseShelf(id)
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
        this.dayStats?.recordCaught();
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
      this.spawnedToday += 1;
      this.dayStats?.recordCustomer();
    }).catch((error) => {
      this.spawning = false;
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      this.releaseShelf(role.shelf?.target.id, role.shelf?.claim);
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
