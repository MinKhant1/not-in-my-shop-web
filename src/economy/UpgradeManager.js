import { UpgradePad } from './UpgradePad.js';

export class UpgradeManager {
  constructor(scene, money, shopUpgrades, getPosition, interval, sectionOpen) {
    this.money = money;
    this.shopUpgrades = shopUpgrades;
    this.getPosition = getPosition;
    this.interval = interval;
    this.sectionOpen = sectionOpen;
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

  presentForEditor(editing) {
    const show = editing === true;
    for (let i = 0; i < this.pads.length; i += 1) {
      const pad = this.pads[i];
      pad.editorReveal = show;
      pad.root.visible = show;
    }
  }

  update(dt) {
    const accepting = this.shopUpgrades.canPurchase();
    const position = this.getPosition();
    for (let i = 0; i < this.pads.length; i += 1) {
      const pad = this.pads[i];
      const open = this.sectionOpen ? this.sectionOpen(pad.x, pad.z) : true;
      pad.update(dt, accepting && open, position.x, position.z);
    }
  }
}
