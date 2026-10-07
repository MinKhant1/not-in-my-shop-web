const FLOOR = '/models/environment/floor.glb';
const WALL = '/models/environment/wall.glb';
const WALL_CORNER = '/models/environment/wall-corner.glb';
const WALL_DOOR = '/models/environment/wall-door-rotate.glb';

const FLOOR_MIN_X = -3;
const FLOOR_MAX_X = 3;
const FLOOR_MIN_Z = -4;
const FLOOR_MAX_Z = 3;
const NORTH_Z = FLOOR_MIN_Z - 0.5;
const SOUTH_Z = FLOOR_MAX_Z + 0.5;
const WEST_X = FLOOR_MIN_X - 0.5;
const EAST_X = FLOOR_MAX_X + 0.5;

function entry(id, model, position, rotation = [0, 0, 0], collision = false, scale = 1) {
  return { id, model, position, rotation, scale, collision };
}

function buildLayout() {
  const layout = [];

  for (let z = -6; z <= 5; z += 1) {
    for (let x = -4; x <= 4; x += 1) {
      layout.push(entry(`floor-${x}-${z}`, FLOOR, [x, 0, z]));
    }
  }

  for (let x = FLOOR_MIN_X; x <= FLOOR_MAX_X; x += 1) {
    layout.push(entry(`wall-north-${x}`, WALL, [x, 0, NORTH_Z], [0, 0, 0], true));
  }

  for (let x = FLOOR_MIN_X; x <= FLOOR_MAX_X; x += 1) {
    if (x === 0) {
      layout.push(entry('wall-door-south', WALL_DOOR, [0, 0, SOUTH_Z], [0, 0, 0], true));
    } else {
      layout.push(entry(`wall-south-${x}`, WALL, [x, 0, SOUTH_Z], [0, 0, 0], true));
    }
  }

  for (let z = FLOOR_MIN_Z; z <= FLOOR_MAX_Z; z += 1) {
    layout.push(entry(`wall-west-${z}`, WALL, [WEST_X, 0, z], [0, Math.PI / 2, 0], true));
    layout.push(entry(`wall-east-${z}`, WALL, [EAST_X, 0, z], [0, Math.PI / 2, 0], true));
  }

  layout.push(
    entry('corner-se', WALL_CORNER, [EAST_X, 0, SOUTH_Z], [0, 0, 0], true),
    entry('corner-ne', WALL_CORNER, [EAST_X, 0, NORTH_Z], [0, Math.PI / 2, 0], true),
    entry('corner-nw', WALL_CORNER, [WEST_X, 0, NORTH_Z], [0, Math.PI, 0], true),
    entry('corner-sw', WALL_CORNER, [WEST_X, 0, SOUTH_Z], [0, -Math.PI / 2, 0], true)
  );

  layout.push(
    entry('freezer-standing-left', '/models/store/freezers-standing.glb', [-2.15, 0, -3.75], [0, 0, 0], true),
    entry('freezer-standing-right', '/models/store/freezers-standing.glb', [2.15, 0, -3.75], [0, 0, 0], true),
    entry('freezer-chest-left', '/models/store/freezer.glb', [-0.42, 0, -3.5], [0, 0, 0], true),
    entry('freezer-chest-right', '/models/store/freezer.glb', [0.42, 0, -3.5], [0, 0, 0], true),

    entry('shelf-boxes-back', '/models/store/shelf-boxes.glb', [-1.55, 0, -2.35], [0, 0, 0], true),
    entry('shelf-boxes-front', '/models/store/shelf-boxes.glb', [-1.55, 0, -0.95], [0, 0, 0], true),
    entry('shelf-bags-back', '/models/store/shelf-bags.glb', [1.55, 0, -2.35], [0, 0, 0], true),
    entry('shelf-bags-front', '/models/store/shelf-bags.glb', [1.55, 0, -0.95], [0, 0, 0], true),
    entry('shelf-end-left', '/models/store/shelf-end.glb', [-1.55, 0, -0.15], [0, Math.PI, 0], true),
    entry('shelf-end-right', '/models/store/shelf-end.glb', [1.55, 0, -0.15], [0, Math.PI, 0], true),

    entry('display-fruit', '/models/store/display-fruit.glb', [-1.55, 0, 1.2], [0, 0, 0], true),
    entry('display-bread', '/models/store/display-bread.glb', [1.55, 0, 1.2], [0, 0, 0], true),

    entry('cart', '/models/store/shopping-cart.glb', [-2.35, 0, 2.25], [0, 0.4, 0], true),
    entry('basket', '/models/store/shopping-basket.glb', [1.55, 0.74, 2.4], [0, 0.2, 0], false),

    {
      id: 'checkout',
      model: null,
      position: [1.7, 0, 2.4],
      rotation: [0, 0, 0],
      scale: 1,
      collision: true,
      placeholder: {
        size: [1.25, 0.74, 0.55],
        color: 0xc49a6c
      }
    }
  );

  return layout;
}

export const storeLayout = buildLayout();
