import { UpgradePad } from './UpgradePad.js';

export class UpgradeManager {
  constructor(scene, money, shopUpgrades, getPosition, interval) {
    this.money = money;
    this.shopUpgrades = shopUpgrades;
    this.getPosition = getPosition;
    this.interval = interval;
    this.scene = scene;
    this.pads = [];
  }

  add(spec) {
    const pad = new UpgradePad(this.scene, this.money, this.shopUpgrades, spec, this.interval);
    this.pads.push(pad);
    if (this.shopUpgrades.owns(spec.id)) {
      spec.onPurchase?.();
    }
    return pad;
  }

  update(dt) {
    const accepting = this.shopUpgrades.canPurchase();
    const position = this.getPosition();
    for (let i = 0; i < this.pads.length; i += 1) {
      this.pads[i].update(dt, accepting, position.x, position.z);
    }
  }
}
