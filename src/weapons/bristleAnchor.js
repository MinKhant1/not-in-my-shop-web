import * as THREE from 'three';

const box = new THREE.Box3();
const vertex = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const meshMatrix = new THREE.Matrix4();
const size = new THREE.Vector3();
const center = new THREE.Vector3();
const outward = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function emptyBand() {
  return {
    count: 0,
    minA: Infinity,
    maxA: -Infinity,
    minB: Infinity,
    maxB: -Infinity,
    sumA: 0,
    sumB: 0
  };
}

function resetBand(band) {
  band.count = 0;
  band.minA = Infinity;
  band.maxA = -Infinity;
  band.minB = Infinity;
  band.maxB = -Infinity;
  band.sumA = 0;
  band.sumB = 0;
}

function bandArea(band) {
  if (band.count < 3) {
    return 0;
  }
  return Math.max(0, band.maxA - band.minA) * Math.max(0, band.maxB - band.minB);
}

function considerMesh(child, visit) {
  const position = child.geometry?.attributes?.position;
  if (!child.isMesh || !position || child.userData.flameVfx) {
    return;
  }
  meshMatrix.multiplyMatrices(inverse, child.matrixWorld);
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(meshMatrix);
    visit(vertex);
  }
}

// Puts the anchor in the bristle head, with local +Y pointing out of the tips.
export function placeBristleAnchor(model, anchor) {
  model.updateWorldMatrix(true, true);
  inverse.copy(model.matrixWorld).invert();
  box.makeEmpty();
  model.traverse((child) => {
    considerMesh(child, (point) => box.expandByPoint(point));
  });

  if (box.isEmpty()) {
    anchor.position.set(0, 0.25, 0);
    anchor.quaternion.identity();
    anchor.scale.set(1, 1, 1);
    anchor.userData.bristleRadius = 0.28;
    return;
  }

  box.getSize(size);
  box.getCenter(center);
  let axis = 0;
  if (size.y >= size.x && size.y >= size.z) {
    axis = 1;
  } else if (size.z >= size.x && size.z >= size.y) {
    axis = 2;
  }

  const min = box.min.getComponent(axis);
  const max = box.max.getComponent(axis);
  const span = Math.max(0.001, max - min);
  const band = span * 0.08;
  const crossA = (axis + 1) % 3;
  const crossB = (axis + 2) % 3;
  const minBand = emptyBand();
  const maxBand = emptyBand();
  resetBand(minBand);
  resetBand(maxBand);

  model.traverse((child) => {
    considerMesh(child, (point) => {
      const along = point.getComponent(axis);
      let slot = null;
      if (along <= min + band) {
        slot = minBand;
      } else if (along >= max - band) {
        slot = maxBand;
      }
      if (!slot) {
        return;
      }
      const a = point.getComponent(crossA);
      const b = point.getComponent(crossB);
      slot.count += 1;
      slot.sumA += a;
      slot.sumB += b;
      if (a < slot.minA) slot.minA = a;
      if (a > slot.maxA) slot.maxA = a;
      if (b < slot.minB) slot.minB = b;
      if (b > slot.maxB) slot.maxB = b;
    });
  });

  const tipIsMin = bandArea(minBand) >= bandArea(maxBand);
  const tip = tipIsMin ? minBand : maxBand;
  const sign = tipIsMin ? -1 : 1;
  const tipValue = tipIsMin ? min : max;
  const radius = tip.count > 0
    ? Math.max(0.12, ((tip.maxA - tip.minA) + (tip.maxB - tip.minB)) * 0.25)
    : 0.28;
  const inset = Math.min(span * 0.22, Math.max(radius * 0.9, span * 0.05));

  anchor.position.copy(center);
  anchor.position.setComponent(axis, tipValue - sign * inset);
  if (tip.count > 0) {
    anchor.position.setComponent(crossA, tip.sumA / tip.count);
    anchor.position.setComponent(crossB, tip.sumB / tip.count);
  }

  outward.set(0, 0, 0);
  outward.setComponent(axis, sign);
  if (outward.dot(up) > 0.999) {
    anchor.quaternion.identity();
  } else if (outward.dot(up) < -0.999) {
    anchor.quaternion.set(1, 0, 0, 0);
  } else {
    anchor.quaternion.setFromUnitVectors(up, outward);
  }
  anchor.scale.set(1, 1, 1);
  anchor.userData.bristleRadius = radius;
}
