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
    if (!money.spendMoney(cost)) {
      return false;
    }
    this.purchased.add(id);
    return true;
  }

  markPurchased(id) {
    if (this.purchased.has(id)) {
      return false;
    }
    this.purchased.add(id);
    return true;
  }
}
