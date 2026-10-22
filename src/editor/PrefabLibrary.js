export class PrefabLibrary {
  constructor() {
    this.models = {};
    this.dirty = false;
  }

  async load() {
    try {
      const response = await fetch(new URL('prefabs.json', document.baseURI), { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const documentState = await response.json();
      if (documentState?.version === 1 && documentState.models && typeof documentState.models === 'object') {
        this.models = documentState.models;
      }
    } catch (error) {
      console.warn('Prefabs could not be loaded', error);
    }
    this.dirty = false;
  }

  get(model) {
    return this.models[model] || null;
  }

  set(model, record) {
    this.models[model] = record;
    this.dirty = true;
  }

  serialize() {
    return {
      version: 1,
      models: this.models
    };
  }

  async save() {
    const response = await fetch('/__editor/prefabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.serialize())
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Prefab save failed (${response.status})`);
    }
    this.dirty = false;
  }

  applyGeneric(scene) {
    const models = Object.keys(this.models);
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      if (model.endsWith('streetlight.glb')) {
        continue;
      }
      const record = this.models[model];
      const parts = record?.parts;
      if (!parts) {
        continue;
      }
      scene.traverse((object) => {
        if (object.userData?.editorModel !== model) {
          return;
        }
        applyParts(object, parts);
      });
    }
  }
}

function applyParts(root, parts) {
  const names = Object.keys(parts);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const state = parts[name];
    const node = findNamed(root, name);
    if (!node || !state) {
      continue;
    }
    if (Array.isArray(state.position)) {
      node.position.fromArray(state.position);
    }
    if (Array.isArray(state.rotation)) {
      node.rotation.set(state.rotation[0], state.rotation[1], state.rotation[2]);
    }
    if (Array.isArray(state.scale)) {
      node.scale.fromArray(state.scale);
    }
  }
}

function findNamed(root, name) {
  let found = null;
  root.traverse((child) => {
    if (!found && child !== root && child.name === name) {
      found = child;
    }
  });
  return found;
}
