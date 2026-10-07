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
  occlusion: {
    debugOcclusion: false,
    occlusionRadius: 0.2,
    fadeOpacity: 0.25,
    fadeSpeed: 8,
    restoreSpeed: 6,
    targetHeight: 1.2
  },
  collision: {
    padding: 0
  },
  joystick: {
    maxRadius: 54,
    deadzone: 0.16
  },
  economy: {
    startingMoney: 0
  },
  checkout: {
    debugCheckout: false,
    checkoutTime: 1.5,
    minCustomerPayment: 5,
    maxCustomerPayment: 15,
    maxComfortableQueue: 5,
    queueAngerCountdown: 5,
    queueArrivalDistance: 0.45,
    angerReactTime: 0.65,
    queueSpacing: 0.78,
    queueSlots: 6,
    queueOrigin: [1.2, 3.7],
    zonePosition: [2.28, 3.7],
    zoneRadius: 0.48
  },
  shoppers: {
    debugNavigation: false,
    maxActive: 8,
    spawnInterval: 5,
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
