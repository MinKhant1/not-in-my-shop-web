export const GameConfig = {
  debug: true,
  background: 0xc5ced6,
  graphics: {
    shadows: false,
    toonShading: true,
    toonPlayer: true,
    toonSteps: 4
  },
  player: {
    speed: 2.6,
    modelScale: 0.36,
    modelRotationOffset: 0,
    modelYOffset: 0.03,
    collisionRadius: 0.22,
    startPosition: [-2.2, 0, 2.25]
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
  },
  shoppers: {
    debugNavigation: false,
    maxActive: 3,
    spawnInterval: 6,
    firstSpawnDelay: 1.4,
    thiefChance: 0.5,
    minItems: 1,
    maxItems: 4,
    moveSpeed: 1.35,
    speedJitter: 0.2,
    rotationSpeed: 6,
    waypointReachDistance: 0.4,
    stuckDistance: 0.05,
    stuckTimeout: 1.5,
    maxRecoveryAttempts: 3,
    pauseMin: 0.35,
    pauseMax: 1.15,
    checkoutDuration: 2,
    pickupWait: 0.65,
    radius: 0.2,
    modelScale: 0.36,
    modelYOffset: 0.03,
    models: [
      '/models/characters/Chef_Male.gltf',
      '/models/characters/OldClassy_Male.gltf',
      '/models/characters/Suit_Male.gltf'
    ]
  }
};
