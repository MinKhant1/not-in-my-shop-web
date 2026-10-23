import * as THREE from 'three';
import {
  PROTECTED_IDS,
  createEditorId,
  describeParent,
  eachNode,
  emptyDocument,
  fileName,
  findNode,
  isRuntimeObject,
  nearestRoot,
  nodePath,
  normalizeDocument,
  readColor,
  readLocal,
  readShadows,
  round,
  sortRecord,
  traverseOwned,
  vecEqual,
  writeLocal
} from './objectMeta.js';

function writeColor(object, hex) {
  const color = new THREE.Color(hex);
  traverseOwned(object, (child) => {
    if (!child.isMesh || !child.material) {
      return;
    }
    const sources = Array.isArray(child.material) ? child.material : [child.material];
    const next = sources.map((source) => {
      if (!source?.color) {
        return source;
      }
      const material = source.userData.editorOwned ? source : source.clone();
      material.userData.editorOwned = true;
      material.color.copy(color);
      material.needsUpdate = true;
      return material;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function writeShadows(object, cast, receive) {
  traverseOwned(object, (child) => {
    if ((child.isMesh || child.isLight) && typeof cast === 'boolean') {
      child.castShadow = cast;
    }
    if (child.isMesh && typeof receive === 'boolean') {
      child.receiveShadow = receive;
    }
  });
}

function cloneEditable(source) {
  const clone = source.clone(false);
  for (let i = 0; i < source.children.length; i += 1) {
    const child = source.children[i];
    if (
      child.userData.editorRoot
      || child.userData.editorHelper
      || child.userData.editorIgnore
      || isRuntimeObject(child)
    ) {
      continue;
    }
    clone.add(cloneEditable(child));
  }
  return clone;
}

function entryFromSpec(spec) {
  const extra = spec.extra || {};
  return {
    id: spec.id,
    model: spec.model || null,
    procedural: spec.procedural || null,
    decor: spec.decor || null,
    placeholder: spec.placeholder || null,
    keepColor: spec.keepColor === true,
    collision: spec.collision !== false,
    group: '',
    accent: spec.accent ?? extra.accent ?? null,
    title: extra.title ?? null,
    label: extra.label ?? null,
    size: extra.size ?? null,
    caseSize: extra.caseSize ?? null,
    caseAccent: extra.caseAccent ?? null,
    caseInterior: extra.caseInterior ?? null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1
  };
}

export class SceneOverrides {
  constructor(game) {
    this.game = game;
    this.doc = emptyDocument();
    this.pendingObjects = {};
    this.baseline = new Map();
    this.nodeBaseline = new Map();
    this.deleted = new Set();
    this.visibility = new Map();
    this.savedText = JSON.stringify(emptyDocument());
    this._world = new THREE.Vector3();
  }

  find(id) {
    if (!id) {
      return null;
    }
    let found = null;
    this.game.scene.traverse((object) => {
      if (!found && object.userData.editorId === id) {
        found = object;
      }
    });
    return found;
  }

  adoptAnchor(object) {
    if (!object) {
      return;
    }
    const id = object.userData.editorId || object.name;
    if (!id) {
      return;
    }
    object.userData.editorId = id;
    object.userData.editorRoot = true;
    object.userData.editorPersistent = true;
    object.userData.editorCollision = false;
    if (this.baseline.has(id)) {
      return;
    }
    this.captureOne(object);
    const pending = this.doc?.objects?.[id];
    if (pending) {
      this.applyState(object, pending);
    }
  }

  persistentRoots() {
    const roots = [];
    this.game.scene.traverse((object) => {
      if (object.userData.editorPersistent && object.userData.editorRoot && !object.userData.editorHelper) {
        roots.push(object);
      }
    });
    return roots;
  }

  resolveParent(parentId) {
    if (!parentId) {
      return this.game.scene;
    }
    const split = parentId.indexOf('>');
    if (split === -1) {
      return this.find(parentId) || this.game.scene;
    }
    const root = this.find(parentId.slice(0, split));
    if (!root) {
      return this.game.scene;
    }
    return findNode(root, parentId.slice(split + 1)) || root;
  }

  async loadAndApply() {
    this.doc = emptyDocument();
    try {
      const response = await fetch(new URL('scene-overrides.json', document.baseURI), { cache: 'no-store' });
      if (response.ok) {
        this.doc = normalizeDocument(await response.json());
      }
    } catch (error) {
      console.warn('Scene overrides could not be loaded', error);
    }
    this.pendingObjects = this.doc.objects;
    this.indexScene();
    this.captureBaseline();
    await this.applyDocument(this.doc);
    this.syncGameplay();
    this.savedText = JSON.stringify(this.serialize());
  }

  indexScene() {
    const scene = this.game.scene;
    const used = new Set();
    scene.traverse((object) => {
      if (object.userData.editorId) {
        used.add(object.userData.editorId);
      }
    });

    const markRoot = (object) => {
      if (!object || object.userData.editorIgnore || object.userData.editorPersistent || object.userData.editorHelper) {
        return;
      }
      if (!object.name || isRuntimeObject(object) || used.has(object.name)) {
        return;
      }
      object.userData.editorId = object.name;
      object.userData.editorRoot = true;
      object.userData.editorPersistent = true;
      used.add(object.name);
    };

    const markChildren = (object) => {
      if (!object) {
        return;
      }
      for (let i = 0; i < object.children.length; i += 1) {
        markRoot(object.children[i]);
      }
    };

    markChildren(scene.getObjectByName('store'));
    const outside = scene.getObjectByName('outside-environment');
    markChildren(outside);
    markChildren(scene.getObjectByName('outside-shop-north'));
    for (let i = 0; i < scene.children.length; i += 1) {
      const child = scene.children[i];
      if (child.isLight) {
        markRoot(child);
      }
    }

    const roots = this.persistentRoots();
    for (let i = 0; i < roots.length; i += 1) {
      const object = roots[i];
      if (typeof object.userData.editorCollision !== 'boolean') {
        const id = object.userData.editorId;
        object.userData.editorCollision = this.game.collision.boxes.some((box) => box.id === id);
      }
    }
  }

  captureBaseline() {
    this.baseline.clear();
    this.nodeBaseline.clear();
    const roots = this.persistentRoots();
    for (let i = 0; i < roots.length; i += 1) {
      if (!roots[i].userData.editorAdded) {
        this.captureOne(roots[i]);
      }
    }
  }

  captureOne(object) {
    const id = object.userData.editorId;
    if (!id) {
      return;
    }
    const local = readLocal(object);
    object.getWorldPosition(this._world);
    const shadows = readShadows(object);
    this.baseline.set(id, {
      position: local.position,
      rotation: local.rotation,
      scale: local.scale,
      world: [round(this._world.x), round(this._world.y), round(this._world.z)],
      parentId: describeParent(object.parent),
      name: object.name,
      visible: object.visible,
      castShadow: shadows.cast,
      receiveShadow: shadows.receive,
      color: readColor(object),
      collision: object.userData.editorCollision === true,
      light: object.isLight ? readLight(object) : null
    });
    this.captureNodes(object);
  }

  captureNodes(object) {
    const id = object.userData.editorId;
    if (!id) {
      return;
    }
    const nodes = new Map();
    eachNode(object, (child, path) => {
      const local = readLocal(child);
      nodes.set(path, {
        object: child,
        position: local.position,
        rotation: local.rotation,
        scale: local.scale,
        parentId: describeParent(child.parent),
        visible: child.visible,
        color: readColor(child)
      });
    });
    this.nodeBaseline.set(id, nodes);
  }

  async applyDocument(doc) {
    for (let i = 0; i < doc.deleted.length; i += 1) {
      const id = doc.deleted[i];
      if (PROTECTED_IDS.has(id)) {
        continue;
      }
      this.deleted.add(id);
      const object = this.find(id);
      if (object) {
        this.detach(object, false);
      }
    }

    const spawned = [];
    for (let i = 0; i < doc.added.length; i += 1) {
      try {
        const object = await this.createAdded(doc.added[i]);
        if (object) {
          spawned.push([object, doc.added[i]]);
        }
      } catch (error) {
        console.error('Failed to restore added object', doc.added[i]?.id, error);
      }
    }
    for (let i = 0; i < spawned.length; i += 1) {
      this.finishAdded(spawned[i][0], spawned[i][1]);
    }

    const removals = [];
    const entries = Object.entries(doc.objects || {});
    for (let i = 0; i < entries.length; i += 1) {
      const [id, state] = entries[i];
      if (this.deleted.has(id)) {
        continue;
      }
      const object = this.find(id);
      if (!object || !state) {
        continue;
      }
      this.applyState(object, state);
      if (Array.isArray(state.removedNodes)) {
        removals.push([object, state.removedNodes]);
      }
    }
    for (let i = 0; i < removals.length; i += 1) {
      const [object, paths] = removals[i];
      for (let p = 0; p < paths.length; p += 1) {
        const node = findNode(object, paths[p]);
        node?.removeFromParent();
      }
    }
  }

  applyState(object, state) {
    if (Object.prototype.hasOwnProperty.call(state, 'parentId')) {
      const parent = this.resolveParent(state.parentId);
      if (parent && parent !== object && parent !== object.parent) {
        let blocked = false;
        let current = parent;
        while (current) {
          if (current === object) {
            blocked = true;
            break;
          }
          current = current.parent;
        }
        if (!blocked) {
          parent.add(object);
        }
      }
    }
    writeLocal(object, state);
    if (typeof state.name === 'string' && state.name) {
      object.name = state.name;
    }
    if (typeof state.visible === 'boolean') {
      this.setVisible(object, state.visible);
    }
    if (typeof state.castShadow === 'boolean' || typeof state.receiveShadow === 'boolean') {
      writeShadows(object, state.castShadow, state.receiveShadow);
    }
    if (typeof state.color === 'string') {
      writeColor(object, state.color);
      object.userData.editorColor = state.color;
    }
    if (state.light && object.isLight) {
      object.userData.editorLightLock = { ...state.light };
      this.applyLightLock(object);
    }
    if (state.props && typeof state.props === 'object') {
      object.userData.editorProps = state.props;
    }
    if (typeof state.collision === 'boolean') {
      object.userData.editorCollision = state.collision;
    }
    this.applyNodeState(object, state.nodes);
  }

  applyNodeState(object, nodes) {
    if (!nodes) {
      return;
    }
    const found = [];
    const paths = Object.keys(nodes);
    for (let i = 0; i < paths.length; i += 1) {
      const node = findNode(object, paths[i]);
      if (node) {
        found.push([node, nodes[paths[i]]]);
      }
    }
    for (let i = 0; i < found.length; i += 1) {
      const [node, state] = found[i];
      if (state.parentId) {
        const parent = this.resolveParent(state.parentId);
        if (parent && parent !== node) {
          parent.add(node);
        }
      }
      writeLocal(node, state);
      if (typeof state.visible === 'boolean') {
        node.visible = state.visible;
      }
      if (typeof state.color === 'string') {
        writeColor(node, state.color);
        node.userData.editorColor = state.color;
      }
    }
  }

  async createAdded(spec) {
    let object = null;
    if (spec.model || spec.procedural || spec.decor || spec.placeholder) {
      object = await this.game.store.spawn(entryFromSpec(spec));
    } else if (spec.cloneOf) {
      object = this.cloneSource(spec.cloneOf, spec.id);
    }
    if (!object) {
      return null;
    }
    object.userData.editorId = spec.id;
    object.userData.editorRoot = true;
    object.userData.editorPersistent = true;
    object.userData.editorAdded = true;
    if (spec.cloneOf) {
      object.userData.editorCloneOf = spec.cloneOf;
    }
    if (spec.collision === false) {
      object.userData.editorCollision = false;
    }
    this.captureNodes(object);
    return object;
  }

  cloneSource(sourceId, id) {
    const source = this.find(sourceId);
    if (!source) {
      console.warn('Missing clone source', sourceId);
      return null;
    }
    const clone = cloneEditable(source);
    clone.traverse((child) => {
      if (child === clone) {
        return;
      }
      delete child.userData.editorId;
      child.userData.editorRoot = false;
      child.userData.editorPersistent = false;
      child.userData.editorAdded = false;
    });
    clone.userData.editorCollision = source.userData.editorCollision === true;
    clone.userData.editorModel = null;
    (source.parent || this.game.scene).add(clone);
    clone.name = id;
    return clone;
  }

  finishAdded(object, spec) {
    if (Object.prototype.hasOwnProperty.call(spec, 'parentId')) {
      const parent = this.resolveParent(spec.parentId);
      if (parent && parent !== object.parent) {
        parent.add(object);
      }
    }
    writeLocal(object, spec);
    if (spec.name) {
      object.name = spec.name;
    }
    if (spec.visible === false) {
      object.visible = false;
    }
    if (typeof spec.castShadow === 'boolean' || typeof spec.receiveShadow === 'boolean') {
      writeShadows(object, spec.castShadow, spec.receiveShadow);
    }
    if (typeof spec.color === 'string') {
      writeColor(object, spec.color);
      object.userData.editorColor = spec.color;
    }
    if (spec.light && object.isLight) {
      object.userData.editorLightLock = { ...spec.light };
      this.applyLightLock(object);
    }
    if (spec.props && typeof spec.props === 'object') {
      object.userData.editorProps = spec.props;
    }
    this.applyNodeState(object, spec.nodes);
    if (Array.isArray(spec.removedNodes)) {
      for (let i = 0; i < spec.removedNodes.length; i += 1) {
        findNode(object, spec.removedNodes[i])?.removeFromParent();
      }
    }
    if (object.userData.editorCollision && object.parent) {
      this.game.collision.replaceObject(object.userData.editorId, object, { group: 'editor-added' });
    }
    this.trackAddedOccluder(object);
  }

  trackAddedOccluder(object) {
    const id = object?.userData?.editorId;
    const occlusion = this.game.occlusion;
    if (!occlusion || !id || id.startsWith('floor-') || id.startsWith('decor-')) {
      return;
    }
    occlusion.track(object, id);
  }

  noteSpawned(object) {
    const id = object?.userData?.editorId;
    if (!id || object.userData.editorAdded || this.baseline.has(id)) {
      return;
    }
    this.captureOne(object);
    const state = this.pendingObjects?.[id];
    if (state && !this.deleted.has(id)) {
      this.applyState(object, state);
    }
    if (this.deleted.has(id)) {
      this.detach(object, false);
    }
    this.syncGameplay();
    this.game.editor?.onSceneStructureChanged?.();
  }

  setVisible(object, visible) {
    object.visible = visible === true;
    const id = object.userData.editorId;
    if (!id || !object.userData.editorRoot) {
      return;
    }
    const base = this.baseline.get(id);
    if (base && base.visible === object.visible) {
      this.visibility.delete(id);
      return;
    }
    this.visibility.set(id, object.visible);
  }

  reapplyVisibility() {
    for (const [id, visible] of this.visibility) {
      const object = this.find(id);
      if (object) {
        object.visible = visible;
      }
    }
  }

  setColor(object, hex) {
    const baseline = this.baselineColor(object);
    if (baseline && baseline === hex) {
      delete object.userData.editorColor;
      writeColor(object, hex);
      return;
    }
    writeColor(object, hex);
    object.userData.editorColor = hex;
  }

  baselineColor(object) {
    if (object.userData.editorRoot && object.userData.editorId) {
      return this.baseline.get(object.userData.editorId)?.color || this.nodeColor(object);
    }
    return this.nodeColor(object);
  }

  nodeColor(object) {
    const root = object.userData.editorRoot ? object : nearestRoot(object);
    if (!root?.userData.editorId || object === root) {
      return root ? this.baseline.get(root.userData.editorId)?.color || null : null;
    }
    const path = nodePath(root, object);
    if (!path) {
      return null;
    }
    return this.nodeBaseline.get(root.userData.editorId)?.get(path)?.color || null;
  }

  setLightField(object, key, value) {
    if (!object.isLight) {
      return;
    }
    const base = this.baseline.get(object.userData.editorId)?.light;
    const lock = { ...(object.userData.editorLightLock || {}) };
    const baseValue = base?.[key];
    const same = typeof value === 'number'
      ? Math.abs((baseValue ?? 0) - value) < 0.0005
      : baseValue === value;
    if (same) {
      delete lock[key];
    } else {
      lock[key] = value;
    }
    if (Object.keys(lock).length === 0) {
      delete object.userData.editorLightLock;
    } else {
      object.userData.editorLightLock = lock;
    }
    this.applyLightLock(object);
  }

  applyLightLock(object) {
    const lock = object.userData.editorLightLock;
    if (!lock || !object.isLight) {
      return;
    }
    if (typeof lock.color === 'string') {
      object.color.set(lock.color);
    }
    if (typeof lock.intensity === 'number') {
      object.intensity = lock.intensity;
    }
    if (typeof lock.groundColor === 'string' && object.groundColor) {
      object.groundColor.set(lock.groundColor);
    }
  }

  applyLightLocks() {
    const roots = this.persistentRoots();
    for (let i = 0; i < roots.length; i += 1) {
      this.applyLightLock(roots[i]);
    }
  }

  detach(object, trackDeleted) {
    const id = object.userData.editorId;
    if (trackDeleted && id && !object.userData.editorAdded && !PROTECTED_IDS.has(id)) {
      this.deleted.add(id);
      this.visibility.delete(id);
    }
    object.userData.editorWasOccluder = id ? this.game.occlusion.has(id) : false;
    object.removeFromParent();
    if (id) {
      this.game.collision.removeId(id);
      this.game.occlusion.forget(id);
    }
  }

  restore(object, parent) {
    const id = object.userData.editorId;
    if (id) {
      this.deleted.delete(id);
    }
    (parent || this.game.scene).add(object);
    if (object.userData.editorWasOccluder && id) {
      this.game.occlusion.track(object, id);
    }
    this.syncObjectPhysics(object);
  }

  async duplicate(source) {
    const id = createEditorId();
    const local = readLocal(source);
    local.position = [local.position[0] + 0.45, local.position[1], local.position[2]];
    let object = null;
    if (source.userData.editorModel || source.userData.editorProcedural || source.userData.editorDecor || source.userData.editorPlaceholder) {
      object = await this.game.store.spawn({
        ...entryFromSpec({
          id,
          model: source.userData.editorModel,
          procedural: source.userData.editorProcedural,
          decor: source.userData.editorDecor,
          placeholder: source.userData.editorPlaceholder,
          keepColor: source.userData.editorKeepColor === true,
          collision: source.userData.editorCollision === true,
          accent: source.userData.editorAccent,
          extra: source.userData.editorExtra
        }),
        collision: source.userData.editorCollision === true
      });
    } else {
      object = this.cloneSource(source.userData.editorCloneOf || source.userData.editorId, id);
    }
    if (!object) {
      return null;
    }
    object.userData.editorId = id;
    object.userData.editorRoot = true;
    object.userData.editorPersistent = true;
    object.userData.editorAdded = true;
    object.userData.editorCollision = source.userData.editorCollision === true;
    if (!object.userData.editorModel) {
      object.userData.editorCloneOf = source.userData.editorCloneOf || source.userData.editorId;
    }
    object.name = `${source.name || fileName(source.userData.editorModel) || 'Object'} Copy`;
    if (source.parent && object.parent !== source.parent) {
      source.parent.add(object);
    }
    this.captureNodes(object);
    writeLocal(object, local);
    object.visible = source.visible;
    const shadows = readShadows(source);
    if (shadows.any) {
      writeShadows(object, shadows.cast, shadows.receive);
    }
    if (source.userData.editorColor) {
      this.setColor(object, source.userData.editorColor);
    }
    if (object.userData.editorCollision) {
      this.game.collision.replaceObject(id, object, { group: 'editor-added' });
    }
    this.trackAddedOccluder(object);
    this.syncGameplay();
    return object;
  }

  async placeModel(url, worldPoint, parent) {
    const id = createEditorId();
    const object = await this.game.store.spawn({
      id,
      model: url,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      collision: true
    });
    object.userData.editorAdded = true;
    object.userData.editorCollision = true;
    object.name = fileName(url);
    const targetParent = parent || object.parent;
    if (targetParent && targetParent !== object.parent) {
      targetParent.add(object);
    }
    this.captureNodes(object);
    const localPoint = worldPoint.clone();
    object.parent.worldToLocal(localPoint);
    object.position.copy(localPoint);
    this.game.collision.replaceObject(id, object, { group: 'editor-added' });
    this.trackAddedOccluder(object);
    this.syncGameplay();
    return object;
  }

  syncGameplay() {
    const roots = this.persistentRoots();
    for (let i = 0; i < roots.length; i += 1) {
      this.syncObjectPhysics(roots[i]);
    }
    this.syncAnchors();
    this.game.collision.rebuildDebug();
  }

  syncObjectPhysics(object) {
    const id = object.userData.editorId;
    if (!id || !object.parent) {
      return;
    }
    const base = this.baseline.get(id);
    const local = readLocal(object);
    const parentId = describeParent(object.parent);
    const moved = !base
      || !vecEqual(local.position, base.position)
      || !vecEqual(local.rotation, base.rotation)
      || !vecEqual(local.scale, base.scale)
      || parentId !== base.parentId;
    const collision = object.userData.editorCollision === true;
    const collisionChanged = !base || collision !== base.collision;
    if (moved || collisionChanged) {
      if (collision) {
        this.game.collision.replaceObject(id, object, {
          group: object.userData.editorGroup || (object.userData.editorAdded ? 'editor-added' : '')
        });
      } else {
        this.game.collision.removeId(id);
      }
    }
    if (moved) {
      this.game.occlusion.refresh(id);
    }
  }

  syncAnchors() {
    const register = this.worldDelta('cash-register');
    const navigation = this.game.shoppers?.navigation;
    if (navigation) {
      navigation.shiftCheckout(register.dx, register.dz);
      navigation.retargetLooks(this.lookMoves());
    }
    if (this.game.checkout) {
      const base = this.game.config.checkout.zonePosition;
      this.game.checkout.setZone(base[0] + register.dx, base[1] + register.dz);
    }
    this.game.cashiers?.syncLayout();
    if (this.game.weaponStation) {
      const weapon = this.worldDelta('weapon-station');
      const base = this.game.config.weapons.zonePosition;
      this.game.weaponStation.setZone(base[0] + weapon.dx, base[1] + weapon.dz);
    }
  }

  worldDelta(id) {
    const base = this.baseline.get(id);
    const object = this.find(id);
    if (!base || !object) {
      return { dx: 0, dz: 0 };
    }
    object.getWorldPosition(this._world);
    return {
      dx: this._world.x - base.world[0],
      dz: this._world.z - base.world[2]
    };
  }

  lookMoves() {
    const moves = [];
    for (const [id, base] of this.baseline) {
      const object = this.find(id);
      if (!object) {
        continue;
      }
      object.getWorldPosition(this._world);
      if (Math.abs(this._world.x - base.world[0]) < 0.02 && Math.abs(this._world.z - base.world[2]) < 0.02) {
        continue;
      }
      moves.push({
        fromX: base.world[0],
        fromZ: base.world[2],
        toX: this._world.x,
        toZ: this._world.z
      });
    }
    return moves;
  }

  serialize() {
    const objects = {};
    const added = [];
    const seen = new Set();
    const roots = this.persistentRoots();
    for (let i = 0; i < roots.length; i += 1) {
      const object = roots[i];
      const id = object.userData.editorId;
      if (!id || object.userData.editorKind === 'shop-sign') {
        continue;
      }
      seen.add(id);
      if (object.userData.editorAdded) {
        added.push(this.serializeAdded(object));
        continue;
      }
      const delta = this.diffOriginal(object);
      if (delta) {
        objects[id] = delta;
      }
    }
    const pendingIds = Object.keys(this.pendingObjects || {});
    for (let i = 0; i < pendingIds.length; i += 1) {
      const id = pendingIds[i];
      if (!seen.has(id) && !this.deleted.has(id) && !this.baseline.has(id)) {
        objects[id] = this.pendingObjects[id];
      }
    }
    return {
      version: 1,
      deleted: [...this.deleted].sort(),
      objects: sortRecord(objects),
      added
    };
  }

  diffOriginal(object) {
    const id = object.userData.editorId;
    const base = this.baseline.get(id);
    if (!base) {
      return null;
    }
    const local = readLocal(object);
    const delta = {};
    if (!vecEqual(local.position, base.position)) delta.position = local.position;
    if (!vecEqual(local.rotation, base.rotation)) delta.rotation = local.rotation;
    if (!vecEqual(local.scale, base.scale)) delta.scale = local.scale;
    const parentId = describeParent(object.parent);
    if (parentId !== base.parentId) delta.parentId = parentId;
    if (object.name !== base.name) delta.name = object.name;
    if (this.visibility.has(id)) delta.visible = this.visibility.get(id);
    const shadows = readShadows(object);
    if (shadows.any && shadows.cast !== base.castShadow) delta.castShadow = shadows.cast;
    if (shadows.any && shadows.receive !== base.receiveShadow) delta.receiveShadow = shadows.receive;
    if (object.userData.editorColor) delta.color = object.userData.editorColor;
    if (object.userData.editorLightLock) delta.light = object.userData.editorLightLock;
    if (object.userData.editorProps) delta.props = object.userData.editorProps;
    if (object.userData.editorCollision !== base.collision) {
      delta.collision = object.userData.editorCollision === true;
    }
    const nodeDiff = this.diffNodes(id);
    if (nodeDiff.nodes) delta.nodes = nodeDiff.nodes;
    if (nodeDiff.removed) delta.removedNodes = nodeDiff.removed;
    return Object.keys(delta).length ? delta : null;
  }

  diffNodes(id) {
    const baseline = this.nodeBaseline.get(id);
    const nodes = {};
    const removed = [];
    if (!baseline) {
      return { nodes: null, removed: null };
    }
    for (const [path, snap] of baseline) {
      const node = snap.object;
      if (!node.parent) {
        removed.push(path);
        continue;
      }
      const local = readLocal(node);
      const record = {};
      if (!vecEqual(local.position, snap.position)) record.position = local.position;
      if (!vecEqual(local.rotation, snap.rotation)) record.rotation = local.rotation;
      if (!vecEqual(local.scale, snap.scale)) record.scale = local.scale;
      const parentId = describeParent(node.parent);
      if (parentId !== snap.parentId) record.parentId = parentId;
      if (node.visible !== snap.visible) record.visible = node.visible;
      if (node.userData.editorColor) record.color = node.userData.editorColor;
      if (Object.keys(record).length) {
        nodes[path] = record;
      }
    }
    removed.sort();
    return {
      nodes: Object.keys(nodes).length ? sortRecord(nodes) : null,
      removed: removed.length ? removed : null
    };
  }

  serializeAdded(object) {
    const local = readLocal(object);
    const shadows = readShadows(object);
    const record = {
      id: object.userData.editorId,
      name: object.name,
      position: local.position,
      rotation: local.rotation,
      scale: local.scale,
      visible: object.visible !== false,
      parentId: describeParent(object.parent),
      collision: object.userData.editorCollision === true
    };
    if (object.userData.editorModel) record.model = object.userData.editorModel;
    if (object.userData.editorProcedural) record.procedural = object.userData.editorProcedural;
    if (object.userData.editorDecor) record.decor = object.userData.editorDecor;
    if (object.userData.editorPlaceholder) record.placeholder = object.userData.editorPlaceholder;
    if (object.userData.editorKeepColor) record.keepColor = true;
    if (object.userData.editorCloneOf) record.cloneOf = object.userData.editorCloneOf;
    if (object.userData.editorAccent != null) record.accent = object.userData.editorAccent;
    if (object.userData.editorExtra) record.extra = object.userData.editorExtra;
    if (shadows.any) {
      record.castShadow = shadows.cast;
      record.receiveShadow = shadows.receive;
    }
    if (object.userData.editorColor) record.color = object.userData.editorColor;
    if (object.userData.editorLightLock) record.light = object.userData.editorLightLock;
    if (object.userData.editorProps) record.props = object.userData.editorProps;
    const nodeDiff = this.diffNodes(object.userData.editorId);
    if (nodeDiff.nodes) record.nodes = nodeDiff.nodes;
    if (nodeDiff.removed) record.removedNodes = nodeDiff.removed;
    return record;
  }

  markSaved(doc) {
    const saved = doc || this.serialize();
    this.doc = saved;
    this.pendingObjects = saved.objects || {};
    this.savedText = JSON.stringify(saved);
  }

  isDirty() {
    return JSON.stringify(this.serialize()) !== this.savedText;
  }
}

function readLight(object) {
  return {
    color: `#${object.color.getHexString()}`,
    intensity: round(object.intensity),
    groundColor: object.groundColor ? `#${object.groundColor.getHexString()}` : null
  };
}
