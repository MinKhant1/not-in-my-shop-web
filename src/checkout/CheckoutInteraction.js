import * as THREE from 'three';

export class CheckoutInteraction {
  constructor(scene, player, queue, money, checkout) {
    this.player = player;
    this.queue = queue;
    this.money = money;
    this.checkoutTime = checkout.checkoutTime;
    this.zoneX = checkout.zonePosition[0];
    this.zoneZ = checkout.zonePosition[1];
    this.zoneRadius = checkout.zoneRadius;
    this.progress = 0;
    this.time = 0;
    this.zone = this.createZone();
    scene.add(this.zone);
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
    const serving = this.isServing(front);
    if (this.playerInside() && serving) {
      if (front.state !== 'CHECKING_OUT') {
        front.startCheckoutService();
      }
      this.progress += dt;
      if (this.progress >= this.checkoutTime) {
        this.progress = 0;
        const payment = front.payment ?? 0;
        front.finishCheckout();
        this.money.addMoney(payment);
      }
    } else {
      if (front && front.state === 'CHECKING_OUT') {
        front.waitForPlayer();
      }
      this.progress = 0;
    }

    const fill = this.checkoutTime > 0 ? this.progress / this.checkoutTime : 0;
    this.disc.material.opacity = 0.14 + fill * 0.45;
    this.ring.material.color.setHex(fill > 0 ? 0xffd15c : 0x3ddc97);
  }

  playerInside() {
    const position = this.player.group.position;
    const dx = position.x - this.zoneX;
    const dz = position.z - this.zoneZ;
    return dx * dx + dz * dz <= this.zoneRadius * this.zoneRadius;
  }

  isServing(shopper) {
    return Boolean(shopper)
      && (shopper.state === 'WAITING_FOR_CHECKOUT' || shopper.state === 'CHECKING_OUT');
  }
}
