import * as THREE from 'three';
import { isFixtureCollisionId } from '../world/Store.js';
import { fixtureById, SECTION_WIDTH, sectionEast, sectionIndexAt } from '../world/StoreSections.js';

function node(id, x, z, kind, look = null) {
  return { id, x, z, kind, look };
}

// Lanes sit in the open floor. The queue is a horizontal line in front of the
// register. Shoppers join from the far end. Thieves run off the north or south
// end of the street before they are removed.
const NODES = [
  node('entranceOutside', -4.4, -3, 'spawn'),
  node('door', -3.55, -3, 'door'),
  node('entranceInside', -2.55, -3, 'door'),
  node('despawn', -4.95, -3.15, 'exit'),
  // The road runs north–south. Thieves leave off either end, not from the middle.
  node('streetDoor', -7.62, -3.15, 'street'),
  node('streetNorth', -7.62, -5.5, 'street'),
  // North buildings start at z = -6.35. Despawn on the road, just before that face.
  node('thiefVanishNorth', -7.62, -6.05, 'vanish'),
  node('streetMid', -7.62, 0.4, 'street'),
  node('streetSouth', -7.62, 3.6, 'street'),
  node('streetFar', -7.62, 4.7, 'street'),
  // South barrier face is z = 5.8. This spot is just before it, inside the thief's radius.
  node('thiefVanishSouth', -7.62, 5.45, 'vanish'),

  node('westBack', -2.45, -2.55, 'lane'),
  node('shelfLeftBack', -2.45, -1.75, 'pick', [-1.2, -1.75]),
  node('westMid', -2.45, -1.35, 'lane'),
  node('shelfLeftFront', -2.45, -0.95, 'pick', [-1.2, -0.95]),
  node('westLower', -2.45, 0.3, 'lane'),
  node('westFront', -2.45, 1.9, 'lane'),

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
  node('checkoutApproach', 1.15, 1.9, 'approach')
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
  ['westFront', 'westBack'],
  ['checkoutApproach', 'westFront'],
  ['westFront', 'shelfFruit'],
  ['shelfFruit', 'frontMid'],
  ['frontMid', 'shelfBread'],
  ['shelfBread', 'checkoutApproach'],
  ['checkoutApproach', 'rightFront'],
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
  ['shelfRightFront', 'rightSouth']
];

function appendQueue(nodes, links, leave, checkout) {
  const spacing = checkout?.queueSpacing ?? 0.78;
  const count = checkout?.queueSlots ?? 6;
  const origin = checkout?.queueOrigin ?? [1.2, 3.7];
  const zone = checkout?.zonePosition ?? [2.28, 3.7];
  const originX = origin[0];
  const originZ = origin[1];
  const slotIds = [];

  for (let i = 0; i < count; i += 1) {
    const id = `queue${i}`;
    slotIds.push(id);
    const x = originX - i * spacing;
    nodes.push(node(id, x, originZ, 'queue', [zone[0], originZ]));
    if (i > 0) {
      links.push([`queue${i}`, `queue${i - 1}`]);
    }
  }

  const tailX = originX - (count - 1) * spacing;
  nodes.push(node('queueApproach', -2.45, originZ - 1.15, 'approach'));
  links.push(
    ['westFront', 'queueApproach'],
    ['queueApproach', `queue${count - 1}`]
  );

  // South wall inner face is z = 5.2. This lane stays north of it so a leaving customer can pass.
  const sideZ = Math.min(originZ + 0.68, 4.75);
  let previousSide = null;
  for (let i = 0; i < count; i += 1) {
    const sideId = `queueSide${i}`;
    const x = originX - i * spacing;
    nodes.push(node(sideId, x, sideZ, 'approach'));
    leave.push([`queue${i}`, sideId]);
    if (previousSide) {
      links.push([previousSide, sideId]);
    }
    previousSide = sideId;
  }

  nodes.push(node('queueExit', Math.min(tailX + 0.35, -2.45), sideZ, 'approach'));
  links.push(
    [previousSide, 'queueExit'],
    ['queueExit', 'westFront']
  );
  return slotIds;
}

export class ShopperNavigation {
  constructor(checkout) {
    this.checkoutConfig = checkout;
    this.installBase();
  }

  // Grocery floor only. Called again when a new shop locks the expansions,
  // because those aisles, shelf spots, and register lines were spliced in permanently.
  installBase() {
    const nodes = NODES.slice();
    const links = LINKS.map((pair) => pair.slice());
    const leave = [];
    this.queueSlotIds = appendQueue(nodes, links, leave, this.checkoutConfig);
    this.nodeList = nodes;
    this.nodes = new Map(nodes.map((entry) => [entry.id, entry]));
    this.links = new Map();
    this.pickIds = [];

    for (let i = 0; i < this.nodeList.length; i += 1) {
      this.links.set(this.nodeList[i].id, []);
      if (this.nodeList[i].kind === 'pick') {
        this.pickIds.push(this.nodeList[i].id);
      }
    }

    for (let i = 0; i < links.length; i += 1) {
      this.addLink(links[i][0], links[i][1], false);
      this.addLink(links[i][1], links[i][0], false);
    }
    this.linkBoth('despawn', 'streetDoor');
    this.linkBoth('streetDoor', 'streetNorth');
    this.addLink('streetNorth', 'thiefVanishNorth', false);
    this.linkBoth('streetDoor', 'streetMid');
    this.linkBoth('streetMid', 'streetSouth');
    this.linkBoth('streetSouth', 'streetFar');
    this.addLink('streetFar', 'thiefVanishSouth', false);
    for (let i = 0; i < leave.length; i += 1) {
      this.addLink(leave[i][0], leave[i][1], true);
    }
    this.openSections = 0;
    this.westChain = new Map();
    this.backChain = new Map();
  }

  syncUnlocked(maxUnlocked) {
    const count = Math.max(0, Math.floor(Number(maxUnlocked) || 0));
    while (this.openSections < count) {
      this.openSections += 1;
      this.addShopSection(this.openSections);
    }
  }

  // New Shop locks every expansion. Shelf spots only ask to open a section, so they stay on syncUnlocked.
  setUnlocked(maxUnlocked) {
    const count = Math.max(0, Math.floor(Number(maxUnlocked) || 0));
    if (count < this.openSections) {
      this.installBase();
    }
    this.syncUnlocked(count);
  }

  addShopSection(index) {
    const west = sectionEast(index) - SECTION_WIDTH;
    const left = west + 0.95;
    const right = west + 6.05;
    const backZ = -2.7;
    const frontZ = 3.15;
    const backWest = `section${index}-west-back`;
    const backEast = `section${index}-east-back`;
    const frontWest = `section${index}-west-front`;
    const frontEast = `section${index}-east-front`;
    this.addNode(node(backWest, left, backZ, 'lane'));
    this.addNode(node(frontWest, left, frontZ, 'lane'));
    this.addNode(node(backEast, right, backZ, 'lane'));
    this.addNode(node(frontEast, right, frontZ, 'lane'));
    this.linkBoth(backWest, frontWest);
    this.linkBoth(backWest, backEast);
    // The broom stand sits on this lane (local x 6.05, z 2.15). Step west around it.
    // The old front crossing ran through the register and back into that stand.
    this.linkAroundBroom(index, backEast, frontEast, right, frontZ);
    this.linkSouthOfCounter(index, frontWest, left);
    this.westChain.set(index, [backWest, frontWest]);
    this.backChain.set(index, [backWest, backEast]);
    if (index === 1) {
      this.addNode(node('grocery-east-back', 3.15, backZ, 'lane'));
      this.linkBoth('backRight', 'grocery-east-back');
      this.linkBoth('grocery-east-back', backWest);
      return;
    }
    const previous = index - 1;
    this.linkBoth(`section${previous}-east-back`, backWest);
    this.linkBoth(`section${previous}-east-front`, frontWest);
  }

  // A line in front of a purchased register. Slot 0 is nearest the counter.
  // Customers enter from the aisle once, then only walk toward the register.
  addCheckoutLane(id, registerX, registerZ) {
    const index = sectionIndexAt(registerX);
    const anchorId = `section${index}-west-front`;
    const anchor = this.nodes.get(anchorId);
    if (index <= 0 || !anchor) {
      return null;
    }
    const checkout = this.checkoutConfig ?? {};
    const preferred = checkout.queueSlots ?? 6;
    const preferredSpacing = checkout.queueSpacing ?? 0.78;
    const origin = checkout.queueOrigin ?? [1.2, 4.055];
    const zone = checkout.zonePosition ?? [2.28, 4.055];
    const homeX = 2.15;
    const headX = registerX + (origin[0] - homeX);
    const headZ = origin[1];
    const zoneX = registerX + (zone[0] - homeX);
    const zoneZ = zone[1];
    const minX = sectionEast(index) - SECTION_WIDTH + 0.7;
    const minSpacing = 0.58;
    const room = Math.max(0, headX - minX);
    const count = Math.max(2, Math.min(preferred, Math.floor(room / minSpacing) + 1));
    const spacing = count > 1 ? Math.min(preferredSpacing, room / (count - 1)) : preferredSpacing;
    const slotIds = [];
    const safe = String(id).replace(/[^a-z0-9_-]/gi, '_');

    for (let i = 0; i < count; i += 1) {
      const slotId = `lane-${safe}-q${i}`;
      slotIds.push(slotId);
      const x = headX - i * spacing;
      this.addNode(node(slotId, x, headZ, 'queue', [zoneX, headZ]));
      if (i > 0) {
        this.addLink(slotIds[i], slotIds[i - 1], false);
      }
    }

    const tailId = slotIds[slotIds.length - 1];
    // Enter from the aisle, not from a node sitting on the line. A node on the
    // line makes a repath walk back to the tail and around the register.
    this.linkBoth(anchorId, tailId);
    for (let i = 0; i < slotIds.length; i += 1) {
      this.addLink(slotIds[i], anchorId, true);
      if (i > 0) {
        this.addLink(slotIds[i - 1], slotIds[i], false);
      }
    }
    return { slotIds, zoneX, zoneZ };
  }

  syncShelfPicks(ids) {
    const owned = new Set(Array.isArray(ids) ? ids : []);
    for (const fixture of fixtureById.values()) {
      if (this.isStockFixture(fixture) && owned.has(fixture.id)) {
        this.enableShelf(fixture);
      }
    }
    for (const entry of this.nodes.values()) {
      if (entry.fixtureId) {
        entry.stocked = owned.has(entry.fixtureId);
      }
    }
  }

  enableShelf(idOrFixture) {
    const fixture = typeof idOrFixture === 'string' ? fixtureById.get(idOrFixture) : idOrFixture;
    if (!this.isStockFixture(fixture)) {
      return;
    }
    this.syncUnlocked(sectionIndexAt(fixture.position[0]));
    const spot = this.shelfNode(fixture.id);
    if (spot) {
      spot.stocked = true;
      return;
    }
    this.addShelfPick(fixture);
  }

  shelfNode(fixtureId) {
    const named = this.nodes.get(`pick-${fixtureId}`);
    if (named) {
      return named;
    }
    for (const entry of this.nodes.values()) {
      if (entry.fixtureId === fixtureId) {
        return entry;
      }
    }
    return null;
  }

  isStockFixture(fixture) {
    if (!fixture?.position || fixture.sectionId === 'grocery') {
      return false;
    }
    if (String(fixture.id).includes('cash_register')) {
      return false;
    }
    return sectionIndexAt(fixture.position[0]) >= 1;
  }

  addShelfPick(fixture) {
    const index = sectionIndexAt(fixture.position[0]);
    const west = sectionEast(index) - SECTION_WIDTH;
    const east = sectionEast(index);
    const aisleX = west + 0.95;
    const fx = fixture.position[0];
    const fz = fixture.position[2];
    const fw = fixture.footprint?.[0] ?? 0.8;
    const fd = fixture.footprint?.[1] ?? 0.6;
    let standX = fx;
    let standZ = fz + fd * 0.5 + 0.85;
    let onBack = false;
    if (fz < -3.1) {
      standX = Math.min(east - 1.15, Math.max(west + 1.15, fx));
      standZ = -2.7;
      onBack = true;
    } else if (standZ > 2.15) {
      standZ = Math.min(fz, 2.05);
      standX = fx - fw * 0.5 - 0.85;
    }
    const toward = standX - aisleX;
    if (!onBack && Math.abs(toward) > 1.7) {
      standX = aisleX + Math.sign(toward || 1) * 1.7;
    }
    standX = Math.min(east - 0.8, Math.max(west + 0.7, standX));
    standZ = Math.min(2.15, Math.max(-3.3, standZ));
    const pickId = `pick-${fixture.id}`;
    const aisleId = onBack
      ? this.spliceChain(this.backChain, index, standX, standZ, 'x')
      : this.spliceChain(this.westChain, index, aisleX, standZ, 'z');
    if (!aisleId) {
      return;
    }
    const aisle = this.nodes.get(aisleId);
    const corner = aisleId.endsWith('-back') || aisleId.endsWith('-front');
    const taken = aisle.fixtureId && aisle.fixtureId !== fixture.id;
    if (!corner && !taken && Math.hypot(standX - aisle.x, standZ - aisle.z) < 0.3) {
      aisle.kind = 'pick';
      aisle.look = [fx, fz];
      aisle.stocked = true;
      aisle.fixtureId = fixture.id;
      if (!this.pickIds.includes(aisleId)) {
        this.pickIds.push(aisleId);
      }
      return;
    }
    if (this.nodes.has(pickId)) {
      return;
    }
    this.addNode(node(pickId, standX, standZ, 'pick', [fx, fz]));
    const spot = this.nodes.get(pickId);
    spot.stocked = true;
    spot.fixtureId = fixture.id;
    this.linkBoth(aisleId, pickId);
  }

  spliceChain(chains, index, x, z, axis) {
    const chain = chains.get(index);
    if (!chain || chain.length < 2) {
      return null;
    }
    const coord = axis === 'x' ? x : z;
    for (let i = 0; i < chain.length; i += 1) {
      const existing = this.nodes.get(chain[i]);
      const value = axis === 'x' ? existing.x : existing.z;
      if (Math.abs(value - coord) < 0.34 && Math.abs((axis === 'x' ? existing.z : existing.x) - (axis === 'x' ? z : x)) < 0.34) {
        return chain[i];
      }
    }
    const id = `section${index}-${axis}-${chain.length}-${Math.round(coord * 10)}`;
    this.addNode(node(id, x, z, 'lane'));
    let insertAt = chain.length;
    for (let i = 0; i < chain.length; i += 1) {
      const existing = this.nodes.get(chain[i]);
      const value = axis === 'x' ? existing.x : existing.z;
      if (coord < value) {
        insertAt = i;
        break;
      }
    }
    const prev = chain[insertAt - 1];
    const next = chain[insertAt];
    if (prev && next) {
      this.unlink(prev, next);
      this.unlink(next, prev);
    }
    if (prev) {
      this.linkBoth(prev, id);
    }
    if (next) {
      this.linkBoth(id, next);
    }
    chain.splice(insertAt, 0, id);
    return id;
  }

  unlink(fromId, toId) {
    const edges = this.links.get(fromId);
    if (!edges) {
      return;
    }
    for (let i = edges.length - 1; i >= 0; i -= 1) {
      if (edges[i].id === toId) {
        edges.splice(i, 1);
      }
    }
  }

  linkAroundBroom(index, backId, frontId, eastX, frontZ) {
    const southZ = 1.15;
    const dodgeX = eastX - 0.72;
    const southId = `section${index}-broom-south`;
    const westSouthId = `section${index}-broom-west-south`;
    const westNorthId = `section${index}-broom-west-north`;
    this.addNode(node(southId, eastX, southZ, 'lane'));
    this.addNode(node(westSouthId, dodgeX, southZ, 'lane'));
    this.addNode(node(westNorthId, dodgeX, frontZ, 'lane'));
    this.linkBoth(backId, southId);
    this.linkBoth(southId, westSouthId);
    this.linkBoth(westSouthId, westNorthId);
    this.linkBoth(westNorthId, frontId);
  }

  // South of the register (z 2.99) and the broom stand (local x 6.05).
  // Customers reach the cashier from here instead of crossing either one.
  linkSouthOfCounter(index, frontWestId, aisleX) {
    const southZ = 4.55;
    const westId = `section${index}-south-west`;
    const eastId = `section${index}-south-east`;
    this.addNode(node(westId, aisleX, southZ, 'lane'));
    this.addNode(node(eastId, aisleX + 3.95, southZ, 'lane'));
    this.linkBoth(frontWestId, westId);
    this.linkBoth(westId, eastId);
    this.linkBoth(eastId, `section${index}-broom-west-north`);
  }

  addNode(entry) {
    this.nodeList.push(entry);
    this.nodes.set(entry.id, entry);
    this.links.set(entry.id, []);
    if (entry.kind === 'pick') {
      this.pickIds.push(entry.id);
    }
    return entry;
  }

  linkBoth(fromId, toId) {
    this.addLink(fromId, toId, false);
    this.addLink(toId, fromId, false);
  }

  addLink(fromId, toId, leave) {
    this.links.get(fromId).push({ id: toId, leave });
  }

  shiftCheckout(dx, dz) {
    for (let i = 0; i < this.nodeList.length; i += 1) {
      const node = this.nodeList[i];
      if (!node.id.startsWith('queue') && node.id !== 'checkoutApproach') {
        continue;
      }
      if (node.homeX == null) {
        node.homeX = node.x;
        node.homeZ = node.z;
        node.homeLook = node.look ? [node.look[0], node.look[1]] : null;
      }
      node.x = node.homeX + dx;
      node.z = node.homeZ + dz;
      if (node.homeLook) {
        node.look[0] = node.homeLook[0] + dx;
        node.look[1] = node.homeLook[1] + dz;
      }
    }
  }

  retargetLooks(moves) {
    for (let i = 0; i < this.nodeList.length; i += 1) {
      const node = this.nodeList[i];
      if (!node.look || node.id.startsWith('queue')) {
        continue;
      }
      if (!node.lookHome) {
        node.lookHome = [node.look[0], node.look[1]];
      }
      let nextX = node.lookHome[0];
      let nextZ = node.lookHome[1];
      for (let m = 0; m < moves.length; m += 1) {
        const move = moves[m];
        if (Math.abs(node.lookHome[0] - move.fromX) < 0.02 && Math.abs(node.lookHome[1] - move.fromZ) < 0.02) {
          nextX = move.toX;
          nextZ = move.toZ;
        }
      }
      node.look[0] = nextX;
      node.look[1] = nextZ;
    }
  }

  // A replaced shelf turns its collision back on. Walk points that sit in that
  // volume are slid out, and anyone already standing there is pushed out too.
  releaseBlocked(collision, id, radius) {
    const moved = new Set();
    const boxes = this.fixtureBoxes(collision, id);
    if (boxes.length === 0) {
      return moved;
    }
    const clearance = radius > 0 ? radius : 0.26;
    for (let n = 0; n < this.nodeList.length; n += 1) {
      const entry = this.nodeList[n];
      if (entry.kind !== 'lane' && entry.kind !== 'pick' && entry.kind !== 'approach') {
        continue;
      }
      let shifted = false;
      for (let pass = 0; pass < 3; pass += 1) {
        let hit = false;
        for (let b = 0; b < boxes.length; b += 1) {
          if (!this.covered(entry.x, entry.z, boxes[b], clearance)) {
            continue;
          }
          const next = this.exitBox(entry.x, entry.z, boxes[b], clearance);
          entry.x = next.x;
          entry.z = next.z;
          hit = true;
          shifted = true;
        }
        if (!hit) {
          break;
        }
      }
      if (shifted) {
        moved.add(entry.id);
      }
    }
    return moved;
  }

  escapePoint(x, z, collision, id, radius) {
    const boxes = this.fixtureBoxes(collision, id);
    const clearance = radius > 0 ? radius : 0.22;
    let px = x;
    let pz = z;
    let freed = false;
    for (let pass = 0; pass < 3; pass += 1) {
      let hit = false;
      for (let b = 0; b < boxes.length; b += 1) {
        if (!this.covered(px, pz, boxes[b], 0.02)) {
          continue;
        }
        const next = this.exitBox(px, pz, boxes[b], clearance);
        px = next.x;
        pz = next.z;
        hit = true;
        freed = true;
      }
      if (!hit) {
        break;
      }
    }
    return freed ? { x: px, z: pz } : null;
  }

  fixtureBoxes(collision, id) {
    const boxes = [];
    const all = collision?.boxes ?? [];
    for (let i = 0; i < all.length; i += 1) {
      const box = all[i];
      if (box.enabled === false) {
        continue;
      }
      if (id) {
        if (box.id === id) {
          boxes.push(box);
        }
        continue;
      }
      if (isFixtureCollisionId(box.id)) {
        boxes.push(box);
      }
    }
    return boxes;
  }

  covered(x, z, box, radius) {
    return x > box.minX - radius
      && x < box.maxX + radius
      && z > box.minZ - radius
      && z < box.maxZ + radius;
  }

  exitBox(x, z, box, radius) {
    const minX = box.minX - radius;
    const maxX = box.maxX + radius;
    const minZ = box.minZ - radius;
    const maxZ = box.maxZ + radius;
    const options = [
      { x: minX - 0.06, z, cost: Math.max(0, x - minX) },
      { x: maxX + 0.06, z, cost: Math.max(0, maxX - x) },
      { x, z: minZ - 0.06, cost: Math.max(0, z - minZ) + 0.45 },
      { x, z: maxZ + 0.06, cost: Math.max(0, maxZ - z) }
    ];
    let best = options[0];
    for (let i = 1; i < options.length; i += 1) {
      if (options[i].cost < best.cost) {
        best = options[i];
      }
    }
    return best;
  }

  nearest(x, z, avoidQueue) {
    let best = this.nodeList[0];
    let bestDistance = Infinity;
    for (let i = 0; i < this.nodeList.length; i += 1) {
      const entry = this.nodeList[i];
      if (entry.kind === 'vanish') {
        continue;
      }
      if (avoidQueue && (entry.kind === 'queue' || entry.id.startsWith('lane-'))) {
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
    const target = this.nodes.get(targetId);
    if (target?.kind === 'queue' && target.id.includes('-q')) {
      return this.routeCheckoutSlot(x, z, target);
    }
    const start = this.nearest(x, z, target?.kind === 'queue' ? avoidQueue : true);
    const ids = this.findPath(start.id, targetId, avoidQueue) ?? [targetId];
    const path = ids.map((id) => this.nodes.get(id)).filter(Boolean);
    return this.trimBacktrack(path, x, z);
  }

  routeCheckoutSlot(x, z, target) {
    const split = target.id.lastIndexOf('-q');
    const prefix = split >= 0 ? target.id.slice(0, split) : '';
    const index = Number(target.id.slice(split + 2));
    const line = [];
    if (prefix && Number.isFinite(index)) {
      for (let i = 0; i < index + 8; i += 1) {
        const slot = this.nodes.get(`${prefix}-q${i}`);
        if (!slot) {
          break;
        }
        line.push(slot);
      }
    }
    if (!line.length) {
      line.push(target);
    }
    const goalIndex = Math.min(index, line.length - 1);
    let nearIndex = 0;
    let nearDistance = Infinity;
    for (let i = 0; i < line.length; i += 1) {
      const dx = line[i].x - x;
      const dz = line[i].z - z;
      const distance = dx * dx + dz * dz;
      if (distance < nearDistance) {
        nearDistance = distance;
        nearIndex = i;
      }
    }
    // Already beside this register: walk only toward the assigned spot.
    // Restarting from the aisle is what made them circle the counter.
    if (nearDistance < 1.4 * 1.4) {
      const path = [];
      const from = Math.max(nearIndex, goalIndex);
      for (let i = from; i >= goalIndex; i -= 1) {
        path.push(line[i]);
      }
      return path;
    }
    const slots = [];
    for (let i = line.length - 1; i >= goalIndex; i -= 1) {
      slots.push(line[i]);
    }
    const outside = this.nearest(x, z, true);
    const anchor = this.nodes.get(target.id) ? this.laneAnchor(target) : null;
    const approachId = anchor?.id ?? outside.id;
    const into = this.findPath(outside.id, approachId, true) ?? [approachId];
    const path = [];
    for (let i = 0; i < into.length; i += 1) {
      const point = this.nodes.get(into[i]);
      if (point && path[path.length - 1]?.id !== point.id) {
        path.push(point);
      }
    }
    for (let i = 0; i < slots.length; i += 1) {
      if (path[path.length - 1]?.id !== slots[i].id) {
        path.push(slots[i]);
      }
    }
    return this.trimBacktrack(path, x, z);
  }

  laneAnchor(slot) {
    const index = sectionIndexAt(slot.x);
    return this.nodes.get(`section${index}-west-front`) ?? null;
  }

  trimBacktrack(path, x, z) {
    if (path.length <= 1) {
      return path;
    }
    while (path.length > 1) {
      const next = path[1];
      const first = path[0];
      const shopperToNext = (next.x - x) * (next.x - x) + (next.z - z) * (next.z - z);
      const firstToNext = (next.x - first.x) * (next.x - first.x) + (next.z - first.z) * (next.z - first.z);
      if (shopperToNext + 0.05 < firstToNext) {
        path.shift();
        continue;
      }
      break;
    }
    return path;
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

  // A lane or stocked shelf that can actually be walked to from here.
  interiorSpot(x, z, exceptId) {
    const start = this.nearest(x, z, true);
    const startId = start?.id ?? null;
    const pool = [];
    for (let i = 0; i < this.nodeList.length; i += 1) {
      const entry = this.nodeList[i];
      if (entry.id === exceptId) {
        continue;
      }
      if (entry.kind !== 'lane' && entry.kind !== 'pick') {
        continue;
      }
      if (entry.stocked === false) {
        continue;
      }
      const dx = entry.x - x;
      const dz = entry.z - z;
      if (dx * dx + dz * dz < 1.1) {
        continue;
      }
      if (startId) {
        const path = this.findPath(startId, entry.id, true);
        if (!path || path.length === 0) {
          continue;
        }
      }
      pool.push(entry.id);
    }
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (startId && startId !== exceptId) {
      return startId;
    }
    return 'centerSouth';
  }

  randomPick(exceptId) {
    const stocked = [];
    for (let i = 0; i < this.pickIds.length; i += 1) {
      const id = this.pickIds[i];
      const spot = this.nodes.get(id);
      if (!spot || spot.stocked === false || id === exceptId) {
        continue;
      }
      stocked.push(id);
    }
    const pool = stocked.length ? stocked : this.pickIds.filter((id) => this.nodes.get(id)?.stocked !== false);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  createDebug(scene) {
    const group = new THREE.Group();
    group.name = 'shopper-nav-debug';
    const geometry = new THREE.SphereGeometry(0.06, 8, 6);
    const positions = [];

    for (let i = 0; i < this.nodeList.length; i += 1) {
      const entry = this.nodeList[i];
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
    for (let i = 0; i < this.nodeList.length; i += 1) {
      const from = this.nodeList[i];
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
  if (kind === 'door' || kind === 'spawn' || kind === 'exit' || kind === 'vanish') {
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
      if (this.path.length > 0 && this.index >= this.path.length) {
        return 'arrived';
      }
      return 'idle';
    }

    const buried = this.navigation.escapePoint(position.x, position.z, collision, null, radius);
    if (buried && this.targetId) {
      position.x = buried.x;
      position.z = buried.z;
      position.y = 0;
      this.setTarget(position.x, position.z, this.targetId, this.avoidQueue);
      return 'moving';
    }

    const dx = point.x - position.x;
    const dz = point.z - position.z;
    const distance = Math.hypot(dx, dz);
    const reach = this.config.waypointReachDistance;
    if (collision.blocksMovement(point.x, point.z, 0.05) && distance <= 2) {
      this.stuckTime = 0;
      this.hasAnchor = false;
      if (this.index < this.path.length - 1) {
        this.index += 1;
        this.skipReached(position.x, position.z);
        this.draw();
        return 'moving';
      }
      this.index = this.path.length;
      return 'arrived';
    }
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

    let budget = Math.min(this.config.moveSpeed * dt, distance);
    const cap = this.config.maxStep > 0 ? this.config.maxStep : budget;
    let movedStep = null;
    let guard = 0;
    while (budget > 0.0001 && guard < 8) {
      guard += 1;
      const cx = point.x - position.x;
      const cz = point.z - position.z;
      const left = Math.hypot(cx, cz);
      if (left <= reach) {
        break;
      }
      const step = Math.min(cap, budget, left);
      const piece = this.stepAround(position, collision, radius, cx / left, cz / left, step, point.x, point.z, left);
      if (!piece) {
        break;
      }
      position.x = piece.x;
      position.z = piece.z;
      position.y = 0;
      movedStep = piece;
      budget -= step;
    }
    if (movedStep) {
      this.face(group, movedStep.nx, movedStep.nz, dt);
    }

    const moved = Math.hypot(position.x - this.anchorX, position.z - this.anchorZ);
    if (moved < this.config.stuckDistance) {
      this.stuckTime += dt;
      if (this.stuckTime >= this.config.stuckTimeout) {
        if (this.index < this.path.length - 1) {
          this.index += 1;
          this.stuckTime = 0;
          this.hasAnchor = false;
          this.skipReached(position.x, position.z);
          this.draw();
          return 'moving';
        }
        if (this.giveUpBlockedQueue(position, collision, radius) || this.recover(position, collision, radius)) {
          return 'arrived';
        }
      }
    } else {
      this.anchorX = position.x;
      this.anchorZ = position.z;
      this.stuckTime = 0;
    }
    return 'moving';
  }

  stepAround(position, collision, radius, nx, nz, step, pointX, pointZ, distance) {
    const options = [
      [nx, nz],
      [nx, 0],
      [0, nz],
      [nz, -nx],
      [-nz, nx]
    ];
    for (let i = 0; i < options.length; i += 1) {
      const ox = options[i][0];
      const oz = options[i][1];
      const length = Math.hypot(ox, oz);
      if (length < 0.001) {
        continue;
      }
      const sx = (ox / length) * step;
      const sz = (oz / length) * step;
      if (collision.blocksMovement(position.x + sx, position.z + sz, radius)) {
        continue;
      }
      const remainX = pointX - (position.x + sx);
      const remainZ = pointZ - (position.z + sz);
      if (i > 0 && remainX * remainX + remainZ * remainZ > distance * distance + 0.08) {
        continue;
      }
      return {
        x: position.x + sx,
        z: position.z + sz,
        nx: ox / length,
        nz: oz / length
      };
    }
    return null;
  }

  giveUpBlockedQueue(position, collision, radius) {
    const goal = this.navigation.nodes.get(this.targetId);
    if (!goal || goal.kind !== 'queue') {
      return false;
    }
    const dx = goal.x - position.x;
    const dz = goal.z - position.z;
    if (dx * dx + dz * dz > 1.15 * 1.15) {
      return false;
    }
    if (!collision.blocksMovement(goal.x, goal.z, Math.min(radius, 0.12))) {
      position.x = goal.x;
      position.z = goal.z;
      position.y = 0;
    }
    this.path = [goal];
    this.index = this.path.length;
    this.stuckTime = 0;
    this.recoveries = 0;
    return true;
  }

  recover(position, collision, radius) {
    this.stuckTime = 0;
    this.hasAnchor = false;
    this.recoveries += 1;
    const goal = this.navigation.nodes.get(this.targetId);
    // Vanish points sit past the map edge. A blocked thief used to stand on the road forever.
    if (goal?.kind === 'vanish') {
      this.index = this.path.length;
      this.recoveries = 0;
      return true;
    }
    if (goal && !collision.blocksMovement(goal.x, goal.z, Math.min(radius, 0.12))) {
      const dx = goal.x - position.x;
      const dz = goal.z - position.z;
      if (dx * dx + dz * dz <= 1.6 * 1.6) {
        position.x = goal.x;
        position.z = goal.z;
        position.y = 0;
        this.index = this.path.length;
        this.recoveries = 0;
        return true;
      }
    }
    this.path = this.navigation.route(position.x, position.z, this.targetId, this.avoidQueue);
    this.index = 0;
    this.recoveries = 0;
    this.skipReached(position.x, position.z);
    this.draw();
    return false;
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

  halt() {
    this.path = [];
    this.index = 0;
    this.targetId = null;
    this.stuckTime = 0;
    this.recoveries = 0;
    this.hasAnchor = false;
    this.clear();
  }

  get point() {
    return this.path[this.index] ?? null;
  }
}
