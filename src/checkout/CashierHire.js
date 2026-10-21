import * as THREE from 'three';
import { HiredCashier } from './HiredCashier.js';

const _forward = { x: 0, z: 1 };
const _left = { x: -1, z: 0 };

function isCheckoutCounter(object) {
  const name = object?.name || '';
  const model = object.userData?.editorModel || '';
  return name === 'cash-register'
    || name.startsWith('cash-register-')
    || name.startsWith('cash-register_')
    || (typeof model === 'string' && model.includes('cash-register'));
}

function findCheckoutCounters(scene) {
  const counters = [];
  scene.traverse((object) => {
    if (!isCheckoutCounter(object)) {
      return;
    }
    let parent = object.parent;
    while (parent) {
      if (isCheckoutCounter(parent)) {
        return;
      }
      parent = parent.parent;
    }
    counters.push(object);
  });
  counters.sort((a, b) => {
    const name = a.name.localeCompare(b.name);
    if (name !== 0) {
      return name;
    }
    return a.position.x - b.position.x || a.position.z - b.position.z;
  });
  return counters;
}

function padId(index) {
  return `cashier_upgrade_${String(index).padStart(2, '0')}`;
}

export class CashierHire {
  constructor(options) {
    this.scene = options.scene;
    this.loader = options.loader;
    this.money = options.money;
    this.upgrades = options.upgrades;
    this.save = options.save;
    this.upgradeManager = options.upgradeManager;
    this.checkout = options.checkout;
    this.shoppers = options.shoppers;
    this.toonFactory = options.toonFactory;
    this.config = options.config ?? {};
    this.stations = [];
    this.shift = false;
    this.world = new THREE.Vector3();
    this.syncLayout();
  }

  syncLayout() {
    const counters = findCheckoutCounters(this.scene);
    for (let i = 0; i < counters.length; i += 1) {
      if (!this.stationFor(counters[i])) {
        this.stations.push(this.createStation(counters[i]));
      }
    }
    this.assignPrimary();
    for (let i = 0; i < this.stations.length; i += 1) {
      if (counters.includes(this.stations[i].register)) {
        this.layout(this.stations[i]);
      }
    }
    this.applyAutomation();
  }

  assignPrimary() {
    let primary = null;
    for (let i = 0; i < this.stations.length; i += 1) {
      if (this.stations[i].register.userData?.editorId === 'cash-register') {
        primary = this.stations[i];
        break;
      }
    }
    if (!primary) {
      primary = this.stations.find((station) => station.register.name === 'cash-register') ?? this.stations[0] ?? null;
    }
    for (let i = 0; i < this.stations.length; i += 1) {
      this.stations[i].servesMainQueue = this.stations[i] === primary;
    }
  }

  stationFor(register) {
    for (let i = 0; i < this.stations.length; i += 1) {
      if (this.stations[i].register === register) {
        return this.stations[i];
      }
    }
    return null;
  }

  createStation(register) {
    const index = this.stations.length + 1;
    const id = padId(index);
    const station = {
      id,
      register,
      servesMainQueue: false,
      standX: 0,
      standZ: 0,
      faceX: 0,
      faceZ: 0,
      cashier: new HiredCashier({
        scene: this.scene,
        loader: this.loader,
        toonFactory: this.toonFactory,
        stationId: id,
        config: this.config
      })
    };
    const alreadyOwned = this.upgrades.owns(id);
    station.pad = this.upgradeManager.add({
      id,
      name: 'HIRE CASHIER',
      cost: this.config.cost ?? 60,
      position: [0, 0],
      halfSize: this.config.halfSize ?? 0.72,
      circular: true,
      retainWhenOwned: true,
      showFloorTitle: true,
      requireFull: true,
      banner: false,
      hiredText: '',
      onPurchase: () => {
        station.cashier.hire();
        station.cashier.place(station.standX, station.standZ, station.faceX, station.faceZ);
        this.applyAutomation();
        if (!alreadyOwned) {
          this.save.write({
            purchasedUpgrades: [...this.upgrades.purchased],
            money: this.money.getMoney()
          });
        }
      }
    });
    return station;
  }

  layout(station) {
    const register = station.register;
    register.updateWorldMatrix(true, false);
    register.getWorldPosition(this.world);
    const registerX = this.world.x;
    const registerZ = this.world.z;
    const basis = this.standOffset();
    const standX = station.servesMainQueue ? this.checkout.zoneX : registerX + basis.x;
    const standZ = station.servesMainQueue ? this.checkout.zoneZ : registerZ + basis.z;
    let forwardX = standX - registerX;
    let forwardZ = standZ - registerZ;
    const length = Math.hypot(forwardX, forwardZ);
    if (length < 0.2) {
      forwardX = _forward.x;
      forwardZ = _forward.z;
    } else {
      forwardX /= length;
      forwardZ /= length;
    }
    const leftX = -forwardZ;
    const leftZ = forwardX;
    const gap = this.config.padGap ?? 1.2;
    station.standX = standX;
    station.standZ = standZ;
    const face = this.faceOffset();
    station.faceX = standX + face.x;
    station.faceZ = standZ + face.z;
    station.pad.setPosition(registerX + leftX * gap, registerZ + leftZ * gap);
    station.cashier.place(standX, standZ, station.faceX, station.faceZ);
  }

  standOffset() {
    const primary = this.primary();
    if (!primary) {
      return { x: 0.13, z: 1.15 };
    }
    primary.register.updateWorldMatrix(true, false);
    primary.register.getWorldPosition(this.world);
    return {
      x: this.checkout.zoneX - this.world.x,
      z: this.checkout.zoneZ - this.world.z
    };
  }

  faceOffset() {
    const queue = this.shoppers?.navigation?.nodes?.get('queue0');
    if (!queue) {
      return { x: _left.x, z: _left.z };
    }
    return {
      x: queue.x - this.checkout.zoneX,
      z: queue.z - this.checkout.zoneZ
    };
  }

  primary() {
    for (let i = 0; i < this.stations.length; i += 1) {
      if (this.stations[i].servesMainQueue) {
        return this.stations[i];
      }
    }
    return this.stations[0] ?? null;
  }

  setShift(active) {
    this.shift = active === true;
    this.applyAutomation();
  }

  applyAutomation() {
    const primary = this.primary();
    const hired = primary?.cashier?.hired === true;
    this.checkout.setAutomated(this.shift && hired);
  }

  update(dt) {
    for (let i = 0; i < this.stations.length; i += 1) {
      this.stations[i].cashier.update(dt);
    }
  }
}
