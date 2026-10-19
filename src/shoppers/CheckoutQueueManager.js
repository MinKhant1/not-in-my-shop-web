export class CheckoutQueueManager {
  constructor(slotIds, checkout) {
    this.slotIds = slotIds;
    this.queue = [];
    this.maxComfortableQueue = checkout?.maxComfortableQueue ?? 5;
    this.queueAngerCountdown = checkout?.queueAngerCountdown ?? 5;
    this.impatient = null;
    this.angerTimer = 0;
  }

  get length() {
    return this.queue.length;
  }

  get count() {
    return this.queue.length;
  }

  get frontCustomer() {
    return this.queue[0] ?? null;
  }

  get lastCustomer() {
    return this.queue[this.queue.length - 1] ?? null;
  }

  join(shopper) {
    if (shopper.isThief || this.queue.includes(shopper)) {
      return this.queue.indexOf(shopper);
    }
    if (this.queue.length >= this.slotIds.length) {
      return -1;
    }
    this.queue.push(shopper);
    const index = this.queue.length - 1;
    shopper.setQueueIndex(index);
    this.refreshImpatience(0);
    return index;
  }

  complete(shopper) {
    const index = this.queue.indexOf(shopper);
    if (index < 0) {
      return;
    }
    if (this.impatient === shopper) {
      this.impatient = null;
      this.angerTimer = 0;
    }
    this.queue.splice(index, 1);
    for (let i = 0; i < this.queue.length; i += 1) {
      this.queue[i].setQueueIndex(i);
    }
    this.refreshImpatience(0);
  }

  clear() {
    const queued = this.queue.splice(0, this.queue.length);
    if (this.impatient) {
      this.impatient.setImpatient(false, 0);
    }
    this.impatient = null;
    this.angerTimer = 0;
    return queued;
  }

  slotId(index) {
    return this.slotIds[index] ?? null;
  }

  isWaitingInSlot(shopper) {
    return Boolean(
      shopper
      && shopper.state === 'WAITING_IN_QUEUE'
      && shopper.hasReachedQueueSlot === true
      && !shopper.isThief
    );
  }

  update(dt) {
    this.refreshImpatience(dt);
  }

  refreshImpatience(dt) {
    if (this.queue.length <= this.maxComfortableQueue) {
      this.cancelImpatience();
      return;
    }

    const last = this.lastCustomer;
    if (!this.isWaitingInSlot(last)) {
      if (last && last === this.impatient) {
        last.setImpatient(false, this.angerTimer);
        return;
      }
      this.cancelImpatience();
      return;
    }

    if (last !== this.impatient) {
      this.cancelImpatience();
      this.impatient = last;
      this.angerTimer = this.queueAngerCountdown;
    } else {
      this.angerTimer -= dt;
    }

    if (this.angerTimer <= 0) {
      const angry = this.impatient;
      this.impatient = null;
      this.angerTimer = 0;
      if (angry && this.queue.includes(angry) && this.isWaitingInSlot(angry)) {
        angry.becomeAngryThief();
      }
      return;
    }

    last.setImpatient(true, this.angerTimer);
  }

  cancelImpatience() {
    if (!this.impatient) {
      return;
    }
    this.impatient.setImpatient(false, 0);
    this.impatient = null;
    this.angerTimer = 0;
  }

  describe() {
    const front = this.frontCustomer;
    const last = this.lastCustomer;
    const frontName = front ? `${front.shortName} ${front.id}` : 'none';
    const lastName = last ? `${last.shortName} ${last.id}` : 'none';
    const reached = last?.hasReachedQueueSlot ? 'yes' : 'no';
    const active = this.isWaitingInSlot(last) && this.impatient === last;
    const timer = this.impatient ? this.angerTimer.toFixed(1) : '-';
    return `Queue: ${this.queue.length} Max Comfortable: ${this.maxComfortableQueue} Front: ${frontName} Last: ${lastName} Reached: ${reached} Timer Active: ${active} Timer: ${timer}`;
  }
}
