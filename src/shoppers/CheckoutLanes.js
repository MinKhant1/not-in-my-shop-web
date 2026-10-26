export class CheckoutLanes {
  constructor(primaryQueue) {
    this.lanes = [{ id: 'cash-register', queue: primaryQueue }];
  }

  get primary() {
    return this.lanes[0].queue;
  }

  has(id) {
    return this.lanes.some((lane) => lane.id === id);
  }

  setOpen(id, open) {
    const lane = this.lanes.find((entry) => entry.id === id);
    if (lane) {
      lane.open = open === true;
    }
  }

  add(id, queue) {
    if (!id || this.has(id)) {
      return;
    }
    this.lanes.push({ id, queue });
  }

  remove(id) {
    if (!id || id === 'cash-register') {
      return;
    }
    this.lanes = this.lanes.filter((lane) => lane.id !== id);
  }

  // Shortest line wins, so the open registers stay even.
  join(shopper) {
    let existing = null;
    let best = null;
    let bestLength = Infinity;
    for (let i = 0; i < this.lanes.length; i += 1) {
      const lane = this.lanes[i];
      if (lane.open === false && !lane.queue.queue.includes(shopper)) {
        continue;
      }
      const queue = lane.queue;
      if (queue.queue.includes(shopper)) {
        existing = queue;
        break;
      }
      if (queue.length >= queue.slotIds.length || queue.length >= bestLength) {
        continue;
      }
      best = queue;
      bestLength = queue.length;
    }
    const queue = existing ?? best;
    if (!queue) {
      return -1;
    }
    shopper.checkoutQueue = queue;
    if (existing) {
      return queue.queue.indexOf(shopper);
    }
    return queue.join(shopper);
  }

  update(dt) {
    for (let i = 0; i < this.lanes.length; i += 1) {
      this.lanes[i].queue.update(dt);
    }
  }

  clear() {
    for (let i = 0; i < this.lanes.length; i += 1) {
      this.lanes[i].queue.clear();
    }
  }

  describe() {
    const parts = [];
    for (let i = 0; i < this.lanes.length; i += 1) {
      const lane = this.lanes[i];
      parts.push(`${lane.id} ${lane.queue.length}`);
    }
    return `Queues: ${parts.join(' | ')}`;
  }
}
