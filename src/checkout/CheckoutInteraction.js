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
    this.time = 0;
    this.zone = this.createZone();
    scene.add(this.zone);
    this.progressUI = new CheckoutProgressUI(scene, camera);
  }

  createZone() {
    const group = new THREE.Group();
    group.name = 'CheckoutPlayerZone';
    group.position.set(this.zoneX, 0.035, this.zoneZ);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.zoneRadius * 0.78, 32),
      new THREE.MeshBasicMaterial({
        color: 0x7dffe0,
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
        color: 0x3ddc97,
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

  update(dt) {
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 3) * 0.035;
    this.ring.scale.set(pulse, pulse, 1);

    const front = this.queue.frontCustomer;
    let active = this.playerInside() && this.isServing(front) && !this.isCheckoutCompleting;
    if (active) {
      if (front.state !== 'CHECKING_OUT') {
        front.startCheckoutService();
      }
      this.elapsed += dt;
      const duration = this.checkoutTime > 0 ? this.checkoutTime : 0.0001;
      this.progress = Math.min(1, this.elapsed / duration);
      if (this.progress >= 1) {
        this.completeFront(front);
        active = false;
      }
    } else if (!this.isCheckoutCompleting) {
      if (front && front.state === 'CHECKING_OUT' && !front.isThief) {
        front.waitForPlayer();
      }
      this.elapsed = 0;
      this.progress = 0;
    }

    if (active) {
      this.progressUI.show();
      this.progressUI.setProgress(this.progress);
    } else {
      this.progressUI.reset();
      this.progressUI.hide();
    }
    this.progressUI.update(dt);

    this.disc.material.opacity = 0.14 + this.progress * 0.45;
    this.ring.material.color.setHex(this.progress > 0 ? 0xffd15c : 0x3ddc97);
  }

  cancel() {
    this.elapsed = 0;
    this.progress = 0;
    this.isCheckoutCompleting = false;
    this.progressUI.reset();
    this.progressUI.hide();
    this.disc.material.opacity = 0.14;
    this.ring.material.color.setHex(0x3ddc97);
  }

  completeFront(front) {
    if (this.isCheckoutCompleting || !front || front.isThief) {
      return;
    }
    this.isCheckoutCompleting = true;
    const payment = front.payment ?? 0;
    this.elapsed = 0;
    this.progress = 0;
    front.finishCheckout();
    this.money.addMoney(payment);
    this.onCheckout?.(payment);
    this.isCheckoutCompleting = false;
  }

  describe() {
    const front = this.queue.frontCustomer;
    const customer = front ? `Shopper_${front.id}` : 'none';
    const active = this.progress > 0 && this.isServing(front);
    return `Checkout active: ${active} Customer: ${customer} Progress: ${this.progress.toFixed(2)} Player in zone: ${this.playerInside()}`;
  }

  playerInside() {
    const position = this.player.group.position;
    const dx = position.x - this.zoneX;
    const dz = position.z - this.zoneZ;
    return dx * dx + dz * dz <= this.zoneRadius * this.zoneRadius;
  }

  isServing(shopper) {
    return Boolean(shopper)
      && !shopper.isThief
      && (shopper.state === 'WAITING_FOR_CHECKOUT' || shopper.state === 'CHECKING_OUT');
  }
}
