import * as THREE from 'three';
import { createToonMaterialFromImported } from '../rendering/ToonMaterial.js';
import { placeBristleAnchor } from './bristleAnchor.js';
import { FlamingBroomVFX } from './FlamingBroomVFX.js';

function applyStationPose(object, offset, rotation, scale) {
  object.position.set(offset[0], offset[1], offset[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  object.scale.setScalar(scale);
}

function exposeLines(object) {
  object.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      material.depthTest = false;
      material.transparent = true;
    }
    child.renderOrder = 31;
  });
}

export class BroomWeapon {
  constructor(config) {
    this.config = config;
    this.holder = new THREE.Group();
    this.holder.name = 'broom-holder';
    this.pivot = new THREE.Group();
    this.pivot.name = 'broom-swing';
    this.holder.add(this.pivot);
    this.model = null;
    this.modelUrl = '';
    this.loader = null;
    this.toonFactory = null;
    this.scene = null;
    this.flameAnchor = null;
    this.flames = null;
    this.flamesOn = false;
    this.equipped = false;
    this.swingTime = -1;
    this.hitSent = false;
  }

  async load(loader, toonFactory) {
    this.loader = loader;
    this.toonFactory = toonFactory;
    await this.useModel(this.config.model);
    if (this.config.debugBroomGrip) {
      const origin = new THREE.AxesHelper(1.35);
      origin.name = 'broom-origin';
      this.holder.add(origin);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2bd6, depthTest: false, transparent: true })
      );
      marker.name = 'broom-origin-marker';
      this.holder.add(marker);
      exposeLines(origin);
      exposeLines(marker);
    }
  }

  async useModel(url) {
    if (!url || (url === this.modelUrl && this.model)) {
      return;
    }
    const asset = await this.loader.load(url);
    const model = asset.scene;
    model.name = 'broom';
    applyBroomMaterials(model, this.toonFactory);
    if (this.model) {
      this.pivot.remove(this.model);
      releaseBroomMaterials(this.model);
    }
    this.model = model;
    this.modelUrl = url;
    this.pivot.add(model);
    this.attachFlameAnchor();
    if (this.equipped) {
      this.syncEquipPose();
    } else {
      this.model.position.set(0, 0, 0);
    }
  }

  attachFlameAnchor() {
    if (!this.flameAnchor) {
      this.flameAnchor = new THREE.Object3D();
      this.flameAnchor.name = 'broom-flame-anchor';
    }
    placeBristleAnchor(this.model, this.flameAnchor);
    this.model.add(this.flameAnchor);
    this.flames?.syncAnchor();
  }

  setFlames(active, visuals) {
    this.flamesOn = active === true;
    if (!this.flamesOn) {
      this.flames?.setActive(false);
      return;
    }
    if (!this.scene || !this.flameAnchor) {
      return;
    }
    if (!this.flames) {
      this.flames = new FlamingBroomVFX(this.scene, this.flameAnchor, {
        quality: this.config.flameQuality,
        seed: 0.17
      });
    }
    this.flames.setPower(visuals?.flameIntensity, visuals?.flameScale, visuals?.flameParticles);
    this.flames.setActive(this.holder.visible);
  }

  updateFlames(dt) {
    if (!this.flames) {
      return;
    }
    const show = this.flamesOn && this.holder.visible;
    this.flames.setActive(show);
    this.flames.update(dt, show && this.equipped && this.swingTime >= 0);
  }

  burstFlames(x, y, z) {
    if (!this.flamesOn || !this.flames) {
      return;
    }
    if (typeof x === 'number') {
      this.flames.hitBurst(x, y, z);
      return;
    }
    this.flames.burstAtHead();
  }

  equip(socket) {
    this.equipped = true;
    this.resetSwing();
    socket.add(this.holder);
    this.syncEquipPose();
  }

  syncEquipPose() {
    const position = this.config.broomEquipPosition;
    const rotation = this.config.broomEquipRotation;
    const scale = this.config.broomEquipScale;
    this.holder.position.set(position.x, position.y, position.z);
    this.holder.rotation.set(rotation.x, rotation.y, rotation.z);
    this.holder.scale.set(scale.x, scale.y, scale.z);
    if (this.model) {
      this.model.position.set(0, -(this.config.broomGripDistance ?? 0), 0);
    }
  }

  unequip(mount) {
    this.equipped = false;
    this.resetSwing();
    if (this.model) {
      this.model.position.set(0, 0, 0);
    }
    mount.add(this.holder);
    applyStationPose(
      this.holder,
      this.config.broomStationOffset,
      this.config.broomStationRotation,
      this.config.broomStationScale
    );
  }

  startSwing() {
    this.swingTime = 0;
    this.hitSent = false;
  }

  resetSwing() {
    this.swingTime = -1;
    this.hitSent = false;
    this.pivot.rotation.set(0, 0, 0);
  }

  updateSwing(dt) {
    if (this.swingTime < 0) {
      return null;
    }
    const previous = this.swingTime;
    this.swingTime += dt;
    const duration = this.config.attackSwingDuration;
    const progress = Math.min(1, this.swingTime / duration);
    this.pivot.rotation.z = Math.sin(progress * Math.PI) * this.config.swingAngle;

    if (!this.hitSent && previous < this.config.attackHitDelay && this.swingTime >= this.config.attackHitDelay) {
      this.hitSent = true;
      return 'hit';
    }
    if (this.swingTime >= duration) {
      this.resetSwing();
      return 'done';
    }
    return null;
  }
}

export function applyBroomMaterials(model, toonFactory) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.castShadow = false;
    child.receiveShadow = false;
    const geometry = child.geometry;
    const missingNormals = Boolean(geometry && !geometry.attributes.normal);
    if (missingNormals) {
      geometry.computeVertexNormals();
    }
    if (!toonFactory) {
      return;
    }
    const painted = Boolean(geometry?.attributes?.color);
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      const material = createToonMaterialFromImported(source, toonFactory.gradientMap);
      if (painted) {
        material.vertexColors = true;
        material.color.setHex(0xffffff);
      }
      if (missingNormals || source?.side === THREE.DoubleSide) {
        material.side = THREE.DoubleSide;
      }
      return material;
    });
    child.material = next.length === 1 ? next[0] : next;
    child.userData.broomMaterials = true;
  });
}

function releaseBroomMaterials(model) {
  model.traverse((child) => {
    if (!child.isMesh || child.userData.broomMaterials !== true) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < materials.length; i += 1) {
      materials[i]?.dispose();
    }
  });
}
