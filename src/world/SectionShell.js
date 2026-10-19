import {
  FLOOR_Z_MAX,
  FLOOR_Z_MIN,
  INTERIOR_Z_MAX,
  INTERIOR_Z_MIN,
  SECTION_WIDTH,
  STORE_NORTH,
  STORE_SOUTH,
  sectionEast
} from './StoreSections.js';

const FLOOR = '/models/environment/floor.glb';
const WALL = '/models/environment/wall.glb';
const WALL_CORNER = '/models/environment/wall-corner.glb';

function entry(id, model, position, rotation, collision, group, extra = {}) {
  return {
    id,
    model,
    position,
    rotation,
    scale: 1,
    collision,
    group,
    startsHidden: true,
    ...extra
  };
}

export function expansionFloorTiles(index) {
  const west = sectionEast(index) - SECTION_WIDTH;
  const east = sectionEast(index);
  const first = index === 1 ? west + 1.5 : west + 0.5;
  const last = east - 0.5;
  const tiles = [];
  for (let z = FLOOR_Z_MIN; z <= FLOOR_Z_MAX; z += 1) {
    for (let x = first; x <= last + 0.001; x += 1) {
      tiles.push([x, z]);
    }
  }
  return tiles;
}

export function apronTiles(index) {
  const x = sectionEast(index) + 0.5;
  const tiles = [];
  for (let z = FLOOR_Z_MIN; z <= FLOOR_Z_MAX; z += 1) {
    tiles.push([x, z]);
  }
  return tiles;
}

function decor(id, kind, position, section, extra = {}) {
  return {
    id: `decor-${id}`,
    model: null,
    position,
    rotation: [0, 0, 0],
    scale: 1,
    collision: false,
    group: `section-${section.id}`,
    startsHidden: section.id !== 'grocery',
    decor: kind,
    accent: section.accent,
    ...extra
  };
}

export function groceryDecor(section) {
  const centerX = sectionEast(0) - SECTION_WIDTH / 2;
  return [
    decor('sign-grocery', 'sign', [centerX, 1.18, -4.16], { ...section, id: 'grocery' }, {
      group: 'section-grocery',
      title: section.name,
      startsHidden: false
    }),
    decor('board-grocery', 'baseboard', [centerX, 0.05, -4.16], { ...section, id: 'grocery' }, {
      group: 'section-grocery',
      startsHidden: false,
      size: [6.3, 0.1, 0.05]
    })
  ];
}

const SHARED_RESERVED = [
  { label: 'WEAPON', local: [6.05, 2.15] },
  { label: 'REGISTER', local: [5.2, 3.3] }
];

export function buildExpansionShell(section) {
  const index = section.index;
  const west = sectionEast(index) - SECTION_WIDTH;
  const east = sectionEast(index);
  const centerX = west + SECTION_WIDTH / 2;
  const sectionGroup = `section-${section.id}`;
  const boundaryGroup = `boundary-${section.id}`;
  const entries = [];

  for (let x = west + 0.5; x <= east - 0.5 + 0.001; x += 1) {
    const tile = Math.round(x);
    entries.push(
      entry(`wall-north-${section.id}-${tile}`, WALL, [tile, 0, STORE_NORTH], [0, 0, 0], true, sectionGroup),
      entry(`wall-south-${section.id}-${tile}`, WALL, [tile, 0, STORE_SOUTH], [0, 0, 0], true, sectionGroup)
    );
  }

  for (let z = INTERIOR_Z_MIN; z <= INTERIOR_Z_MAX; z += 1) {
    entries.push(
      entry(`wall-east-${section.id}-${z}`, WALL, [east, 0, z], [0, Math.PI / 2, 0], true, boundaryGroup)
    );
  }
  entries.push(
    entry(`corner-se-${section.id}`, WALL_CORNER, [east, 0, STORE_SOUTH], [0, 0, 0], true, boundaryGroup),
    entry(`corner-ne-${section.id}`, WALL_CORNER, [east, 0, STORE_NORTH], [0, Math.PI / 2, 0], true, boundaryGroup)
  );

  entries.push(
    decor(`tint-${section.id}`, 'tint', [centerX, 0.046, 0.5], section, { size: [6.2, 9.2] }),
    decor(`seam-${section.id}`, 'seam', [west + 0.04, 0.052, 0.5], section, { size: [0.07, 9.2] }),
    decor(`board-${section.id}`, 'baseboard', [centerX, 0.05, -4.16], section, { size: [6.3, 0.1, 0.05] }),
    decor(`sign-${section.id}`, 'sign', [centerX, 1.18, -4.16], section, { title: section.name })
  );

  const reserved = section.reserved.concat(SHARED_RESERVED);
  for (let i = 0; i < reserved.length; i += 1) {
    const spot = reserved[i];
    entries.push(decor(
      `reserved-${section.id}-${spot.label.toLowerCase()}`,
      'reserved',
      [west + spot.local[0], 0.05, spot.local[1]],
      section,
      { label: spot.label }
    ));
  }

  return {
    tiles: expansionFloorTiles(index),
    apron: apronTiles(index),
    entries
  };
}

export const shellFloorModel = FLOOR;
