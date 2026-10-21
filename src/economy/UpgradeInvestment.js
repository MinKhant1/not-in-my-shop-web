export class UpgradeInvestment {
  constructor(cost) {
    this.cost = Math.max(0, Math.round(cost));
    this.invested = 0;
    this.purchased = false;
    this.elapsed = 0;
  }

  refund(money) {
    if (this.purchased || this.invested <= 0) {
      return 0;
    }
    const amount = this.invested;
    this.invested = 0;
    this.elapsed = 0;
    money.addMoney(amount);
    return amount;
  }

  tick(money, dt, active, interval, hold = false) {
    if (this.purchased) {
      return 'idle';
    }
    if (!active) {
      this.refund(money);
      return 'idle';
    }
    if (hold) {
      this.elapsed = 0;
      return 'held';
    }

    const step = interval > 0 ? interval : 0.15;
    this.elapsed += Math.max(0, dt);
    let changed = false;
    while (this.elapsed + 1e-4 >= step && this.invested < this.cost) {
      if (money.getMoney() < 1 || !money.spendMoney(1)) {
        this.elapsed = step;
        break;
      }
      this.elapsed -= step;
      this.invested += 1;
      changed = true;
    }

    if (this.invested >= this.cost) {
      this.purchased = true;
      this.elapsed = 0;
      return 'purchased';
    }
    return changed ? 'progress' : 'idle';
  }
}
