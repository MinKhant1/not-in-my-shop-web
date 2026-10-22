export const SECTION_WIDTH = 7;
export const STORE_WEST = -3.5;
export const STORE_NORTH = -4.5;
export const STORE_SOUTH = 5.5;
export const INTERIOR_Z_MIN = -4;
export const INTERIOR_Z_MAX = 5;
export const FLOOR_Z_MIN = -6;
export const FLOOR_Z_MAX = 7;
export const FLOOR_MIN_X = -3;
export const FLOOR_MAX_X = 3;
export const CORNER_FLUSH = 0.2;

export const SECTION_ORDER = ['grocery', 'electronics', 'sports', 'clothing', 'jewellery'];

const ACCENT = {
  grocery: 0x3f8f5a,
  electronics: 0x3a78d0,
  sports: 0xe07a2f,
  clothing: 0xd7c4a3,
  jewellery: 0xe0b84a
};

function sectionWest(index) {
  return STORE_WEST + index * SECTION_WIDTH;
}

export function sectionEast(index) {
  return sectionWest(index) + SECTION_WIDTH;
}

export function sectionIndexAt(x) {
  const index = Math.floor((x - STORE_WEST) / SECTION_WIDTH);
  if (index < 0 || index >= storeSections.length) {
    return -1;
  }
  return index;
}

function toFixture(section, spec) {
  const local = spec.local;
  return {
    id: spec.id,
    sectionId: section.id,
    name: spec.name,
    asset: spec.asset ?? null,
    procedural: spec.procedural ?? null,
    caseSize: spec.caseSize ?? null,
    caseAccent: spec.caseAccent ?? null,
    caseInterior: spec.caseInterior ?? null,
    price: spec.price,
    local,
    position: [sectionWest(section.index) + local[0], local[1], local[2]],
    rotation: spec.rotation ?? [0, 0, 0],
    scale: spec.scale ?? [1, 1, 1],
    footprint: spec.footprint ?? [0.8, 0.6],
    purchasedByDefault: spec.purchasedByDefault === true,
    existing: spec.existing === true,
    keepColor: spec.keepColor !== false
  };
}

const FIXTURE_SPECS = {
  grocery: [
    { id: 'grocery_freezer_1', name: 'Freezer', asset: '/models/store/freezers-standing.glb', price: 30, local: [3, 0, -3.7], purchasedByDefault: true, existing: true, keepColor: false },
    { id: 'grocery_freezer_2', name: 'Freezer', asset: '/models/store/freezers-standing.glb', price: 30, local: [4, 0, -3.7], purchasedByDefault: true, existing: true, keepColor: false },
    { id: 'grocery_freezer_3', name: 'Freezer', asset: '/models/store/freezer.glb', price: 30, local: [2.9, 0, -3.4], purchasedByDefault: true, existing: true, keepColor: false },
    { id: 'grocery_freezer_4', name: 'Freezer', asset: '/models/store/freezer.glb', price: 30, local: [4.1, 0, -3.4], purchasedByDefault: true, existing: true, keepColor: false },
    { id: 'grocery_shelf_1', name: 'Grocery Shelf 1', asset: '/models/store/shelf-boxes.glb', price: 20, local: [2.3, 0, -1.35], purchasedByDefault: true, existing: true, keepColor: false },
    { id: 'grocery_shelf_2', name: 'Grocery Shelf 2', asset: '/models/store/shelf-bags.glb', price: 20, local: [4.7, 0, -1.35], purchasedByDefault: true, existing: true, keepColor: false },
    { id: 'grocery_fruit_bread', name: 'Fruit/Bread Display', asset: '/models/store/display-fruit.glb', price: 25, local: [3.5, 0, 1.05], purchasedByDefault: true, existing: true, keepColor: false }
  ],
  electronics: [
    { id: 'electronics_headphone_rack_1', name: 'Headphone Rack', asset: '/models/store/headphone_rack.glb', price: 25, local: [1.75, 0, -3.95], scale: [1.25, 1.25, 1.25], footprint: [0.95, 0.4] },
    { id: 'electronics_headphone_rack_2', name: 'Headphone Rack', asset: '/models/store/headphone_rack.glb', price: 25, local: [3.5, 0, -3.95], scale: [1.25, 1.25, 1.25], footprint: [0.95, 0.4] },
    { id: 'electronics_headphone_rack_3', name: 'Headphone Rack', asset: '/models/store/headphone_rack.glb', price: 25, local: [5.25, 0, -3.95], scale: [1.25, 1.25, 1.25], footprint: [0.95, 0.4] },
    { id: 'electronics_phone_rack', name: 'Phone Rack', asset: '/models/store/phone_rack.glb', price: 40, local: [2.2, 0, -1.5], scale: [1.3, 1.3, 1.3], footprint: [1, 0.65] },
    { id: 'electronics_laptop_shelf', name: 'Laptop Shelf', procedural: 'laptop-shelf', price: 40, local: [4.85, 0, -1.5], footprint: [1.1, 0.62] },
    { id: 'electronics_camera_rack', name: 'Camera Rack', asset: '/models/store/camera_rack.glb', price: 35, local: [3.5, 0, 0.15], scale: [1.3, 1.3, 1.3], footprint: [0.95, 0.65] },
    { id: 'electronics_speaker_display', name: 'Speaker Display', procedural: 'speaker-display', price: 30, local: [3.5, 0, 1.8], footprint: [1, 0.58] },
    { id: 'electronics_cash_register', name: 'Cash Register', asset: '/models/store/cash-register.glb', price: 40, local: [3.5, 0, 3.45], rotation: [0, Math.PI, 0], footprint: [0.8, 0.55], keepColor: false }
  ],
  sports: [
    { id: 'sports_bike_wall_rack', name: 'Bike Wall Rack', asset: '/models/store/bike_wall_rack.glb', price: 50, local: [3.5, 0, -3.98], scale: [2.2, 1.2, 1.15], footprint: [2.1, 0.36] },
    { id: 'sports_shoe_rack', name: 'Shoe Rack', asset: '/models/store/shoe_rack.glb', price: 35, local: [3.5, 0, -1.45], scale: [1.35, 1.35, 1.35], footprint: [1.05, 0.8] },
    { id: 'sports_ball_rack', name: 'Ball Rack', asset: '/models/store/ball_rack.glb', price: 25, local: [3.5, 0, 0.25], scale: [1.35, 1.35, 1.35], footprint: [1.1, 0.6] },
    { id: 'sports_cash_register', name: 'Cash Register', asset: '/models/store/cash-register.glb', price: 40, local: [3.5, 0, 3.45], rotation: [0, Math.PI, 0], footprint: [0.8, 0.55], keepColor: false }
  ],
  clothing: [
    { id: 'clothing_wall_rack', name: 'Clothes Wall Rack', asset: '/models/store/clothes_wall_rack.glb', price: 40, local: [3.5, 0, -3.95], scale: [2.4, 1.25, 1.15], footprint: [2, 0.4] },
    { id: 'clothing_rack_1', name: 'Clothes Rack', asset: '/models/store/clothes_rack1.glb', price: 30, local: [2.25, 0, -1.45], scale: [1.35, 1.35, 1.35], footprint: [1.2, 0.65] },
    { id: 'clothing_rack_2', name: 'Clothes Rack', asset: '/models/store/clothes_rack2.glb', price: 30, local: [4.75, 0, -1.45], scale: [1.35, 1.35, 1.35], footprint: [1.15, 0.7] },
    { id: 'clothing_folded_rack', name: 'Folded Clothes Rack', asset: '/models/store/clothes_rack_folded.glb', price: 35, local: [3.5, 0, 0.25], scale: [1.35, 1.35, 1.35], footprint: [1.1, 0.7] },
    { id: 'clothing_cash_register', name: 'Cash Register', asset: '/models/store/cash-register.glb', price: 40, local: [3.5, 0, 3.45], rotation: [0, Math.PI, 0], footprint: [0.8, 0.55], keepColor: false }
  ],
  jewellery: [
    { id: 'jewellery_luxury_case', name: 'Luxury Glass Case', procedural: 'glass-case', price: 60, local: [3.5, 0, -3.82], footprint: [2.3, 0.5], caseSize: [2.25, 0.86, 0.46], caseAccent: ACCENT.jewellery, caseInterior: 0x6b1d32 },
    { id: 'jewellery_ring_display', name: 'Ring Display', asset: '/models/store/ring_display.glb', price: 45, local: [2.15, 0, -1.45], scale: [1.5, 1.5, 1.5], footprint: [0.95, 0.58] },
    { id: 'jewellery_watch_display', name: 'Watch Display', asset: '/models/store/watch_display.glb', price: 45, local: [4.85, 0, -1.45], scale: [1.5, 1.5, 1.5], footprint: [1.05, 0.58] },
    { id: 'jewellery_necklace_display', name: 'Necklace Display', asset: '/models/store/necklace_display.glb', price: 45, local: [3.5, 0, 0.2], scale: [1.5, 1.5, 1.5], footprint: [1.2, 0.62] },
    { id: 'jewellery_glass_showcase', name: 'Glass Showcase', procedural: 'glass-case', price: 50, local: [3.5, 0, 1.75], footprint: [1.2, 0.62], caseSize: [1.15, 0.66, 0.58], caseAccent: ACCENT.jewellery, caseInterior: 0x1d3a4a },
    { id: 'jewellery_cash_register', name: 'Cash Register', asset: '/models/store/cash-register.glb', price: 40, local: [3.5, 0, 3.45], rotation: [0, Math.PI, 0], footprint: [0.8, 0.55], keepColor: false }
  ]
};

const RESERVED = {
  sports: [
    { id: 'sports_skates', label: 'SKATES', local: [2.15, 1.85] },
    { id: 'sports_broom', label: 'BROOM', local: [4.85, 1.85] }
  ],
  clothing: [
    { id: 'clothing_intercom', label: 'INTERCOM', local: [3.5, 1.85] }
  ]
};

const SECTION_DEFS = [
  { id: 'grocery', name: 'Grocery', expansionCost: 0, unlockedByDefault: true },
  { id: 'electronics', name: 'Electronics', expansionCost: 100, unlockedByDefault: false },
  { id: 'sports', name: 'Sports', expansionCost: 200, unlockedByDefault: false },
  { id: 'clothing', name: 'Clothing', expansionCost: 300, unlockedByDefault: false },
  { id: 'jewellery', name: 'Jewellery', expansionCost: 500, unlockedByDefault: false }
];

function createSections() {
  return SECTION_DEFS.map((def, index) => {
    const section = {
      ...def,
      index,
      accent: ACCENT[def.id],
      reserved: RESERVED[def.id] ?? [],
      fixtures: []
    };
    const specs = FIXTURE_SPECS[def.id] ?? [];
    section.fixtures = specs.map((spec) => toFixture(section, spec));
    return section;
  });
}

export const storeSections = createSections();

export const fixtureById = new Map();
for (let s = 0; s < storeSections.length; s += 1) {
  const fixtures = storeSections[s].fixtures;
  for (let i = 0; i < fixtures.length; i += 1) {
    fixtureById.set(fixtures[i].id, fixtures[i]);
  }
}

export function sectionById(id) {
  for (let i = 0; i < storeSections.length; i += 1) {
    if (storeSections[i].id === id) {
      return storeSections[i];
    }
  }
  return null;
}

export function sanitizeUnlock(ids) {
  const have = ids instanceof Set ? ids : new Set(ids);
  const unlocked = [];
  for (let i = 0; i < storeSections.length; i += 1) {
    const section = storeSections[i];
    if (!section.unlockedByDefault && !have.has(section.id)) {
      break;
    }
    unlocked.push(section.id);
  }
  return unlocked;
}

export function sanitizeFixtures(ids, unlocked) {
  const open = unlocked instanceof Set ? unlocked : new Set(unlocked);
  const owned = [];
  const seen = new Set();
  const list = Array.isArray(ids) ? ids : [];
  for (let i = 0; i < list.length; i += 1) {
    const id = list[i];
    const fixture = fixtureById.get(id);
    if (!fixture || seen.has(id) || fixture.existing || fixture.purchasedByDefault) {
      continue;
    }
    if (!open.has(fixture.sectionId)) {
      continue;
    }
    seen.add(id);
    owned.push(id);
  }
  return owned;
}

export function defaultOwnedFixtureIds() {
  const ids = [];
  for (let s = 0; s < storeSections.length; s += 1) {
    const fixtures = storeSections[s].fixtures;
    for (let i = 0; i < fixtures.length; i += 1) {
      if (fixtures[i].purchasedByDefault) {
        ids.push(fixtures[i].id);
      }
    }
  }
  return ids;
}
