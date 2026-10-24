export class DroppedItemManager {
  constructor(scene, config) {
    this.scene = scene;
    this.radius = config.pickupRadius;
    this.value = config.itemRecoveryValue;
    this.items = [];
  }

  spawn(drops) {
    for (let i = 0; i < drops.length; i += 1) {
      const drop = drops[i];
      this.scene.attach(drop.mesh);
      drop.mesh.position.set(drop.x, 0.08, drop.z);
      drop.mesh.rotation.set(0, drop.angle ?? 0, 0);
      this.items.push({
        mesh: drop.mesh,
        value: drop.value ?? this.value
      });
    }
  }

  update(player, money) {
    if (this.items.length === 0) {
      return;
    }
    const position = player.position;
    const radiusSq = this.radius * this.radius;
    let gained = 0;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      const dx = item.mesh.position.x - position.x;
      const dz = item.mesh.position.z - position.z;
      if (dx * dx + dz * dz > radiusSq) {
        continue;
      }
      gained += item.value;
      item.mesh.removeFromParent();
      const materials = Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material];
      for (let m = 0; m < materials.length; m += 1) {
        materials[m].dispose();
      }
      this.items.splice(i, 1);
    }
    if (gained > 0) {
      money.addMoney(gained);
    }
  }

  clear() {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.mesh.removeFromParent();
      const materials = Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material];
      for (let m = 0; m < materials.length; m += 1) {
        materials[m].dispose();
      }
    }
    this.items = [];
  }

  describe() {
    if (this.items.length === 0) {
      return 'Dropped: 0';
    }
    return `Dropped: ${this.items.length} Value: ${this.items[0].value}`;
  }
}
