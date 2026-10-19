export class ShopExpansionUpgrade {
  constructor(store) {
    this.store = store;
    this.id = 'right-shop-expansion';
  }

  activate() {
    this.store.openRightExpansion();
  }
}
