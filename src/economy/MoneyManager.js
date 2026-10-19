export class MoneyManager {
  constructor(startingMoney = 0) {
    this.amount = startingMoney;
    this.listener = null;
  }

  setListener(listener) {
    this.listener = listener;
    this.listener(this.amount, 0);
  }

  getMoney() {
    return this.amount;
  }

  addMoney(amount) {
    const gain = Math.round(amount);
    if (gain === 0) {
      return this.amount;
    }
    this.amount += gain;
    this.listener?.(this.amount, gain);
    return this.amount;
  }

  removeMoney(amount) {
    const loss = Math.round(amount);
    if (loss === 0) {
      return this.amount;
    }
    this.amount = Math.max(0, this.amount - loss);
    this.listener?.(this.amount, -loss);
    return this.amount;
  }

  spendMoney(amount) {
    const cost = Math.round(amount);
    if (cost <= 0) {
      return true;
    }
    if (this.amount < cost) {
      return false;
    }
    this.amount -= cost;
    this.listener?.(this.amount, -cost);
    return true;
  }

  setMoney(amount) {
    const next = Math.max(0, Math.round(amount));
    const delta = next - this.amount;
    this.amount = next;
    this.listener?.(this.amount, delta);
    return this.amount;
  }
}
