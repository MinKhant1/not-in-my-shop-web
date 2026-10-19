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
