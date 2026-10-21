import { formatGameTime, gameMinutesFromElapsed } from './shopTime.js';

export const DayPhase = {
  DAY: 'DAY',
  CLOSING: 'CLOSING',
  RESULTS: 'RESULTS',
  NIGHT: 'NIGHT',
  TRANSITIONING: 'TRANSITIONING'
};

export class DayNightController {
  constructor(config, hooks = {}) {
    this.dayDuration = config.dayDuration ?? 120;
    this.transitionSeconds = config.transitionSeconds ?? 1.5;
    this.closingSeconds = config.closingSeconds ?? 2.6;
    this.closingSoonSeconds = config.closingSoonSeconds ?? 10;
    this.hooks = hooks;
    this.dayNumber = 1;
    this.remaining = this.dayDuration;
    this.phase = DayPhase.DAY;
    this.transitionTarget = DayPhase.DAY;
    this.transitionElapsed = 0;
    this.closingElapsed = 0;
    this.timerRunning = true;
    this.closedForNight = false;
    this.upgradesOpen = false;
    this.results = null;
  }

  displayPhase() {
    if (this.phase === DayPhase.TRANSITIONING) {
      return this.transitionTarget;
    }
    return this.phase;
  }

  elapsedSeconds() {
    return Math.min(this.dayDuration, Math.max(0, this.dayDuration - this.remaining));
  }

  gameMinutes() {
    if (this.remaining <= 0 && this.phase !== DayPhase.DAY) {
      return gameMinutesFromElapsed(this.dayDuration, this.dayDuration);
    }
    return gameMinutesFromElapsed(this.elapsedSeconds(), this.dayDuration);
  }

  showsNightHud() {
    return this.phase === DayPhase.NIGHT
      || (this.phase === DayPhase.TRANSITIONING && this.transitionTarget === DayPhase.NIGHT && this.closedForNight);
  }

  blocksPlay() {
    return this.phase === DayPhase.CLOSING || this.phase === DayPhase.RESULTS;
  }

  closingSoon() {
    return this.phase === DayPhase.DAY
      && this.timerRunning
      && this.remaining > 0
      && this.remaining <= this.closingSoonSeconds;
  }

  update(dt) {
    const counting = this.timerRunning
      && !this.closedForNight
      && this.phase === DayPhase.DAY;
    if (counting) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining <= 0) {
        this.endDay();
      }
    }

    if (this.phase === DayPhase.CLOSING) {
      this.closingElapsed += dt;
      if (this.closingElapsed >= this.closingSeconds) {
        this.phase = DayPhase.RESULTS;
      }
    }

    if (this.phase === DayPhase.TRANSITIONING) {
      this.transitionElapsed += dt;
      if (this.transitionElapsed >= this.transitionSeconds) {
        this.phase = this.transitionTarget;
        this.transitionElapsed = 0;
      }
    }
  }

  endDay() {
    if (this.closedForNight || this.phase !== DayPhase.DAY) {
      return false;
    }
    this.remaining = 0;
    this.timerRunning = false;
    this.closingElapsed = 0;
    this.phase = DayPhase.CLOSING;
    this.upgradesOpen = false;
    this.hooks.setSpawning?.(false);
    this.hooks.setUpgradesOpen?.(false);
    this.hooks.onVisual?.('night');
    this.hooks.dismissShoppers?.();
    this.results = this.hooks.snapshotStats?.(this.dayNumber) ?? null;
    this.hooks.onClosingStart?.();
    return true;
  }

  continueToNight() {
    if (this.phase !== DayPhase.RESULTS) {
      return false;
    }
    this.closedForNight = true;
    this.timerRunning = false;
    this.beginTransition(DayPhase.NIGHT, false);
    return true;
  }

  startNextDay() {
    const opening = this.phase === DayPhase.TRANSITIONING && this.transitionTarget === DayPhase.DAY;
    const night = this.displayPhase() === DayPhase.NIGHT;
    if ((!this.closedForNight && !night) || opening || this.blocksPlay()) {
      return false;
    }
    this.closedForNight = false;
    this.results = null;
    this.dayNumber += 1;
    this.remaining = this.dayDuration;
    this.timerRunning = true;
    this.hooks.prepareNextDay?.();
    this.beginTransition(DayPhase.DAY, false);
    return true;
  }

  debugToggle() {
    if (this.phase !== DayPhase.DAY && this.phase !== DayPhase.NIGHT) {
      return false;
    }
    if (this.displayPhase() === DayPhase.NIGHT) {
      this.timerRunning = !this.closedForNight && this.remaining > 0;
      this.beginTransition(DayPhase.DAY, false);
      return true;
    }
    this.timerRunning = false;
    this.beginTransition(DayPhase.NIGHT, false);
    return true;
  }

  beginTransition(target, dismiss) {
    this.transitionTarget = target;
    this.transitionElapsed = 0;
    this.phase = DayPhase.TRANSITIONING;
    const night = target === DayPhase.NIGHT;
    const dayOpen = !night && !this.closedForNight;
    this.upgradesOpen = night;
    this.hooks.setSpawning?.(dayOpen);
    this.hooks.setUpgradesOpen?.(night);
    this.hooks.onVisual?.(night ? 'night' : 'day');
    if (dismiss || night) {
      this.hooks.dismissShoppers?.();
    }
  }

  describe() {
    if (this.showsNightHud()) {
      return `NIGHT ${this.dayNumber} closed`;
    }
    return `DAY ${this.dayNumber} ${formatGameTime(this.gameMinutes())}`;
  }
}
