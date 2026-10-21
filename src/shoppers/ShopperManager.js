import { ToonMaterialFactory } from '../rendering/ToonMaterial.js';
import { CheckoutQueueManager } from './CheckoutQueueManager.js';
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
    this.toonFactory = config.graphics?.toonShading
      ? new ToonMaterialFactory(config.graphics.toonSteps ?? 4)
      : null;
    this.shoppers = [];
    this.spawnTimer = this.config.firstSpawnDelay;
    this.spawning = false;
    this.spawningEnabled = true;
    this.spawnGeneration = 0;
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
        this.spawnTimer = this.config.spawnInterval * randomBetween(0.85, 1.2);
        this.spawn();
      }
    }

    for (let i = 0; i < this.shoppers.length; i += 1) {
      this.shoppers[i].update(dt);
    }
    this.checkoutQueue.update(dt);

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

  prepareNextDay() {
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

  dismissForClosing() {
    this.checkoutQueue.clear();
    for (let i = 0; i < this.shoppers.length; i += 1) {
      this.shoppers[i].leaveBecauseShopClosed();
    }
  }

  spawn() {
    if (!this.spawningEnabled || this.shoppers.length >= this.config.maxActive) {
      return;
    }

    const door = this.navigation.nodes.get('entranceOutside');
    for (let i = 0; i < this.shoppers.length; i += 1) {
      const position = this.shoppers[i].group.position;
      const dx = position.x - door.x;
      const dz = position.z - door.z;
      if (dx * dx + dz * dz < 0.64) {
        return;
      }
    }

    const models = this.config.models;
    const modelUrl = models[Math.floor(Math.random() * models.length)];
    const generation = this.spawnGeneration;
    this.spawning = true;
    this.loader.load(modelUrl).then((asset) => {
      this.spawning = false;
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
      shopper.onEscaped = () => {
        if (shopper.outcomeCounted || !shopper.isThief || shopper.isDefeated) {
          return;
        }
        shopper.outcomeCounted = true;
        this.dayStats?.recordEscape(shopper.inventory.count);
      };
      this.scene.add(shopper.group);
      this.shoppers.push(shopper);
      this.dayStats?.recordCustomer();
    }).catch((error) => {
      this.spawning = false;
      console.error('Failed to spawn shopper', error);
    });
  }

  getShoppers() {
    return this.shoppers;
  }

  describe() {
    let thieves = 0;
    for (let i = 0; i < this.shoppers.length; i += 1) {
      if (this.shoppers[i].isThief) {
        thieves += 1;
      }
    }
    return `shoppers ${this.shoppers.length} thieves ${thieves}`;
  }
}
