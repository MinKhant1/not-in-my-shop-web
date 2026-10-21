import * as THREE from 'three';

const EDGE_MARGIN = 54;

// Screen-edge "!" marks for thieves the cameras are tracking.
// A mark is shown only while that thief is outside the current view.
export class CctvAlertUI {
  constructor(parent) {
    this.root = document.createElement('div');
    this.root.id = 'cctv-alerts';
    this.root.setAttribute('data-no-joystick', '');
    parent.appendChild(this.root);
    this.marks = new Map();
    this.world = new THREE.Vector3();
    this.view = new THREE.Vector3();
    this.ndc = new THREE.Vector3();
  }

  update(tracked, camera, width, height) {
    const live = new Set();
    if (camera && width > 1 && height > 1) {
      camera.updateMatrixWorld();
      for (let i = 0; i < tracked.length; i += 1) {
        const shopper = tracked[i];
        const spot = this.place(shopper, camera, width, height);
        const mark = this.markFor(shopper.id);
        live.add(shopper.id);
        if (!spot) {
          mark.hidden = true;
          continue;
        }
        mark.hidden = false;
        mark.style.left = `${spot.x}px`;
        mark.style.top = `${spot.y}px`;
      }
    }

    for (const [id, mark] of this.marks) {
      if (live.has(id)) {
        continue;
      }
      mark.remove();
      this.marks.delete(id);
    }
  }

  clear() {
    for (const mark of this.marks.values()) {
      mark.remove();
    }
    this.marks.clear();
  }

  // Returns null when the thief is inside the view, otherwise a pixel on the inset screen edge.
  place(shopper, camera, width, height) {
    const position = shopper.group.position;
    this.world.set(position.x, position.y + 0.75, position.z);
    this.view.copy(this.world).applyMatrix4(camera.matrixWorldInverse);
    this.ndc.copy(this.world).project(camera);
    const inFront = this.view.z < 0;
    const onScreen = inFront
      && this.ndc.x >= -1
      && this.ndc.x <= 1
      && this.ndc.y >= -1
      && this.ndc.y <= 1
      && this.ndc.z >= -1
      && this.ndc.z <= 1;
    if (onScreen) {
      return null;
    }

    const dx = this.view.x;
    const dy = this.view.y;
    const length = Math.hypot(dx, dy);
    const dirX = length > 0.001 ? dx / length : 0;
    const dirY = length > 0.001 ? dy / length : -1;
    const halfW = Math.max(8, width * 0.5 - EDGE_MARGIN);
    const halfH = Math.max(8, height * 0.5 - EDGE_MARGIN);
    const hitX = dirX === 0 ? Infinity : halfW / Math.abs(dirX);
    const hitY = dirY === 0 ? Infinity : halfH / Math.abs(dirY);
    const travel = Math.min(hitX, hitY);
    return {
      x: width * 0.5 + dirX * travel,
      y: height * 0.5 - dirY * travel
    };
  }

  markFor(id) {
    let mark = this.marks.get(id);
    if (mark) {
      return mark;
    }
    mark = document.createElement('div');
    mark.className = 'cctv-alert';
    mark.textContent = '!';
    mark.setAttribute('aria-hidden', 'true');
    this.root.appendChild(mark);
    this.marks.set(id, mark);
    return mark;
  }
}
