export const GameConfig = {
  debug: false,
  background: 0xc7e3f6,
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
    height: 7.05,
    distance: 4.5,
    lookAhead: 1.7,
    smoothness: 8,
    fov: 42,
    portraitFov: 45
  },
  diorama: {
    marginNorth: 5.4,
    marginSouth: 2.9,
    marginEast: 4,
    marginWest: 1.35,
    sidewalk: 2,
    southWalk: 2
  },
  streetlight: {
    color: 0xffd58a,
    intensity: 8,
    angle: Math.PI / 5.5,
    penumbra: 1,
    distance: 12,
    decay: 0,
    castShadow: false,
    emissiveIntensity: 1.5,
    height: 2.35,
    headLocal: null,
    headNudge: [0, 0, 0],
    lightForward: 0.05
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
  menu: {
    holdSeconds: 0.8,
    feedbackUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSf8CUUSx4tPHo77xMg_KlK_eY_GS3RcFAoQCTeykflh7Yu6_Q/viewform?usp=dialog'
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
    broomStation: {
      cost: 200,
      halfSize: 0.72
    },
    intercom: {
      id: 'intercom',
      cost: 100,
      position: [-2.05, 2.35],
      halfSize: 0.72,
      cooldown: 60,
      icon: '/assets/ui/ability/intercom_ability_icon.png',
      micModel: '/models/objects/intercom_mic_stand.glb',
      speakerModel: '/models/objects/wall_pa_speaker.glb',
      micScale: 0.58,
      micPosition: [1.62, 0.42, 2.78],
      micRotation: [0, Math.PI, 0],
      speakerScale: 0.72,
      speakerHeight: 0.78,
      speakerRightOffset: 1.05,
      speakerWallZ: -4.2,
      speakerBack: 0.186,
      pulseSeconds: 1.2,
      noticeSeconds: 1.7
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
    // One-time sports upgrade. The pad sits on the reserved SKATES spot.
    // roller_skate.glb is the left skate only: +Y up, toe toward -Z, wheels on Y=0.
    // Pose is in foot-bone local space. Rx(+90) lays skate-up on bone +Z and the toe on bone +Y.
    rollerSkate: {
      id: 'roller-skate',
      cost: 100,
      halfSize: 0.72,
      model: '/models/objects/roller_skate.glb',
      speedMultiplier: 1.3,
      position: { x: 0, y: 0.03, z: -0.09 },
      rotation: { x: Math.PI / 2, y: 0, z: 0 },
      scale: 0.32,
      outward: 0
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
    fogNear: 20,
    fogFar: 42,
    day: {
      background: 0xc7e3f6,
      hemisphereSky: 0xfff8f0,
      hemisphereGround: 0xcfc2d4,
      hemisphereIntensity: 0.7,
      sunColor: 0xfffaf6,
      sunIntensity: 1.7,
      fillColor: 0xffe7c8,
      fillIntensity: 0.32
    },
    night: {
      background: 0x1d2838,
      hemisphereSky: 0x8ea6d8,
      hemisphereGround: 0x3a3558,
      hemisphereIntensity: 0.48,
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
    queueOrigin: [1.2, 4.055],
    zonePosition: [2.28, 4.055],
    zoneRadius: 0.48
  },
  weapons: {
    debugWeapons: false,
    debugBroomGrip: false,
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
    // auto, low, medium, or high. Mobile uses medium unless the device is very small.
    flameQuality: 'auto',
    pickupRadius: 1,
    itemRecoveryValue: 5,
    // Seconds they stay on the ground after the fall, before standing back up.
    knockoutLieTime: 0.8,
    defeatedThiefRunSpeed: 3.6,
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
      '/models/characters/Suit_Male.gltf',
      '/models/outside/Chef_Female.gltf',
      '/models/outside/Cowboy_Female.gltf',
      '/models/outside/Cowboy_Male.gltf',
      '/models/outside/Doctor_Female_Old.gltf',
      '/models/outside/Doctor_Female_Young.gltf',
      '/models/outside/OldClassy_Female.gltf'
    ]
  },
  trash: {
    model: '/models/objects/trash_bag.glb',
    startDay: 3,
    chance:0.1,
    height: 0.28
  }
};
