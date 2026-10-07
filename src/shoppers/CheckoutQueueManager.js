export class CheckoutQueueManager {
  constructor(slotIds) {
    this.slotIds = slotIds;
    this.queue = [];
  }

  get length() {
    return this.queue.length;
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
    return index;
  }

  complete(shopper) {
    const index = this.queue.indexOf(shopper);
    if (index < 0) {
      return;
    }
    this.queue.splice(index, 1);
    for (let i = 0; i < this.queue.length; i += 1) {
      this.queue[i].setQueueIndex(i);
    }
  }

  slotId(index) {
    return this.slotIds[index] ?? null;
  }
}
