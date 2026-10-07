import * as THREE from 'three';

function node(id, x, z, kind, look = null) {
  return { id, x, z, kind, look };
}

// Lanes sit in the open floor, clear of shelf, freezer, display, and register colliders.
// Shelf points are on those lanes, not inside the fixtures. Queue slots run west of the
// register. The only link out of slot 0 is a one-way exit north, so thieves never use it.
const NODES = [
  node('entranceOutside', -4.4, -3, 'spawn'),
  node('door', -3.55, -3, 'door'),
  node('entranceInside', -2.55, -3, 'door'),
  node('despawn', -4.95, -3.15, 'exit'),

  node('westBack', -2.45, -2.55, 'lane'),
  node('shelfLeftBack', -2.45, -1.75, 'pick', [-1.2, -1.75]),
  node('westMid', -2.45, -1.35, 'lane'),
  node('shelfLeftFront', -2.45, -0.95, 'pick', [-1.2, -0.95]),
  node('westLower', -2.45, 0.3, 'lane'),
  node('westFront', -2.45, 1.9, 'lane'),
  node('westQueue', -2.45, 2.35, 'lane'),

  node('backCenter', 0, -2.55, 'lane'),
  node('shelfCenterBack', 0, -1.75, 'pick', [-1.2, -1.75]),
  node('centerMid', 0, -1.35, 'lane'),
  node('shelfCenterFront', 0, -0.95, 'pick', [1.2, -0.95]),
  node('centerSouth', 0, 0.3, 'lane'),

  node('backRight', 2.15, -2.55, 'lane'),
  node('shelfRightBack', 2.15, -1.75, 'pick', [1.2, -1.75]),
  node('rightMid', 2.15, -1.35, 'lane'),
  node('shelfRightFront', 2.15, -0.95, 'pick', [1.2, -0.95]),
  node('rightSouth', 2.15, 0.3, 'lane'),
  node('rightFront', 1.75, 1.05, 'lane'),

  node('shelfFruit', -0.45, 1.9, 'pick', [-0.4, 1.05]),
  node('frontMid', 0, 1.9, 'lane'),
  node('shelfBread', 0.55, 1.9, 'pick', [0.45, 1.05]),
  node('queueApproach', 1.15, 1.9, 'approach'),

  node('queueEntrance', -1.85, 2.35, 'approach'),
  node('queue4', -1.25, 2.35, 'queue', [2.15, 2.35]),
  node('queue3', -0.65, 2.35, 'queue', [2.15, 2.35]),
  node('queue2', -0.05, 2.35, 'queue', [2.15, 2.35]),
  node('queue1', 0.55, 2.35, 'queue', [2.15, 2.35]),
  node('queue0', 1.15, 2.35, 'queue', [2.15, 2.35])
];

const LINKS = [
  ['entranceOutside', 'door'],
  ['door', 'entranceInside'],
  ['door', 'despawn'],
  ['entranceOutside', 'despawn'],
  ['entranceInside', 'westBack'],

  ['westBack', 'shelfLeftBack'],
  ['shelfLeftBack', 'westMid'],
  ['westMid', 'shelfLeftFront'],
  ['shelfLeftFront', 'westLower'],
  ['westLower', 'westFront'],
  ['westFront', 'westQueue'],
  ['westFront', 'westBack'],
  ['queueApproach', 'westFront'],
  ['westQueue', 'queueEntrance'],
  ['westFront', 'shelfFruit'],
  ['shelfFruit', 'frontMid'],
  ['frontMid', 'shelfBread'],
  ['shelfBread', 'queueApproach'],
  ['queueApproach', 'rightFront'],
  ['rightFront', 'rightSouth'],

  ['westBack', 'backCenter'],
  ['backCenter', 'backRight'],
  ['backCenter', 'shelfCenterBack'],
  ['shelfCenterBack', 'centerMid'],
  ['centerMid', 'shelfCenterFront'],
  ['shelfCenterFront', 'centerSouth'],
  ['westLower', 'centerSouth'],
  ['centerSouth', 'rightSouth'],
  ['backRight', 'shelfRightBack'],
  ['shelfRightBack', 'rightMid'],
  ['rightMid', 'shelfRightFront'],
  ['shelfRightFront', 'rightSouth'],

  ['queueEntrance', 'queue4'],
  ['queue4', 'queue3'],
  ['queue3', 'queue2'],
  ['queue2', 'queue1'],
  ['queue1', 'queue0']
];

const LEAVE_LINKS = [
  ['queue0', 'queueApproach']
];

export class ShopperNavigation {
  constructor() {
    this.nodes = new Map(NODES.map((entry) => [entry.id, entry]));
    this.links = new Map();
    this.pickIds = [];
    this.queueSlotIds = ['queue0', 'queue1', 'queue2', 'queue3', 'queue4'];

    for (let i = 0; i < NODES.length; i += 1) {
      this.links.set(NODES[i].id, []);
      if (NODES[i].kind === 'pick') {
        this.pickIds.push(NODES[i].id);
      }
    }

    for (let i = 0; i < LINKS.length; i += 1) {
      this.addLink(LINKS[i][0], LINKS[i][1], false);
      this.addLink(LINKS[i][1], LINKS[i][0], false);
    }
    for (let i = 0; i < LEAVE_LINKS.length; i += 1) {
      this.addLink(LEAVE_LINKS[i][0], LEAVE_LINKS[i][1], true);
    }
  }

  addLink(fromId, toId, leave) {
    this.links.get(fromId).push({ id: toId, leave });
  }

  nearest(x, z, avoidQueue) {
    let best = NODES[0];
    let bestDistance = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const entry = NODES[i];
      if (avoidQueue && entry.kind === 'queue') {
        continue;
      }
      const dx = entry.x - x;
      const dz = entry.z - z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }
    return best;
  }

  route(x, z, targetId, avoidQueue = false) {
    const start = this.nearest(x, z, avoidQueue && this.nodes.get(targetId)?.kind !== 'queue');
    const ids = this.findPath(start.id, targetId, avoidQueue) ?? [targetId];
    return ids.map((id) => this.nodes.get(id));
  }

  findPath(startId, targetId, avoidQueue) {
    if (startId === targetId) {
      return [startId];
    }
    const queue = [startId];
    const previous = new Map([[startId, null]]);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const neighbors = this.links.get(current) ?? [];
      for (let i = 0; i < neighbors.length; i += 1) {
        const edge = neighbors[i];
        if (edge.leave && !avoidQueue) {
          continue;
        }
        const nextNode = this.nodes.get(edge.id);
        if (avoidQueue && nextNode.kind === 'queue') {
          continue;
        }
        if (previous.has(edge.id)) {
          continue;
        }
        previous.set(edge.id, current);
        if (edge.id === targetId) {
          const path = [targetId];
          let cursor = current;
          while (cursor) {
            path.push(cursor);
            cursor = previous.get(cursor);
          }
          path.reverse();
          return path;
        }
        queue.push(edge.id);
      }
    }
    return null;
  }

  randomLane() {
    const lanes = [];
    for (const entry of this.nodes.values()) {
      if (entry.kind === 'lane') {
        lanes.push(entry.id);
      }
    }
    return lanes[Math.floor(Math.random() * lanes.length)];
  }

  randomPick(exceptId) {
    const pool = this.pickIds.length > 1
      ? this.pickIds.filter((id) => id !== exceptId)
      : this.pickIds;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  createDebug(scene) {
    const group = new THREE.Group();
    group.name = 'shopper-nav-debug';
    const geometry = new THREE.SphereGeometry(0.06, 8, 6);
    const positions = [];

    for (let i = 0; i < NODES.length; i += 1) {
      const entry = NODES[i];
      const color = colorForKind(entry.kind);
      const marker = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color })
      );
      marker.position.set(entry.x, 0.14, entry.z);
      marker.name = entry.id;
      group.add(marker);
    }

    const seen = new Set();
    for (let i = 0; i < NODES.length; i += 1) {
      const from = NODES[i];
      const neighbors = this.links.get(from.id);
      for (let n = 0; n < neighbors.length; n += 1) {
        const key = [from.id, neighbors[n].id].sort().join('|');
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const to = this.nodes.get(neighbors[n].id);
        positions.push(from.x, 0.08, from.z, to.x, 0.08, to.z);
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    group.add(new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: 0xd5dde6 })
    ));

    this.routeGroup = new THREE.Group();
    this.routeGroup.name = 'shopper-routes';
    group.add(this.routeGroup);
    this.routeLines = new Map();
    scene.add(group);
    return group;
  }

  showRoute(shopperId, path, pathIndex) {
    if (!this.routeGroup || !path || path.length === 0) {
      return;
    }
    let line = this.routeLines.get(shopperId);
    const positions = [];
    const start = Math.max(0, pathIndex);
    for (let i = start; i < path.length; i += 1) {
      positions.push(path[i].x, 0.2, path[i].z);
    }
    if (positions.length < 6) {
      const only = path[path.length - 1];
      positions.push(only.x, 0.2, only.z, only.x, 0.2, only.z);
    }
    if (!line) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x2f6fed }));
      line.name = `route-${shopperId}`;
      line.frustumCulled = false;
      this.routeGroup.add(line);
      this.routeLines.set(shopperId, line);
      return;
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  clearRoute(shopperId) {
    const line = this.routeLines?.get(shopperId);
    if (!line) {
      return;
    }
    line.removeFromParent();
    line.geometry.dispose();
    line.material.dispose();
    this.routeLines.delete(shopperId);
  }
}

function colorForKind(kind) {
  if (kind === 'pick') {
    return 0xe2a23a;
  }
  if (kind === 'queue') {
    return 0x3ddc97;
  }
  if (kind === 'approach') {
    return 0xf2d24b;
  }
  if (kind === 'door' || kind === 'spawn' || kind === 'exit') {
    return 0x6cb6ff;
  }
  return 0xffffff;
}

export class ShopperRoute {
  constructor(navigation, config, shopperId) {
    this.navigation = navigation;
    this.config = config;
    this.shopperId = shopperId;
    this.path = [];
    this.index = 0;
    this.targetId = null;
    this.avoidQueue = false;
    this.stuckTime = 0;
    this.recoveries = 0;
    this.anchorX = 0;
    this.anchorZ = 0;
    this.hasAnchor = false;
  }

  setTarget(x, z, targetId, avoidQueue) {
    this.targetId = targetId;
    this.avoidQueue = avoidQueue;
    this.path = this.navigation.route(x, z, targetId, avoidQueue);
    this.index = 0;
    this.stuckTime = 0;
    this.recoveries = 0;
    this.hasAnchor = false;
    this.skipReached(x, z);
    this.draw();
  }

  update(dt, group, collision, radius) {
    const position = group.position;
    const point = this.path[this.index];
    if (!point) {
      return 'idle';
    }

    const dx = point.x - position.x;
    const dz = point.z - position.z;
    const distance = Math.hypot(dx, dz);
    const reach = this.config.waypointReachDistance;
    if (distance <= reach) {
      this.index += 1;
      this.stuckTime = 0;
      this.hasAnchor = false;
      this.draw();
      if (this.index >= this.path.length) {
        this.recoveries = 0;
        return 'arrived';
      }
      return 'moving';
    }

    if (!this.hasAnchor) {
      this.anchorX = position.x;
      this.anchorZ = position.z;
      this.hasAnchor = true;
    }

    const step = Math.min(this.config.moveSpeed * dt, distance);
    const nx = dx / distance;
    const nz = dz / distance;
    const nextX = position.x + nx * step;
    const nextZ = position.z + nz * step;
    if (!collision.blocksMovement(nextX, nextZ, radius)) {
      position.x = nextX;
      position.z = nextZ;
      position.y = 0;
      this.face(group, nx, nz, dt);
    }

    const moved = Math.hypot(position.x - this.anchorX, position.z - this.anchorZ);
    if (moved < this.config.stuckDistance) {
      this.stuckTime += dt;
      if (this.stuckTime >= this.config.stuckTimeout) {
        this.recover(position, radius);
      }
    } else {
      this.anchorX = position.x;
      this.anchorZ = position.z;
      this.stuckTime = 0;
    }
    return 'moving';
  }

  recover(position) {
    this.stuckTime = 0;
    this.hasAnchor = false;
    this.recoveries += 1;
    if (this.recoveries >= this.config.maxRecoveryAttempts) {
      const safe = this.navigation.nearest(position.x, position.z, this.avoidQueue);
      position.x = safe.x;
      position.z = safe.z;
      position.y = 0;
      this.recoveries = 0;
    }
    this.path = this.navigation.route(position.x, position.z, this.targetId, this.avoidQueue);
    this.index = 0;
    this.skipReached(position.x, position.z);
    this.draw();
  }

  face(group, nx, nz, dt) {
    const targetYaw = Math.atan2(nx, nz);
    const currentYaw = group.rotation.y;
    const deltaYaw = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
    const step = Math.max(-this.config.rotationSpeed * dt, Math.min(this.config.rotationSpeed * dt, deltaYaw));
    group.rotation.y = currentYaw + step;
  }

  skipReached(x, z) {
    const reach = this.config.waypointReachDistance;
    while (this.index < this.path.length - 1) {
      const point = this.path[this.index];
      const dx = point.x - x;
      const dz = point.z - z;
      if (dx * dx + dz * dz > reach * reach) {
        break;
      }
      this.index += 1;
    }
  }

  draw() {
    if (!this.navigation.routeGroup) {
      return;
    }
    this.navigation.showRoute(this.shopperId, this.path, this.index);
  }

  clear() {
    this.navigation.clearRoute(this.shopperId);
  }

  get point() {
    return this.path[this.index] ?? null;
  }
}
