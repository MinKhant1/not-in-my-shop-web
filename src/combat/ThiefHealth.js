export class ThiefHealth {
  constructor(maxHP) {
    this.maxHP = maxHP;
    this.currentHP = maxHP;
    this.isDefeated = false;
  }

  get ratio() {
    if (this.maxHP <= 0) {
      return 0;
    }
    return this.currentHP / this.maxHP;
  }

  takeDamage(amount) {
    if (this.isDefeated) {
      return false;
    }
    this.currentHP = Math.max(0, this.currentHP - Math.max(0, amount));
    if (this.currentHP <= 0) {
      this.currentHP = 0;
      this.isDefeated = true;
      return true;
    }
    return false;
  }
}
