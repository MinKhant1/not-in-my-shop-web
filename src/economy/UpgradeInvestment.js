export class UpgradeInvestment {
  constructor(cost, duration = 0) {
    this.cost = Math.max(0, Math.round(cost));
    this.invested = 0;
    this.purchased = false;
    this.elapsed = 0;
    this.duration = duration > 0 ? duration : 0;
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
      this.elapsed = 0;
      return 'idle';
    }
    if (hold) {
      if (!(this.duration > 0)) {
        this.elapsed = 0;
      }
      return 'held';
    }
    if (this.duration > 0) {
      return this.tickDuration(money, dt);
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

  tickDuration(money, dt) {
    const duration = this.duration;
    if (this.cost <= 0) {
      this.purchased = true;
      this.elapsed = 0;
      return 'purchased';
    }

    this.elapsed += Math.max(0, dt);
    if (this.elapsed > duration) {
      this.elapsed = duration;
    }

    const before = this.invested;
    const target = this.elapsed >= duration
      ? this.cost
      : Math.floor((this.cost * this.elapsed) / duration + 1e-9);
    const due = target - this.invested;
    if (due > 0) {
      const affordable = Math.min(due, Math.max(0, Math.floor(money.getMoney())));
      if (affordable > 0 && money.spendMoney(affordable)) {
        this.invested += affordable;
      }
    }

    if (this.invested < target) {
      const next = Math.min(this.cost, this.invested + 1);
      this.elapsed = next >= this.cost ? duration : (next * duration) / this.cost;
    }

    if (this.invested >= this.cost) {
      this.purchased = true;
      this.elapsed = 0;
      return 'purchased';
    }
    return this.invested > before ? 'progress' : 'idle';
  }
}
