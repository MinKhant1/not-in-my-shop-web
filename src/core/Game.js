import * as THREE from 'three';
import { GameConfig } from '../config/GameConfig.js';
import { Renderer } from './Renderer.js';
import { AssetLoader } from './AssetLoader.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { InputSystem } from '../systems/InputSystem.js';
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { FollowCamera } from '../camera/FollowCamera.js';
import { Store } from '../world/Store.js';
import { OutsideEnvironment } from '../world/OutsideEnvironment.js';
import { Player } from '../entities/Player.js';
import { ShopperManager } from '../shoppers/ShopperManager.js';
import { PlayerOcclusionManager } from '../systems/PlayerOcclusionManager.js';
import { MoneyManager } from '../economy/MoneyManager.js';
import { ShopUpgrades } from '../economy/ShopUpgrades.js';
import { UpgradeManager } from '../economy/UpgradeManager.js';
import { StoreSave } from '../economy/StoreSave.js';
import { PurchaseManager } from '../economy/PurchaseManager.js';
import { MoneyHUD } from '../ui/MoneyHUD.js';
import { DebugMoneyUI } from '../ui/DebugMoneyUI.js';
import { DayNightController } from '../daynight/DayNightController.js';
import { DayNightLighting } from '../daynight/DayNightLighting.js';
import { DayStats } from '../daynight/DayStats.js';
import { ShopAudio } from '../daynight/ShopAudio.js';
import { DayNightHUD } from '../ui/DayNightHUD.js';
import { CheckoutInteraction } from '../checkout/CheckoutInteraction.js';
import { PlayerActivityManager } from '../player/PlayerActivity.js';
import { WeaponStation } from '../weapons/WeaponStation.js';
import { PlayerWeaponController } from '../weapons/PlayerWeaponController.js';
import { DroppedItemManager } from '../combat/DroppedItemManager.js';
import { HitFeedback } from '../combat/HitFeedback.js';
import { SceneOverrides } from '../editor/SceneOverrides.js';

export class Game {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.app = app;
    this.config = GameConfig;
    this.renderer = new Renderer(canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.background);
    this.loader = new AssetLoader({ debug: this.config.debug });
    this.collision = new CollisionSystem(this.config);
    this.joystick = new VirtualJoystick(
      document.querySelector('#joystick-zone'),
      this.config.joystick
    );
    this.input = new InputSystem(this.joystick);
    this.followCamera = new FollowCamera(this.config);
    this.player = null;
    this.shoppers = new ShopperManager(this.scene, this.loader, this.collision, this.config);
    this.occlusion = new PlayerOcclusionManager(this.scene, this.config);
    this.money = new MoneyManager(this.config.economy?.startingMoney ?? 0);
    this.upgrades = new ShopUpgrades();
    this.save = new StoreSave();
    this.save.apply(this.money, this.upgrades);
    this.moneyHud = new MoneyHUD(document.querySelector('#money-hud'), this.money);
    this.lighting = new DayNightLighting(this.scene, this.config.dayNight);
    this.dayStats = new DayStats(this.money, this.config.weapons.itemRecoveryValue ?? 5);
    this.shoppers.setDayStats(this.dayStats);
    this.audio = new ShopAudio();
    this.dayNight = new DayNightController(this.config.dayNight, {
      setSpawning: (enabled) => this.shoppers.setSpawningEnabled(enabled),
      prepareNextDay: () => {
        this.shoppers.prepareNextDay();
        this.dayStats.reset();
      },
      setUpgradesOpen: (open) => this.upgrades.setOpen(open),
      dismissShoppers: () => {
        this.checkout?.cancel();
        this.shoppers.resolveOpenThieves();
        this.shoppers.dismissForClosing();
      },
      snapshotStats: (dayNumber) => this.dayStats.snapshot(dayNumber, this.money.getMoney()),
      onVisual: (phase) => this.lighting.setPhase(phase),
      onClosingStart: () => this.audio.bell()
    });
    this.phaseHud = new DayNightHUD(app, this.dayNight, this.audio, () => this.money.getMoney());
    this.clock = new THREE.Clock();
    this.debugElement = document.querySelector('#debug-overlay');
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.onResize = () => this.resize();
    this.loop = this.loop.bind(this);
  }

  async init() {
    this.save.claimPendingRefund(this.money);
    this.money.setPersist((amount) => {
      this.save.write({ money: amount });
    });
    const unlocked = this.save.unlockedSections();
    const ownedFixtures = this.save.purchasedFixtures(unlocked);
    const store = new Store(this.scene, this.loader, this.collision, this.config);
    store.onBoundsChanged = (limits) => this.applyPlayLimits(limits);
    this.outside = new OutsideEnvironment(this.scene, this.loader, this.collision, this.config);
    await Promise.all([
      store.load(unlocked, ownedFixtures),
      this.outside.load()
    ]);
    this.occlusion.collect(store);
    this.outside.trackOccluders(this.occlusion);
    this.applyPlayLimits(store.playLimits());
    this.store = store;
    this.shoppers.syncSections(store.maxUnlocked);
    store.onSectionUnlocked = (count) => this.shoppers.syncSections(count);
    this.sceneOverrides = new SceneOverrides(this);
    await this.sceneOverrides.loadAndApply();
    store.onVisibilitySynced = () => this.sceneOverrides.reapplyVisibility();
    store.onFixtureSpawned = (object, id) => {
      this.occlusion.track(object, id);
      this.sceneOverrides.noteSpawned(object);
    };

    this.player = new Player(this.loader, this.input, this.collision, this.config);
    await this.player.load();
    this.scene.add(this.player.group);
    await this.shoppers.load();

    const debugView = this.collision.createDebugVisuals();
    if (debugView) {
      this.scene.add(debugView);
    }

    if (this.config.debug && this.debugElement) {
      this.debugElement.hidden = false;
    }

    this.scene.add(this.followCamera.camera);
    this.followCamera.follow(this.player);
    this.occlusion.attach(this.followCamera.camera, this.player);
    this.checkout = new CheckoutInteraction(
      this.scene,
      this.player,
      this.shoppers.checkoutQueue,
      this.money,
      this.config.checkout,
      this.followCamera.camera
    );
    this.activity = new PlayerActivityManager();
    this.weaponStation = new WeaponStation(this.scene, this.player, this.config.weapons);
    await this.weaponStation.load(
      this.loader,
      this.config.graphics.toonShading ? this.player.toonFactory : null
    );
    this.weaponStation.bind(this.activity);
    this.checkout.onCheckout = (amount) => this.dayStats.recordCheckout(amount);
    const upgradeConfig = this.config.upgrades ?? {};
    this.upgradeManager = new UpgradeManager(
      this.scene,
      this.money,
      this.upgrades,
      () => this.player.group.position,
      upgradeConfig.coinInterval ?? 0.15
    );
    const openShop = this.config.dayNight?.openShop ?? { x: -2.5, z: -2, holdSeconds: 1 };
    this.purchases = new PurchaseManager(
      this.scene,
      store,
      this.money,
      this.upgrades,
      this.save,
      {
        ...this.config.purchases,
        openShop: {
          ...openShop,
          canOpen: () => this.dayNight.displayPhase() === 'NIGHT' && !this.dayNight.blocksPlay(),
          onOpen: () => this.dayNight.startNextDay()
        }
      }
    );
    this.purchases.restoreOwned(ownedFixtures);
    this.purchases.syncOffers();
    this.debugMoney = new DebugMoneyUI(
      this.app,
      this.money,
      this.config.economy?.startingMoney ?? 0,
      import.meta.env.DEV && this.config.economy?.debugMoney !== false,
      this.save
    );
    this.drops = new DroppedItemManager(this.scene, this.config.weapons);
    this.hitFeedback = new HitFeedback(this.scene, this.config.weapons);
    this.weapons = new PlayerWeaponController(
      this.player,
      this.shoppers,
      this.weaponStation.broom,
      this.drops,
      this.hitFeedback,
      this.activity,
      this.config.weapons
    );
    if (this.config.debug || this.config.checkout.debugCheckout || this.config.weapons.debugWeapons || this.config.weapons.debugBroomGrip) {
      window.__checkout = this.checkout;
      window.__money = this.money;
      window.__shoppers = this.shoppers;
      window.__weapons = this.weapons;
      window.__activity = this.activity;
      window.__player = this.player;
      window.__dayNight = this.dayNight;
      window.__upgrades = this.upgrades;
      window.__store = this.store;
      window.__outside = this.outside;
      window.__upgradeManager = this.upgradeManager;
      window.__purchases = this.purchases;
      window.__save = this.save;
    }
    this.sceneOverrides.syncGameplay();
    const editorRequested = import.meta.env.DEV || new URLSearchParams(window.location.search).has('editor');
    if (editorRequested) {
      const { EditorSession } = await import('../editor/EditorSession.js');
      this.editor = new EditorSession(this);
      if (new URLSearchParams(window.location.search).has('editor')) {
        this.editor.enter();
      }
    }
    if (this.config.debug) {
      window.__sceneOverrides = this.sceneOverrides;
    }
    this.resize();
    this.followCamera.snap();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.onResize);
    }

    this.clock.start();
    this.loop();
  }

  applyPlayLimits(limits) {
    this.outside?.setShopSpan(limits.floorWest, limits.floorEast);
    const streetMin = this.outside?.cameraMinX;
    this.followCamera.setLimits({
      minX: streetMin == null ? limits.minX : Math.min(limits.minX, streetMin),
      maxX: limits.maxX
    });
  }

  resize() {
    const width = this.app.clientWidth || window.innerWidth;
    const height = this.app.clientHeight || window.innerHeight;
    if (width < 1 || height < 1) {
      return;
    }
    this.renderer.resize(width, height);
    this.followCamera.resize(width, height);
    this.editor?.resize(width, height);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.editor?.active) {
      this.editor.update(dt);
      this.renderer.render(this.scene, this.editor.camera);
      return;
    }
    this.dayNight.update(dt);
    this.lighting.update(dt);
    this.sceneOverrides?.applyLightLocks();
    this.phaseHud.update(dt);
    const playing = !this.dayNight.blocksPlay();
    this.player.movementLocked = !playing;
    this.player.update(dt);
    this.upgradeManager?.update(dt);
    const position = this.player.group.position;
    this.purchases?.update(dt, playing, position.x, position.z);
    this.shoppers.update(dt);
    if (playing) {
      this.activity.updateZones({
        checkout: this.checkout.playerInside(),
        weapon: this.weaponStation.playerInside()
      });
      this.weaponStation.update(dt);
      this.weapons.update(dt);
      this.drops.update(this.player, this.money);
      this.checkout.update(dt);
    }
    this.hitFeedback.update(dt);
    this.followCamera.update(dt);
    this.occlusion.update(dt);
    this.updateDebug(dt);
    this.renderer.render(this.scene, this.followCamera.camera);
  }

  updateDebug(dt) {
    if (!this.config.debug || !this.debugElement) {
      return;
    }

    this.fpsFrames += 1;
    this.fpsTime += dt;
    if (this.fpsTime < 0.5) {
      return;
    }

    const fps = Math.round(this.fpsFrames / this.fpsTime);
    const shopperLine = this.config.shoppers?.debugNavigation ? ` ${this.shoppers.describe()}` : '';
    const checkoutLine = this.config.checkout?.debugCheckout
      ? ` ${this.shoppers.checkoutQueue.describe()} ${this.checkout.describe()}`
      : '';
    const weaponLine = this.config.weapons?.debugWeapons
      ? ` ${this.weapons.describe()} ${this.drops.describe()}`
      : '';
    const occlusionLine = this.config.occlusion?.debugOcclusion
      ? ` occlusion ${this.occlusion.describe() || 'clear'}`
      : '';
    const phaseLine = ` ${this.dayNight.describe()}`;
    this.debugElement.textContent = `${fps} FPS${phaseLine}${shopperLine}${checkoutLine}${weaponLine}${occlusionLine}`;
    this.fpsFrames = 0;
    this.fpsTime = 0;
  }
}
