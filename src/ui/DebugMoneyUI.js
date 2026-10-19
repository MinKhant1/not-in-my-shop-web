function button(label, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

export class DebugMoneyUI {
  constructor(app, money, startingMoney, enabled, save) {
    this.enabled = enabled === true;
    this.money = money;
    this.startingMoney = startingMoney;
    this.save = save;
    if (!this.enabled) {
      return;
    }

    this.root = document.createElement('div');
    this.root.id = 'debug-money';
    this.root.setAttribute('data-no-joystick', '');
    const title = document.createElement('p');
    title.textContent = 'DEBUG MONEY';
    this.root.append(
      title,
      button('+10', () => money.addMoney(10)),
      button('+50', () => money.addMoney(50)),
      button('SET 100', () => money.setMoney(100)),
      button('RESET', () => money.setMoney(startingMoney)),
      this.progressButton()
    );
    app.append(this.root);

    this.onKeyDown = (event) => {
      if (!this.enabled || event.repeat) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select')) {
        return;
      }
      if (event.code === 'KeyM') {
        money.addMoney(10);
      } else if (event.code === 'KeyN') {
        money.addMoney(50);
      } else if (event.code === 'KeyB') {
        money.setMoney(100);
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  progressButton() {
    const element = button('RESET PROGRESS', () => {
      this.save?.clear();
      window.location.reload();
    });
    element.className = 'reset-progress';
    return element;
  }
}
