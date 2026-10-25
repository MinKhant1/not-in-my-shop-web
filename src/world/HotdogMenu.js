import * as THREE from 'three';
import { UpgradePad } from '../economy/UpgradePad.js';

const COST = 100;
const HALF = 0.46;
const STEP = 1.12;

const MENU = [
  {
    id: 'hotdog-spicy',
    kind: 'spicy',
    name: '🌶️ Spicy Hotdog',
    floorLines: ['Spicy', 'Hotdog'],
    detail: '+5% ATK',
    color: 0xe23b3b,
    summary: 'Attack Speed. +5% faster broom swings.',
    float: '+5% faster broom swings'
  },
  {
    id: 'hotdog-cheese',
    kind: 'cheese',
    name: '🧀 Cheese Hotdog',
    floorLines: ['Cheese', 'Hotdog'],
    detail: '+5% CRIT',
    color: 0xf0c14a,
    summary: 'Critical Chance. +5% chance to deal double damage.',
    float: '+5% chance to deal double damage'
  },
  {
    id: 'hotdog-classic',
    kind: 'classic',
    name: '🌭 Classic Hotdog',
    floorLines: ['Classic', 'Hotdog'],
    detail: '+5% MOVE',
    color: 0xf08a24,
    summary: 'Movement Speed. +5% movement speed.',
    float: '+5% movement speed'
  }
];

function whole(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return number;
}

// One hotdog per night. Standing on a circle pays the same way as a shop upgrade.
export class HotdogMenu {
  constructor({ scene, money, shopUpgrades, save, stand, player, weapons, tip, feedback, audio, dayNumber, coinInterval }) {
    this.money = money;
    this.save = save;
    this.stand = stand;
    this.player = player;
    this.weapons = weapons;
    this.tip = tip;
    this.feedback = feedback;
    this.dayNumber = dayNumber;
    this.counts = { spicy: 0, cheese: 0, classic: 0 };
    this.eatenNight = 0;
    this.servedNight = 0;
    this.night = false;
    this.tipShown = false;
    this.center = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.box = new THREE.Box3();
    this.read();
    this.pads = MENU.map((item) => {
      const pad = new UpgradePad(scene, money, shopUpgrades, {
        id: item.id,
        name: item.name,
        cost: COST,
        position: [0, 0],
        halfSize: HALF,
        circular: true,
        manual: true,
        color: item.color,
        detail: item.detail,
        summary: item.summary,
        showFloorTitle: true,
        floorLines: item.floorLines,
        closedLines: ['NOT HUNGRY', 'TONIGHT'],
        audio,
        onPurchase: () => this.buy(item.kind)
      }, coinInterval ?? 0.15);
      pad.root.userData.editorIgnore = true;
      return pad;
    });
    this.place();
    this.apply();
  }

  read() {
    const data = this.save?.data?.hotdogs;
    if (!data || typeof data !== 'object') {
      return;
    }
    this.counts.spicy = whole(data.spicy);
    this.counts.cheese = whole(data.cheese);
    this.counts.classic = whole(data.classic);
    this.eatenNight = whole(data.eatenNight);
  }

  snapshot() {
    return {
      spicy: this.counts.spicy,
      cheese: this.counts.cheese,
      classic: this.counts.classic,
      eatenNight: this.eatenNight
    };
  }

  persist() {
    this.save?.write({ hotdogs: this.snapshot(), money: this.money.getMoney() });
  }

  // Latest hotdog adds another 5%. Movement stacks with roller skates.
  apply() {
    this.weapons?.setHotdogBuffs(this.counts.spicy, this.counts.cheese);
    const move = 1 + 0.05 * this.counts.classic;
    this.player?.setSpeedModifier('hotdog-classic', move);
  }

  syncNight(open) {
    this.night = open === true;
    if (!this.night) {
      return;
    }
    const day = this.dayNumber?.() ?? 1;
    if (this.eatenNight === day) {
      this.markFull();
      return;
    }
    if (this.servedNight === day) {
      return;
    }
    this.reopen();
    this.servedNight = day;
  }

  reopen() {
    for (let i = 0; i < this.pads.length; i += 1) {
      this.pads[i].reopen();
    }
  }

  markFull() {
    for (let i = 0; i < this.pads.length; i += 1) {
      this.pads[i].markClosed();
    }
  }

  reset() {
    this.counts.spicy = 0;
    this.counts.cheese = 0;
    this.counts.classic = 0;
    this.eatenNight = 0;
    this.servedNight = 0;
    this.reopen();
    this.apply();
    this.persist();
  }

  buy(kind) {
    const day = this.dayNumber?.() ?? 1;
    if (this.eatenNight === day || this.counts[kind] == null) {
      return 'again';
    }
    this.counts[kind] += 1;
    this.eatenNight = day;
    for (let i = 0; i < this.pads.length; i += 1) {
      const pad = this.pads[i];
      if (!pad.investment.purchased) {
        pad.investment.refund(this.money);
      }
      pad.markClosed();
    }
    this.apply();
    this.persist();
    this.tipShown = false;
    this.tip?.hide();
    const item = MENU.find((entry) => entry.kind === kind);
    const position = this.player?.position;
    if (item && position) {
      this.feedback?.spawnLine(position.x, position.y + 1.7, position.z, item.float);
    }
    return 'again';
  }

  // Circles sit on the shop-facing side of the cart and follow it if the stand is moved.
  place() {
    const stand = this.stand?.stand;
    if (!stand) {
      return;
    }
    stand.updateWorldMatrix(true, true);
    this.box.setFromObject(stand);
    if (this.box.isEmpty()) {
      return;
    }
    const center = this.box.getCenter(this.center);
    this.forward.set(0, 0, 1).applyQuaternion(stand.quaternion);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-8) {
      this.forward.set(1, 0, 0);
    }
    this.forward.normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);
    let extent = 0;
    const xs = [this.box.min.x, this.box.max.x];
    const zs = [this.box.min.z, this.box.max.z];
    for (let i = 0; i < xs.length; i += 1) {
      for (let j = 0; j < zs.length; j += 1) {
        const along = (xs[i] - center.x) * this.forward.x + (zs[j] - center.z) * this.forward.z;
        if (along > extent) {
          extent = along;
        }
      }
    }
    const originX = center.x + this.forward.x * (extent + 0.62);
    const originZ = center.z + this.forward.z * (extent + 0.62);
    for (let i = 0; i < this.pads.length; i += 1) {
      const offset = (i - 1) * STEP;
      this.pads[i].setPosition(originX + this.right.x * offset, originZ + this.right.z * offset);
    }
  }

  hungry() {
    return this.night && this.eatenNight !== (this.dayNumber?.() ?? 1);
  }

  update(dt) {
    this.place();
    const position = this.player?.group?.position;
    const x = position?.x ?? 0;
    const z = position?.z ?? 0;
    const open = this.hungry();
    for (let i = 0; i < this.pads.length; i += 1) {
      this.pads[i].update(dt, this.night, x, z);
    }
    const hovered = open ? this.circleUnder(x, z) : null;
    if (hovered) {
      this.tipShown = true;
      this.tip?.show(hovered);
      return;
    }
    if (this.tipShown) {
      this.tipShown = false;
      this.tip?.hide();
    }
  }

  circleUnder(x, z) {
    for (let i = 0; i < this.pads.length; i += 1) {
      const pad = this.pads[i];
      if (pad.covers(x, z)) {
        return pad;
      }
    }
    return null;
  }
}
