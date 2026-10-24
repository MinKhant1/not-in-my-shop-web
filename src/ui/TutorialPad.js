import * as THREE from 'three';
import { paletteHex, StorePalette } from '../theme/storePalette.js';

const RADIUS = 0.72;
const HOLD = 0.55;

const STEPS = [
  {
    image: '/assets/ui/hud/checkout.jpg',
    title: 'Checkout',
    text: 'Do checkouts for customers.'
  },
  {
    image: '/assets/ui/hud/catch_thief.jpg',
    title: 'Catch thieves',
    text: 'A red mark means a thief. Hit them with the broom.'
  },
  {
    image: '/assets/ui/hud/upgrade_shop.jpg',
    title: 'Upgrade',
    text: 'At night, the shop will be closed and you can upgrade your shop.'
  }
];

// A floor circle outside the shop door. Standing on it opens the tutorial.
export class TutorialPad {
  constructor(game) {
    this.game = game;
    this.hold = 0;
    this.inside = false;
    this.latched = false;
    this.open = false;
    this.step = 0;
    this.paintKey = '';
    this._world = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this.root = this.createPad();
    this.panel = this.createPanel();
  }

  createPad() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const root = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS, 40),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      })
    );
    root.name = 'tutorial-pad';
    root.position.set(-4.65, 0.05, -3);
    root.rotation.x = -Math.PI / 2;
    root.userData.editorId = 'tutorial-pad';
    root.userData.editorRoot = true;
    root.userData.editorPersistent = true;
    root.userData.editorCollision = false;
    this.game.scene.add(root);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texture = texture;
    this.paint();
    return root;
  }

  createPanel() {
    const panel = document.createElement('section');
    panel.id = 'tutorial-modal';
    panel.hidden = true;
    panel.setAttribute('data-no-joystick', '');
    const kicker = document.createElement('p');
    kicker.className = 'tutorial-kicker';
    const title = document.createElement('h2');
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    const copy = document.createElement('p');
    const dots = document.createElement('div');
    dots.className = 'tutorial-dots';
    const actions = document.createElement('div');
    actions.className = 'tutorial-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'is-quiet';
    back.textContent = 'Back';
    back.addEventListener('click', () => this.showStep(this.step - 1));
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Next';
    next.addEventListener('click', () => {
      if (this.step >= STEPS.length - 1) {
        this.close();
        return;
      }
      this.showStep(this.step + 1);
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tutorial-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.close());
    actions.append(back, next);
    panel.append(close, kicker, title, image, copy, dots, actions);
    this.game.app.append(panel);
    this.kicker = kicker;
    this.title = title;
    this.image = image;
    this.copy = copy;
    this.dots = dots;
    this.back = back;
    this.next = next;
    return panel;
  }

  update(dt) {
    const player = this.game.player;
    if (!player || this.game.editor?.active || this.game.mainMenu?.state === 'MODAL') {
      return;
    }
    const position = player.group.position;
    const inside = this.contains(position.x, position.z);
    if (!inside) {
      this.inside = false;
      this.hold = 0;
      this.latched = false;
      this.paint();
      return;
    }
    if (!this.inside) {
      this.inside = true;
      this.game.audio?.tick();
    }
    if (this.open || this.latched) {
      this.paint();
      return;
    }
    this.hold += dt;
    this.paint();
    if (this.hold >= HOLD) {
      this.hold = 0;
      this.latched = true;
      this.show();
    }
  }

  contains(x, z) {
    this.root.getWorldPosition(this._world);
    this.root.getWorldScale(this._scale);
    const radius = RADIUS * Math.max(this._scale.x, this._scale.y);
    const dx = x - this._world.x;
    const dz = z - this._world.z;
    return dx * dx + dz * dz <= radius * radius;
  }

  show() {
    this.open = true;
    this.step = 0;
    this.panel.hidden = false;
    this.showStep(0);
    this.suspendInput(true);
    this.game.audio?.tone(520, 0.07, 'sine', 0.04);
  }

  showStep(index) {
    const step = Math.max(0, Math.min(STEPS.length - 1, index));
    this.step = step;
    const page = STEPS[step];
    this.kicker.textContent = `${step + 1} / ${STEPS.length}`;
    this.title.textContent = page.title;
    this.image.src = page.image;
    this.copy.textContent = page.text;
    this.back.disabled = step === 0;
    this.next.textContent = step === STEPS.length - 1 ? 'Done' : 'Next';
    this.dots.replaceChildren();
    for (let i = 0; i < STEPS.length; i += 1) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = i === step ? 'is-on' : '';
      dot.setAttribute('aria-label', `Step ${i + 1}`);
      dot.addEventListener('click', () => this.showStep(i));
      this.dots.append(dot);
    }
  }

  close() {
    this.open = false;
    this.panel.hidden = true;
    this.suspendInput(false);
  }

  suspendInput(active) {
    const input = this.game.input;
    if (!input || this.game.editor?.active || document.body.classList.contains('is-naming')) {
      return;
    }
    input.suspended = active === true;
    if (active) {
      input.keys.clear();
      input.joystick?.reset?.();
    }
  }

  paint() {
    const progress = Math.max(0, Math.min(1, this.hold / HOLD));
    const key = `${this.inside}|${progress.toFixed(3)}`;
    if (key === this.paintKey) {
      return;
    }
    this.paintKey = key;
    const ctx = this.ctx;
    const color = paletteHex(StorePalette.uiGold);
    ctx.clearRect(0, 0, 512, 512);
    ctx.beginPath();
    ctx.arc(256, 256, 228, 0, Math.PI * 2);
    ctx.fillStyle = this.inside
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
    ctx.font = '800 52px system-ui, sans-serif';
    ctx.fillText('TUTORIAL', 256, 236);
    ctx.font = '700 32px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText('STAND', 256, 292);
    this.texture.needsUpdate = true;
  }
}
