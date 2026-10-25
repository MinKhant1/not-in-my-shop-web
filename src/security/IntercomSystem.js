import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { findSceneObject } from '../core/findSceneObject.js';
import { SECURITY_CAMERA_SPOTS } from './securityCameraSpots.js';

const WAVE_COLOR = 0xffca45;

// Countertop microphone on the cashier counter, plus a wall speaker to the right of each CCTV.
// Activation uses the same unlocked-section placement as the cameras and the existing thief flee path.
export class IntercomSystem {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.shoppers = options.shoppers;
    this.audio = options.audio ?? null;
    this.toonFactory = options.toonFactory ?? null;
    this.getUnlockedIndex = options.getUnlockedIndex;
    const config = options.config ?? {};
    this.cooldownDuration = config.cooldown > 0 ? config.cooldown : 60;
    this.iconUrl = config.icon || '/assets/ui/ability/intercom_ability_icon.webp';
    this.micUrl = config.micModel;
    this.speakerUrl = config.speakerModel;
    this.micScale = config.micScale ?? 0.58;
    this.micPosition = config.micPosition ?? [1.62, 0.42, 2.78];
    this.micRotation = config.micRotation ?? [0, Math.PI, 0];
    this.speakerScale = config.speakerScale ?? 0.72;
    this.speakerHeight = config.speakerHeight ?? 0.78;
    this.speakerRightOffset = config.speakerRightOffset ?? 1.05;
    this.speakerWallZ = config.speakerWallZ ?? -4.2;
    this.speakerBack = config.speakerBack ?? 0.186;
    this.pulseSeconds = config.pulseSeconds > 0 ? config.pulseSeconds : 1.2;
    this.noticeSeconds = config.noticeSeconds > 0 ? config.noticeSeconds : 1.7;
    this.cooldown = 0;
    this.pulse = 0;
    this.noticeLeft = 0;
    this.purchased = false;
    this.loading = false;
    this.ready = false;
    this.micTemplate = null;
    this.speakerTemplate = null;
    this.micRoot = null;
    this.speakers = [];
    this.ability = this.createAbility(options.app);
    this.onKeyDown = (event) => {
      if (event.repeat || (event.code !== 'KeyE' && event.code !== 'Space')) {
        return;
      }
      if (!this.purchased || this.ability.hidden || this.cooldown > 0) {
        return;
      }
      event.preventDefault();
      this.tryActivate();
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  activate() {
    this.purchased = true;
    if (this.ready) {
      this.showOwned();
      return;
    }
    this.load();
  }

  deactivate() {
    this.purchased = false;
    this.cooldown = 0;
    this.pulse = 0;
    this.noticeLeft = 0;
    this.ability.hidden = true;
    this.notice.hidden = true;
    if (this.micRoot) {
      this.micRoot.visible = false;
    }
    this.showSpeakers();
  }

  load() {
    if (this.loading || this.ready || !this.micUrl || !this.speakerUrl) {
      return;
    }
    this.loading = true;
    Promise.all([
      this.loader.load(this.micUrl),
      this.loader.load(this.speakerUrl)
    ]).then(([mic, speaker]) => {
      this.loading = false;
      this.micTemplate = mic.scene;
      this.speakerTemplate = speaker.scene;
      this.applyToon(this.micTemplate);
      this.applyToon(this.speakerTemplate);
      this.ready = true;
      if (this.purchased) {
        this.showOwned();
      }
    }).catch((error) => {
      this.loading = false;
      console.error('Failed to load intercom', error);
    });
  }

  createAbility(parent) {
    const button = document.createElement('button');
    button.id = 'intercom-ability';
    button.type = 'button';
    button.hidden = true;
    button.setAttribute('data-no-joystick', '');
    button.setAttribute('aria-label', 'Use intercom');
    const icon = document.createElement('img');
    icon.alt = '';
    icon.draggable = false;
    icon.src = this.iconUrl;
    const veil = document.createElement('span');
    veil.className = 'intercom-veil';
    veil.hidden = true;
    const time = document.createElement('span');
    time.className = 'intercom-time';
    time.hidden = true;
    button.append(icon, veil, time);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.tryActivate();
    });
    const notice = document.createElement('p');
    notice.id = 'intercom-notice';
    notice.hidden = true;
    notice.setAttribute('data-no-joystick', '');
    notice.textContent = 'INTERCOM ACTIVATED';
    parent.append(button, notice);
    this.veil = veil;
    this.time = time;
    this.notice = notice;
    return button;
  }

  showOwned() {
    if (!this.micRoot) {
      this.createMicrophone();
    }
    this.micRoot.visible = true;
    this.syncSpeakers();
    this.showSpeakers();
  }

  createMicrophone() {
    const root = new THREE.Group();
    root.name = 'intercom-mic';
    root.userData.editorIgnore = true;
    const model = SkeletonUtils.clone(this.micTemplate);
    model.name = 'intercom-mic-model';
    model.userData.editorIgnore = true;
    root.add(model);
    root.scale.setScalar(this.micScale);
    root.rotation.set(this.micRotation[0], this.micRotation[1], this.micRotation[2]);
    this.scene.add(root);
    this.micRoot = root;
    this.placeMicrophone();
  }

  // Sit the stand on the cashier counter, toward the checkout, not on the wall.
  // The checkout progress board is parented to the register and must not raise the stand.
  placeMicrophone() {
    const register = findSceneObject(this.scene, 'cash-register');
    const box = this.counterBounds(register);
    if (!register || !box || box.isEmpty()) {
      this.micRoot.position.set(this.micPosition[0], this.micPosition[1], this.micPosition[2]);
      return;
    }
    const width = box.max.x - box.min.x;
    const depth = box.max.z - box.min.z;
    const height = box.max.y - box.min.y;
    this.micRoot.position.set(
      box.min.x + width * 0.24,
      box.min.y + height * 0.6,
      box.max.z - depth * 0.28
    );
  }

  counterBounds(register) {
    if (!register) {
      return null;
    }
    register.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const childBox = new THREE.Box3();
    register.traverse((child) => {
      if (!child.isMesh || !child.geometry) {
        return;
      }
      let parent = child.parent;
      while (parent && parent !== register) {
        if (parent.name === 'CheckoutProgressUI') {
          return;
        }
        parent = parent.parent;
      }
      childBox.setFromObject(child);
      box.union(childBox);
    });
    return box;
  }

  syncSpeakers() {
    if (!this.purchased || !this.ready) {
      return;
    }
    const unlocked = this.getUnlockedIndex?.() ?? 0;
    for (let i = 0; i < SECURITY_CAMERA_SPOTS.length; i += 1) {
      const spot = SECURITY_CAMERA_SPOTS[i];
      if (unlocked < spot.requiredSection - 1) {
        continue;
      }
      if (this.speakers.some((speaker) => speaker.id === spot.id)) {
        continue;
      }
      this.speakers.push(this.createSpeaker(spot));
    }
    this.showSpeakers();
  }

  createSpeaker(spot) {
    const root = new THREE.Group();
    root.name = `intercom-speaker-${spot.id}`;
    root.userData.editorIgnore = true;
    const scale = this.speakerScale;
    root.position.set(
      spot.position.x + this.speakerRightOffset,
      this.speakerHeight,
      this.speakerWallZ + this.speakerBack * scale
    );
    root.scale.setScalar(scale);
    const model = SkeletonUtils.clone(this.speakerTemplate);
    model.name = 'intercom-speaker-model';
    model.userData.editorIgnore = true;
    root.add(model);
    this.scene.add(root);

    const waves = new THREE.Group();
    waves.name = `intercom-waves-${spot.id}`;
    waves.userData.editorIgnore = true;
    waves.position.set(root.position.x, root.position.y, root.position.z + 0.16);
    const rings = [];
    for (let i = 0; i < 2; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.12, 20),
        new THREE.MeshBasicMaterial({
          color: WAVE_COLOR,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      ring.name = `intercom-wave-${spot.id}-${i}`;
      ring.userData.editorIgnore = true;
      ring.visible = false;
      ring.renderOrder = 3;
      waves.add(ring);
      rings.push(ring);
    }
    this.scene.add(waves);
    return { id: spot.id, root, waves, rings, baseScale: scale };
  }

  showSpeakers() {
    const unlocked = this.getUnlockedIndex?.() ?? 0;
    for (let i = 0; i < this.speakers.length; i += 1) {
      const speaker = this.speakers[i];
      const spot = SECURITY_CAMERA_SPOTS.find((entry) => entry.id === speaker.id);
      const open = Boolean(spot) && unlocked >= spot.requiredSection - 1;
      const shown = this.purchased === true && open;
      speaker.root.visible = shown;
      speaker.waves.visible = shown;
    }
  }

  update(dt, playing) {
    if (!this.purchased || !playing) {
      this.ability.hidden = true;
      if (!playing) {
        return;
      }
    }
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }
    this.updatePulse(dt);
    this.updateNotice(dt);
    this.refreshAbility(playing);
  }

  updatePulse(dt) {
    if (this.pulse <= 0) {
      return;
    }
    this.pulse = Math.max(0, this.pulse - dt);
    const elapsed = this.pulseSeconds - this.pulse;
    const speakerPulse = this.pulse > 0 ? 1 + Math.sin(elapsed * 18) * 0.06 : 1;
    for (let i = 0; i < this.speakers.length; i += 1) {
      const speaker = this.speakers[i];
      speaker.root.scale.setScalar(speaker.baseScale * speakerPulse);
      for (let ringIndex = 0; ringIndex < speaker.rings.length; ringIndex += 1) {
        const ring = speaker.rings[ringIndex];
        if (this.pulse <= 0) {
          ring.visible = false;
          ring.material.opacity = 0;
          continue;
        }
        const local = (elapsed / this.pulseSeconds + ringIndex * 0.42) % 1;
        const size = 1 + local * 2.4;
        ring.visible = true;
        ring.scale.setScalar(size);
        ring.material.opacity = (1 - local) * 0.7;
      }
    }
  }

  updateNotice(dt) {
    if (this.noticeLeft <= 0) {
      return;
    }
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
    this.notice.hidden = this.noticeLeft <= 0;
  }

  refreshAbility(playing) {
    const shown = this.purchased === true && playing === true;
    this.ability.hidden = !shown;
    if (!shown) {
      return;
    }
    const cooling = this.cooldown > 0;
    this.ability.classList.toggle('is-cooling', cooling);
    this.veil.hidden = !cooling;
    this.time.hidden = !cooling;
    if (!cooling) {
      return;
    }
    const fraction = Math.min(1, this.cooldown / this.cooldownDuration);
    this.veil.style.setProperty('--remaining', String(fraction));
    this.time.textContent = String(Math.ceil(this.cooldown));
  }

  tryActivate() {
    if (!this.purchased || !this.ready || this.cooldown > 0) {
      return false;
    }
    this.cooldown = this.cooldownDuration;
    this.shoppers?.fleeThieves?.();
    this.audio?.announce();
    this.pulse = this.pulseSeconds;
    this.noticeLeft = this.noticeSeconds;
    this.notice.hidden = false;
    this.refreshAbility(true);
    return true;
  }

  resetCooldown() {
    this.cooldown = 0;
    this.refreshAbility(!this.ability.hidden);
  }

  describe() {
    const left = this.cooldown > 0 ? `${Math.ceil(this.cooldown)}s` : 'ready';
    return `Intercom ${left} speakers ${this.speakers.length}`;
  }

  applyToon(root) {
    if (!this.toonFactory) {
      return;
    }
    root.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      const geometry = child.geometry;
      if (geometry && !geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }
      const sources = Array.isArray(child.material) ? child.material : [child.material];
      const next = sources.map((source) => this.toonFactory.fromImported(source));
      child.material = Array.isArray(child.material) ? next : next[0];
    });
  }
}
