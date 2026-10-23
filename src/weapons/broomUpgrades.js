// Player broom progression. Level 1 is free. Each later tier is bought once, in order.
export const BROOM_UPGRADES = [
  {
    level: 1,
    id: 'normal_broom',
    name: 'Normal Broom',
    model: '/models/objects/low_poly_broom.glb',
    damage: 10,
    cost: 0,
    burnDps: 0,
    burnDuration: 0
  },
  {
    level: 2,
    id: 'spiked_broom',
    name: 'Spiked Broom',
    model: '/models/objects/broom_2.glb',
    damage: 20,
    cost: 150,
    burnDps: 0,
    burnDuration: 0
  },
  {
    level: 3,
    id: 'flaming_spiked_broom',
    name: 'Flaming Spiked Broom',
    model: '/models/objects/broom_2.glb',
    damage: 30,
    cost: 350,
    burnDps: 5,
    burnDuration: 3,
    flameScale: 1,
    flameIntensity: 1,
    flameParticles: 1
  }
];

export function broomByLevel(level) {
  const found = BROOM_UPGRADES.find((entry) => entry.level === level);
  return found ?? BROOM_UPGRADES[0];
}

export function nextBroom(level) {
  return BROOM_UPGRADES.find((entry) => entry.level === level + 1) ?? null;
}

export function broomOfferSummary(name) {
  const label = String(name || '').toUpperCase();
  if (label.includes('FLAM')) {
    return 'Sets the broom alight. Swings hit harder and burn a thief for a few seconds.';
  }
  if (label.includes('SPIK')) {
    return 'Adds spikes to the broom so each swing hits harder.';
  }
  if (label.includes('STATION')) {
    return 'Places a broom stand in this aisle. Step on it again later to upgrade the broom.';
  }
  return 'The broom is fully upgraded. It hits hard and burns thieves.';
}
