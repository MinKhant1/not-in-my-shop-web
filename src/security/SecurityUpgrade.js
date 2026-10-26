import { UpgradePad } from '../economy/UpgradePad.js';
import { broomByLevel, broomOfferSummary, nextBroom } from '../weapons/broomUpgrades.js';

const PAD_ID = 'security-guard';

// Night pad for the guard. The first purchase hires them. Later purchases upgrade the broom they hold.
export class SecurityUpgrade {
  constructor(options) {
    this.money = options.money;
    this.save = options.save;
    this.upgrades = options.upgrades;
    this.guard = options.guard;
    this.hireCost = options.hireCost ?? 80;
    this.level = broomByLevel(options.level).level;
    this.hired = options.hired === true;
    this.pad = new UpgradePad(options.scene, options.money, options.upgrades, {
      id: PAD_ID,
      name: 'HIRE SECURITY GUARD',
      cost: this.hireCost,
      position: options.position,
      halfSize: options.halfSize ?? 0.72,
      circular: true,
      manual: true,
      showFloorTitle: true,
      retainWhenOwned: true,
      banner: false,
      hiredLines: ['GUARD', 'HIRED'],
      summary: 'Hires a guard who patrols the shop and stops thieves.',
      audio: options.audio ?? null,
      onPurchase: () => this.purchase()
    }, options.interval);
    this.syncOffer();
  }

  get current() {
    return broomByLevel(this.level);
  }

  restore() {
    if (this.hired) {
      this.guard.hire();
      this.guard.setBroom(this.current);
    }
    this.syncOffer();
  }

  reset() {
    this.hired = false;
    this.level = 1;
    this.guard.setBroom(this.current);
    this.syncOffer();
  }

  purchase() {
    if (!this.hired) {
      this.hired = true;
      this.upgrades.markPurchased(PAD_ID);
      this.guard.hire();
      this.guard.setBroom(this.current);
      this.persist();
      if (nextBroom(this.level)) {
        this.syncOffer();
        return 'again';
      }
      return undefined;
    }
    const next = nextBroom(this.level);
    if (!next) {
      return undefined;
    }
    this.level = next.level;
    this.guard.setBroom(this.current);
    this.persist();
    if (nextBroom(this.level)) {
      this.syncOffer();
      return 'again';
    }
    this.pad.configure({
      name: 'GUARD',
      cost: 0,
      hired: true,
      summary: broomOfferSummary('BROOM')
    });
    return undefined;
  }

  persist() {
    this.save.write({
      purchasedUpgrades: [...this.upgrades.purchased],
      securityBroomLevel: this.level,
      money: this.money.getMoney()
    });
  }

  syncOffer() {
    if (!this.hired) {
      this.pad.floorLines = null;
      this.pad.configure({
        name: 'HIRE SECURITY GUARD',
        cost: this.hireCost,
        hired: false,
        summary: 'Hires a guard who patrols the shop and stops thieves.'
      });
      return;
    }
    const next = nextBroom(this.level);
    if (!next) {
      this.pad.configure({
        name: 'GUARD',
        cost: 0,
        hired: true,
        summary: broomOfferSummary('BROOM')
      });
      return;
    }
    this.pad.floorLines = ['SECURITY', 'GUARD', `LVL ${next.level}`];
    this.pad.configure({
      name: `SECURITY GUARD LVL ${next.level}`,
      cost: next.cost * 2,
      hired: false,
      summary: broomOfferSummary(next.name)
    });
  }
}
