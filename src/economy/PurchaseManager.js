import * as THREE from 'three';
import { UpgradeInvestment } from './UpgradeInvestment.js';
import { PurchaseSquare } from './PurchaseSquare.js';
import {
  fixtureById,
  sectionEast,
  storeSections
} from '../world/StoreSections.js';

const EXIT_PADDING = 0.16;
const EXPANSION_HALF_X = 0.62;
const EXPANSION_HALF_Z = 0.62;
const FURNITURE_HALF = 0.52;
const INTERIOR_NORTH = -4.02;
const INTERIOR_SOUTH = 5.02;
const COIN_POOL = 24;

function expansionId(sectionId) {
  return `unlock_${sectionId}`;
}

function clampToInterior(x, z, halfX, halfZ, west, east) {
  const minX = west + halfX + 0.2;
  const maxX = east - halfX - 0.28;
  const minZ = INTERIOR_NORTH + halfZ;
  const maxZ = INTERIOR_SOUTH - halfZ;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z))
  };
}

export class PurchaseManager {
  constructor(scene, store, money, upgrades, save, config) {
    this.scene = scene;
    this.store = store;
    this.money = money;
    this.upgrades = upgrades;
    this.save = save;
    this.interval = config?.paymentInterval > 0 ? config.paymentInterval : 0.04;
    this.openShop = config?.openShop ?? null;
    this.offers = [];
    this.fading = [];
    this.heldShelves = [];
    this.playerRadius = 0.22;
    this.active = null;
    this.owned = new Set();
    this.busy = false;
    this.coins = this.createCoins();
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this.openHold = 0;
    this.openPad = null;
    this.createOpenPad();
  }

  restoreOwned(ids) {
    const list = Array.isArray(ids) ? ids : [];
    for (let i = 0; i < list.length; i += 1) {
      this.owned.add(list[i]);
    }
  }

  syncOffers() {
    for (let s = this.store.maxUnlocked + 1; s < storeSections.length; s += 1) {
      this.ensureExpansion(storeSections[s]);
    }

    for (let s = 0; s < storeSections.length; s += 1) {
      const section = storeSections[s];
      const fixtures = section.fixtures;
      for (let i = 0; i < fixtures.length; i += 1) {
        const fixture = fixtures[i];
        if (fixture.existing || fixture.purchasedByDefault || this.owned.has(fixture.id)) {
          continue;
        }
        if (this.store.spawnedFixtures.has(fixture.id)) {
          continue;
        }
        this.ensureFurniture(fixture, section);
      }
    }

    for (let i = this.offers.length - 1; i >= 0; i -= 1) {
      const offer = this.offers[i];
      const staleFurniture = offer.type === 'furniture' && (this.owned.has(offer.fixtureId) || this.store.spawnedFixtures.has(offer.fixtureId));
      if (!staleFurniture) {
        continue;
      }
      if (this.active === offer && !offer.investment.purchased) {
        this.cancel(offer);
      }
      this.offers.splice(i, 1);
      offer.view.dispose();
      if (this.active === offer) {
        this.active = null;
      }
    }
  }

  ensureExpansion(section) {
    const id = expansionId(section.id);
    if (this.offers.some((offer) => offer.id === id)) {
      return;
    }
    const doorIndex = Math.max(0, section.index - 1);
    const west = sectionEast(doorIndex) - 7;
    const east = sectionEast(doorIndex);
    const placed = section.id === 'electronics'
      ? { x: 2.237, z: 0 }
      : clampToInterior(east - 1.05, 2.55, EXPANSION_HALF_X, EXPANSION_HALF_Z, west, east);
    this.addOffer({
      id,
      type: 'store_expansion',
      price: section.expansionCost,
      label: `UNLOCK ${section.name}`,
      sectionId: section.id,
      fixtureId: null,
      fixture: null,
      x: placed.x,
      z: placed.z,
      halfX: EXPANSION_HALF_X,
      halfZ: EXPANSION_HALF_Z,
      half: Math.max(EXPANSION_HALF_X, EXPANSION_HALF_Z),
      accent: 0xffca45
    });
  }

  ensureFurniture(fixture, section) {
    if (this.offers.some((offer) => offer.id === fixture.id)) {
      return;
    }
    const west = sectionEast(section.index) - 7;
    const east = sectionEast(section.index);
    const placed = clampToInterior(
      fixture.position[0],
      fixture.position[2],
      FURNITURE_HALF,
      FURNITURE_HALF,
      west,
      east
    );
    this.addOffer({
      id: fixture.id,
      type: 'furniture',
      price: fixture.price,
      label: fixture.name,
      sectionId: fixture.sectionId,
      fixtureId: fixture.id,
      fixture,
      x: placed.x,
      z: placed.z,
      halfX: FURNITURE_HALF,
      halfZ: FURNITURE_HALF,
      half: FURNITURE_HALF,
      accent: section?.accent ?? 0x3a78d0
    });
  }

  addOffer(spec) {
    const investment = new UpgradeInvestment(spec.price);
    const view = new PurchaseSquare(spec);
    view.root.visible = this.upgradesOpen();
    this.scene.add(view.root);
    this.offers.push({
      ...spec,
      investment,
      view,
      savedPaid: 0
    });
  }

  upgradesOpen() {
    return this.upgrades?.canPurchase() === true;
  }

  presentForEditor(editing) {
    this.editorReveal = editing === true;
    this.syncOffers();
    this.setNightVisible(this.upgradesOpen());
    if (this.openPad) {
      this.openPad.root.visible = this.editorReveal === true;
    }
  }

  syncSquare(root) {
    if (!root) {
      return;
    }
    root.position.y = 0;
    const x = root.position.x;
    const z = root.position.z;
    if (this.openPad?.root === root && this.openShop) {
      this.openShop.x = x;
      this.openShop.z = z;
      return;
    }
    for (let i = 0; i < this.offers.length; i += 1) {
      const offer = this.offers[i];
      if (offer.view.root !== root) {
        continue;
      }
      offer.x = x;
      offer.z = z;
      return;
    }
  }

  createOpenPad() {
    const spot = this.openShop;
    if (!spot) {
      return;
    }
    this.openHalf = EXPANSION_HALF_X;
    this.openHoldSeconds = spot.holdSeconds > 0 ? spot.holdSeconds : 1;
    this.openPad = new PurchaseSquare({
      id: 'open-shop',
      label: 'OPEN SHOP',
      x: spot.x,
      z: spot.z,
      halfX: this.openHalf,
      halfZ: this.openHalf,
      half: this.openHalf,
      accent: 0xffca45,
      meter: 'hold'
    });
    this.openPad.root.visible = false;
    this.scene.add(this.openPad.root);
  }

  updateOpenPad(dt, playing, x, z) {
    const pad = this.openPad;
    if (!pad) {
      return;
    }
    const show = playing && this.upgradesOpen() && this.openShop?.canOpen?.() === true;
    pad.root.visible = show;
    if (!show) {
      this.openHold = 0;
      pad.setState(0, 1, 'idle');
      return;
    }
    const inside = Math.abs(x - this.openShop.x) <= this.openHalf
      && Math.abs(z - this.openShop.z) <= this.openHalf;
    if (!inside) {
      this.openHold = 0;
    } else {
      this.openHold = Math.min(1, this.openHold + dt / this.openHoldSeconds);
    }
    const shown = Math.round(this.openHold * 100) / 100;
    pad.setState(shown, 1, this.openHold > 0 ? 'paying' : 'idle');
    pad.update(dt);
    if (this.openHold >= 1) {
      this.openHold = 0;
      pad.setState(0, 1, 'idle');
      this.openShop.onOpen?.();
    }
  }

  setNightVisible(open) {
    const reveal = this.editorReveal === true;
    const nextIndex = this.store.maxUnlocked + 1;
    for (let i = 0; i < this.offers.length; i += 1) {
      const offer = this.offers[i];
      const sectionIndex = storeSections.findIndex((section) => section.id === offer.sectionId);
      const nextUnlock = offer.type === 'store_expansion' && sectionIndex === nextIndex;
      const inOpenShop = offer.type !== 'store_expansion' && (sectionIndex < 0 || sectionIndex <= this.store.maxUnlocked);
      offer.view.root.visible = reveal || (open && (nextUnlock || inOpenShop));
    }
    for (let i = 0; i < this.fading.length; i += 1) {
      this.fading[i].view.root.visible = open;
    }
  }

  contains(offer, x, z, padded) {
    const pad = padded ? EXIT_PADDING : 0;
    const halfX = (offer.halfX ?? offer.half) + pad;
    const halfZ = (offer.halfZ ?? offer.half) + pad;
    return Math.abs(x - offer.x) <= halfX && Math.abs(z - offer.z) <= halfZ;
  }

  nearestInside(x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (let i = 0; i < this.offers.length; i += 1) {
      const offer = this.offers[i];
      if (offer.investment.purchased || !offer.view.root.visible || !this.contains(offer, x, z, false)) {
        continue;
      }
      const dx = x - offer.x;
      const dz = z - offer.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        best = offer;
        bestDistance = distance;
      }
    }
    return best;
  }

  update(dt, playing, x, z) {
    this._playerX = x;
    this._playerZ = z;
    this.releaseHeldShelves(x, z);
    this.updateCoins(dt);
    this.updateFading(dt);
    for (let i = 0; i < this.offers.length; i += 1) {
      this.offers[i].view.update(dt);
    }
    const open = this.upgradesOpen();
    this.setNightVisible(open);
    this.updateOpenPad(dt, playing, x, z);
    if (!open) {
      if (playing && this.active && !this.active.investment.purchased) {
        this.cancel(this.active);
        this.active = null;
      }
      this.refreshViews();
      return;
    }
    if (!playing || this.busy) {
      this.refreshViews();
      return;
    }

    let occupied = null;
    if (this.active && !this.active.investment.purchased && this.contains(this.active, x, z, true)) {
      occupied = this.active;
    } else {
      occupied = this.nearestInside(x, z);
    }

    if (this.active && this.active !== occupied) {
      this.cancel(this.active);
      this.active = null;
    }

    if (occupied && !occupied.investment.purchased) {
      this.active = occupied;
      const before = occupied.investment.invested;
      const result = this.withoutPersist(() => occupied.investment.tick(this.money, dt, true, this.interval));
      const gained = occupied.investment.invested - before;
      if (gained > 0) {
        this.emitCoins(x, z, occupied.x, occupied.z, Math.min(gained, 8));
      }
      if (result === 'purchased') {
        this.commit(occupied);
      } else if (gained > 0) {
        this.writePending(occupied);
      }
    }

    this.refreshViews();
  }

  refreshViews() {
    const wallet = this.money.getMoney();
    for (let i = 0; i < this.offers.length; i += 1) {
      const offer = this.offers[i];
      const paid = offer.investment.invested;
      let mode = 'idle';
      if (this.active === offer && wallet < 1 && paid < offer.price) {
        mode = 'paused';
      } else if (this.active === offer && paid > 0) {
        mode = 'paying';
      }
      offer.view.setState(paid, offer.price, mode);
    }
  }

  withoutPersist(fn) {
    const persist = this.money.persist;
    this.money.persist = null;
    try {
      return fn();
    } finally {
      this.money.persist = persist;
    }
  }

  writePending(offer) {
    this.save.write({
      pendingPurchase: {
        id: offer.id,
        amountPaid: offer.investment.invested
      },
      money: this.money.getMoney()
    });
    offer.savedPaid = offer.investment.invested;
  }

  cancel(offer) {
    if (!offer || offer.investment.purchased) {
      return 0;
    }
    const refund = offer.investment.invested;
    offer.investment.invested = 0;
    offer.investment.elapsed = 0;
    offer.savedPaid = 0;
    if (refund > 0) {
      this.withoutPersist(() => this.money.addMoney(refund));
      this.emitCoins(offer.x, offer.z, this._playerX ?? offer.x, this._playerZ ?? offer.z, Math.min(6, refund));
    }
    this.save.write({ pendingPurchase: null, money: this.money.getMoney() });
    return refund;
  }

  commit(offer) {
    if (this.busy || offer.investment.purchased !== true) {
      return;
    }
    this.busy = true;
    this.active = null;
    const index = this.offers.indexOf(offer);
    if (index >= 0) {
      this.offers.splice(index, 1);
    }
    this.fading.push(offer);
    offer.retireLife = 0.28;

    if (offer.type === 'store_expansion') {
      const opened = this.store.unlockSection(offer.sectionId);
      if (!opened) {
        this.fading = this.fading.filter((item) => item !== offer);
        offer.view.dispose();
        offer.investment.purchased = false;
        offer.investment.invested = 0;
        this.withoutPersist(() => this.money.addMoney(offer.price));
        this.save.write({ pendingPurchase: null, money: this.money.getMoney() });
        this.busy = false;
        return;
      }
      this.upgrades.markPurchased(`section-${offer.sectionId}`);
      this.save.write({
        pendingPurchase: null,
        money: this.money.getMoney(),
        unlockedSections: this.store.unlockedIds(),
        purchasedUpgrades: [...this.upgrades.purchased]
      });
    } else {
      this.owned.add(offer.fixtureId);
      this.save.write({
        pendingPurchase: null,
        money: this.money.getMoney(),
        unlockedSections: this.store.unlockedIds(),
        purchasedFixtures: this.purchasedIds()
      });
      const fixture = offer.fixture ?? fixtureById.get(offer.fixtureId);
      if (fixture) {
        this.store.holdFixtureCollision(fixture.id);
        this.heldShelves.push({
          id: fixture.id,
          x: offer.x,
          z: offer.z,
          halfX: offer.halfX ?? offer.half,
          halfZ: offer.halfZ ?? offer.half
        });
        this.store.spawnFixture(fixture).catch((error) => {
          console.error('Failed to place fixture', offer.fixtureId, error);
        });
      }
    }

    this.syncOffers();
    this.busy = false;
  }

  releaseHeldShelves(x, z) {
    for (let i = this.heldShelves.length - 1; i >= 0; i -= 1) {
      const held = this.heldShelves[i];
      if (this.contains(held, x, z, true)) {
        continue;
      }
      const spawned = this.store.collision.boxes.some((box) => box.id === held.id);
      if (!spawned || this.store.collision.overlapsId(held.id, x, z, this.playerRadius)) {
        continue;
      }
      this.store.releaseFixtureCollision(held.id);
      this.heldShelves.splice(i, 1);
    }
  }

  purchasedIds() {
    const ids = [];
    for (const id of this.owned) {
      const fixture = fixtureById.get(id);
      if (fixture && !fixture.purchasedByDefault && !fixture.existing) {
        ids.push(id);
      }
    }
    return ids;
  }

  updateFading(dt) {
    for (let i = this.fading.length - 1; i >= 0; i -= 1) {
      const offer = this.fading[i];
      offer.retireLife -= dt;
      const life = Math.max(0, offer.retireLife / 0.28);
      offer.view.root.scale.setScalar(1 + (1 - life) * 0.18);
      offer.view.labelMaterial.opacity = life;
      offer.view.outline.material.opacity = life;
      if (offer.retireLife <= 0) {
        offer.view.dispose();
        this.fading.splice(i, 1);
      }
    }
  }

  createCoins() {
    const coins = [];
    const geometry = new THREE.CircleGeometry(0.07, 10);
    for (let i = 0; i < COIN_POOL; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffca45,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      coins.push({
        mesh,
        life: 0,
        from: new THREE.Vector3(),
        to: new THREE.Vector3()
      });
    }
    this.coinGeometry = geometry;
    return coins;
  }

  emitCoins(fromX, fromZ, toX, toZ, count) {
    const total = Math.max(0, count | 0);
    for (let n = 0; n < total; n += 1) {
      let slot = null;
      for (let i = 0; i < this.coins.length; i += 1) {
        if (this.coins[i].life <= 0) {
          slot = this.coins[i];
          break;
        }
      }
      if (!slot) {
        return;
      }
      slot.life = 1;
      slot.from.set(fromX, 0.7, fromZ);
      slot.to.set(toX, 0.35, toZ);
      slot.mesh.visible = true;
      slot.mesh.position.copy(slot.from);
      slot.mesh.material.opacity = 1;
    }
  }

  updateCoins(dt) {
    const step = dt / 0.26;
    for (let i = 0; i < this.coins.length; i += 1) {
      const coin = this.coins[i];
      if (coin.life <= 0) {
        continue;
      }
      coin.life = Math.max(0, coin.life - step);
      const t = 1 - coin.life;
      coin.mesh.position.lerpVectors(coin.from, coin.to, t);
      coin.mesh.position.y += Math.sin(t * Math.PI) * 0.42;
      coin.mesh.material.opacity = coin.life;
      if (coin.life <= 0) {
        coin.mesh.visible = false;
      }
    }
  }

  describe() {
    const active = this.active;
    if (!active) {
      return `squares ${this.offers.length}`;
    }
    return `${active.id} ${active.investment.invested}/${active.price}`;
  }
}

export function expansionSquareId(sectionId) {
  return expansionId(sectionId);
}
