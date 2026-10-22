import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EditorCamera, isEditorUi, isTyping } from './EditorCamera.js';
import {
  PROTECTED_IDS,
  containsObject,
  fileName,
  hasHelper,
  isRuntimeObject,
  isShown,
  nearestRoot,
  objectKey,
  readColor,
  readLocal,
  readShadows,
  toDegrees,
  toRadians
} from './objectMeta.js';
import './editor.css';

export class EditorSession {
  constructor(game) {
    this.game = game;
    this.overrides = game.sceneOverrides;
    this.active = false;
    this.selected = null;
    this.tool = 'translate';
    this.busy = false;
    this.dirty = false;
    this.query = '';
    this.assetQuery = '';
    this.expanded = new Set(['store']);
    this.undoStack = [];
    this.redoStack = [];
    this.assets = [];
    this.selectedAsset = '';
    this.usingGizmo = false;
    this.gizmoBefore = null;
    this.pointerDown = null;
    this.transformBefore = null;
    this.preview = null;
    this.prefabModel = null;

    this.view = new EditorCamera(game.canvas);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.controls = new TransformControls(this.view.camera, game.canvas);
    this.controls.enabled = false;
    const helper = this.controls.getHelper();
    helper.userData.editorHelper = true;
    helper.traverse((child) => {
      child.userData.editorHelper = true;
    });
    game.scene.add(helper);

    this.box = new THREE.BoxHelper(new THREE.Object3D(), 0x3d8bfd);
    this.box.userData.editorHelper = true;
    this.box.visible = false;
    this.box.material.depthTest = false;
    game.scene.add(this.box);
    this.controls.detach();

    this.root = document.createElement('div');
    this.root.id = 'editor-root';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="toolbar editor-toolbar">
        <button type="button" data-action="play">Play</button>
        <button type="button" data-action="save">Save</button>
        <button type="button" data-mode="translate">Move</button>
        <button type="button" data-mode="rotate">Rotate</button>
        <button type="button" data-mode="scale">Scale</button>
        <button type="button" data-action="focus">Focus</button>
        <button type="button" data-action="duplicate">Duplicate</button>
        <button type="button" data-action="delete">Delete</button>
        <button type="button" data-action="undo">Undo</button>
        <button type="button" data-action="redo">Redo</button>
        <button type="button" data-action="prefab-done" hidden>Done Prefab</button>
        <span class="editor-status"></span>
      </div>
      <section class="panel editor-hierarchy">
        <div class="editor-panel-head">Hierarchy <input type="search" placeholder="Search" data-role="search"></div>
        <div class="editor-list" data-role="hierarchy"></div>
      </section>
      <section class="panel editor-inspector">
        <div class="editor-panel-head">Inspector</div>
        <div class="editor-inspector-body" data-role="inspector"></div>
      </section>
      <section class="panel editor-assets">
        <div class="editor-preview">
          <canvas width="480" height="280" data-role="preview"></canvas>
          <p data-role="asset-name">Drag a model into the scene</p>
        </div>
        <div class="editor-asset-pane">
          <div class="editor-assets-head">Assets <input type="search" placeholder="Filter models" data-role="asset-search"></div>
          <div class="editor-asset-list" data-role="assets"></div>
        </div>
      </section>
    `;
    game.app.append(this.root);
    this.status = this.root.querySelector('.editor-status');
    this.hierarchyList = this.root.querySelector('[data-role="hierarchy"]');
    this.inspector = this.root.querySelector('[data-role="inspector"]');
    this.assetList = this.root.querySelector('[data-role="assets"]');
    this.assetName = this.root.querySelector('[data-role="asset-name"]');
    this.toolButtons = [...this.root.querySelectorAll('[data-mode]')];
    this.prefabDone = this.root.querySelector('[data-action="prefab-done"]');

    this.launch = document.createElement('button');
    this.launch.id = 'editor-launch';
    this.launch.type = 'button';
    this.launch.textContent = 'Edit Scene';
    this.launch.title = 'Open the scene editor (F2)';
    this.launch.addEventListener('click', () => this.enter());
    game.app.append(this.launch);

    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !this.root.contains(button)) {
        return;
      }
      const action = button.dataset.action;
      const mode = button.dataset.mode;
      if (mode) this.setTool(mode);
      if (action === 'play') this.exit();
      if (action === 'save') this.save().catch((error) => this.setStatus(error.message));
      if (action === 'focus' && this.selected) this.view.focus(this.selected);
      if (action === 'duplicate') this.duplicateSelection();
      if (action === 'delete') this.deleteSelection();
      if (action === 'undo') this.undo();
      if (action === 'redo') this.redo();
      if (action === 'prefab-done') this.exitPrefab();
    });
    this.root.querySelector('[data-role="search"]').addEventListener('input', (event) => {
      this.query = event.target.value.trim().toLowerCase();
      this.refreshHierarchy();
    });
    this.root.querySelector('[data-role="asset-search"]').addEventListener('input', (event) => {
      this.assetQuery = event.target.value.trim().toLowerCase();
      this.renderAssets();
    });

    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onKeyUp = (event) => this.view.keys.delete(event.code);
    this.onPointerDown = (event) => {
      if (!this.active || event.button !== 0 || isEditorUi(event.target)) {
        return;
      }
      this.pointerDown = { x: event.clientX, y: event.clientY };
    };
    this.onPointerUp = (event) => {
      if (!this.active || event.button !== 0) {
        return;
      }
      if (this.usingGizmo) {
        this.usingGizmo = false;
        this.pointerDown = null;
        return;
      }
      if (!this.pointerDown || isEditorUi(event.target)) {
        this.pointerDown = null;
        return;
      }
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      this.pointerDown = null;
      if (dx * dx + dy * dy > 16) {
        return;
      }
      this.select(this.pick(event, event.altKey));
    };
    this.onDragOver = (event) => {
      if (!this.active) {
        return;
      }
      if ([...event.dataTransfer.types].includes('application/x-shop-model')) {
        event.preventDefault();
      }
    };
    this.onDrop = (event) => {
      const url = event.dataTransfer.getData('application/x-shop-model');
      if (!this.active || !url) {
        return;
      }
      event.preventDefault();
      const point = this.raycastPoint(event);
      this.place(url, point, null);
    };
    this.onUnload = (event) => {
      if (this.overrides.isDirty() || this.game.prefabs?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    this.controls.addEventListener('mouseDown', () => {
      if (!this.selected) {
        return;
      }
      this.gizmoBefore = takeTransform(this.selected);
      this.usingGizmo = true;
    });
    this.controls.addEventListener('mouseUp', () => {
      if (!this.selected || !this.gizmoBefore) {
        return;
      }
      const after = takeTransform(this.selected);
      if (!sameTransform(this.gizmoBefore, after)) {
        const before = this.gizmoBefore;
        const object = this.selected;
        this.pushApplied({
          undo: () => this.putTransform(object, before),
          redo: () => this.putTransform(object, after)
        });
      }
      this.gizmoBefore = null;
      this.syncInspector();
    });
    this.controls.addEventListener('objectChange', () => {
      this.syncPrefabPart(this.selected);
      this.syncInspector();
      if (this.selected && !this.selected.isLight) {
        this.box.setFromObject(this.selected);
      }
    });

    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('beforeunload', this.onUnload);
    game.canvas.addEventListener('dragover', this.onDragOver);
    game.canvas.addEventListener('drop', this.onDrop);
    this.setTool('translate');
    this.setStatus('Editor ready');
    this.loadAssets();
    window.__editor = this;
  }

  get camera() {
    return this.view.camera;
  }

  resize(width, height) {
    this.view.resize(width, height);
  }

  enter() {
    if (this.active) {
      return;
    }
    this.active = true;
    document.body.classList.add('editor-mode');
    this.root.hidden = false;
    this.game.input.suspended = true;
    this.game.input.keys.clear();
    this.game.occlusion.restoreAll();
    this.controls.enabled = true;
    this.view.enabled = true;
    if (!this.viewReady) {
      this.view.frameHome();
      this.viewReady = true;
    }
    this.refreshHierarchy();
    if (this.selected?.parent) {
      this.controls.attach(this.selected);
    }
    this.renderInspector();
  }

  exit() {
    if (!this.active) {
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.active = false;
    document.body.classList.remove('editor-mode');
    this.root.hidden = true;
    this.controls.detach();
    this.controls.enabled = false;
    this.view.enabled = false;
    this.view.rightMouse = false;
    this.view.middleMouse = false;
    this.box.visible = false;
    this.game.input.suspended = false;
    this.game.input.keys.clear();
    this.overrides.syncGameplay();
    this.game.occlusion.restoreAll();
    this.game.followCamera.snap();
    this.exitPrefab();
  }

  update(dt) {
    this.view.keys = this.view.keys;
    this.view.update(dt);
    if (this.selected?.parent && !this.selected.isLight) {
      this.box.visible = true;
      this.box.setFromObject(this.selected);
    }
    this.preview?.update(dt);
  }

  onSceneStructureChanged() {
    if (this.active) {
      this.refreshHierarchy();
    }
  }

  setTool(mode) {
    this.tool = mode;
    this.controls.setMode(mode);
    for (let i = 0; i < this.toolButtons.length; i += 1) {
      this.toolButtons[i].classList.toggle('is-active', this.toolButtons[i].dataset.mode === mode);
    }
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  touch() {
    this.dirty = true;
    this.setStatus('Unsaved changes');
  }

  pushApplied(command) {
    this.undoStack.push(command);
    if (this.undoStack.length > 100) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.overrides.syncGameplay();
    this.touch();
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) {
      return;
    }
    command.undo();
    this.redoStack.push(command);
    this.finishHistory();
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) {
      return;
    }
    command.redo();
    this.undoStack.push(command);
    this.finishHistory();
  }

  finishHistory() {
    this.overrides.syncGameplay();
    this.dirty = this.overrides.isDirty();
    this.setStatus(this.dirty ? 'Unsaved changes' : 'Scene matches the saved file');
    this.refreshHierarchy();
    this.renderInspector();
  }

  select(object) {
    if (object && !object.parent) {
      object = null;
    }
    this.selected = object;
    if (this.active && object) {
      this.controls.attach(object);
    } else {
      this.controls.detach();
    }
    this.box.visible = Boolean(object && !object.isLight);
    if (this.box.visible) {
      this.box.setFromObject(object);
    }
    if (object) {
      this.reveal(object);
    }
    this.updateSelectionHighlight();
    this.renderInspector();
  }

  reveal(object) {
    const rowKey = objectKey(object);
    let row = this.hierarchyList.querySelector(`[data-key="${CSS.escape(rowKey)}"]`);
    if (!row) {
      let current = object.parent;
      while (current && current.type !== 'Scene') {
        this.expanded.add(objectKey(current));
        current = current.parent;
      }
      this.refreshHierarchy();
      row = this.hierarchyList.querySelector(`[data-key="${CSS.escape(rowKey)}"]`);
    }
    row?.scrollIntoView({ block: 'nearest' });
  }

  refreshHierarchy() {
    this.hierarchyList.replaceChildren();
    this.appendPrefabs(this.hierarchyList);
    const roots = this.game.scene.children.filter((child) => (
      child.userData.editorPersistent && child.userData.editorRoot && !child.userData.editorHelper
    ));
    this.appendNodes(this.hierarchyList, roots, 0);
    this.updateSelectionHighlight();
  }

  appendPrefabs(container) {
    const catalog = this.prefabCatalog();
    if (catalog.size === 0) {
      return;
    }
    const title = document.createElement('div');
    title.className = 'editor-prefab-label';
    title.textContent = 'Prefabs';
    container.append(title);
    catalog.forEach((instances, model) => {
      const row = document.createElement('div');
      row.className = 'editor-row';
      row.style.paddingLeft = '8px';
      if (this.prefabModel === model) row.classList.add('is-selected');
      const label = document.createElement('span');
      label.className = 'editor-label';
      label.textContent = `${fileName(model)} (${this.prefabInstances(model).length})`;
      row.append(label);
      row.addEventListener('click', () => this.enterPrefab(model));
      row.addEventListener('dblclick', () => {
        this.enterPrefab(model);
        if (this.selected) this.view.focus(this.selected);
      });
      container.append(row);
      if (this.prefabModel !== model || !instances[0]) {
        return;
      }
      const parts = prefabParts(instances[0]);
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const partRow = document.createElement('div');
        partRow.className = 'editor-row';
        partRow.dataset.key = objectKey(part);
        partRow.style.paddingLeft = '22px';
        if (part === this.selected) partRow.classList.add('is-selected');
        const partLabel = document.createElement('span');
        partLabel.className = 'editor-label';
        partLabel.textContent = part.name || part.type;
        partRow.append(partLabel);
        partRow.addEventListener('click', (event) => {
          event.stopPropagation();
          this.select(part);
        });
        partRow.addEventListener('dblclick', () => this.view.focus(part));
        container.append(partRow);
      }
    });
  }

  prefabCatalog() {
    const map = new Map();
    this.game.scene.traverse((object) => {
      const model = object.userData?.editorPrefab;
      if (!model) {
        return;
      }
      if (!map.has(model)) map.set(model, []);
      map.get(model).push(object);
    });
    const saved = Object.keys(this.game.prefabs?.models || {});
    for (let i = 0; i < saved.length; i += 1) {
      if (!map.has(saved[i])) map.set(saved[i], this.prefabInstances(saved[i]));
    }
    if (this.prefabModel && !map.has(this.prefabModel)) {
      map.set(this.prefabModel, this.prefabInstances(this.prefabModel));
    }
    return map;
  }

  prefabInstances(model) {
    const list = [];
    this.game.scene.traverse((object) => {
      if (modelOf(object) === model && (object.userData.editorRoot || object.userData.editorPrefab)) {
        list.push(object);
      }
    });
    return list;
  }

  enterPrefab(model) {
    if (!model) {
      return;
    }
    const instances = this.prefabInstances(model);
    if (instances.length === 0) {
      this.setStatus('No copies of that prefab are in the scene');
      return;
    }
    this.prefabModel = model;
    if (this.prefabDone) this.prefabDone.hidden = false;
    const diorama = this.game.outside?.diorama;
    if (model.endsWith('streetlight.glb') && diorama) {
      diorama.previewNight = 1;
      diorama.setNight(diorama.nightAmount);
    }
    const part = prefabParts(instances[0])[0] || instances[0];
    this.refreshHierarchy();
    this.select(part);
    this.view.focus(part);
    this.setStatus(`Editing ${fileName(model)} prefab. Changes apply to all ${instances.length} copies. Save to keep them.`);
  }

  exitPrefab() {
    if (!this.prefabModel) {
      return;
    }
    this.prefabModel = null;
    if (this.prefabDone) this.prefabDone.hidden = true;
    const diorama = this.game.outside?.diorama;
    if (diorama) {
      diorama.previewNight = null;
      diorama.setNight(this.game.lighting?.night ?? diorama.nightAmount);
    }
    if (this.active) {
      this.refreshHierarchy();
      this.renderInspector();
      this.setStatus('Prefab editing closed');
    }
  }

  syncPrefabPart(object) {
    if (!this.prefabModel || !object || object === this.prefabRootOf(object)) {
      return;
    }
    const root = this.prefabRootOf(object);
    if (!root || modelOf(root) !== this.prefabModel) {
      return;
    }
    const diorama = this.game.outside?.diorama;
    if (this.prefabModel.endsWith('streetlight.glb') && diorama && object.userData.editorPrefabPart) {
      diorama.captureStreetlightPart(root, object);
      diorama.reflowStreetlights(root, object.name);
      this.game.prefabs?.set(this.prefabModel, diorama.streetlightPrefabRecord());
      return;
    }
    const record = this.game.prefabs?.get(this.prefabModel) || { parts: {} };
    const parts = { ...(record.parts || {}) };
    parts[object.name] = {
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray()
    };
    const instances = this.prefabInstances(this.prefabModel);
    for (let i = 0; i < instances.length; i += 1) {
      if (instances[i] === root) {
        continue;
      }
      const match = findNamed(instances[i], object.name);
      if (!match) {
        continue;
      }
      match.position.copy(object.position);
      match.rotation.copy(object.rotation);
      match.scale.copy(object.scale);
    }
    this.game.prefabs?.set(this.prefabModel, { ...record, parts });
  }

  prefabRootOf(object) {
    return prefabRootOf(object);
  }

  appendNodes(container, objects, depth) {
    for (let i = 0; i < objects.length; i += 1) {
      const object = objects[i];
      if (isRuntimeObject(object) || object.userData.editorIgnore || object.userData.editorHelper) {
        continue;
      }
      const children = object.children.filter((child) => (
        !isRuntimeObject(child) && !child.userData.editorIgnore && !child.userData.editorHelper
      ));
      const name = object.name || object.userData.editorId || object.type;
      const selfMatch = !this.query
        || name.toLowerCase().includes(this.query)
        || (object.userData.editorId || '').toLowerCase().includes(this.query);
      const childMatch = this.query && children.some((child) => this.subtreeMatches(child, this.query));
      if (this.query && !selfMatch && !childMatch) {
        continue;
      }
      const key = objectKey(object);
      const row = document.createElement('div');
      row.className = 'editor-row';
      row.dataset.key = key;
      row.style.paddingLeft = `${6 + depth * 12}px`;
      row.title = object.userData.editorId || name;
      if (!object.visible) row.classList.add('is-hidden');
      if (object === this.selected) row.classList.add('is-selected');

      const twist = document.createElement('button');
      twist.type = 'button';
      twist.className = 'twist';
      const childBox = document.createElement('div');
      childBox.className = 'editor-children';
      const open = children.length > 0 && (this.query ? Boolean(childMatch || selfMatch) : this.expanded.has(key));
      twist.textContent = children.length ? (open ? '▾' : '▸') : '';
      twist.disabled = children.length === 0;
      twist.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!children.length || this.query) {
          return;
        }
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        const nowOpen = this.expanded.has(key);
        childBox.hidden = !nowOpen;
        twist.textContent = nowOpen ? '▾' : '▸';
      });

      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'eye';
      eye.textContent = object.visible ? '●' : '○';
      eye.title = 'Show or hide';
      eye.addEventListener('click', (event) => {
        event.stopPropagation();
        const before = object.visible;
        const after = !before;
        this.overrides.setVisible(object, after);
        this.pushApplied({
          undo: () => this.overrides.setVisible(object, before),
          redo: () => this.overrides.setVisible(object, after)
        });
        this.refreshHierarchy();
      });

      const label = document.createElement('span');
      label.className = 'editor-label';
      label.textContent = name;
      row.append(twist, eye, label);
      row.addEventListener('click', () => this.select(object));
      row.addEventListener('dblclick', () => this.view.focus(object));
      row.draggable = true;
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('application/x-shop-id', key);
        event.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', (event) => {
        const types = [...event.dataTransfer.types];
        if (types.includes('application/x-shop-id') || types.includes('application/x-shop-model')) {
          event.preventDefault();
          row.classList.add('is-drop');
        }
      });
      row.addEventListener('dragleave', () => row.classList.remove('is-drop'));
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        row.classList.remove('is-drop');
        const model = event.dataTransfer.getData('application/x-shop-model');
        const draggedKey = event.dataTransfer.getData('application/x-shop-id');
        if (model) {
          const point = new THREE.Vector3();
          object.getWorldPosition(point);
          point.x += 0.4;
          this.place(model, point, object);
          return;
        }
        const dragged = this.findKey(draggedKey);
        if (dragged) {
          this.reparent(dragged, object);
        }
      });
      container.append(row);
      if (children.length) {
        childBox.hidden = !open;
        this.appendNodes(childBox, children, depth + 1);
        container.append(childBox);
      }
    }
  }

  subtreeMatches(object, query) {
    const name = (object.name || object.userData.editorId || '').toLowerCase();
    if (name.includes(query)) {
      return true;
    }
    for (let i = 0; i < object.children.length; i += 1) {
      const child = object.children[i];
      if (!isRuntimeObject(child) && !child.userData.editorIgnore && this.subtreeMatches(child, query)) {
        return true;
      }
    }
    return false;
  }

  updateSelectionHighlight() {
    const rows = this.hierarchyList.querySelectorAll('.editor-row');
    const key = this.selected ? objectKey(this.selected) : '';
    for (let i = 0; i < rows.length; i += 1) {
      rows[i].classList.toggle('is-selected', rows[i].dataset.key === key);
    }
  }

  findKey(key) {
    if (!key) {
      return null;
    }
    let found = null;
    this.game.scene.traverse((object) => {
      if (!found && objectKey(object) === key) {
        found = object;
      }
    });
    return found;
  }

  renderInspector() {
    const object = this.selected?.parent ? this.selected : null;
    this.inspector.replaceChildren();
    if (!object) {
      const empty = document.createElement('p');
      empty.className = 'editor-note';
      empty.textContent = 'Click an object in the scene or hierarchy. Alt-click selects a mesh inside a model.';
      this.inspector.append(empty);
      return;
    }
    const root = nearestRoot(object);
    const meta = document.createElement('p');
    meta.className = 'meta';
    const kind = object.isLight
      ? object.type
      : object.userData.editorModel
        ? 'GLB instance'
        : object.userData.editorProcedural
          ? `Procedural ${object.userData.editorProcedural}`
          : object.type;
    meta.textContent = `${kind}${object.userData.editorId ? ` · ${object.userData.editorId}` : ''}`;
    this.inspector.append(meta);
    const prefabModel = modelOf(root || object);
    if (prefabModel) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = this.prefabModel === prefabModel ? 'Done Prefab' : 'Edit Prefab';
      edit.addEventListener('click', () => {
        if (this.prefabModel === prefabModel) this.exitPrefab();
        else this.enterPrefab(prefabModel);
      });
      this.inspector.append(edit);
      if (this.prefabModel === prefabModel && object !== (root || object)) {
        const note = document.createElement('p');
        note.className = 'editor-note';
        note.textContent = 'This part is shared. Moving it updates every copy of the prefab.';
        this.inspector.append(note);
      }
    }
    if (root && root !== object) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.textContent = `Select ${root.name || 'root'}`;
      jump.addEventListener('click', () => this.select(root));
      this.inspector.append(jump);
    }

    this.addTextField('Name', object.name || '', (value) => {
      const before = object.name;
      object.name = value || before;
      this.pushApplied({
        undo: () => { object.name = before; },
        redo: () => { object.name = value || before; }
      });
      this.refreshHierarchy();
    });
    this.addCheck('Visible', object.visible, (value) => {
      const before = object.visible;
      this.overrides.setVisible(object, value);
      this.pushApplied({
        undo: () => this.overrides.setVisible(object, before),
        redo: () => this.overrides.setVisible(object, value)
      });
    });

    const local = readLocal(object);
    this.addVector('Position', 'pos', local.position, 3);
    this.addVector('Rotation', 'rot', local.rotation.map((value) => toDegrees(value)), 2);
    this.addVector('Scale', 'scl', local.scale, 3);

    const shadows = readShadows(object);
    if (shadows.any) {
      this.addCheck('Cast shadow', shadows.cast, (value) => this.commitShadows(object, value, shadows.receive));
      this.addCheck('Receive shadow', shadows.receive, (value) => this.commitShadows(object, shadows.cast, value));
    }
    const color = object.userData.editorColor || readColor(object);
    if (color) {
      this.addColor(color, (value) => {
        const before = object.userData.editorColor || null;
        this.overrides.setColor(object, value);
        const after = object.userData.editorColor || null;
        this.pushApplied({
          undo: () => (before ? this.overrides.setColor(object, before) : this.overrides.setColor(object, readColor(object))),
          redo: () => this.overrides.setColor(object, value)
        });
        if (!after && !before) {
          this.undoStack.pop();
        }
      });
    }
    if (object.userData.editorRoot) {
      this.addCheck('Collision', object.userData.editorCollision === true, (value) => {
        const before = object.userData.editorCollision === true;
        object.userData.editorCollision = value;
        this.pushApplied({
          undo: () => { object.userData.editorCollision = before; },
          redo: () => { object.userData.editorCollision = value; }
        });
      });
    }
    if (object.userData.editorPrefabPart && object.isLight && this.prefabModel?.endsWith('streetlight.glb')) {
      this.addStreetlightFields();
    } else if (object.isLight) {
      this.addNumber('Intensity', object.intensity, (value) => {
        const before = object.userData.editorLightLock ? { ...object.userData.editorLightLock } : null;
        this.overrides.setLightField(object, 'intensity', value);
        const after = object.userData.editorLightLock ? { ...object.userData.editorLightLock } : null;
        this.pushApplied({
          undo: () => this.restoreLight(object, before),
          redo: () => this.restoreLight(object, after)
        });
      });
      this.addColorField('Color', `#${object.color.getHexString()}`, (value) => {
        const before = object.userData.editorLightLock ? { ...object.userData.editorLightLock } : null;
        this.overrides.setLightField(object, 'color', value);
        const after = object.userData.editorLightLock ? { ...object.userData.editorLightLock } : null;
        this.pushApplied({
          undo: () => this.restoreLight(object, before),
          redo: () => this.restoreLight(object, after)
        });
      });
      if (object.groundColor) {
        this.addColorField('Ground', `#${object.groundColor.getHexString()}`, (value) => {
          const before = object.userData.editorLightLock ? { ...object.userData.editorLightLock } : null;
          this.overrides.setLightField(object, 'groundColor', value);
          const after = object.userData.editorLightLock ? { ...object.userData.editorLightLock } : null;
          this.pushApplied({
            undo: () => this.restoreLight(object, before),
            redo: () => this.restoreLight(object, after)
          });
        });
      }
      const note = document.createElement('p');
      note.className = 'editor-note';
      note.textContent = 'Edited light color and intensity stay fixed while the day and night cycle runs. Position still follows the object.';
      this.inspector.append(note);
    }
    if (object.userData.editorModel) {
      const model = document.createElement('p');
      model.className = 'meta';
      model.textContent = object.userData.editorModel;
      this.inspector.append(model);
    }
    this.addProps(object);
  }

  addTextField(label, value, onCommit) {
    const field = document.createElement('label');
    field.className = 'row';
    field.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('change', () => onCommit(input.value));
    field.append(input);
    this.inspector.append(field);
  }

  addCheck(label, value, onChange) {
    const field = document.createElement('label');
    field.className = 'row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value === true;
    input.addEventListener('change', () => onChange(input.checked));
    field.append(input, document.createTextNode(label));
    this.inspector.append(field);
  }

  addVector(label, prefix, values, digits) {
    const title = document.createElement('h3');
    title.textContent = label;
    this.inspector.append(title);
    const row = document.createElement('div');
    row.className = 'editor-vec';
    row.append(document.createTextNode(prefix === 'pos' ? 'P' : prefix === 'rot' ? 'R' : 'S'));
    ['x', 'y', 'z'].forEach((axis, index) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = prefix === 'rot' ? '1' : '0.01';
      input.dataset.field = `${prefix}-${axis}`;
      input.value = Number(values[index]).toFixed(digits);
      input.addEventListener('focus', () => {
        this.transformBefore = this.selected ? takeTransform(this.selected) : null;
      });
      input.addEventListener('input', () => this.applyTransformFromInputs());
      input.addEventListener('change', () => this.commitTransformUndo());
      row.append(input);
    });
    this.inspector.append(row);
  }

  addColor(value, onChange) {
    this.addColorField('Material', value, onChange);
  }

  addColorField(label, value, onChange) {
    const field = document.createElement('label');
    field.className = 'row';
    field.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    field.append(input);
    this.inspector.append(field);
  }

  addNumber(label, value, onChange) {
    const field = document.createElement('label');
    field.className = 'row';
    field.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.05';
    input.value = String(roundInput(value));
    input.addEventListener('change', () => onChange(Number(input.value)));
    field.append(input);
    this.inspector.append(field);
  }

  addProps(object) {
    const title = document.createElement('h3');
    title.textContent = 'Gameplay properties';
    const input = document.createElement('textarea');
    input.value = JSON.stringify(object.userData.editorProps || {}, null, 2);
    input.addEventListener('change', () => {
      try {
        const parsed = JSON.parse(input.value || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Properties must be a JSON object');
        }
        const before = object.userData.editorProps ? { ...object.userData.editorProps } : null;
        object.userData.editorProps = parsed;
        this.pushApplied({
          undo: () => { object.userData.editorProps = before; },
          redo: () => { object.userData.editorProps = parsed; }
        });
        this.setStatus('Gameplay properties updated');
      } catch (error) {
        this.setStatus(error.message);
      }
    });
    const other = {};
    const keys = Object.keys(object.userData);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key.startsWith('editor') || key === 'shopper') {
        continue;
      }
      const value = object.userData[key];
      if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        other[key] = value;
      }
    }
    this.inspector.append(title, input);
    if (Object.keys(other).length) {
      const note = document.createElement('p');
      note.className = 'meta';
      note.textContent = JSON.stringify(other);
      this.inspector.append(note);
    }
  }

  applyTransformFromInputs() {
    const object = this.selected;
    if (!object) {
      return;
    }
    const local = readLocal(object);
    const position = readVec(this.inspector, 'pos', local.position);
    const rotation = readVec(this.inspector, 'rot', local.rotation.map((value) => toDegrees(value)));
    const scale = readVec(this.inspector, 'scl', local.scale);
    object.position.set(position[0], position[1], position[2]);
    object.rotation.set(toRadians(rotation[0]), toRadians(rotation[1]), toRadians(rotation[2]));
    object.scale.set(scale[0], scale[1], scale[2]);
    this.syncPrefabPart(object);
  }

  commitTransformUndo() {
    const object = this.selected;
    if (!object || !this.transformBefore) {
      return;
    }
    const before = this.transformBefore;
    const after = takeTransform(object);
    this.transformBefore = null;
    if (sameTransform(before, after)) {
      return;
    }
    this.pushApplied({
      undo: () => this.putTransform(object, before),
      redo: () => this.putTransform(object, after)
    });
  }

  commitShadows(object, cast, receive) {
    const before = readShadows(object);
    writeShadowValues(object, cast, receive);
    this.pushApplied({
      undo: () => writeShadowValues(object, before.cast, before.receive),
      redo: () => writeShadowValues(object, cast, receive)
    });
  }

  restoreLight(object, lock) {
    if (lock) object.userData.editorLightLock = { ...lock };
    else delete object.userData.editorLightLock;
    this.overrides.applyLightLock(object);
  }

  putTransform(object, state) {
    object.position.copy(state.position);
    object.quaternion.copy(state.quaternion);
    object.scale.copy(state.scale);
    this.syncPrefabPart(object);
    this.overrides.syncGameplay();
    if (this.selected === object) {
      this.syncInspector();
      if (!object.isLight) this.box.setFromObject(object);
    }
  }

  syncInspector() {
    const object = this.selected;
    if (!object || !this.inspector) {
      return;
    }
    const local = readLocal(object);
    writeVec(this.inspector, 'pos', local.position, 3);
    writeVec(this.inspector, 'rot', local.rotation.map((value) => toDegrees(value)), 2);
    writeVec(this.inspector, 'scl', local.scale, 3);
  }

  reparent(object, parent) {
    if (!object || !parent || object === parent || containsObject(object, parent)) {
      this.setStatus('Cannot parent an object to itself');
      return;
    }
    const before = {
      parent: object.parent,
      ...takeTransform(object)
    };
    parent.attach(object);
    const after = {
      parent: object.parent,
      ...takeTransform(object)
    };
    this.pushApplied({
      undo: () => this.putParent(object, before),
      redo: () => this.putParent(object, after)
    });
    this.refreshHierarchy();
    this.select(object);
  }

  putParent(object, state) {
    state.parent.add(object);
    this.putTransform(object, state);
    this.refreshHierarchy();
  }

  async duplicateSelection() {
    if (!this.selected || this.busy) {
      return;
    }
    const source = this.selected.userData.editorRoot ? this.selected : nearestRoot(this.selected);
    if (!source) {
      return;
    }
    this.busy = true;
    try {
      const created = await this.overrides.duplicate(source);
      if (!created) {
        this.setStatus('That object could not be duplicated');
        return;
      }
      const parent = created.parent;
      this.pushApplied({
        undo: () => {
          this.overrides.detach(created, false);
          if (this.selected === created) this.select(null);
        },
        redo: () => {
          this.overrides.restore(created, parent);
          this.select(created);
        }
      });
      this.refreshHierarchy();
      this.select(created);
      this.setStatus(`Duplicated ${created.name}`);
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.busy = false;
    }
  }

  deleteSelection() {
    const object = this.selected;
    if (!object?.parent) {
      return;
    }
    if (object.userData.editorPrefab || object.userData.editorPrefabPart) {
      this.setStatus('Open the prefab to move shared parts. Placed copies can still be deleted from the hierarchy.');
      return;
    }
    if (object.userData.editorRoot && PROTECTED_IDS.has(object.userData.editorId)) {
      this.setStatus('The store and street roots stay in the scene');
      return;
    }
    const parent = object.parent;
    if (object.userData.editorRoot && object.userData.editorId && !object.userData.editorAdded) {
      this.overrides.detach(object, true);
      this.pushApplied({
        undo: () => this.overrides.restore(object, parent),
        redo: () => this.overrides.detach(object, true)
      });
    } else if (object.userData.editorRoot) {
      this.overrides.detach(object, false);
      this.pushApplied({
        undo: () => this.overrides.restore(object, parent),
        redo: () => this.overrides.detach(object, false)
      });
    } else {
      object.removeFromParent();
      this.pushApplied({
        undo: () => parent.add(object),
        redo: () => object.removeFromParent()
      });
    }
    this.select(null);
    this.refreshHierarchy();
  }

  async place(url, point, parent) {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const created = await this.overrides.placeModel(url, point, parent);
      const createdParent = created.parent;
      this.pushApplied({
        undo: () => {
          this.overrides.detach(created, false);
          if (this.selected === created) this.select(null);
        },
        redo: () => this.overrides.restore(created, createdParent)
      });
      this.refreshHierarchy();
      this.select(created);
      this.setStatus(`Placed ${created.name}`);
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.busy = false;
    }
  }

  async loadAssets() {
    try {
      const response = await fetch('/__editor/assets', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Asset list unavailable');
      }
      const payload = await response.json();
      this.assets = Array.isArray(payload.assets) ? payload.assets : [];
      this.renderAssets();
    } catch (error) {
      this.assetName.textContent = 'Asset list is available while npm run dev is running';
      console.warn(error);
    }
  }

  renderAssets() {
    this.assetList.replaceChildren();
    const query = this.assetQuery;
    for (let i = 0; i < this.assets.length; i += 1) {
      const asset = this.assets[i];
      const label = `${asset.folder || ''} ${asset.name || asset.url}`.toLowerCase();
      if (query && !label.includes(query)) {
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-asset';
      button.textContent = asset.name || fileName(asset.url);
      button.title = asset.url;
      button.draggable = true;
      if (asset.url === this.selectedAsset) button.classList.add('is-selected');
      button.addEventListener('click', () => this.previewAsset(asset));
      button.addEventListener('dblclick', () => {
        const point = new THREE.Vector3();
        this.view.camera.getWorldDirection(point);
        point.multiplyScalar(4).add(this.view.camera.position);
        point.y = 0;
        this.place(asset.url, point, null);
      });
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('application/x-shop-model', asset.url);
        event.dataTransfer.effectAllowed = 'copy';
      });
      this.assetList.append(button);
    }
  }

  async previewAsset(asset) {
    this.selectedAsset = asset.url;
    this.assetName.textContent = asset.url;
    this.renderAssets();
    if (!this.preview) {
      this.preview = new ModelPreview(this.root.querySelector('[data-role="preview"]'));
    }
    try {
      await this.preview.show(this.game.loader, asset.url);
    } catch (error) {
      this.setStatus(error.message);
    }
  }

  pick(event, alt) {
    this.setPointer(event);
    const hits = this.raycaster.intersectObjects(this.game.scene.children, true);
    for (let i = 0; i < hits.length; i += 1) {
      const picked = resolvePick(hits[i].object, alt, this.prefabModel);
      if (picked) {
        return picked;
      }
    }
    return null;
  }

  raycastPoint(event) {
    this.setPointer(event);
    const hits = this.raycaster.intersectObjects(this.game.scene.children, true);
    for (let i = 0; i < hits.length; i += 1) {
      const object = hits[i].object;
      if (hasHelper(object) || !isShown(object) || blocked(object)) {
        continue;
      }
      return hits[i].point.clone();
    }
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floor, point)) {
      return point;
    }
    return new THREE.Vector3();
  }

  setPointer(event) {
    this.view.camera.updateMatrixWorld();
    const rect = this.game.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
  }

  handleKeyDown(event) {
    if (event.code === 'F2' && !isTyping(event.target)) {
      event.preventDefault();
      if (this.active) this.exit();
      else this.enter();
      return;
    }
    if (!this.active) {
      return;
    }
    this.view.keys.add(event.code);
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
      event.preventDefault();
      this.save().catch((error) => this.setStatus(error.message));
      return;
    }
    if (isTyping(event.target)) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyD') {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
      return;
    }
    if (event.code === 'KeyF') {
      if (this.selected) this.view.focus(this.selected);
      return;
    }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || this.view.rightMouse) {
      return;
    }
    if (event.code === 'KeyW') this.setTool('translate');
    if (event.code === 'KeyE') this.setTool('rotate');
    if (event.code === 'KeyR') this.setTool('scale');
    if (event.code === 'Escape') {
      if (this.prefabModel) this.exitPrefab();
      else this.select(null);
    }
  }

  async save() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.overrides.syncGameplay();
    const documentState = this.overrides.serialize();
    const response = await fetch('/__editor/scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentState)
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Save failed (${response.status})`);
    }
    this.overrides.markSaved(documentState);
    if (this.game.prefabs?.dirty) {
      await this.game.prefabs.save();
    }
    this.dirty = false;
    this.setStatus(this.game.prefabs ? 'Scene and prefabs saved' : 'Scene saved');
  }

  addStreetlightFields() {
    const cfg = this.game.outside?.diorama?.lightConfig;
    if (!cfg) {
      return;
    }
    const apply = (key, value) => {
      cfg[key] = value;
      this.game.outside.diorama.setNight(this.game.outside.diorama.nightAmount);
      this.game.prefabs?.set(this.prefabModel, this.game.outside.diorama.streetlightPrefabRecord());
    };
    this.addNumber('Intensity', cfg.intensity, (value) => apply('intensity', value));
    this.addColorField('Color', `#${new THREE.Color(cfg.color).getHexString()}`, (value) => {
      apply('color', new THREE.Color(value).getHex());
    });
    this.addNumber('Angle', toDegrees(cfg.angle), (value) => apply('angle', toRadians(value)));
    this.addNumber('Penumbra', cfg.penumbra, (value) => apply('penumbra', value));
    this.addNumber('Distance', cfg.distance, (value) => apply('distance', value));
    this.addNumber('Decay', cfg.decay, (value) => apply('decay', value));
  }
}

function takeTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone()
  };
}

function sameTransform(before, after) {
  return before.position.distanceToSquared(after.position) < 1e-8
    && before.scale.distanceToSquared(after.scale) < 1e-8
    && before.quaternion.angleTo(after.quaternion) < 1e-4;
}

function modelOf(object) {
  return object?.userData?.editorPrefab || object?.userData?.editorModel || '';
}

function prefabRootOf(object) {
  let current = object;
  while (current && current.type !== 'Scene') {
    if (current.userData?.editorHelper || isRuntimeObject(current)) {
      return null;
    }
    if (current.userData?.editorRoot && !current.userData?.editorIgnore) {
      return modelOf(current) ? current : null;
    }
    current = current.parent;
  }
  return null;
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

function prefabParts(root) {
  const parts = [];
  root.traverse((child) => {
    if (child !== root && child.userData?.editorPrefabPart) {
      parts.push(child);
    }
  });
  return parts;
}

function resolvePick(object, alt, prefabModel) {
  if (hasHelper(object) || !isShown(object)) {
    return null;
  }
  if (object.userData?.editorIgnore || object.userData?.editorPrefabPart) {
    const prefab = prefabRootOf(object);
    if (!prefab) {
      return null;
    }
    if (alt && prefabModel && modelOf(prefab) === prefabModel) {
      let current = object;
      while (current && current !== prefab) {
        if (current.userData.editorPrefabPart) {
          return current;
        }
        current = current.parent;
      }
    }
    return prefab;
  }
  let current = object;
  while (current && current.type !== 'Scene') {
    if (current.userData.editorHelper) {
      return null;
    }
    if (current.userData.editorIgnore || isRuntimeObject(current)) {
      return null;
    }
    if (current.userData.editorRoot) {
      return alt ? object : current;
    }
    current = current.parent;
  }
  return null;
}

function blocked(object) {
  let current = object;
  while (current) {
    if (current.userData.editorHelper || current.userData.editorIgnore || isRuntimeObject(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function readVec(root, prefix, fallback) {
  return [0, 1, 2].map((index) => {
    const axis = ['x', 'y', 'z'][index];
    const input = root.querySelector(`[data-field="${prefix}-${axis}"]`);
    const value = input ? Number(input.value) : fallback[index];
    return Number.isFinite(value) ? value : fallback[index];
  });
}

function writeVec(root, prefix, values, digits) {
  ['x', 'y', 'z'].forEach((axis, index) => {
    const input = root.querySelector(`[data-field="${prefix}-${axis}"]`);
    if (!input || document.activeElement === input) {
      return;
    }
    input.value = Number(values[index]).toFixed(digits);
  });
}

function writeShadowValues(object, cast, receive) {
  object.traverse((child) => {
    if (child.isMesh || child.isLight) {
      child.castShadow = cast === true;
    }
    if (child.isMesh) {
      child.receiveShadow = receive === true;
    }
  });
}

function roundInput(value) {
  return Math.round(value * 1000) / 1000;
}

class ModelPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(240, 140, false);
    this.renderer.setClearColor(0x141414, 1);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(32, 240 / 140, 0.01, 100);
    this.current = null;
    this.url = '';
  }

  async show(loader, url) {
    if (this.url === url && this.current) {
      return;
    }
    this.url = url;
    if (this.current) {
      this.scene.remove(this.current);
      this.current = null;
    }
    const gltf = await loader.cached(url);
    const model = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.2);
    model.position.sub(center);
    this.scene.add(model);
    this.current = model;
    this.camera.position.set(size * 0.7, size * 0.4, size);
    this.camera.lookAt(0, 0, 0);
    this.render();
  }

  update(dt) {
    if (!this.current) {
      return;
    }
    this.current.rotation.y += dt * 0.7;
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
