export class MoneyHUD {
  constructor(root, money) {
    this.root = root;
    this.amountElement = root.querySelector('#money-amount');
    this.gainElement = root.querySelector('#money-gain');
    this.gainTimer = 0;
    money.setListener((amount, delta) => this.render(amount, delta));
  }

  render(amount, delta) {
    this.amountElement.textContent = String(amount);
    if (delta > 0) {
      this.gainElement.textContent = `+${delta}`;
      this.gainElement.hidden = false;
      this.gainElement.classList.remove('is-shown');
      void this.gainElement.offsetWidth;
      this.gainElement.classList.add('is-shown');
    }
  }
}
