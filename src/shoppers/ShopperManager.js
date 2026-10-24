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
    this.ready = false;
    if (this.debug) {
      window.__shoppers = this;
    }
  }

  syncSections(maxUnlocked) {
    this.navigation.syncUnlocked(maxUnlocked);
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
    const modelUrl = models[Math.floor(Math.random() * models.length)];
    const generation = this.spawnGeneration;
    this.spawning = true;
    this.pendingSpawns += 1;
    this.loader.load(modelUrl).then((asset) => {
      this.spawning = false;
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      if (!this.spawningEnabled || generation !== this.spawnGeneration || this.shoppers.length >= this.config.maxActive) {
        return;
      }
      const shopper = new ShopperAI({
        asset,
        modelUrl,
        config: this.config,
        navigation: this.navigation,
        collision: this.collision,
        checkoutQueue: this.checkoutQueue,
        checkoutLanes: this.lanes,
        checkoutConfig: this.checkoutConfig,
        weaponsConfig: this.weaponsConfig,
        toonFactory: this.toonFactory,
        debug: this.debug || this.checkoutConfig?.debugCheckout === true || this.weaponsConfig?.debugWeapons === true
      });
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
