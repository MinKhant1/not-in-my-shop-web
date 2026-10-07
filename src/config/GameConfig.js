export const GameConfig = {
  debug: true,
  background: 0xc5ced6,
  graphics: {
    shadows: false
  },
  player: {
    speed: 2.6,
    modelScale: 0.36,
    modelRotationOffset: 0,
    modelYOffset: 0.03,
    collisionRadius: 0.22,
    startPosition: [0, 0, 2.15]
  },
  camera: {
    height: 6.5,
    distance: 5.4,
    lookAhead: 2.7,
    smoothness: 8,
    fov: 48
  },
  collision: {
    padding: 0
  },
  joystick: {
    maxRadius: 54,
    deadzone: 0.16
  }
};
