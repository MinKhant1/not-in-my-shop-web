export const PlayerActivity = {
  NONE: 'NONE',
  WEAPON: 'WEAPON',
  CHECKOUT: 'CHECKOUT',
  OTHER: 'OTHER'
};

export const WeaponId = {
  NONE: 'NONE',
  BROOM: 'BROOM'
};

export class PlayerActivityManager {
  constructor() {
    this.activity = PlayerActivity.NONE;
    this.listeners = [];
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  setActivity(next) {
    if (next === this.activity) {
      return;
    }
    const previous = this.activity;
    this.activity = next;
    for (let i = 0; i < this.listeners.length; i += 1) {
      this.listeners[i](next, previous);
    }
  }

  updateZones({ checkout, weapon }) {
    if (checkout) {
      this.setActivity(PlayerActivity.CHECKOUT);
      return;
    }
    if (weapon) {
      this.setActivity(PlayerActivity.WEAPON);
      return;
    }
    if (this.activity === PlayerActivity.CHECKOUT) {
      this.setActivity(PlayerActivity.NONE);
    }
  }
}
