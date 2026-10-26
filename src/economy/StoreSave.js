import { sanitizeFixtures, sanitizeUnlock } from '../world/StoreSections.js';

const SAVE_KEY = 'not-in-my-shop';

function storage() {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

function readVec3(value) {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }
  const vector = [Number(value[0]), Number(value[1]), Number(value[2])];
  if (vector.some((entry) => !Number.isFinite(entry))) {
    return null;
  }
  return vector;
}

function readData() {
  const store = storage();
  if (!store) {
    return {};
  }
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export class StoreSave {
  constructor() {
    this.data = readData();
  }

  clear() {
    this.data = {};
    const store = storage();
    if (!store) {
      return;
    }
    try {
      store.removeItem(SAVE_KEY);
    } catch {
      // Ignore a blocked storage write. The reload still starts from memory.
    }
  }

  write(partial) {
    this.data = { version: 1, ...this.data, ...partial };
    const store = storage();
    if (!store) {
      return;
    }
    try {
      store.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Private mode or a full disk should not interrupt the shop.
    }
  }

  money() {
    return Number.isFinite(this.data.money) ? this.data.money : null;
  }

  broomLevel() {
    return this.readBroomLevel(this.data.broomLevel);
  }

  securityBroomLevel() {
    return this.readBroomLevel(this.data.securityBroomLevel);
  }

  readBroomLevel(value) {
    const level = Math.round(Number(value));
    if (level === 2 || level === 3) {
      return level;
    }
    return 1;
  }

  upgrades() {
    return Array.isArray(this.data.purchasedUpgrades)
      ? this.data.purchasedUpgrades.filter((id) => typeof id === 'string')
      : [];
  }

  unlockedSections() {
    const saved = Array.isArray(this.data.unlockedSections) ? this.data.unlockedSections : [];
    const have = new Set(saved.filter((id) => typeof id === 'string'));
    if (this.upgrades().includes('right-shop-expansion')) {
      have.add('electronics');
    }
    return sanitizeUnlock(have);
  }

  purchasedFixtures(unlocked) {
    return sanitizeFixtures(this.data.purchasedFixtures, unlocked);
  }

  day() {
    const day = this.data.day;
    if (!day || typeof day !== 'object') {
      return null;
    }
    const number = Math.round(Number(day.number));
    if (!Number.isFinite(number) || number < 1) {
      return null;
    }
    const remaining = Number(day.remaining);
    return {
      number,
      remaining: Number.isFinite(remaining) ? remaining : null,
      phase: day.phase === 'NIGHT' ? 'NIGHT' : 'DAY',
      purse: Number.isFinite(Number(day.purse)) ? Number(day.purse) : null
    };
  }

  hasProgress() {
    if (this.data.played === true) {
      return true;
    }
    if (this.money() > 0) {
      return true;
    }
    if (this.upgrades().length > 0) {
      return true;
    }
    if (this.broomLevel() > 1) {
      return true;
    }
    if (this.unlockedSections().length > 1) {
      return true;
    }
    if (Array.isArray(this.data.purchasedFixtures) && this.data.purchasedFixtures.length > 0) {
      return true;
    }
    if (this.data.pendingPurchase) {
      return true;
    }
    const day = this.day();
    return Boolean(day && (day.number > 1 || day.phase === 'NIGHT'));
  }

  isPurchaseComplete(id) {
    if (typeof id !== 'string' || id.length === 0) {
      return false;
    }
    if (id.startsWith('unlock_')) {
      return this.unlockedSections().includes(id.slice(7));
    }
    const fixtures = Array.isArray(this.data.purchasedFixtures) ? this.data.purchasedFixtures : [];
    return fixtures.includes(id);
  }

  claimPendingRefund(money) {
    const pending = this.data.pendingPurchase;
    if (!pending) {
      return 0;
    }
    let amount = 0;
    if (typeof pending.id === 'string' && Number.isFinite(pending.amountPaid)) {
      const paid = Math.max(0, Math.round(pending.amountPaid));
      if (paid > 0 && !this.isPurchaseComplete(pending.id)) {
        amount = paid;
      }
    }
    if (amount > 0 && money) {
      const persist = money.persist;
      money.persist = null;
      money.addMoney(amount);
      money.persist = persist;
    }
    this.write({
      pendingPurchase: null,
      money: money ? money.getMoney() : this.data.money
    });
    return amount;
  }

  shopName() {
    const name = typeof this.data.shopName === 'string'
      ? this.data.shopName.replace(/\s+/g, ' ').trim().slice(0, 20)
      : '';
    return name || 'MY SHOP';
  }

  shopSign() {
    const sign = this.data.shopSign;
    if (!sign || typeof sign !== 'object') {
      return null;
    }
    const position = readVec3(sign.position);
    const rotation = readVec3(sign.rotation);
    const scale = readVec3(sign.scale);
    if (!position || !rotation || !scale) {
      return null;
    }
    return {
      position,
      rotation,
      scale: scale.map((value) => (value === 0 ? 1 : value))
    };
  }

  apply(money, upgrades) {
    const savedMoney = this.money();
    if (savedMoney != null) {
      money.setMoney(savedMoney);
    }
    const owned = this.upgrades();
    for (let i = 0; i < owned.length; i += 1) {
      upgrades.markPurchased(owned[i]);
    }
  }
}
