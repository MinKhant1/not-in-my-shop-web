import * as THREE from 'three';
import { createToonMaterialFromImported, getSharedToonGradientMap } from '../rendering/ToonMaterial.js';

const CAT_URL = '/models/outside/cat.glb';
const DOG_URL = '/models/outside/dog.glb';

const CAT_HEIGHT = 0.32;
const DOG_HEIGHT = 0.46;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function dampAngle(current, target, dt, speed) {
  let delta = target - current;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  const step = speed * dt;
  if (Math.abs(delta) <= step) {
    return target;
  }
  return current + Math.sign(delta) * step;
}

function plant(model) {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.x -= (box.min.x + box.max.x) * 0.5;
  model.position.z -= (box.min.z + box.max.z) * 0.5;
  model.position.y -= box.min.y;
  return size;
}

const LOCOMOTION = ['iddle', 'walk', 'run'];

function skinnedMesh(root) {
  let mesh = null;
  root.traverse((child) => {
    if (!mesh && child.isSkinnedMesh) {
      mesh = child;
    }
  });
  return mesh;
}

function boneDepth(bone, cache) {
  const known = cache.get(bone);
  if (known !== undefined) {
    return known;
  }
  const depth = bone.parent?.isBone ? boneDepth(bone.parent, cache) + 1 : 0;
  cache.set(bone, depth);
  return depth;
}

function rotationTracks(clip) {
  const tracks = new Map();
  for (let i = 0; i < clip.tracks.length; i += 1) {
    const track = clip.tracks[i];
    if (!track.name.endsWith('.quaternion')) {
      continue;
    }
    tracks.set(track.name.slice(0, -'.quaternion'.length), track);
  }
  return tracks;
}

function retargetFlatClip(clip, dogRest, catBones) {
  const tracks = rotationTracks(clip);
  const times = tracks.values().next().value?.times;
  if (!times) {
    return new THREE.AnimationClip(clip.name, clip.duration, []);
  }
  const depth = new Map();
  const ordered = [...catBones].sort((a, b) => boneDepth(a, depth) - boneDepth(b, depth));
  const values = new Map();
  for (let i = 0; i < ordered.length; i += 1) {
    if (tracks.has(ordered[i].name)) {
      values.set(ordered[i].name, new Float32Array(times.length * 4));
    }
  }
  const animated = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const desiredWorld = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const parentWorld = new Map();
  for (let frame = 0; frame < times.length; frame += 1) {
    parentWorld.clear();
    for (let i = 0; i < ordered.length; i += 1) {
      const bone = ordered[i];
      const rest = bone.userData.restWorld;
      const dogTrack = tracks.get(bone.name);
      const dogBase = dogRest.get(bone.name);
      if (rest && dogTrack && dogBase && frame < dogTrack.times.length) {
        animated.fromArray(dogTrack.values, frame * 4);
        delta.copy(dogBase).invert().multiply(animated);
        desiredWorld.copy(rest).multiply(delta);
      } else if (rest) {
        desiredWorld.copy(rest);
      } else {
        continue;
      }
      const parent = bone.parent?.isBone
        ? (parentWorld.get(bone.parent.name) || bone.userData.restParent)
        : bone.userData.restParent;
      local.copy(parent).invert().multiply(desiredWorld);
      const output = values.get(bone.name);
      if (output) {
        local.toArray(output, frame * 4);
      }
      parentWorld.set(bone.name, desiredWorld.clone());
    }
  }
  const baked = [];
  values.forEach((frameValues, name) => {
    baked.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times.slice(), frameValues));
  });
  return new THREE.AnimationClip(clip.name, clip.duration, baked);
}

function retargetDogClips(catModel, dogModel, animations) {
  const dogMesh = skinnedMesh(dogModel);
  const catMesh = skinnedMesh(catModel);
  const clips = {};
  if (!dogMesh || !catMesh) {
    return clips;
  }
  dogMesh.skeleton.pose();
  catMesh.skeleton.pose();
  catModel.updateMatrixWorld(true);
  const dogRest = new Map();
  for (let i = 0; i < dogMesh.skeleton.bones.length; i += 1) {
    const bone = dogMesh.skeleton.bones[i];
    dogRest.set(bone.name, bone.quaternion.clone());
  }
  const catBones = catMesh.skeleton.bones;
  for (let i = 0; i < catBones.length; i += 1) {
    const bone = catBones[i];
    bone.userData.restWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    const restLocal = bone.quaternion.clone();
    bone.userData.restParent = bone.userData.restWorld.clone().multiply(restLocal.invert());
  }
  for (let i = 0; i < animations.length; i += 1) {
    const source = animations[i];
    if (!LOCOMOTION.includes(source.name)) {
      continue;
    }
    clips[source.name] = retargetFlatClip(source, dogRest, catBones);
  }
  return clips;
}

function prepareModel(model, gradient) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.castShadow = false;
    child.receiveShadow = false;
    if (!gradient || !child.material) {
      return;
    }
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((material) => createToonMaterialFromImported(material, gradient));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

export class StreetPets {
  constructor(scene, loader, collision, outside, config) {
    this.scene = scene;
    this.loader = loader;
    this.collision = collision;
    this.outside = outside;
    this.useToon = config?.graphics?.toonShading === true;
    this.toonSteps = config?.graphics?.toonSteps ?? 4;
    this.cat = null;
    this.dog = null;
    this.area = null;
  }

  async load() {
    const gradient = this.useToon ? getSharedToonGradientMap(this.toonSteps) : null;
    const [catAsset, dogAsset] = await Promise.all([
      this.loader.load(CAT_URL),
      this.loader.load(DOG_URL)
    ]);
    this.area = this.readArea();
    const catClips = retargetDogClips(catAsset.scene, dogAsset.scene, dogAsset.animations);
    this.cat = this.createPet('pet-cat', catAsset, CAT_HEIGHT, {
      wander: 0.42,
      flee: 1.25,
      radius: 0.16,
      arrive: 0.28
    });
    this.dog = this.createPet('pet-dog', dogAsset, DOG_HEIGHT, {
      wander: 0.55,
      chase: 1.45,
      radius: 0.24,
      arrive: 0.45,
      faceOffset: Math.PI
    });
    prepareModel(this.cat.model, gradient);
    prepareModel(this.dog.model, gradient);
    this.bindClips(this.cat, catClips, this.cat.model);
    this.bindClips(this.dog, Object.fromEntries(dogAsset.animations.map((clip) => [clip.name, clip])), this.dog.model);
    this.placeStart();
    this.beginWander(this.cat, randomBetween(0.4, 1.4));
    this.beginWander(this.dog, randomBetween(0.8, 2.2));
    this.dog.chaseCooldown = randomBetween(4, 8);
  }

  createPet(name, asset, height, speeds) {
    const group = new THREE.Group();
    group.name = name;
    group.userData.editorIgnore = true;
    const pivot = new THREE.Group();
    const model = asset.scene;
    const size = plant(model);
    const scale = height / Math.max(size.y, 0.05);
    pivot.add(model);
    group.add(pivot);
    group.scale.setScalar(scale);
    group.rotation.y = speeds.faceOffset || 0;
    this.scene.add(group);
    return {
      name,
      group,
      pivot,
      model,
      ...speeds,
      state: 'idle',
      goalX: 0,
      goalZ: 0,
      yaw: 0,
      timer: 0,
      stuck: 0,
      phase: Math.random() * Math.PI * 2,
      moving: false,
      chaseCooldown: 0,
      actions: null,
      clip: ''
    };
  }

  bindClips(pet, clips, mixerRoot) {
    if (!mixerRoot) {
      return;
    }
    const mixer = new THREE.AnimationMixer(mixerRoot);
    const actions = {};
    for (let i = 0; i < LOCOMOTION.length; i += 1) {
      const name = LOCOMOTION[i];
      const clip = clips[name];
      if (!clip) {
        continue;
      }
      const action = mixer.clipAction(clip);
      action.enabled = name === 'iddle';
      action.setEffectiveWeight(name === 'iddle' ? 1 : 0);
      if (name === 'iddle') {
        action.play();
      }
      actions[name] = action;
    }
    pet.mixer = mixer;
    pet.actions = actions;
    pet.clip = 'iddle';
    pet.current = actions.iddle ?? null;
  }

  readArea() {
    const layout = this.outside?.layout;
    if (!layout) {
      return { minX: -10.4, maxX: -4.3, minZ: -6, maxZ: 6 };
    }
    return {
      minX: layout.streetWest + 0.32,
      maxX: -4.15,
      minZ: layout.minZ + 0.7,
      maxZ: layout.maxZ - 0.7
    };
  }

  placeStart() {
    const area = this.area;
    const catZ = (area.minZ + area.maxZ) * 0.5;
    this.cat.group.position.set(area.maxX - 0.7, 0.02, catZ);
    this.dog.group.position.set((area.minX + area.maxX) * 0.5, 0.02, catZ + 2.4);
    this.cat.goalX = this.cat.group.position.x;
    this.cat.goalZ = this.cat.group.position.z;
    this.dog.goalX = this.dog.group.position.x;
    this.dog.goalZ = this.dog.group.position.z;
  }

  update(dt) {
    if (!this.cat || !this.dog || dt <= 0) {
      return;
    }
    this.updateDog(dt);
    this.updateCat(dt);
    this.cat.mixer?.update(dt);
    this.dog.mixer?.update(dt);
  }

  updateDog(dt) {
    const dog = this.dog;
    dog.chaseCooldown = Math.max(0, dog.chaseCooldown - dt);
    if (dog.state === 'chase') {
      dog.goalX = this.cat.group.position.x;
      dog.goalZ = this.cat.group.position.z;
      dog.speed = dog.chase;
      dog.timer -= dt;
      const caught = this.distance(dog, this.cat) < 0.72;
      if (caught || dog.timer <= 0) {
        this.endChase(caught);
      }
    } else {
      dog.timer -= dt;
      if (dog.timer <= 0) {
        if (dog.chaseCooldown <= 0 && Math.random() < 0.55) {
          this.startChase();
        } else if (dog.state === 'idle') {
          this.beginWander(dog, 0);
        } else {
          this.beginIdle(dog);
        }
      }
    }
    const arrived = this.move(dog, dt);
    if (arrived === true && dog.state === 'wander') {
      this.beginIdle(dog);
    }
    this.playClip(dog, dog.state === 'chase' ? 'run' : dog.moving ? 'walk' : 'iddle');
  }

  updateCat(dt) {
    const cat = this.cat;
    const dog = this.dog;
    const chased = dog.state === 'chase' && this.distance(cat, dog) < 4.2;
    if (chased) {
      cat.state = 'flee';
      cat.speed = cat.flee;
      cat.timer -= dt;
      if (cat.timer <= 0) {
        this.aimAway(cat, dog);
        cat.timer = randomBetween(0.35, 0.7);
      }
    } else if (cat.state === 'flee') {
      this.beginWander(cat, 0);
    } else {
      cat.timer -= dt;
      if (cat.timer <= 0) {
        if (cat.state === 'idle') {
          this.beginWander(cat, 0);
        } else {
          this.beginIdle(cat);
        }
      }
    }
    const arrived = this.move(cat, dt);
    if (arrived === true && cat.state === 'wander') {
      this.beginIdle(cat);
    }
    this.playClip(cat, cat.state === 'flee' ? 'run' : cat.moving ? 'walk' : 'iddle');
  }

  startChase() {
    const dog = this.dog;
    dog.state = 'chase';
    dog.speed = dog.chase;
    dog.timer = randomBetween(4.5, 7.5);
    dog.stuck = 0;
    dog.arrive = 0.55;
  }

  endChase(caught) {
    const dog = this.dog;
    dog.chaseCooldown = randomBetween(caught ? 7 : 5, caught ? 14 : 11);
    this.beginIdle(dog);
    dog.timer = randomBetween(1.1, 2.1);
    this.aimAway(this.cat, dog);
    this.cat.state = 'flee';
    this.cat.speed = this.cat.flee;
    this.cat.timer = randomBetween(0.8, 1.4);
  }

  beginIdle(pet) {
    pet.state = 'idle';
    pet.speed = 0;
    pet.timer = randomBetween(1.4, 3.2);
    pet.stuck = 0;
  }

  beginWander(pet, delay) {
    const point = this.freePoint(pet.radius);
    pet.state = 'wander';
    pet.speed = pet.wander;
    pet.goalX = point.x;
    pet.goalZ = point.z;
    pet.timer = delay > 0 ? delay : randomBetween(6, 11);
    pet.stuck = 0;
    pet.arrive = pet.name === 'pet-dog' ? 0.45 : 0.28;
  }

  aimAway(cat, dog) {
    const dx = cat.group.position.x - dog.group.position.x;
    const dz = cat.group.position.z - dog.group.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const options = [
      [dx / len, dz / len],
      [-dz / len, dx / len],
      [dz / len, -dx / len]
    ];
    let best = null;
    let bestDist = -1;
    for (let i = 0; i < options.length; i += 1) {
      const point = this.clamp(
        cat.group.position.x + options[i][0] * 3.4,
        cat.group.position.z + options[i][1] * 3.4
      );
      const dist = Math.hypot(point.x - dog.group.position.x, point.z - dog.group.position.z);
      if (dist > bestDist && this.canStand(point.x, point.z, cat.radius)) {
        best = point;
        bestDist = dist;
      }
    }
    const point = best ?? this.freePoint(cat.radius);
    cat.goalX = point.x;
    cat.goalZ = point.z;
  }

  move(pet, dt) {
    if (pet.state === 'idle' || pet.speed <= 0) {
      pet.moving = false;
      return false;
    }
    const dx = pet.goalX - pet.group.position.x;
    const dz = pet.goalZ - pet.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= pet.arrive) {
      pet.moving = false;
      pet.stuck = 0;
      return true;
    }
    const nx = dx / dist;
    const nz = dz / dist;
    const step = Math.min(dist, pet.speed * dt);
    const x = pet.group.position.x;
    const z = pet.group.position.z;
    let moved = false;
    if (this.canStand(x + nx * step, z + nz * step, pet.radius)) {
      pet.group.position.x = x + nx * step;
      pet.group.position.z = z + nz * step;
      moved = true;
    } else if (this.canStand(x + nx * step, z, pet.radius)) {
      pet.group.position.x = x + nx * step;
      moved = true;
    } else if (this.canStand(x, z + nz * step, pet.radius)) {
      pet.group.position.z = z + nz * step;
      moved = true;
    }
    if (!moved) {
      pet.moving = false;
      pet.stuck += dt;
      if (pet.stuck > 0.45 && pet.state !== 'chase') {
        this.beginWander(pet, 0);
      }
      return false;
    }
    pet.stuck = 0;
    pet.moving = true;
    const face = Math.atan2(pet.group.position.x - x, pet.group.position.z - z);
    pet.yaw = dampAngle(pet.yaw, face, dt, pet.state === 'chase' || pet.state === 'flee' ? 8 : 5);
    pet.group.rotation.y = pet.yaw + (pet.faceOffset || 0);
    return false;
  }

  playClip(pet, name) {
    const next = pet.actions?.[name];
    if (!next || pet.clip === name) {
      return;
    }
    const previous = pet.current;
    next.enabled = true;
    next.reset();
    next.setEffectiveWeight(1);
    if (previous && previous !== next) {
      next.crossFadeFrom(previous, 0.18, false);
    }
    next.play();
    pet.current = next;
    pet.clip = name;
  }

  distance(a, b) {
    return Math.hypot(a.group.position.x - b.group.position.x, a.group.position.z - b.group.position.z);
  }

  canStand(x, z, radius) {
    const area = this.area;
    if (x < area.minX + radius || x > area.maxX - radius || z < area.minZ + radius || z > area.maxZ - radius) {
      return false;
    }
    return !this.collision.blocksMovement(x, z, radius);
  }

  clamp(x, z) {
    const area = this.area;
    return {
      x: Math.min(area.maxX - 0.2, Math.max(area.minX + 0.2, x)),
      z: Math.min(area.maxZ - 0.2, Math.max(area.minZ + 0.2, z))
    };
  }

  freePoint(radius) {
    const area = this.area;
    for (let i = 0; i < 8; i += 1) {
      const point = {
        x: randomBetween(area.minX + 0.3, area.maxX - 0.3),
        z: randomBetween(area.minZ + 0.3, area.maxZ - 0.3)
      };
      if (this.canStand(point.x, point.z, radius)) {
        return point;
      }
    }
    return this.clamp((area.minX + area.maxX) * 0.5, (area.minZ + area.maxZ) * 0.5);
  }
}
