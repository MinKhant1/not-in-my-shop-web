import * as THREE from 'three';

function painted(toon, color) {
  const source = new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.04 });
  return toon ? toon.fromImported(source) : source;
}

function box(parent, size, position, color, toon) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), painted(toon, color));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function glassMaterial(tint) {
  return new THREE.MeshStandardMaterial({
    color: tint,
    transparent: true,
    opacity: 0.22,
    roughness: 0.06,
    metalness: 0.04,
    depthWrite: false
  });
}

function laptop(parent, x, toon) {
  box(parent, [0.34, 0.025, 0.22], [x, 0.5, 0.02], 0x222a33, toon);
  const screen = box(parent, [0.34, 0.2, 0.018], [x, 0.6, -0.08], 0x3a78d0, toon);
  screen.rotation.x = -0.42;
}

export function createLaptopShelf(toon) {
  const group = new THREE.Group();
  group.name = 'laptop-shelf';
  box(group, [1.02, 0.42, 0.5], [0, 0.21, 0], 0x243044, toon);
  box(group, [1.08, 0.05, 0.56], [0, 0.445, 0], 0x1b242e, toon);
  box(group, [1.02, 0.035, 0.03], [0, 0.3, 0.26], 0x3a78d0, toon);
  laptop(group, -0.24, toon);
  laptop(group, 0.24, toon);
  return group;
}

export function createSpeakerDisplay(toon) {
  const group = new THREE.Group();
  group.name = 'speaker-display';
  box(group, [0.96, 0.08, 0.5], [0, 0.04, 0], 0x2a241c, toon);
  const towers = [-0.3, 0.3];
  for (let i = 0; i < towers.length; i += 1) {
    const x = towers[i];
    box(group, [0.28, 0.62, 0.28], [x, 0.39, 0], 0x1c2430, toon);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.02, 18),
      painted(toon, 0x3a78d0)
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(x, 0.48, 0.15);
    group.add(cone);
    const small = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16),
      painted(toon, 0xd7dde6)
    );
    small.rotation.x = Math.PI / 2;
    small.position.set(x, 0.28, 0.15);
    group.add(small);
  }
  box(group, [0.22, 0.16, 0.18], [0, 0.16, 0], 0x303846, toon);
  return group;
}

export function createGlassCase(toon, size, accent, interior) {
  const width = size?.[0] ?? 1.15;
  const height = size?.[1] ?? 0.66;
  const depth = size?.[2] ?? 0.55;
  const frame = accent ?? 0xe0b84a;
  const cloth = interior ?? 0x6b1d32;
  const group = new THREE.Group();
  group.name = 'glass-case';

  box(group, [width, 0.08, depth], [0, 0.04, 0], 0x3a2e22, toon);
  box(group, [width - 0.12, 0.035, depth - 0.12], [0, 0.1, 0], cloth, toon);

  const post = 0.055;
  const hx = width / 2 - post / 2;
  const hz = depth / 2 - post / 2;
  const corners = [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]];
  for (let i = 0; i < corners.length; i += 1) {
    box(group, [post, height, post], [corners[i][0], height / 2, corners[i][1]], frame, toon);
  }
  box(group, [width, 0.045, depth], [0, height - 0.02, 0], frame, toon);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.1, height - 0.16, depth - 0.1),
    glassMaterial(0xe7f2f6)
  );
  glass.name = 'glass';
  glass.position.y = height * 0.52;
  group.add(glass);
  return group;
}

export function createProceduralFixture(entry, toon) {
  if (entry.procedural === 'laptop-shelf') {
    return createLaptopShelf(toon);
  }
  if (entry.procedural === 'speaker-display') {
    return createSpeakerDisplay(toon);
  }
  if (entry.procedural === 'glass-case') {
    return createGlassCase(toon, entry.caseSize, entry.caseAccent, entry.caseInterior);
  }
  return new THREE.Group();
}
