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
}
