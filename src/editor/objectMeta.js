const RUNTIME_NAMES = new Set([
  'player',
  'player-visual',
  'Casual_Male',
  'collision-debug',
  'occlusion-ray',
  'occlusion-bounds',
  'CheckoutPlayerZone',
  'CheckoutProgressUI',
  'WeaponStationZone',
  'WeaponStationMount',
  'RightHandWeaponSocket'
]);

const RUNTIME_PREFIXES = ['shopper-', 'marker-', 'dropped-', 'hit-', 'security-', 'cashier-', 'cctv-', 'intercom-'];

export const PROTECTED_IDS = new Set(['store', 'outside-environment']);

export function round(value) {
  return Math.round(value * 10000) / 10000;
}

export function readLocal(object) {
  return {
    position: [round(object.position.x), round(object.position.y), round(object.position.z)],
    rotation: [round(object.rotation.x), round(object.rotation.y), round(object.rotation.z)],
    scale: [round(object.scale.x), round(object.scale.y), round(object.scale.z)]
  };
}

export function writeLocal(object, local) {
  if (local.position) {
    object.position.set(local.position[0], local.position[1], local.position[2]);
  }
  if (local.rotation) {
    object.rotation.set(local.rotation[0], local.rotation[1], local.rotation[2]);
  }
  if (local.scale) {
    object.scale.set(local.scale[0], local.scale[1], local.scale[2]);
  }
}

export function vecEqual(left, right) {
  return Boolean(left && right)
    && left[0] === right[0]
    && left[1] === right[1]
    && left[2] === right[2];
}

export function toDegrees(radians) {
  return round((radians * 180) / Math.PI);
}

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function isRuntimeObject(object) {
  if (!object) {
    return true;
  }
  if (object.userData?.shopper || object.isCamera) {
    return true;
  }
  const name = object.name || '';
  if (RUNTIME_NAMES.has(name)) {
    return true;
  }
  for (let i = 0; i < RUNTIME_PREFIXES.length; i += 1) {
    if (name.startsWith(RUNTIME_PREFIXES[i])) {
      return true;
    }
  }
  return false;
}

export function hasHelper(object) {
  let current = object;
  while (current) {
    if (current.userData?.editorHelper) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function isShown(object) {
  let current = object;
  while (current) {
    if (current.visible === false) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

export function containsObject(root, target) {
  let current = target;
  while (current) {
    if (current === root) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function nearestRoot(object) {
  let current = object;
  while (current) {
    if (current.userData?.editorRoot) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export function objectKey(object) {
  return object.userData.editorId || object.uuid;
}

export function fileName(url) {
  const clean = String(url || '').split('?')[0];
  const base = clean.split('/').pop() || 'Object';
  return base.replace(/\.(glb|gltf)$/i, '');
}

export function createEditorId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `placed-${Date.now().toString(36)}-${random}`;
}

export function includeNode(object) {
  if (!object) {
    return false;
  }
  if (object.userData.editorRoot || object.userData.editorHelper || object.userData.editorIgnore) {
    return false;
  }
  return !isRuntimeObject(object);
}

function segmentFor(parent, child) {
  const included = parent.children.filter(includeNode);
  const name = child.name || 'object';
  const same = included.filter((item) => (item.name || 'object') === name);
  if (same.length <= 1) {
    return name;
  }
  return `${name}#${same.indexOf(child)}`;
}

export function eachNode(root, visitor) {
  function walk(parent, parentPath) {
    for (let i = 0; i < parent.children.length; i += 1) {
      const child = parent.children[i];
      if (!includeNode(child)) {
        continue;
      }
      const segment = segmentFor(parent, child);
      const path = parentPath ? `${parentPath}/${segment}` : segment;
      visitor(child, path);
      walk(child, path);
    }
  }
  walk(root, '');
}

export function nodePath(root, object) {
  if (!root || !object || object === root) {
    return '';
  }
  const parts = [];
  let current = object;
  while (current && current !== root) {
    const parent = current.parent;
    if (!parent) {
      return null;
    }
    parts.push(segmentFor(parent, current));
    current = parent;
  }
  if (current !== root) {
    return null;
  }
  return parts.reverse().join('/');
}

export function findNode(root, path) {
  if (!root || !path) {
    return root || null;
  }
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (!current) {
      return null;
    }
    const part = parts[i];
    const included = current.children.filter(includeNode);
    let next = null;
    const hash = part.lastIndexOf('#');
    if (hash > 0 && /^\d+$/.test(part.slice(hash + 1))) {
      const name = part.slice(0, hash);
      const index = Number(part.slice(hash + 1));
      const same = included.filter((item) => (item.name || 'object') === name);
      if (same.length > 1) {
        next = same[index] || null;
      }
    }
    if (!next) {
      next = included.find((item) => (item.name || 'object') === part) || null;
    }
    current = next;
  }
  return current;
}

export function describeParent(parent) {
  if (!parent || parent.isScene || parent.type === 'Scene') {
    return null;
  }
  if (parent.userData.editorId) {
    return parent.userData.editorId;
  }
  const root = nearestRoot(parent);
  if (!root) {
    return null;
  }
  const path = nodePath(root, parent);
  if (!path) {
    return root.userData.editorId || null;
  }
  return `${root.userData.editorId}>${path}`;
}

export function traverseOwned(object, visit) {
  visit(object);
  for (let i = 0; i < object.children.length; i += 1) {
    const child = object.children[i];
    if (child.userData.editorRoot || child.userData.editorHelper || child.userData.editorIgnore) {
      continue;
    }
    if (isRuntimeObject(child)) {
      continue;
    }
    traverseOwned(child, visit);
  }
}

export function readShadows(object) {
  let cast = null;
  let receive = null;
  traverseOwned(object, (child) => {
    if (!child.isMesh || cast !== null) {
      return;
    }
    cast = child.castShadow === true;
    receive = child.receiveShadow === true;
  });
  return {
    any: cast !== null,
    cast: cast === true,
    receive: receive === true
  };
}

export function readColor(object) {
  let hex = null;
  traverseOwned(object, (child) => {
    if (hex || !child.isMesh || !child.material) {
      return;
    }
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material?.color?.getHexString) {
      hex = `#${material.color.getHexString()}`;
    }
  });
  return hex;
}

export function emptyDocument() {
  return {
    version: 1,
    deleted: [],
    objects: {},
    added: []
  };
}

export function normalizeDocument(value) {
  const document = emptyDocument();
  if (!value || typeof value !== 'object') {
    return document;
  }
  if (Array.isArray(value.deleted)) {
    document.deleted = value.deleted.filter((id) => typeof id === 'string' && id.length < 200);
  }
  if (value.objects && typeof value.objects === 'object' && !Array.isArray(value.objects)) {
    document.objects = value.objects;
  }
  if (Array.isArray(value.added)) {
    document.added = value.added.filter((item) => item && typeof item.id === 'string');
  }
  return document;
}

export function sortRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return record;
  }
  const sorted = {};
  const keys = Object.keys(record).sort();
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = record[key];
    sorted[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? sortRecord(value)
      : value;
  }
  return sorted;
}
