import * as THREE from 'three';
import { GameConfig } from '../config/GameConfig.js';
import { Renderer } from './Renderer.js';
import { AssetLoader } from './AssetLoader.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { InputSystem } from '../systems/InputSystem.js';
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { FollowCamera } from '../camera/FollowCamera.js';
import { Store } from '../world/Store.js';
import { reservedSpot, sectionIndexAt } from '../world/StoreSections.js';
import { cleanShopName, ShopSign } from '../world/ShopSign.js';
import { OutsideEnvironment } from '../world/OutsideEnvironment.js';
import { HotdogStand } from '../world/HotdogStand.js';
import { StreetPets } from '../world/StreetPets.js';
import { STREETLIGHT_MODEL } from '../world/Diorama.js';
import { PrefabLibrary } from '../editor/PrefabLibrary.js';
import { Player } from '../entities/Player.js';
import { ShopperManager } from '../shoppers/ShopperManager.js';
import { countExpansionShelves } from '../shoppers/customerQuota.js';
import { PlayerOcclusionManager } from '../systems/PlayerOcclusionManager.js';
import { MoneyManager } from '../economy/MoneyManager.js';
import { ShopUpgrades } from '../economy/ShopUpgrades.js';
import { UpgradeManager } from '../economy/UpgradeManager.js';
import { StoreSave } from '../economy/StoreSave.js';
import { PurchaseManager } from '../economy/PurchaseManager.js';
import { MoneyHUD } from '../ui/MoneyHUD.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { DebugMoneyUI } from '../ui/DebugMoneyUI.js';
import { DayNightController } from '../daynight/DayNightController.js';
import { DayNightLighting } from '../daynight/DayNightLighting.js';
import { DayStats } from '../daynight/DayStats.js';
import { ShopAudio } from '../daynight/ShopAudio.js';
import { DayNightHUD } from '../ui/DayNightHUD.js';
import { CheckoutInteraction } from '../checkout/CheckoutInteraction.js';
import { CashierHire } from '../checkout/CashierHire.js';
import { PlayerActivityManager } from '../player/PlayerActivity.js';
import { WeaponStation } from '../weapons/WeaponStation.js';
import { BroomUpgrade } from '../weapons/BroomUpgrade.js';
import { BroomStationSet } from '../weapons/BroomStations.js';
import { PlayerWeaponController } from '../weapons/PlayerWeaponController.js';
import { DroppedItemManager } from '../combat/DroppedItemManager.js';
import { HitFeedback } from '../combat/HitFeedback.js';
import { SceneOverrides } from '../editor/SceneOverrides.js';
import { SecurityGuard } from '../security/SecurityGuard.js';
import { SecurityCameraSystem } from '../security/SecurityCameraSystem.js';
import { IntercomSystem } from '../security/IntercomSystem.js';
import { RollerSkates } from '../player/RollerSkates.js';
import { findSceneObject } from './findSceneObject.js';
import { MainMenu } from '../menu/MainMenu.js';
import { TutorialPad } from '../ui/TutorialPad.js';
import { EntranceGuide } from '../ui/EntranceGuide.js';

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
    this.shoppers.audio = this.audio;
    this.paused = false;
    this.dayStartMoney = this.save.day()?.purse ?? this.money.getMoney();
    this.pauseMenu = new PauseMenu(this);
    this.dayNight = new DayNightController(this.config.dayNight, {
      setSpawning: (enabled) => this.shoppers.setSpawningEnabled(enabled),
      prepareNextDay: () => {
        this.shoppers.prepareNextDay();
        this.dayStats.reset();
        this.dayStartMoney = this.money.getMoney();
        this.intercom?.resetCooldown();
        this.persistDay();
      },
      setUpgradesOpen: (open) => this.upgrades.setOpen(open),
      dismissShoppers: () => {
        this.checkout?.cancel();
        this.shoppers.resolveOpenThieves();
        this.shoppers.dismissForClosing();
      },
      snapshotStats: (dayNumber) => this.dayStats.snapshot(dayNumber, this.money.getMoney()),
      onVisual: (phase) => this.lighting.setPhase(phase),
      onClosingStart: () => {
        this.audio.bell();
        this.persistDay();
      },
      onDayOpen: () => this.audio.shopBell()
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
      const playing = this.mainMenu?.state === 'PLAYING';
      this.save.write({
        money: amount,
        ...(playing ? { day: this.dayNight.snapshot(), played: true } : {})
      });
    });
    const unlocked = this.save.unlockedSections();
    const ownedFixtures = this.save.purchasedFixtures(unlocked);
    const store = new Store(this.scene, this.loader, this.collision, this.config);
    store.onBoundsChanged = (limits) => this.applyPlayLimits(limits);
    this.outside = new OutsideEnvironment(this.scene, this.loader, this.collision, this.config);
    this.prefabs = new PrefabLibrary();
    await Promise.all([
      store.load(unlocked, ownedFixtures),
      this.outside.load(),
      this.prefabs.load()
    ]);
    this.occlusion.collect(store);
    this.outside.trackOccluders(this.occlusion);
    this.applyPlayLimits(store.playLimits());
    this.store = store;
    this.shoppers.syncSections(store.maxUnlocked);
    this.shoppers.syncShelfPicks(ownedFixtures);
    store.onSectionUnlocked = (count) => {
      this.shoppers.syncSections(count);
      this.cameras?.syncCameras();
      this.intercom?.syncSpeakers();
      this.broomStations?.syncUnlocked();
    };
    this.mainMenu = new MainMenu(this);
    this.tutorial = new TutorialPad(this);
    this.entranceGuide = new EntranceGuide(this.scene);
    this.hotdog = new HotdogStand(this.scene, this.loader, this.collision, this.outside, this.config);
    await this.hotdog.load();
    this.pets = new StreetPets(this.scene, this.loader, this.collision, this.outside, this.config);
    await this.pets.load();
    this.sceneOverrides = new SceneOverrides(this);
    await this.sceneOverrides.loadAndApply();
    this.shopSign = new ShopSign(this.scene, this.save);
    this.applyPlayLimits(store.playLimits());
    this.outside.diorama?.applySavedPrefab(this.prefabs.get(STREETLIGHT_MODEL));
    this.outside.diorama?.attachPlacedStreetlights(this.scene);
    this.prefabs.applyGeneric(this.scene);
    store.onVisibilitySynced = () => this.sceneOverrides.reapplyVisibility();
    store.onFixtureSpawned = (object, id) => {
      this.occlusion.track(object, id);
      this.sceneOverrides.noteSpawned(object);
      this.cashiers?.syncLayout();
      this.shoppers.addShelf(id);
    };

    this.player = new Player(this.loader, this.input, this.collision, this.config);
    await this.player.load();
    this.scene.add(this.player.group);
    this.mainMenu.placePlayer();
    this.dayNight.holdMenu();
    this.mainMenu.syncPresentation();
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
      this.followCamera.camera,
      this.audio
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
      upgradeConfig.coinInterval ?? 0.15,
      (x) => {
        const index = sectionIndexAt(x);
        return index >= 0 && index <= this.store.maxUnlocked;
      },
      this.audio
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
        audio: this.audio,
        openShop: {
          ...openShop,
          canOpen: () => this.dayNight.displayPhase() === 'NIGHT' && !this.dayNight.blocksPlay(),
          onOpen: () => this.dayNight.startNextDay()
        }
      }
    );
    this.purchases.restoreOwned(ownedFixtures);
    this.purchases.syncOffers();
    this.shoppers.setCustomerSources({
      day: () => this.dayNight.dayNumber,
      dayRemaining: () => this.dayNight.remaining,
      dayDuration: () => this.dayNight.dayDuration,
      shelves: () => countExpansionShelves(this.purchases.owned)
    });
    this.debugMoney = new DebugMoneyUI(
      this.app,
      this.money,
      this.config.economy?.startingMoney ?? 0,
      import.meta.env.DEV && this.config.economy?.debugMoney !== false,
      this.save
    );
    this.drops = new DroppedItemManager(this.scene, this.config.weapons);
    this.hitFeedback = new HitFeedback(this.scene, this.config.weapons);
    const guardConfig = upgradeConfig.securityGuard ?? {};
    this.security = new SecurityGuard({
      scene: this.scene,
      loader: this.loader,
      collision: this.collision,
      shoppers: this.shoppers,
      drops: this.drops,
      feedback: this.hitFeedback,
      toonFactory: this.config.graphics.toonShading ? this.player.toonFactory : null,
      weapons: this.config.weapons,
      config: guardConfig
    });
    this.upgradeManager.add({
      id: guardConfig.id,
      name: 'HIRE SECURITY GUARD',
      cost: guardConfig.cost,
      position: guardConfig.position,
      halfSize: guardConfig.halfSize,
      circular: true,
      retainWhenOwned: true,
      showFloorTitle: true,
      hiredLines: ['GUARD', 'HIRED'],
      summary: 'Hires a guard who patrols the shop and stops thieves.',
      onPurchase: () => {
        this.security.hire();
        this.save.write({
          purchasedUpgrades: [...this.upgrades.purchased],
          money: this.money.getMoney()
        });
      }
    });
    const cameraConfig = upgradeConfig.securityCamera ?? {};
    this.cameras = new SecurityCameraSystem({
      scene: this.scene,
      loader: this.loader,
      shoppers: this.shoppers,
      app: this.app,
      toonFactory: this.config.graphics.toonShading ? this.player.toonFactory : null,
      getUnlockedIndex: () => this.store.maxUnlocked,
      config: cameraConfig
    });
    const intercomConfig = upgradeConfig.intercom ?? {};
    this.intercom = new IntercomSystem({
      scene: this.scene,
      loader: this.loader,
      shoppers: this.shoppers,
      audio: this.audio,
      app: this.app,
      toonFactory: this.config.graphics.toonShading ? this.player.toonFactory : null,
      getUnlockedIndex: () => this.store.maxUnlocked,
      config: intercomConfig
    });
    this.upgradeManager.add({
      id: intercomConfig.id,
      name: 'INTERCOM',
      cost: intercomConfig.cost,
      position: intercomConfig.position,
      halfSize: intercomConfig.halfSize,
      circular: true,
      retainWhenOwned: true,
      showFloorTitle: true,
      hiredLines: ['INTERCOM', 'OWNED'],
      summary: 'Sounds the speakers. Every thief drops what they took and runs. It needs a minute to recharge.',
      onPurchase: () => {
        this.intercom.activate();
        this.save.write({
          purchasedUpgrades: [...this.upgrades.purchased],
          money: this.money.getMoney()
        });
      }
    });
    this.upgradeManager.add({
      id: cameraConfig.id,
      name: 'SECURITY CAMERA',
      cost: cameraConfig.cost,
      position: cameraConfig.position,
      halfSize: cameraConfig.halfSize,
      circular: true,
      retainWhenOwned: true,
      showFloorTitle: true,
      hiredLines: ['CAMERA', 'OWNED'],
      summary: 'Mounts cameras that sweep the aisles and warn you when a thief is spotted.',
      onPurchase: () => {
        this.cameras.activate();
        this.save.write({
          purchasedUpgrades: [...this.upgrades.purchased],
          money: this.money.getMoney()
        });
      }
    });
    const skateConfig = upgradeConfig.rollerSkate ?? {};
    const skateSpot = reservedSpot('sports', 'sports_skates');
    this.rollerSkates = new RollerSkates({
      player: this.player,
      loader: this.loader,
      toonFactory: this.config.graphics.toonPlayer ? this.player.toonFactory : null,
      config: skateConfig
    });
    this.upgradeManager.add({
      id: skateConfig.id,
      name: 'SKATES',
      detail: 'MOVEMENT SPEED +30%',
      cost: skateConfig.cost,
      position: [skateSpot?.x ?? 12.65, skateSpot?.z ?? 1.85],
      halfSize: skateConfig.halfSize ?? 0.72,
      circular: true,
      retainWhenOwned: true,
      showFloorTitle: true,
      hiredLines: ['SPEED +30%', 'OWNED'],
      summary: 'Strap on skates. You move 30% faster.',
      onPurchase: () => {
        this.rollerSkates.activate();
        this.player.setSpeedModifier(skateConfig.id, skateConfig.speedMultiplier ?? 1.3);
        this.save.write({
          purchasedUpgrades: [...this.upgrades.purchased],
          money: this.money.getMoney()
        });
      }
    });
    // The reserved card sits on the same spot as the purchase circle.
    const skateMarker = findSceneObject(this.scene, 'decor-reserved-sports-skates');
    if (skateMarker) {
      skateMarker.traverse((child) => {
        if (child !== skateMarker) {
          child.visible = false;
        }
      });
    }
    this.cashiers = new CashierHire({
      scene: this.scene,
      loader: this.loader,
      money: this.money,
      upgrades: this.upgrades,
      save: this.save,
      upgradeManager: this.upgradeManager,
      checkout: this.checkout,
      shoppers: this.shoppers,
      toonFactory: this.config.graphics.toonShading ? this.player.toonFactory : null,
      config: upgradeConfig.cashier ?? {}
    });
    this.weapons = new PlayerWeaponController(
      this.player,
      this.shoppers,
      this.weaponStation.broom,
      this.drops,
      this.hitFeedback,
      this.activity,
      this.config.weapons,
      this.audio
    );
    this.shoppers.onThiefDrops = (drops) => this.drops.spawn(drops);
    this.broomUpgrade = new BroomUpgrade({
      scene: this.scene,
      money: this.money,
      save: this.save,
      station: this.weaponStation,
      upgrades: this.upgrades,
      level: this.save.broomLevel(),
      position: [this.weaponStation.zoneX, this.weaponStation.zoneZ],
      halfSize: 0.72,
      interval: upgradeConfig.coinInterval ?? 0.15,
      audio: this.audio
    });
    this.upgradeManager.pads.push(this.broomUpgrade.pad);
    this.weaponStation.onZoneMove = (x, z) => this.broomUpgrade.pad.setPosition(x, z);
    this.weapons.getBroom = () => this.broomUpgrade.current;
    await this.broomUpgrade.restore();
    const stationConfig = upgradeConfig.broomStation ?? {};
    this.broomStations = new BroomStationSet({
      scene: this.scene,
      loader: this.loader,
      collision: this.collision,
      money: this.money,
      upgrades: this.upgrades,
      save: this.save,
      upgradeManager: this.upgradeManager,
      broomUpgrade: this.broomUpgrade,
      player: this.player,
      toonFactory: this.config.graphics.toonShading ? this.player.toonFactory : null,
      getUnlocked: () => this.store.maxUnlocked,
      onSpawn: (object, id) => this.occlusion.track(object, id),
      weapons: this.config.weapons,
      stationConfig,
      interval: upgradeConfig.coinInterval ?? 0.15,
      audio: this.audio
    });
    this.broomUpgrade.onChanged = () => this.broomStations.syncFromUpgrade();
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
      window.__security = this.security;
      window.__cameras = this.cameras;
      window.__intercom = this.intercom;
      window.__rollerSkates = this.rollerSkates;
      window.__cashiers = this.cashiers;
      window.__broomStations = this.broomStations;
      window.__menu = this.mainMenu;
      window.__shopSign = this.shopSign;
      window.__hotdog = this.hotdog;
      window.__pets = this.pets;
    }
    this.sceneOverrides.syncGameplay();
    this.registerEditorAnchors();
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

  presentEditor(editing) {
    this.store?.presentForEditor(editing);
    this.purchases?.presentForEditor(editing);
    this.upgradeManager?.presentForEditor(editing);
    this.registerEditorAnchors();
  }

  registerEditorAnchors() {
    const overrides = this.sceneOverrides;
    if (!overrides?.adoptAnchor) {
      return;
    }
    const pads = this.upgradeManager?.pads ?? [];
    for (let i = 0; i < pads.length; i += 1) {
      const root = pads[i].root;
      root.userData.editorKind = 'upgrade';
      overrides.adoptAnchor(root);
      pads[i].setPosition(root.position.x, root.position.z);
    }
    const offers = this.purchases?.offers ?? [];
    for (let i = 0; i < offers.length; i += 1) {
      const root = offers[i].view.root;
      root.userData.editorKind = 'purchase';
      overrides.adoptAnchor(root);
      this.purchases.syncSquare(root);
    }
    const open = this.purchases?.openPad?.root;
    if (open) {
      open.userData.editorKind = 'purchase';
      overrides.adoptAnchor(open);
      this.purchases.syncSquare(open);
    }
  }

  syncEditorAnchor(object) {
    if (!object?.userData?.editorKind) {
      return;
    }
    if (object.userData.editorKind === 'upgrade') {
      const pads = this.upgradeManager?.pads ?? [];
      for (let i = 0; i < pads.length; i += 1) {
        if (pads[i].root === object) {
          pads[i].setPosition(object.position.x, object.position.z);
          return;
        }
      }
    }
    if (object.userData.editorKind === 'purchase') {
      this.purchases?.syncSquare(object);
    }
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
    if (!this.editor?.active && !this.paused) {
      this.hotdog?.update(dt);
      this.pets?.update(dt);
    }
    if (this.editor?.active) {
      this.editor.update(dt);
      this.shopSign?.update(this.lighting.night);
      this.renderer.render(this.scene, this.editor.camera);
      return;
    }
    if (this.paused) {
      this.renderer.render(this.scene, this.followCamera.camera);
      return;
    }
    if (this.mainMenu?.blocksGameplay()) {
      this.mainMenu.update(dt);
      this.lighting.update(dt);
      this.shopSign?.update(this.lighting.night);
      this.outside?.diorama?.setNight(this.lighting.night);
      this.tutorial?.update(dt);
      this.player.movementLocked = this.mainMenu.state === 'MODAL' || this.tutorial?.open === true;
      this.player.update(dt);
      this.followCamera.update(dt);
      this.occlusion.update(dt);
      this.updateDebug(dt);
      this.renderer.render(this.scene, this.followCamera.camera);
      return;
    }
    this.dayNight.update(dt);
    this.lighting.update(dt);
    this.shopSign?.update(this.lighting.night);
    this.outside?.diorama?.setNight(this.lighting.night);
    this.sceneOverrides?.applyLightLocks();
    this.phaseHud.update(dt);
    const playing = !this.dayNight.blocksPlay();
    this.tutorial?.update(dt);
    this.player.movementLocked = !playing || this.tutorial?.open === true;
    this.player.update(dt);
    this.entranceGuide?.update(dt, this.player.group.position);
    this.upgradeManager?.update(dt);
    this.weaponStation.setUpgradeMode(this.upgrades.canPurchase());
    this.broomStations?.setUpgradeMode(this.upgrades.canPurchase());
    const position = this.player.group.position;
    this.purchases?.update(dt, playing, position.x, position.z);
    this.shoppers.update(dt);
    this.security?.setShift(playing && this.dayNight.displayPhase() === 'DAY');
    this.security?.update(dt);
    const dayShift = playing && this.dayNight.displayPhase() === 'DAY';
    this.cashiers?.setShift(dayShift);
    this.cashiers?.update(dt);
    if (playing) {
      this.activity.updateZones({
        checkout: this.checkout.playerInside(),
        weapon: this.weaponStation.playerInside() || this.broomStations.playerInside()
      });
      this.weaponStation.update(dt);
      this.broomStations.update(dt);
      this.weapons.update(dt);
      this.drops.update(this.player, this.money);
      this.checkout.update(dt);
    }
    this.hitFeedback.update(dt);
    this.followCamera.update(dt);
    const viewWidth = this.app.clientWidth || window.innerWidth;
    const viewHeight = this.app.clientHeight || window.innerHeight;
    this.cameras?.update(dt, this.followCamera.camera, viewWidth, viewHeight);
    this.intercom?.update(dt, playing);
    this.occlusion.update(dt);
    this.updateDebug(dt);
    this.renderer.render(this.scene, this.followCamera.camera);
  }

  persistDay() {
    if (this.mainMenu?.state !== 'PLAYING') {
      return;
    }
    this.save.write({
      day: this.dayRecord(),
      played: true
    });
  }

  dayRecord() {
    return {
      ...this.dayNight.snapshot(),
      purse: this.dayStartMoney
    };
  }

  restartCurrentDay() {
    const purse = Number.isFinite(this.dayStartMoney) ? this.dayStartMoney : this.money.getMoney();
    this.dayStartMoney = purse;
    this.money.setMoney(purse);
    this.dayStats.reset();
    this.drops?.clear();
    this.checkout?.cancel();
    this.intercom?.resetCooldown();
    this.shoppers.clearLive();
    this.dayNight.applySnapshot({
      number: this.dayNight.dayNumber,
      remaining: this.dayNight.dayDuration,
      phase: 'DAY'
    }, true);
    this.phaseHud.update(0);
    this.persistDay();
  }

  async resetToNewShop(shopName) {
    const fixtures = Array.isArray(this.save.data.purchasedFixtures)
      ? [...this.save.data.purchasedFixtures]
      : [];
    this.save.clear();
    const persist = this.money.persist;
    this.money.persist = null;
    this.money.setMoney(this.config.economy?.startingMoney ?? 0);
    this.money.persist = persist;
    this.dayStartMoney = this.money.getMoney();
    this.upgrades.purchased.clear();
    this.upgrades.setOpen(false);
    this.dayNight.applySnapshot(null, false);
    this.dayNight.holdMenu();
    this.dayStats.reset();
    this.rollerSkates?.detach();
    const skateId = this.config.upgrades?.rollerSkate?.id;
    if (skateId) {
      this.player.setSpeedModifier(skateId, 1);
    }
    this.security?.dismiss();
    this.cameras?.deactivate();
    this.intercom?.deactivate();
    this.cashiers?.dismissAll();
    if (this.broomUpgrade) {
      this.broomUpgrade.level = 1;
      await this.broomUpgrade.restore();
    }
    this.broomStations?.syncFromUpgrade();
    this.store.maxUnlocked = 0;
    this.store.syncUnlock();
    this.shoppers.syncSections(0);
    this.shoppers.syncShelfPicks([]);
    this.shoppers.setSpawningEnabled(false);
    for (let i = 0; i < fixtures.length; i += 1) {
      this.store.concealFixture(fixtures[i]);
    }
    this.cashiers?.syncLayout();
    this.purchases?.owned.clear();
    this.purchases?.syncOffers();
    this.registerEditorAnchors();
    const pads = this.upgradeManager?.pads ?? [];
    for (let i = 0; i < pads.length; i += 1) {
      pads[i].reopen();
    }
    this.save.write({
      money: this.money.getMoney(),
      broomLevel: 1,
      purchasedUpgrades: [],
      unlockedSections: this.save.unlockedSections(),
      purchasedFixtures: [],
      pendingPurchase: null,
      played: false,
      day: this.dayNight.snapshot(),
      shopName: cleanShopName(shopName) || 'MY SHOP'
    });
    this.shopSign?.applyNewGame(this.save.shopName());
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
      ? ` ${this.shoppers.lanes.describe()} ${this.checkout.describe()}`
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
