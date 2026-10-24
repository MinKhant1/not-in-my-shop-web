import * as THREE from 'three';
import { CheckoutProgressUI } from './CheckoutProgressUI.js';

export class CheckoutInteraction {
  constructor(scene, player, queue, money, checkout, camera) {
    this.player = player;
    this.queue = queue;
    this.money = money;
    this.checkoutTime = checkout.checkoutTime;
    this.zoneX = checkout.zonePosition[0];
    this.zoneZ = checkout.zonePosition[1];
    this.zoneRadius = checkout.zoneRadius;
    this.elapsed = 0;
    this.progress = 0;
    this.isCheckoutCompleting = false;
    this.automated = false;
    this.time = 0;
    this.scene = scene;
    this.camera = camera;
    this.zone = this.createZone(this.zoneX, this.zoneZ);
    scene.add(this.zone);
    this.progressUI = new CheckoutProgressUI(scene, camera);
    this.lanes = [{
      id: 'cash-register',
      queue,
      zoneX: this.zoneX,
      zoneZ: this.zoneZ,
      zone: this.zone,
      disc: this.disc,
      ring: this.ring,
      elapsed: 0,
      progress: 0,
      completing: false,
      automated: false,
      progressUI: this.progressUI
    }];
  }

  createZone(x, z) {
    const group = new THREE.Group();
    group.name = 'CheckoutPlayerZone';
    group.position.set(x, 0.035, z);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.zoneRadius * 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0x65e9c3,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.name = 'checkout-disc';

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.zoneRadius * 0.78, this.zoneRadius, 40),
      new THREE.MeshBasicMaterial({
        color: 0x65e9c3,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'checkout-ring';

    group.add(disc);
    group.add(ring);
    group.renderOrder = 2;
    this.disc = disc;
    this.ring = ring;
    return group;
  }

  addLane({ id, queue, x, z, register }) {
    if (this.lanes.some((lane) => lane.id === id)) {
      return;
    }
    const zone = this.createZone(x, z);
    this.scene.add(zone);
    const progressUI = new CheckoutProgressUI(this.scene, this.camera, register);
    this.lanes.push({
      id,
      queue,
      zoneX: x,
      zoneZ: z,
      zone,
      disc: this.disc,
      ring: this.ring,
      elapsed: 0,
      progress: 0,
      completing: false,
      automated: false,
      progressUI
    });
    const lane = this.lanes[this.lanes.length - 1];
    lane.disc = zone.getObjectByName('checkout-disc');
    lane.ring = zone.getObjectByName('checkout-ring');
  }

  update(dt) {
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 3) * 0.035;
    for (let i = 0; i < this.lanes.length; i += 1) {
      this.updateLane(this.lanes[i], dt, pulse);
    }
    const primary = this.lanes[0];
    this.elapsed = primary.elapsed;
    this.progress = primary.progress;
    this.isCheckoutCompleting = primary.completing;
    this.automated = primary.automated;
  }

  updateLane(lane, dt, pulse) {
    lane.ring.scale.set(pulse, pulse, 1);
    const front = lane.queue.frontCustomer;
    const attended = lane.zone.visible !== false && (this.insideLane(lane) || lane.automated === true);
    let active = attended && this.isServing(front) && !lane.completing;
    if (active) {
      if (front.state !== 'CHECKING_OUT') {
        front.startCheckoutService();
      }
      lane.elapsed += dt;
      const duration = this.checkoutTime > 0 ? this.checkoutTime : 0.0001;
      lane.progress = Math.min(1, lane.elapsed / duration);
      if (lane.progress >= 1) {
        this.completeFront(lane, front);
        active = false;
      }
    } else if (!lane.completing) {
      if (front && front.state === 'CHECKING_OUT' && !front.isThief) {
        front.waitForPlayer();
      }
      lane.elapsed = 0;
      lane.progress = 0;
    }

    if (active) {
      lane.progressUI.show();
      lane.progressUI.setProgress(lane.progress);
    } else {
      lane.progressUI.reset();
      lane.progressUI.hide();
    }
    lane.progressUI.update(dt);
    lane.disc.material.opacity = 0.14 + lane.progress * 0.45;
    lane.ring.material.color.setHex(lane.progress > 0 ? 0xffd15c : 0x3ddc97);
  }

  cancel() {
    for (let i = 0; i < this.lanes.length; i += 1) {
      const lane = this.lanes[i];
      lane.elapsed = 0;
      lane.progress = 0;
      lane.completing = false;
      lane.progressUI.reset();
      lane.progressUI.hide();
      lane.disc.material.opacity = 0.14;
      lane.ring.material.color.setHex(0x3ddc97);
    }
    this.elapsed = 0;
    this.progress = 0;
    this.isCheckoutCompleting = false;
  }

  completeFront(lane, front) {
    if (lane.completing || !front || front.isThief) {
      return;
    }
    lane.completing = true;
    const payment = front.payment ?? 0;
    lane.elapsed = 0;
    lane.progress = 0;
    front.finishCheckout();
    this.money.addMoney(payment);
    this.onCheckout?.(payment);
    lane.completing = false;
  }

  describe() {
    const parts = [];
    for (let i = 0; i < this.lanes.length; i += 1) {
      const lane = this.lanes[i];
      const front = lane.queue.frontCustomer;
      const customer = front ? `Shopper_${front.id}` : 'none';
      parts.push(`${lane.id} ${customer} ${lane.progress.toFixed(2)}`);
    }
    return `Checkout ${parts.join(' | ')} Player in zone: ${this.playerInside()}`;
  }

  setAutomated(automated) {
    this.setLaneAutomated('cash-register', automated);
  }

  setLaneOpen(id, open) {
    const lane = this.lanes.find((entry) => entry.id === id);
    if (!lane) {
      return;
    }
    lane.zone.visible = open === true;
    if (open !== true) {
      lane.elapsed = 0;
      lane.progress = 0;
      lane.completing = false;
      lane.progressUI.reset();
      lane.progressUI.hide();
    }
  }

  setLaneAutomated(id, automated) {
    const lane = this.lanes.find((entry) => entry.id === id);
    if (!lane) {
      return;
    }
    lane.automated = automated === true;
    if (lane.id === 'cash-register') {
      this.automated = lane.automated;
    }
  }

  setZone(x, z) {
    this.zoneX = x;
    this.zoneZ = z;
    this.zone.position.set(x, 0.035, z);
    const primary = this.lanes[0];
    primary.zoneX = x;
    primary.zoneZ = z;
  }

  playerInside() {
    for (let i = 0; i < this.lanes.length; i += 1) {
      if (this.insideLane(this.lanes[i])) {
        return true;
      }
    }
    return false;
  }

  insideLane(lane) {
    if (lane.zone.visible === false) {
      return false;
    }
    const position = this.player.group.position;
    const dx = position.x - lane.zoneX;
    const dz = position.z - lane.zoneZ;
    return dx * dx + dz * dz <= this.zoneRadius * this.zoneRadius;
  }

  isServing(shopper) {
    return Boolean(shopper)
      && !shopper.isThief
      && (shopper.state === 'WAITING_FOR_CHECKOUT' || shopper.state === 'CHECKING_OUT');
  }
}
