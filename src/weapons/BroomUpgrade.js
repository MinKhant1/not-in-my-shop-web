import { UpgradePad } from '../economy/UpgradePad.js';
import { broomByLevel, broomOfferSummary, nextBroom } from './broomUpgrades.js';

const PAD_ID = 'broom-upgrade';

// Night purchase circle on the broom stand. Standing on it pays the same way as hiring the guard.
export class BroomUpgrade {
  constructor(options) {
    this.money = options.money;
    this.save = options.save;
    this.station = options.station;
    this.level = broomByLevel(options.level).level;
    this.pad = new UpgradePad(options.scene, options.money, options.upgrades, {
      id: PAD_ID,
      name: 'BROOM',
      cost: 1,
      position: options.position,
      halfSize: options.halfSize ?? 0.72,
      circular: true,
      manual: true,
      showFloorTitle: true,
      retainWhenOwned: true,
      banner: false,
      summary: broomOfferSummary('BROOM'),
      audio: options.audio ?? null,
      onPurchase: () => this.purchase()
    }, options.interval);
    this.syncOffer();
  }

  get current() {
    return broomByLevel(this.level);
  }

  async restore() {
    await this.station.setBroomLevel(this.current);
    this.syncOffer();
    this.onChanged?.();
  }

  purchase() {
    const next = nextBroom(this.level);
    if (!next) {
      return;
    }
    this.level = next.level;
    this.save.write({
      broomLevel: this.level,
      money: this.money.getMoney()
    });
    this.station.setBroomLevel(this.current).catch((error) => {
      console.error('Failed to equip broom upgrade', error);
    });
    const following = nextBroom(this.level);
    if (!following) {
      this.onChanged?.();
      return;
    }
    this.pad.configure({
      name: following.name.toUpperCase(),
      cost: following.cost,
      hired: false,
      summary: broomOfferSummary(following.name)
    });
    this.onChanged?.();
    return 'again';
  }

  syncOffer() {
    const next = nextBroom(this.level);
    if (!next) {
      this.pad.configure({
        name: 'BROOM',
        cost: 0,
        hired: true,
        summary: broomOfferSummary('BROOM')
      });
      return;
    }
    this.pad.configure({
      name: next.name.toUpperCase(),
      cost: next.cost,
      hired: false,
      summary: broomOfferSummary(next.name)
    });
  }
}
