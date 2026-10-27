import * as THREE from 'three';
import { applyToonOutfit } from '../shoppers/ShopperVisuals.js';
import { findRightHandBone } from '../entities/Player.js';
import { BroomWeapon } from '../weapons/BroomWeapon.js';
import { INTERIOR_Z_MAX, INTERIOR_Z_MIN, STORE_WEST, sectionEast } from '../world/StoreSections.js';

const ROOT_POSITION_TRACKS = new Set([
  'Bone.position',
  'CharacterArmature.position'
]);

function withoutRootMotion(clip) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => !ROOT_POSITION_TRACKS.has(track.name));
  return copy;
}

function findClip(clips, names) {
  for (let i = 0; i < names.length; i += 1) {
    const exact = clips.find((clip) => clip.name.toLowerCase() === names[i]);
    if (exact) {
      return exact;
    }
  }
  return clips.find((clip) => names.some((name) => clip.name.toLowerCase().includes(name))) ?? null;
}

export class SecurityGuard {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.collision = options.collision;
    this.shoppers = options.shoppers;
    this.drops = options.drops;
    this.feedback = options.feedback;
    this.toonFactory = options.toonFactory;
    const weapons = options.weapons ?? {};
    this.weaponsConfig = { ...weapons, debugBroomGrip: false };
    const config = options.config ?? {};
    this.modelUrl = config.model;
    this.modelScale = config.modelScale ?? 0.36;
    this.modelYOffset = config.modelYOffset ?? 0.03;
    this.home = config.home ?? [2.45, -2.55];
    this.patrol = (config.patrol?.length ? config.patrol : [this.home]).map((point) => ({
      x: point[0],
      z: point[1]
    }));
    this.detectRange = config.detectRange ?? 5.5;
    this.attackRange = weapons.attackRange ?? 1.5;
    this.damage = weapons.broomDamage ?? 20;
    this.attackCooldownTime = weapons.attackCooldown ?? 0.6;
    this.moveSpeed = config.moveSpeed ?? 1.7;
    this.radius = config.radius ?? 0.22;
    this.fleeSpeed = weapons.defeatedThiefRunSpeed ?? 2.4;
    this.section = {
      minX: STORE_WEST + 0.35,
      maxX: sectionEast(0) - 0.35,
      minZ: INTERIOR_Z_MIN + 0.2,
      maxZ: INTERIOR_Z_MAX - 0.15
    };
    this.hired = false;
    this.loading = false;
    this.ready = false;
    this.shift = false;
    this.group = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.mode = 'idle';
    this.patrolIndex = 0;
    this.pause = 0;
    this.path = null;
    this.stuckTime = 0;
    this.detour = null;
    this.target = null;
    this.attackTime = 0;
    this.hitDone = false;
    this.attackDuration = 0.55;
    this.cooldown = 0;
    this.broom = null;
    this.broomSocket = null;
    this.broomDef = null;
    this.broomToken = 0;
    this.burnDps = 0;
    this.burnDuration = 0;
  }

  hire() {
    if (this.hired && (this.ready || this.loading)) {
      return;
    }
    this.hired = true;
    if (this.group) {
      this.group.visible = true;
      this.ready = true;
      return;
    }
    if (!this.modelUrl || this.loading) {
      return;
    }
    this.loading = true;
    this.loader.load(this.modelUrl).then((asset) => {
      this.loading = false;
      if (!this.hired || this.group) {
        return;
      }
      this.spawn(asset);
    }).catch((error) => {
      this.loading = false;
      console.error('Failed to load security guard', error);
    });
  }

  dismiss() {
    this.hired = false;
    this.setShift(false);
    this.ready = false;
    if (this.group) {
      this.group.visible = false;
    }
  }

  setShift(active) {
    const next = active === true;
    if (!next && this.shift) {
      this.target = null;
      this.mode = 'idle';
      this.path = null;
      this.detour = null;
      this.stuckTime = 0;
      this.broom?.resetSwing();
    }
    this.shift = next;
  }

  update(dt) {
    if (!this.ready) {
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }
    if (!this.shift) {
      this.play('idle');
      this.broom?.updateFlames(dt);
      this.mixer.update(dt);
      return;
    }
    if (this.mode === 'attack') {
      this.updateAttack(dt);
    } else {
      const thief = this.nearestThief();
      if (thief) {
        this.path = null;
        this.detour = null;
        this.stuckTime = 0;
        this.chase(thief, dt);
      } else {
        this.target = null;
        this.patrolStep(dt);
      }
    }
    this.broom?.updateFlames(dt);
    this.mixer.update(dt);
  }

  setBroom(def) {
    if (!def) {
      return;
    }
    this.broomDef = def;
    this.damage = def.damage ?? this.damage;
    this.burnDps = def.burnDps ?? 0;
    this.burnDuration = def.burnDuration ?? 0;
    this.applyBroomModel();
  }

  spawn(asset) {
    const group = new THREE.Group();
    group.name = 'security-guard';
    group.userData.editorIgnore = true;
    const visual = new THREE.Group();
    visual.name = 'security-guard-visual';
    visual.scale.setScalar(this.modelScale);
    visual.position.y = this.modelYOffset;
    applyToonOutfit(asset.scene, this.toonFactory);
    visual.add(asset.scene);
    group.add(visual);
    group.position.set(this.home[0], 0, this.home[1]);
    this.scene.add(group);
    this.group = group;
    this.mixer = new THREE.AnimationMixer(asset.scene);
    const clips = asset.animations ?? [];
    this.actions.idle = this.makeLoop(findClip(clips, ['idle']));
    this.actions.walk = this.makeLoop(findClip(clips, ['walk']));
    this.actions.run = this.makeLoop(findClip(clips, ['run']));
    this.actions.punch = this.makeOnce(findClip(clips, ['punch', 'swordslash']));
    if (this.actions.punch) {
      this.attackDuration = Math.max(0.35, this.actions.punch.getClip().duration);
    }
    this.ready = true;
    this.play('idle');
    this.equipBroom(asset.scene);
  }

  equipBroom(model) {
    const hand = findRightHandBone(model);
    if (!hand) {
      return;
    }
    const socket = new THREE.Group();
    socket.name = 'RightHandWeaponSocket';
    hand.add(socket);
    this.broomSocket = socket;
    this.broom = new BroomWeapon(this.weaponsConfig);
    this.broom.scene = this.scene;
    if (this.broomDef) {
      this.applyBroomModel();
      return;
    }
    this.broom.load(this.loader, this.toonFactory).then(() => {
      if (this.broom?.model) {
        this.broom.equip(socket);
      }
    }).catch((error) => {
      console.error('Failed to equip security broom', error);
    });
  }

  applyBroomModel() {
    const def = this.broomDef;
    if (!def || !this.broom) {
      return;
    }
    const token = this.broomToken + 1;
    this.broomToken = token;
    this.broom.loader = this.loader;
    this.broom.toonFactory = this.toonFactory;
    this.broom.scene = this.scene;
    this.broom.useModel(def.model).then(() => {
      if (this.broomToken !== token || !this.broom?.model) {
        return;
      }
      if (this.broomSocket && !this.broom.equipped) {
        this.broom.equip(this.broomSocket);
      }
      this.broom.setFlames(def.level >= 3, def);
    }).catch((error) => {
      console.error('Failed to equip security broom', error);
    });
  }

  inSection(x, z) {
    const area = this.section;
    return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ;
  }

  makeLoop(clip) {
    if (!clip) {
      return null;
    }
    const action = this.mixer.clipAction(withoutRootMotion(clip));
    action.setLoop(THREE.LoopRepeat, Infinity);
    return action;
  }

  makeOnce(clip) {
    if (!clip) {
      return null;
    }
    const action = this.mixer.clipAction(withoutRootMotion(clip));
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    return action;
  }

  play(name) {
    const next = this.actions[name] ?? this.actions.idle;
    if (!next || this.current === next) {
      return;
    }
    next.reset().fadeIn(0.16).play();
    if (this.current) {
      this.current.fadeOut(0.16);
    }
    this.current = next;
  }

  nearestThief() {
    const list = this.shoppers?.getShoppers?.() ?? [];
    const origin = this.group.position;
    const limit = this.detectRange * this.detectRange;
    let best = null;
    let bestDistance = limit;
    for (let i = 0; i < list.length; i += 1) {
      const shopper = list[i];
      if (!shopper.isAttackable?.() || shopper.problem) {
        continue;
      }
      const sx = shopper.group.position.x;
      const sz = shopper.group.position.z;
      if (!this.inSection(sx, sz)) {
        continue;
      }
      const dx = sx - origin.x;
      const dz = shopper.group.position.z - origin.z;
      const distance = dx * dx + dz * dz;
      if (distance <= bestDistance) {
        best = shopper;
        bestDistance = distance;
      }
    }
    return best;
  }

  chase(thief, dt) {
    this.target = thief;
    const dx = thief.group.position.x - this.group.position.x;
    const dz = thief.group.position.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= this.attackRange) {
      if (this.cooldown <= 0) {
        this.beginAttack();
      } else {
        this.play('idle');
        this.face(dx, dz, dt);
      }
      return;
    }
    this.mode = 'chase';
    this.play('walk');
    if (distance > 0.001) {
      this.step(dx / distance, dz / distance, dt);
    }
  }

  patrolStep(dt) {
    if (this.pause > 0) {
      this.pause -= dt;
      this.play('idle');
      return;
    }
    const hereX = this.group.position.x;
    const hereZ = this.group.position.z;
    if (this.inSection(hereX, hereZ) && this.collision.blocksMovement(hereX, hereZ, this.radius)) {
      const open = this.nearestOpen(hereX, hereZ);
      if (open) {
        this.group.position.set(open.x, 0, open.z);
        this.path = null;
        this.detour = null;
        this.stuckTime = 0;
      }
      return;
    }
    if (!this.inSection(hereX, hereZ)) {
      this.walkToward(0, 0.4, dt);
      return;
    }
    if (this.detour) {
      this.followDetour(dt);
      return;
    }
    if (!this.path || this.path.length === 0) {
      this.path = this.pathToPatrol();
    }
    const point = this.path[0];
    const dx = point.x - this.group.position.x;
    const dz = point.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.34) {
      this.path.shift();
      this.stuckTime = 0;
      if (this.path.length === 0) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
        this.pause = 0.55;
        this.play('idle');
      }
      return;
    }
    const beforeX = this.group.position.x;
    const beforeZ = this.group.position.z;
    this.mode = 'patrol';
    this.play('walk');
    this.step(dx / distance, dz / distance, dt);
    const moved = Math.hypot(this.group.position.x - beforeX, this.group.position.z - beforeZ);
    const after = Math.hypot(point.x - this.group.position.x, point.z - this.group.position.z);
    if (moved < 0.012 || after > distance - 0.004) {
      this.stuckTime += dt;
    } else {
      this.stuckTime = 0;
    }
    if (this.stuckTime >= 0.4) {
      this.unstick(dx, dz);
    }
  }

  pathToPatrol() {
    const goal = this.patrol[this.patrolIndex];
    const navigation = this.shoppers?.navigation;
    const direct = [{ x: goal.x, z: goal.z }];
    if (!navigation) {
      return direct;
    }
    const lanes = [];
    navigation.nodes.forEach((node) => {
      if (!this.inSection(node.x, node.z)) {
        return;
      }
      if (node.kind === 'queue' || node.kind === 'vanish' || node.kind === 'exit' || node.kind === 'spawn') {
        return;
      }
      lanes.push(node);
    });
    if (lanes.length === 0) {
      return direct;
    }
    const here = this.group.position;
    let start = lanes[0];
    let end = lanes[0];
    let startDistance = Infinity;
    let endDistance = Infinity;
    for (let i = 0; i < lanes.length; i += 1) {
      const node = lanes[i];
      const fromHere = (node.x - here.x) ** 2 + (node.z - here.z) ** 2;
      const fromGoal = (node.x - goal.x) ** 2 + (node.z - goal.z) ** 2;
      if (fromHere < startDistance) {
        start = node;
        startDistance = fromHere;
      }
      if (fromGoal < endDistance) {
        end = node;
        endDistance = fromGoal;
      }
    }
    const ids = navigation.findPath(start.id, end.id, true);
    const path = [];
    if (ids) {
      for (let i = 0; i < ids.length; i += 1) {
        const node = navigation.nodes.get(ids[i]);
        if (node && this.inSection(node.x, node.z)) {
          path.push({ x: node.x, z: node.z });
        }
      }
    }
    path.push({ x: goal.x, z: goal.z });
    while (path.length > 1) {
      const dx = path[0].x - here.x;
      const dz = path[0].z - here.z;
      if (dx * dx + dz * dz > 0.16) {
        break;
      }
      path.shift();
    }
    return path;
  }

  followDetour(dt) {
    const dx = this.detour.x - this.group.position.x;
    const dz = this.detour.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    this.detour.time -= dt;
    if (distance <= 0.2 || this.detour.time <= 0) {
      this.detour = null;
      this.path = null;
      this.stuckTime = 0;
      return;
    }
    this.mode = 'patrol';
    this.play('walk');
    this.step(dx / distance, dz / distance, dt);
  }

  unstick(dx, dz) {
    const x = this.group.position.x;
    const z = this.group.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = dx / length;
    const nz = dz / length;
    const sides = [
      { x: -nz, z: nx },
      { x: nz, z: -nx }
    ];
    for (let i = 0; i < sides.length; i += 1) {
      const side = sides[i];
      const nextX = x + side.x * 0.7;
      const nextZ = z + side.z * 0.7;
      if (this.canStep(nextX, nextZ)) {
        this.detour = { x: nextX, z: nextZ, time: 0.55 };
        this.path = null;
        this.stuckTime = 0;
        return;
      }
    }
    const open = this.nearestOpen(x, z);
    if (open) {
      this.group.position.x = open.x;
      this.group.position.z = open.z;
      this.path = null;
      this.detour = null;
      this.stuckTime = 0;
      return;
    }
    if (this.path && this.path.length > 1) {
      this.path.shift();
    } else {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
      this.path = null;
    }
    this.stuckTime = 0;
  }

  nearestOpen(x, z) {
    const radii = [0.45, 0.85, 1.25, 1.7];
    for (let ring = 0; ring < radii.length; ring += 1) {
      const radius = radii[ring];
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        const nextX = x + Math.cos(angle) * radius;
        const nextZ = z + Math.sin(angle) * radius;
        if (this.canStep(nextX, nextZ)) {
          return { x: nextX, z: nextZ };
        }
      }
    }
    return null;
  }

  walkToward(x, z, dt) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) {
      return;
    }
    this.mode = 'patrol';
    this.play('walk');
    this.step(dx / distance, dz / distance, dt);
  }

  beginAttack() {
    this.mode = 'attack';
    this.attackTime = 0;
    this.hitDone = false;
    this.broom?.startSwing();
    const action = this.actions.punch;
    if (!action) {
      return;
    }
    action.reset();
    action.fadeIn(0.08).play();
    if (this.current && this.current !== action) {
      this.current.fadeOut(0.08);
    }
    this.current = action;
  }

  updateAttack(dt) {
    const target = this.target;
    const stillHere = target?.group
      && target.isAttackable?.()
      && this.inSection(target.group.position.x, target.group.position.z);
    if (!stillHere) {
      this.target = null;
    } else {
      const dx = target.group.position.x - this.group.position.x;
      const dz = target.group.position.z - this.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > this.attackRange * 0.72) {
        this.step(dx / distance, dz / distance, dt);
      } else if (distance > 0.001) {
        this.face(dx, dz, dt);
      }
    }
    const swing = this.broom?.updateSwing(dt) ?? null;
    if (!this.broom) {
      this.attackTime += dt;
      if (!this.hitDone && this.attackTime >= (this.weaponsConfig.attackHitDelay ?? 0.16)) {
        this.hitDone = true;
        this.resolveHit();
      }
      if (this.attackTime >= (this.weaponsConfig.attackSwingDuration ?? 0.45)) {
        this.finishSwing();
      }
      return;
    }
    if (swing === 'hit') {
      this.resolveHit();
    }
    if (swing === 'done') {
      this.finishSwing();
    }
  }

  finishSwing() {
    this.mode = 'idle';
    this.cooldown = this.attackCooldownTime;
    if (!this.target?.isAttackable?.()) {
      this.target = null;
    }
    this.play('idle');
  }

  resolveHit() {
    const target = this.target;
    if (!target?.isAttackable?.() || !this.inSection(target.group.position.x, target.group.position.z)) {
      return;
    }
    const dx = target.group.position.x - this.group.position.x;
    const dz = target.group.position.z - this.group.position.z;
    if (dx * dx + dz * dz > (this.attackRange + 0.35) * (this.attackRange + 0.35)) {
      return;
    }
    const position = target.group.position;
    this.feedback?.spawn(position.x, 1.55, position.z, this.damage);
    const defeated = target.takeDamage(this.damage);
    if (this.burnDps > 0) {
      this.broom?.burstFlames(position.x, position.y + 1.05, position.z);
      if (!defeated && this.burnDuration > 0) {
        target.applyBurn?.(this.burnDps, this.burnDuration);
        target.burnFlames?.burst();
      }
    }
    if (!defeated) {
      return;
    }
    const drops = target.dieOrFlee(this.fleeSpeed);
    this.drops?.spawn(drops);
    this.target = null;
  }

  canStep(x, z) {
    return this.inSection(x, z) && !this.collision.blocksMovement(x, z, this.radius);
  }

  step(nx, nz, dt) {
    const distance = Math.min(this.moveSpeed * dt, 0.35);
    const dx = nx * distance;
    const dz = nz * distance;
    const x = this.group.position.x;
    const z = this.group.position.z;
    if (this.canStep(x + dx, z + dz)) {
      this.group.position.x = x + dx;
      this.group.position.z = z + dz;
    } else if (this.canStep(x + dx, z)) {
      this.group.position.x = x + dx;
    } else if (this.canStep(x, z + dz)) {
      this.group.position.z = z + dz;
    }
    this.face(nx, nz, dt);
  }

  face(nx, nz, dt) {
    const target = Math.atan2(nx, nz);
    let delta = target - this.group.rotation.y;
    while (delta > Math.PI) {
      delta -= Math.PI * 2;
    }
    while (delta < -Math.PI) {
      delta += Math.PI * 2;
    }
    const maxTurn = 10 * dt;
    this.group.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, delta));
  }
}
