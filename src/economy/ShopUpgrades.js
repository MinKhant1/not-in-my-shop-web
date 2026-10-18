export class ShopUpgrades {
  constructor() {
    this.open = false;
    this.purchased = new Set();
  }

  setOpen(open) {
    this.open = open === true;
  }

  canPurchase() {
    return this.open;
  }

  owns(id) {
    return this.purchased.has(id);
  }

  tryPurchase(id, cost, money) {
    if (!this.open || this.purchased.has(id)) {
      return false;
    }
    if (money.getMoney() < cost) {
      return false;
    }
    money.removeMoney(cost);
    this.purchased.add(id);
    return true;
  }
}
