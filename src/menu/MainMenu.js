import * as THREE from 'three';
import { paletteHex, StorePalette } from '../theme/storePalette.js';
import { cleanShopName, DEFAULT_SHOP_NAME, SHOP_NAME_LIMIT } from '../world/ShopSign.js';

const HOLD_SECONDS = 0.8;
const SQUARE_RADIUS = 0.72;

const ACTIONS = [
  { id: 'menu-new-shop', action: 'new-shop', title: 'NEW SHOP', subtitle: 'DAY 1', color: paletteHex(StorePalette.uiGold), position: [-5.15, 0.05, -2.05] },
  { id: 'menu-continue', action: 'continue', title: 'CONTINUE', subtitle: 'LOAD', color: paletteHex(StorePalette.mint), position: [-5.15, 0.05, -0.45] },
  { id: 'menu-credits', action: 'credits', title: 'CREDITS', subtitle: 'ABOUT', color: paletteHex(StorePalette.sky), position: [-5.15, 0.05, 1.15] },
  { id: 'menu-feedback', action: 'feedback', title: 'FEEDBACK', subtitle: 'FORM', color: paletteHex(StorePalette.coral), position: [-5.15, 0.05, 2.75] }
];

// The main menu is a set of editable objects in the shop scene, not a second scene.
export class MainMenu {
  constructor(game) {
    this.game = game;
    this.state = 'MAIN_MENU';
    this.previousState = 'MAIN_MENU';
    this.editing = false;
    this.busy = false;
    this.cooldown = 0;
    this.squares = ACTIONS.map((spec) => this.createSquare(spec));
    this.spawn = this.createSpawn();
    this.blocker = this.createBlocker();
    this.panel = this.createPanel();
    this.hint = this.createHint();
    this.fade = this.createFade();
    this._world = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    document.body.classList.add('is-main-menu');
  }

  blocksGameplay() {
    return this.state !== 'PLAYING';
  }

  createSquare(spec) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    const root = new THREE.Mesh(new THREE.CircleGeometry(SQUARE_RADIUS, 40), material);
    root.name = spec.id;
    root.position.set(spec.position[0], spec.position[1], spec.position[2]);
    root.rotation.x = -Math.PI / 2;
    root.userData.editorId = spec.id;
    root.userData.editorRoot = true;
    root.userData.editorPersistent = true;
    root.userData.editorCollision = false;
    root.userData.menuAction = spec.action;
    this.game.scene.add(root);
    const square = {
      spec,
      root,
      canvas,
      ctx: canvas.getContext('2d'),
      texture,
      hold: 0,
      latched: false,
      inside: false,
      disabled: false,
      paintKey: ''
    };
    this.paintSquare(square);
    return square;
  }

  createSpawn() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(23, 32, 43, 0.88)';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = paletteHex(StorePalette.uiGold);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 48);
    ctx.lineTo(168, 150);
    ctx.lineTo(128, 124);
    ctx.lineTo(88, 150);
    ctx.closePath();
    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const root = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 28),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      })
    );
    root.name = 'menu-player-spawn';
    root.position.set(-5.15, 0.06, 4.35);
    root.rotation.x = -Math.PI / 2;
    root.userData.editorId = 'menu-player-spawn';
    root.userData.editorRoot = true;
    root.userData.editorPersistent = true;
    root.userData.editorCollision = false;
    root.userData.menuRole = 'spawn';
    this.game.scene.add(root);
    return root;
  }

  createBlocker() {
    const root = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.8, 1.2),
      new THREE.MeshBasicMaterial({
        color: StorePalette.uiGold,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    root.name = 'menu-entrance-blocker';
    root.position.set(-3.72, 0.9, -3);
    root.userData.editorId = 'menu-entrance-blocker';
    root.userData.editorRoot = true;
    root.userData.editorPersistent = true;
    root.userData.editorCollision = false;
    root.userData.menuRole = 'blocker';
    this.game.scene.add(root);
    return root;
  }

  createHint() {
    const hint = document.createElement('p');
    hint.id = 'menu-hint';
    hint.textContent = 'Stand on a square to select.';
    this.game.app.append(hint);
    return hint;
  }

  createFade() {
    const fade = document.createElement('div');
    fade.id = 'menu-fade';
    this.game.app.append(fade);
    return fade;
  }

  createPanel() {
    const panel = document.createElement('section');
    panel.id = 'menu-panel';
    panel.hidden = true;
    panel.setAttribute('data-no-joystick', '');
    this.game.app.append(panel);
    return panel;
  }

  setEditing(editing) {
    this.editing = editing === true;
    this.syncPresentation();
    if (this.game.editor?.active) {
      this.game.editor.refreshHierarchy();
    }
  }

  syncPresentation() {
    const showMenu = this.editing || this.state !== 'PLAYING';
    for (let i = 0; i < this.squares.length; i += 1) {
      this.squares[i].root.visible = showMenu;
    }
    if (this.game.tutorial) {
      this.game.tutorial.root.visible = showMenu;
    }
    this.spawn.visible = this.editing;
    const blocking = !this.editing && this.state !== 'PLAYING';
    this.blocker.visible = this.editing || blocking;
    this.blocker.material.opacity = this.editing ? 0.35 : 0;
    this.hint.hidden = this.editing || this.state !== 'MAIN_MENU';
    this.syncBlocker(blocking);
  }

  syncBlocker(blocking) {
    const id = this.blocker.userData.editorId;
    this.game.collision.removeId(id);
    if (!blocking) {
      return;
    }
    this.blocker.visible = true;
    this.blocker.material.opacity = 0;
    this.game.collision.addObject(this.blocker, { id, group: 'menu-blocker' });
    if (this.editing) {
      this.blocker.material.opacity = 0.35;
    }
  }

  placePlayer() {
    const player = this.game.player;
    if (!player) {
      return;
    }
    this.spawn.updateWorldMatrix(true, true);
    this.spawn.getWorldPosition(this._world);
    player.group.position.set(this._world.x, 0, this._world.z);
    const facing = new THREE.Vector3(0, 1, 0);
    facing.applyQuaternion(this.spawn.getWorldQuaternion(new THREE.Quaternion()));
    player.group.rotation.y = Math.atan2(facing.x, facing.z);
  }

  update(dt) {
    this.syncPresentation();
    if (this.editing || this.state !== 'MAIN_MENU') {
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const player = this.game.player;
    const x = player.group.position.x;
    const z = player.group.position.z;
    const continueReady = this.game.save.hasProgress();
    for (let i = 0; i < this.squares.length; i += 1) {
      const square = this.squares[i];
      square.disabled = square.spec.action === 'continue' && !continueReady;
      const inside = this.contains(square, x, z);
      if (!inside) {
        this.release(square);
        this.paintSquare(square);
        continue;
      }
      if (!square.inside) {
        square.inside = true;
        this.game.audio.tick();
      }
      if (square.disabled || square.latched || this.cooldown > 0 || this.busy) {
        square.hold = 0;
        this.paintSquare(square);
        continue;
      }
      square.hold += dt;
      this.paintSquare(square);
      if (square.hold >= this.holdSeconds()) {
        square.hold = 0;
        square.latched = true;
        this.cooldown = 0.6;
        this.activate(square.spec.action);
        return;
      }
    }
  }

  holdSeconds() {
    const configured = this.game.config.menu?.holdSeconds;
    return configured > 0 ? configured : HOLD_SECONDS;
  }

  contains(square, x, z) {
    square.root.getWorldPosition(this._world);
    square.root.getWorldScale(this._scale);
    const radius = SQUARE_RADIUS * Math.max(this._scale.x, this._scale.y);
    const dx = x - this._world.x;
    const dz = z - this._world.z;
    return dx * dx + dz * dz <= radius * radius;
  }

  release(square) {
    square.inside = false;
    square.hold = 0;
    square.latched = false;
  }

  paintSquare(square) {
    const progress = square.disabled ? 0 : Math.max(0, Math.min(1, square.hold / this.holdSeconds()));
    const subtitle = square.disabled ? 'NO SAVE' : square.spec.subtitle;
    const key = `${square.disabled}|${subtitle}|${progress.toFixed(3)}|${square.inside}`;
    if (key === square.paintKey) {
      return;
    }
    square.paintKey = key;
    const ctx = square.ctx;
    const color = square.disabled ? '#66707a' : square.spec.color;
    ctx.clearRect(0, 0, 512, 512);
    ctx.beginPath();
    ctx.arc(256, 256, 228, 0, Math.PI * 2);
    ctx.fillStyle = square.inside && !square.disabled
      ? paletteHex(StorePalette.uiBackgroundSecondary)
      : paletteHex(StorePalette.uiBackground);
    ctx.fill();
    ctx.lineWidth = 22;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (progress > 0.01) {
      ctx.beginPath();
      ctx.lineWidth = 16;
      ctx.strokeStyle = paletteHex(StorePalette.uiText);
      ctx.lineCap = 'round';
      ctx.arc(256, 256, 196, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
    }
    ctx.fillStyle = paletteHex(StorePalette.uiText);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 58px system-ui, sans-serif';
    ctx.fillText(square.spec.title, 256, 228);
    ctx.font = '700 32px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(subtitle, 256, 292);
    square.texture.needsUpdate = true;
  }

  activate(action) {
    this.game.audio.tone(520, 0.07, 'sine', 0.04);
    this.game.audio.tone(780, 0.12, 'sine', 0.03);
    if (action === 'new-shop') {
      this.promptNewShop();
      return;
    }
    if (action === 'continue') {
      if (!this.game.save.hasProgress()) {
        return;
      }
      this.game.dayNight.applySnapshot(this.game.save.day(), true);
      this.beginPlay();
      return;
    }
    if (action === 'credits') {
      this.showCredits();
      return;
    }
    if (action === 'feedback') {
      this.showFeedback();
    }
  }

  promptNewShop() {
    if (!this.game.save.hasProgress()) {
      this.promptShopName();
      return;
    }
    this.openModal(() => {
      const title = document.createElement('h2');
      title.textContent = 'New Shop';
      const copy = document.createElement('p');
      copy.textContent = 'Start from day 1? This replaces your saved money, upgrades, and shop progress.';
      const start = this.button('Start New Shop', () => this.promptShopName());
      const cancel = this.button('Cancel', () => this.closeModal(), true);
      this.panel.append(title, copy, start, cancel);
    });
  }

  promptShopName() {
    this.openModal(() => {
      this.panel.classList.add('is-compact');
      const form = document.createElement('form');
      const title = document.createElement('h2');
      title.textContent = 'NAME YOUR SHOP';
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'shop-name';
      input.maxLength = SHOP_NAME_LIMIT;
      input.placeholder = 'Enter shop name...';
      input.value = DEFAULT_SHOP_NAME;
      input.autocomplete = 'off';
      input.autocapitalize = 'characters';
      input.enterKeyHint = 'done';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Shop name');
      input.setAttribute('data-no-joystick', '');
      const open = this.button('OPEN SHOP', () => {});
      open.type = 'submit';
      form.append(title, input, open);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = cleanShopName(input.value);
        if (!name) {
          input.focus();
          return;
        }
        this.startNewShop(name);
      });
      this.panel.append(form);
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 30);
    });
    this.setNaming(true);
  }

  setNaming(active) {
    document.body.classList.toggle('is-naming', active === true);
    if (this.game.input && !this.game.editor?.active) {
      this.game.input.suspended = active === true;
      if (active) {
        this.game.input.keys.clear();
        this.game.input.joystick?.reset?.();
      }
    }
  }

  async startNewShop(shopName) {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.closeModal();
    try {
      await this.game.resetToNewShop(shopName);
      this.game.dayNight.applySnapshot(null, true);
      this.beginPlay({ fresh: true });
    } catch (error) {
      console.error('Failed to start a new shop', error);
      this.busy = false;
    }
  }

  showCredits() {
    const menu = this.game.config.menu ?? {};
    const developer = typeof menu.developer === 'string' ? menu.developer.trim() : '';
    this.openModal(() => {
      const title = document.createElement('h2');
      title.textContent = 'Credits';
      this.panel.append(title);
      this.addBlock('Developer', developer || 'Not In My Shop');
      this.addBlock(
        'Third-party assets',
        'Icons by the Lucide Contributors, with portions by Cole Bemis from Feather. Lucide is ISC. Feather portions are MIT.'
      );
      this.addBlock('Engine', 'Built with Three.js.');
      this.addBlock('Acknowledgments', 'Thanks for playing, and for the third-party art that dresses the shop.');
      this.panel.append(this.button('Close', () => this.closeModal()));
    });
  }

  showFeedback() {
    const url = this.game.config.menu?.feedbackUrl ?? '';
    const ready = /^https?:\/\//i.test(url);
    this.openModal(() => {
      const title = document.createElement('h2');
      title.textContent = 'Feedback';
      const copy = document.createElement('p');
      copy.textContent = 'Tell us what is working and what should change.';
      const open = this.button('Open Feedback Form', () => {
        if (ready) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
      open.disabled = !ready;
      this.panel.append(title, copy, open);
      if (!ready) {
        const note = document.createElement('p');
        note.className = 'menu-note';
        note.textContent = 'Add a Google Form link to menu.feedbackUrl in the game config.';
        this.panel.append(note);
      }
      this.panel.append(this.button('Close', () => this.closeModal(), true));
    });
  }

  addBlock(heading, text) {
    const title = document.createElement('h3');
    title.textContent = heading;
    const copy = document.createElement('p');
    copy.textContent = text;
    this.panel.append(title, copy);
  }

  button(label, onClick, quiet) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (quiet) {
      element.className = 'is-quiet';
    }
    element.addEventListener('click', onClick);
    return element;
  }

  openModal(fill) {
    this.resetHolds();
    this.previousState = this.state === 'MODAL' ? this.previousState : this.state;
    this.state = 'MODAL';
    this.panel.replaceChildren();
    fill();
    this.panel.hidden = false;
    this.syncPresentation();
  }

  closeModal() {
    this.panel.classList.remove('is-compact');
    this.panel.hidden = true;
    this.panel.replaceChildren();
    this.setNaming(false);
    this.state = this.previousState === 'PLAYING' ? 'PLAYING' : 'MAIN_MENU';
    this.syncPresentation();
  }

  resetHolds() {
    for (let i = 0; i < this.squares.length; i += 1) {
      const square = this.squares[i];
      square.hold = 0;
      square.latched = square.inside;
      this.paintSquare(square);
    }
  }

  beginPlay(options = {}) {
    this.closeModal();
    if (options.fresh) {
      this.game.entranceGuide?.show();
    } else {
      this.game.entranceGuide?.hide();
    }
    this.state = 'PLAYING';
    this.previousState = 'PLAYING';
    document.body.classList.remove('is-main-menu');
    for (let i = 0; i < this.squares.length; i += 1) {
      this.release(this.squares[i]);
    }
    this.syncPresentation();
    const day = this.game.dayNight;
    const playingDay = day.phase === 'DAY' && !day.closedForNight && day.remaining > 0;
    day.timerRunning = playingDay;
    this.game.shoppers.setSpawningEnabled(playingDay);
    this.game.save.write({
      played: true,
      day: this.game.dayRecord()
    });
    this.busy = false;
    this.playFade();
  }

  exitToMenu() {
    this.game.persistDay();
    this.game.pauseMenu?.close(false);
    this.game.paused = false;
    this.game.dayNight.holdMenu();
    this.state = 'MAIN_MENU';
    this.previousState = 'MAIN_MENU';
    document.body.classList.add('is-main-menu');
    this.placePlayer();
    this.syncPresentation();
    this.game.input.suspended = false;
    this.game.input.keys.clear();
    this.game.input.joystick?.reset?.();
  }

  playFade() {
    this.fade.classList.add('is-on');
    window.setTimeout(() => {
      this.fade.classList.remove('is-on');
    }, 420);
  }
}
