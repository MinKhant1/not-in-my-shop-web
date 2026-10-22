// Visual cost for the flaming broom. Mobile stays on medium unless the device is very small.
export const FLAME_PRESETS = {
  low: {
    planes: 2,
    rows: 4,
    quality: 0,
    glow: false,
    light: false,
    emberCapacity: 10,
    sparkCapacity: 14,
    emberTarget: 8,
    idleSparks: 1,
    attackSparks: 12,
    hitSparks: 6,
    hitEmbers: 3,
    emberRate: 16,
    sparkRate: 2,
    trailSegments: 8,
    trailLife: 0.16,
    trailWidth: 0.11,
    lightIntensity: 0,
    lightDistance: 0
  },
  medium: {
    planes: 3,
    rows: 8,
    quality: 1,
    glow: true,
    light: true,
    emberCapacity: 16,
    sparkCapacity: 24,
    emberTarget: 12,
    idleSparks: 2,
    attackSparks: 16,
    hitSparks: 8,
    hitEmbers: 4,
    emberRate: 20,
    sparkRate: 3,
    trailSegments: 14,
    trailLife: 0.22,
    trailWidth: 0.22,
    lightIntensity: 0.22,
    lightDistance: 0.55
  },
  high: {
    planes: 3,
    rows: 8,
    quality: 1,
    glow: true,
    light: true,
    emberCapacity: 22,
    sparkCapacity: 32,
    emberTarget: 16,
    idleSparks: 3,
    attackSparks: 20,
    hitSparks: 10,
    hitEmbers: 5,
    emberRate: 26,
    sparkRate: 4,
    trailSegments: 18,
    trailLife: 0.25,
    trailWidth: 0.26,
    lightIntensity: 0.3,
    lightDistance: 0.7
  }
};

export function resolveFlameQuality(requested) {
  if (requested === 'low' || requested === 'medium' || requested === 'high') {
    return requested;
  }
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const memory = typeof navigator !== 'undefined' ? navigator.deviceMemory || 4 : 4;
  if (memory <= 2 || cores <= 2) {
    return 'low';
  }
  const mobile = typeof navigator !== 'undefined'
    && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  if (!mobile && cores >= 8 && memory >= 8) {
    return 'high';
  }
  return 'medium';
}

export function flamePreset(requested) {
  return FLAME_PRESETS[resolveFlameQuality(requested)];
}
