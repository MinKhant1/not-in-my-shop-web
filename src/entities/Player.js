import * as THREE from 'three';

const PLAYER_MODEL = '/models/characters/Casual_Male.gltf';
const ROOT_POSITION_TRACKS = new Set([
  'Bone.position',
  'CharacterArmature.position'
]);
const FADE_SECONDS = 0.18;
const TURN_RESPONSE = 12;

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
    this.debug = config.debug;

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
    this.actions = { idle: null, walk: null };
    this.currentAction = null;
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
    this.setupAnimations(model, clips);

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

  setupAnimations(model, clips) {
    if (clips.length === 0) {
      return;
    }

    const idleClip = findIdleClip(clips);
    const walkClip = findWalkClip(clips);
    if (!idleClip && !walkClip) {
      return;
    }

    this.mixer = new THREE.AnimationMixer(model);
    if (idleClip) {
      this.actions.idle = this.mixer.clipAction(withoutRootMotion(idleClip));
    }
    if (walkClip) {
      this.actions.walk = this.mixer.clipAction(withoutRootMotion(walkClip));
    }

    const starting = this.actions.idle ?? this.actions.walk;
    starting.play();
    this.currentAction = this.actions.idle ? 'idle' : 'walk';
  }

  update(dt) {
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

  updateAnimation(moving, dt) {
    if (!this.mixer) {
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
