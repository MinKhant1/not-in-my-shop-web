export class DayStats {
  constructor(money, itemValue) {
    this.money = money;
    this.itemValue = itemValue;
    this.reset();
  }

  reset() {
    this.customers = 0;
    this.checkouts = 0;
    this.thievesCaught = 0;
    this.thievesEscaped = 0;
    this.checkoutIncome = 0;
    this.moneyStolen = 0;
  }

  recordCustomer() {
    this.customers += 1;
  }

  recordCheckout(amount) {
    this.checkouts += 1;
    this.checkoutIncome += Math.max(0, Math.round(amount) || 0);
  }

  recordCaught() {
    this.thievesCaught += 1;
  }

  recordEscape(itemCount) {
    this.thievesEscaped += 1;
    const loss = Math.max(0, itemCount) * this.itemValue;
    this.moneyStolen += loss;
    if (loss > 0) {
      this.money.removeMoney(loss);
    }
  }

  snapshot(dayNumber, available) {
    return {
      dayNumber,
      customers: this.customers,
      checkouts: this.checkouts,
      thievesCaught: this.thievesCaught,
      thievesEscaped: this.thievesEscaped,
      checkoutIncome: this.checkoutIncome,
      moneyStolen: this.moneyStolen,
      net: this.checkoutIncome - this.moneyStolen,
      available
    };
  }
}
