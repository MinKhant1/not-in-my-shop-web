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
    startingMoney: 0,
    debugMoney: true
  },
  upgrades: {
    coinInterval: 0.15,
    securityGuard: {
      id: 'security-guard',
      cost: 80,
      position: [2.55, -3.15],
      halfSize: 0.72,
      model: '/models/characters/BlueSoldier_Male.gltf',
      modelScale: 0.36,
      modelYOffset: 0.03,
      home: [2.45, -2.55],
      patrol: [
        [2.45, -2.55],
        [-2.15, -2.55],
        [2.45, -2.55],
        [2.45, -0.85]
      ],
      detectRange: 6.5,
      moveSpeed: 1.7,
      radius: 0.22
    },
    securityCamera: {
      id: 'security-camera',
      cost: 100,
      position: [5.054, 1.230],
      halfSize: 0.72,
      baseModel: '/models/objects/cctv_wall_base.glb',
      headModel: '/models/objects/cctv_rotating_camera.glb',
      mountHeight: 0.84,
      modelScale: 0.5,
      sweepRadians: 0.48,
      sweepPeriod: 7.5
    },
    cashier: {
      cost: 60,
      halfSize: 0.72,
      padGap: 1.2,
      model: '/models/characters/Casual2_Female.gltf',
      modelScale: 0.36,
      modelYOffset: 0.03
    }
  },
  purchases: {
    paymentInterval: 0.04,
    paymentPerTick: 1
  },
  dayNight: {
    dayDuration: 120,
    transitionSeconds: 1.5,
    closingSeconds: 2.6,
    closingSoonSeconds: 10,
    openShop: {
      x: -2.5,
      z: -2,
      holdSeconds: 1
    },
    day: {
      background: 0xc5ced6,
      hemisphereSky: 0xfff6ea,
      hemisphereGround: 0x8e99a3,
      hemisphereIntensity: 0.45,
      sunColor: 0xfffaf3,
      sunIntensity: 2,
      fillColor: 0xffc27a,
      fillIntensity: 0
    },
    night: {
      background: 0x2a3548,
      hemisphereSky: 0x8ea6d8,
      hemisphereGround: 0x3d3428,
      hemisphereIntensity: 0.42,
      sunColor: 0xb9c9ee,
      sunIntensity: 0.72,
      fillColor: 0xffb15e,
      fillIntensity: 1.05
    }
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
  weapons: {
    debugWeapons: false,
    debugBroomGrip: true,
    model: '/models/objects/low_poly_broom.glb',
    // Local to RightHandWeaponSocket, which is parented to the right-hand bone (Fist.R).
    broomEquipPosition: { x: 0, y: 0, z: 0.04 },
    broomEquipRotation: { x: 3, y: -1, z: -1.99 },
    broomEquipScale: { x: 0.85, y: 0.85, z: 0.85 },
    // Distance along the handle from the exported origin. 0 holds the near end; ~2.99 holds the far end.
    broomGripDistance: 2.99,
    thiefMaxHP: 100,
    broomDamage: 20,
    attackRange: 1.5,
    attackCooldown: 0.6,
    attackHitDelay: 0.16,
    attackSwingDuration: 0.45,
    swingAngle: 1.15,
    pickupRadius: 1,
    itemRecoveryValue: 5,
    defeatedThiefRunSpeed: 2.4,
    zonePosition: [1.9, 1.25],
    zoneRadius: 0.42,
    broomStationOffset: [-0.52, 0.02, 0.08],
    broomStationRotation: [0.2, 0.5, 0.55],
    broomStationScale: 0.34
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
