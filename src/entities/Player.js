import * as THREE from 'three';
import { ToonMaterialFactory } from '../rendering/ToonMaterial.js';
import { WeaponId } from '../player/PlayerActivity.js';

const PLAYER_MODEL = '/models/characters/Casual_Male.gltf';
const ROOT_POSITION_TRACKS = new Set([
  'Bone.position',
  'CharacterArmature.position'
]);
const FADE_SECONDS = 0.18;
const TURN_RESPONSE = 12;
const RIGHT_HAND_BONE_NAMES = [
  'RightHand',
  'Hand_R',
  'mixamorigRightHand',
  'Right_Hand',
  'hand.R',
  'Fist.R',
  'FistR',
  'Hand.R',
  'HandR'
];

function sanitizeBoneName(name) {
  return name.replace(/\s/g, '_').replace(/\./g, '');
}

function findClip(clips, name) {
  const needle = name.toLowerCase();
  return clips.find((clip) => clip.name.toLowerCase() === needle) ?? null;
}

function findIdleClip(clips) {
  return findClip(clips, 'idle')
    ?? clips.find((clip) => clip.name.toLowerCase().includes('idle'))
    ?? null;
}

function findWalkClip(clips) {
  return findClip(clips, 'walk')
    ?? findClip(clips, 'walking')
    ?? clips.find((clip) => {
      const name = clip.name.toLowerCase();
      return name.includes('walk') && !name.includes('carry');
    })
    ?? null;
}

function addAxes(parent, name, size) {
  const axes = new THREE.AxesHelper(size);
  axes.name = name;
  axes.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      material.depthTest = false;
      material.transparent = true;
    }
    child.renderOrder = 30;
  });
  parent.add(axes);
}

function withoutRootMotion(clip) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => !ROOT_POSITION_TRACKS.has(track.name));
  return copy;
}

export class Player {
  constructor(loader, input, collision, config) {
    this.loader = loader;
    this.input = input;
    this.collision = collision;
    this.config = config.player;
    this.weaponsConfig = config.weapons;
    this.debug = config.debug;
    this.toonPlayer = config.graphics?.toonPlayer === true;
    this.toonSteps = config.graphics?.toonSteps ?? 4;
    this.toonFactory = null;
    this.materialSlots = [];

    this.speed = this.config.speed;
    this.collisionRadius = this.config.collisionRadius;

    this.group = new THREE.Group();
    this.group.name = 'player';
    this.visual = new THREE.Group();
    this.visual.name = 'player-visual';
    this.group.add(this.visual);

    const [x, , z] = this.config.startPosition;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.PI;

    this.mixer = null;
    this.actions = { idle: null, walk: null, attack: null };
    this.currentAction = null;
    this.attacking = false;
    this.attackClipDuration = 0;
    this.currentWeapon = WeaponId.NONE;
    this.hasBroomEquipped = false;
    this.movementLocked = false;
    this.weaponSocket = null;
    this.handBone = null;
    this._box = new THREE.Box3();
    this._size = new THREE.Vector3();
  }

  get position() {
    return this.group.position;
  }

  async load() {
    const asset = await this.loader.load(PLAYER_MODEL);
    const model = asset.scene;
    model.name = 'Casual_Male';
    this.model = model;
    this.visual.add(model);
    this.visual.scale.setScalar(this.config.modelScale);
    this.visual.rotation.y = this.config.modelRotationOffset;
    this.visual.position.y = this.config.modelYOffset;

    const clips = asset.animations ?? [];
    console.log('Casual_Male animations:', clips.map((clip) => clip.name));
    this.prepareMaterials(model);
    this.setupAnimations(model, clips);
    this.createWeaponSocket();

    if (this.debug) {
      this._box.setFromObject(this.visual);
      this._box.getSize(this._size);
      console.log('Casual_Male visual bounds:', {
        size: {
          x: Number(this._size.x.toFixed(3)),
          y: Number(this._size.y.toFixed(3)),
          z: Number(this._size.z.toFixed(3))
        },
        minY: Number(this._box.min.y.toFixed(3)),
        maxY: Number(this._box.max.y.toFixed(3))
      });
    }
  }

  prepareMaterials(model) {
    this.toonFactory = new ToonMaterialFactory(this.toonSteps);
    this.materialSlots = [];

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const multiple = Array.isArray(child.material);
      const sources = multiple ? child.material.slice() : [child.material];
      const toon = sources.map((source) => this.toonFactory.fromImported(source));
      this.materialSlots.push({
        mesh: child,
        original: sources,
        toon,
        multiple
      });

      if (!this.debug) {
        return;
      }

      sources.forEach((source, index) => {
        const meshName = child.name || '(unnamed)';
        const suffix = sources.length > 1 ? ` [${index}]` : '';
        console.log(`Player mesh: ${meshName}${suffix}`);
        console.log(`SkinnedMesh: ${Boolean(child.isSkinnedMesh)}`);
        console.log(`Original material: ${source && source.name ? source.name : '(unnamed)'}`);
        console.log(`Texture: ${Boolean(source && source.map)}`);
        console.log(`Converted to toon: ${this.toonPlayer}`);
      });
    });

    this.applyPlayerMaterials();
  }

  applyPlayerMaterials() {
    for (let i = 0; i < this.materialSlots.length; i += 1) {
      const slot = this.materialSlots[i];
      const chosen = this.toonPlayer ? slot.toon : slot.original;
      slot.mesh.material = slot.multiple ? chosen : chosen[0];
    }
  }

  setToonPlayer(enabled) {
    this.toonPlayer = enabled === true;
    this.applyPlayerMaterials();
  }

  setupAnimations(model, clips) {
    if (clips.length === 0) {
      return;
    }

    const idleClip = findIdleClip(clips);
    const walkClip = findWalkClip(clips);
    const attackClip = findClip(clips, 'SwordSlash') ?? findClip(clips, 'Punch');
    if (!idleClip && !walkClip && !attackClip) {
      return;
    }

    this.mixer = new THREE.AnimationMixer(model);
    if (idleClip) {
      this.actions.idle = this.mixer.clipAction(withoutRootMotion(idleClip));
    }
    if (walkClip) {
      this.actions.walk = this.mixer.clipAction(withoutRootMotion(walkClip));
    }
    if (attackClip) {
      const action = this.mixer.clipAction(withoutRootMotion(attackClip));
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.attack = action;
      this.attackClipDuration = action.getClip().duration;
    }

    const starting = this.actions.idle ?? this.actions.walk;
    starting.play();
    this.currentAction = this.actions.idle ? 'idle' : 'walk';
  }

  update(dt) {
    if (this.movementLocked) {
      this.group.position.y = 0;
      this.updateAnimation(false, dt);
      return;
    }
    const input = this.input.getMovementVector();
    const dx = input.x;
    const dz = -input.y;
    const moving = dx * dx + dz * dz > 0.0001;

    if (moving) {
      const step = this.speed * dt;
      const moveX = dx * step;
      const moveZ = dz * step;
      const radius = this.collisionRadius;
      const position = this.group.position;
      const nextX = position.x + moveX;

      if (!this.collision.blocksMovement(nextX, position.z, radius)) {
        position.x = nextX;
      }

      const nextZ = position.z + moveZ;
      if (!this.collision.blocksMovement(position.x, nextZ, radius)) {
        position.z = nextZ;
      }

      const targetYaw = Math.atan2(dx, dz);
      const currentYaw = this.group.rotation.y;
      const deltaYaw = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
      this.group.rotation.y = currentYaw + deltaYaw * (1 - Math.exp(-TURN_RESPONSE * dt));
    }

    this.group.position.y = 0;
    this.updateAnimation(moving, dt);
  }

  createWeaponSocket() {
    const boneNames = [];
    this.model.traverse((child) => {
      if (child.isBone) {
        boneNames.push(child.name);
      }
    });
    console.log('Player skeleton bones:', boneNames.join(', '));

    const bonesByName = new Map();
    this.model.traverse((child) => {
      if (child.isBone) {
        bonesByName.set(child.name, child);
        bonesByName.set(sanitizeBoneName(child.name), child);
      }
    });

    let hand = null;
    for (const name of RIGHT_HAND_BONE_NAMES) {
      const found = bonesByName.get(name) ?? bonesByName.get(sanitizeBoneName(name));
      if (found) {
        hand = found;
        break;
      }
    }

    const socket = new THREE.Group();
    socket.name = 'RightHandWeaponSocket';
    this.weaponSocket = socket;

    if (!hand) {
      console.error('Right-hand bone not found. Broom socket was not attached to the player root.', boneNames);
      return;
    }

    hand.add(socket);
    this.handBone = hand;
    console.log('Right-hand bone:', hand.name, 'parent:', hand.parent?.name ?? 'none');

    if (this.weaponsConfig?.debugBroomGrip) {
      addAxes(hand, 'RightHandBoneAxes', 1.15);
      addAxes(socket, 'RightHandWeaponSocketAxes', 0.72);
    }
  }

  playAttack(timeScale) {
    if (!this.actions.attack) {
      return false;
    }
    this.attacking = true;
    const action = this.actions.attack;
    action.setEffectiveTimeScale(timeScale > 0 ? timeScale : 1);
    action.reset().fadeIn(0.05).play();
    if (this.currentAction && this.currentAction !== 'attack' && this.actions[this.currentAction]) {
      this.actions[this.currentAction].fadeOut(0.05);
    }
    this.currentAction = 'attack';
    return true;
  }

  endAttack() {
    this.attacking = false;
  }

  updateAnimation(moving, dt) {
    if (!this.mixer) {
      return;
    }

    if (this.attacking) {
      this.mixer.update(dt);
      return;
    }

    let next = null;
    if (moving && this.actions.walk) {
      next = 'walk';
    } else if (this.actions.idle) {
      next = 'idle';
    }

    if (next && next !== this.currentAction) {
      const action = this.actions[next];
      action.reset().fadeIn(FADE_SECONDS).play();
      if (this.currentAction && this.actions[this.currentAction]) {
        this.actions[this.currentAction].fadeOut(FADE_SECONDS);
      }
      this.currentAction = next;
    }

    this.mixer.update(dt);
  }
}
