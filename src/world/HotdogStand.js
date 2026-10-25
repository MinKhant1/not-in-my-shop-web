import * as THREE from 'three';
import { createToonMaterialFromImported, getSharedToonGradientMap } from '../rendering/ToonMaterial.js';

const STAND_URL = '/models/outside/hotdog_stand.glb';
const SELLER_URL = '/models/characters/OldClassy_Male.glb';
const ROOT_POSITION_TRACKS = new Set(['Bone.position', 'CharacterArmature.position']);

// The cart file is Z-up. This pitch stands it up in Three's Y-up space.
const STAND_UPRIGHT = -Math.PI / 2;
// After that pitch, the sign side faces +Z. This yaw turns it toward the shop (+X).
const FACE_SHOP = Math.PI / 2;

const PERFORMANCES = [
  { name: 'Victory', weight: 1, once: true }
];

function withoutRootMotion(clip) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => !ROOT_POSITION_TRACKS.has(track.name));
  return copy;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function weightedPick(items, avoid) {
  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].name !== avoid) {
      total += items[i].weight;
    }
  }
  if (total <= 0) {
    return items[0] ?? null;
  }
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].name === avoid) {
      continue;
    }
    roll -= items[i].weight;
    if (roll <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

function prepareMesh(mesh, gradient) {
  const geometry = mesh.geometry;
  if (geometry && !geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  if (!gradient || !mesh.material) {
    return;
  }
  const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = sources.map((material) => createToonMaterialFromImported(material, gradient));
  mesh.material = Array.isArray(mesh.material) ? next : next[0];
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

function markEditable(root, id, collision) {
  root.name = id;
  root.userData.editorId = id;
  root.userData.editorRoot = true;
  root.userData.editorPersistent = true;
  root.userData.editorCollision = collision;
}

export class HotdogStand {
  constructor(scene, loader, collision, outside, config) {
    this.scene = scene;
    this.loader = loader;
    this.collision = collision;
    this.outside = outside;
    this.modelScale = config?.player?.modelScale ?? 0.36;
    this.useToon = config?.graphics?.toonShading === true;
    this.toonSteps = config?.graphics?.toonSteps ?? 4;
    this.stand = null;
    this.seller = null;
    this.mixer = null;
    this.actions = {};
    this.performances = [];
    this.current = null;
    this.currentName = '';
    this.currentOnce = false;
    this.until = 0;
    this.onFinished = (event) => {
      if (event.action !== this.current || this.currentName === 'Idle' || !this.currentOnce) {
        return;
      }
      this.returnToIdle();
    };
  }

  async load() {
    const gradient = this.useToon ? getSharedToonGradientMap(this.toonSteps) : null;
    const [standAsset, sellerAsset] = await Promise.all([
      this.loader.load(STAND_URL),
      this.loader.load(SELLER_URL)
    ]);

    const stand = new THREE.Group();
    markEditable(stand, 'hotdog-stand', true);
    const standModel = standAsset.scene;
    standModel.rotation.x = STAND_UPRIGHT;
    standModel.traverse((child) => {
      if (child.isMesh) {
        prepareMesh(child, gradient);
      }
    });
    stand.add(standModel);
    const standSize = plant(standModel);

    const seller = new THREE.Group();
    markEditable(seller, 'hotdog-seller', false);
    const sellerModel = sellerAsset.scene;
    sellerModel.traverse((child) => {
      if (child.isMesh) {
        prepareMesh(child, gradient);
      }
    });
    seller.add(sellerModel);
    plant(sellerModel);
    seller.scale.setScalar(this.modelScale);
    seller.rotation.y = FACE_SHOP;
    stand.rotation.y = FACE_SHOP;

    this.scene.add(stand);
    this.scene.add(seller);
    this.stand = stand;
    this.seller = seller;
    this.bindSeller(sellerModel, sellerAsset.animations);
    const standScale = this.scaleStandToSeller(standSize.y);
    stand.scale.setScalar(standScale);
    this.place(stand, seller, standSize.z * standScale);
    this.collision.addObject(stand, { id: 'hotdog-stand', group: 'outside' });
  }

  scaleStandToSeller(unscaledHeight) {
    if (!(unscaledHeight > 0) || !this.mixer) {
      return 0.28;
    }
    this.mixer.update(1 / 60);
    this.seller.updateWorldMatrix(true, true);
    let head = null;
    this.seller.traverse((child) => {
      if (!head && child.isBone && child.name === 'Head') {
        head = child;
      }
    });
    const posedHeight = head
      ? new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).y - this.seller.position.y
      : 0.8;
    return Math.max(0.2, (Math.max(posedHeight, 0.45) * 1.34) / unscaledHeight);
  }

  place(stand, seller, standDepth) {
    const layout = this.outside?.layout;
    const spotZ = -1;
    if (!layout) {
      stand.position.set(-9.95, 0.02, spotZ);
      seller.position.set(-10.7, 0.02, spotZ);
      return;
    }
    // Buildings sit just west of the sidewalk. Keep the seller on the pavement
    // and let the cart nose onto the curb so he has room to stand behind it.
    const buildingFront = layout.streetWest - 0.15;
    const sellerHalf = 0.24;
    const sellerX = buildingFront + sellerHalf + 0.08;
    const standX = sellerX + sellerHalf + 0.1 + standDepth * 0.5;
    stand.position.set(standX, 0.02, spotZ);
    seller.position.set(sellerX, 0.02, spotZ);
  }

  bindSeller(model, animations) {
    const byName = new Map(animations.map((clip) => [clip.name, clip]));
    const idleClip = byName.get('Idle');
    if (!idleClip) {
      return;
    }
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', this.onFinished);
    this.actions.Idle = this.mixer.clipAction(withoutRootMotion(idleClip));
    for (let i = 0; i < PERFORMANCES.length; i += 1) {
      const spec = PERFORMANCES[i];
      const clip = byName.get(spec.name);
      if (!clip) {
        continue;
      }
      const action = this.mixer.clipAction(withoutRootMotion(clip));
      if (spec.once) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[spec.name] = action;
      this.performances.push(spec);
    }
    this.play('Idle', false);
    this.until = randomBetween(2.8, 5.5);
  }

  play(name, once) {
    const next = this.actions[name];
    if (!next) {
      return;
    }
    const previous = this.current;
    next.enabled = true;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = Boolean(once);
    next.reset();
    next.setEffectiveWeight(1);
    if (previous && previous !== next) {
      next.crossFadeFrom(previous, 0.25, false);
    }
    next.play();
    this.current = next;
    this.currentName = name;
    this.currentOnce = Boolean(once);
  }

  playPerformance() {
    const choice = weightedPick(this.performances, this.lastPerformance);
    if (!choice || !this.actions[choice.name]) {
      this.until = randomBetween(3.2, 6.4);
      return;
    }
    this.lastPerformance = choice.name;
    this.play(choice.name, choice.once);
    if (choice.once) {
      const duration = this.actions[choice.name].getClip().duration;
      this.until = duration + 0.2;
      return;
    }
    this.until = randomBetween(choice.min, choice.max);
  }

  returnToIdle() {
    if (this.currentName !== 'Idle') {
      this.play('Idle', false);
    }
    this.until = randomBetween(3.2, 6.8);
  }

  update(dt) {
    if (!this.mixer || dt <= 0) {
      return;
    }
    this.mixer.update(dt);
    this.until -= dt;
    if (this.until > 0) {
      return;
    }
    if (this.currentName === 'Idle') {
      this.playPerformance();
      return;
    }
    this.returnToIdle();
  }
}
