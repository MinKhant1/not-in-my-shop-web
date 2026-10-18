import * as THREE from 'three';
import { GameConfig } from '../config/GameConfig.js';
import { Renderer } from './Renderer.js';
import { AssetLoader } from './AssetLoader.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { InputSystem } from '../systems/InputSystem.js';
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { FollowCamera } from '../camera/FollowCamera.js';
import { Store } from '../world/Store.js';
import { Player } from '../entities/Player.js';
import { ShopperManager } from '../shoppers/ShopperManager.js';
import { PlayerOcclusionManager } from '../systems/PlayerOcclusionManager.js';
import { MoneyManager } from '../economy/MoneyManager.js';
import { MoneyHUD } from '../ui/MoneyHUD.js';
import { CheckoutInteraction } from '../checkout/CheckoutInteraction.js';
import { PlayerActivityManager } from '../player/PlayerActivity.js';
import { WeaponStation } from '../weapons/WeaponStation.js';
import { PlayerWeaponController } from '../weapons/PlayerWeaponController.js';
import { DroppedItemManager } from '../combat/DroppedItemManager.js';
import { HitFeedback } from '../combat/HitFeedback.js';

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
    this.moneyHud = new MoneyHUD(document.querySelector('#money-hud'), this.money);
    this.clock = new THREE.Clock();
    this.debugElement = document.querySelector('#debug-overlay');
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.onResize = () => this.resize();
    this.loop = this.loop.bind(this);
  }

  async init() {
    this.setupLights();

    const store = new Store(this.scene, this.loader, this.collision, this.config);
    await store.load();
    this.occlusion.collect(store);

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
    if (this.config.checkout.debugCheckout || this.config.weapons.debugWeapons || this.config.weapons.debugBroomGrip) {
      window.__checkout = this.checkout;
      window.__money = this.money;
      window.__shoppers = this.shoppers;
      window.__weapons = this.weapons;
      window.__activity = this.activity;
      window.__player = this.player;
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

  setupLights() {
    const toon = this.config.graphics.toonShading;
    const hemisphere = new THREE.HemisphereLight(0xfff6ea, 0x8e99a3, toon ? 0.45 : 1.05);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfffaf3, toon ? 2.0 : 0.8);
    sun.position.set(toon ? 8 : 5, toon ? 6 : 10, toon ? 5 : 6);
    if (this.config.graphics.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 30;
      sun.shadow.camera.left = -10;
      sun.shadow.camera.right = 10;
      sun.shadow.camera.top = 10;
      sun.shadow.camera.bottom = -10;
    }
    this.scene.add(sun);
  }

  resize() {
    const width = this.app.clientWidth || window.innerWidth;
    const height = this.app.clientHeight || window.innerHeight;
    if (width < 1 || height < 1) {
      return;
    }
    this.renderer.resize(width, height);
    this.followCamera.resize(width, height);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.player.update(dt);
    this.shoppers.update(dt);
    this.activity.updateZones({
      checkout: this.checkout.playerInside(),
      weapon: this.weaponStation.playerInside()
    });
    this.weaponStation.update(dt);
    this.weapons.update(dt);
    this.drops.update(this.player, this.money);
    this.hitFeedback.update(dt);
    this.followCamera.update(dt);
    this.checkout.update(dt);
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
    this.debugElement.textContent = `${fps} FPS${shopperLine}${checkoutLine}${weaponLine}${occlusionLine}`;
    this.fpsFrames = 0;
    this.fpsTime = 0;
  }
}
