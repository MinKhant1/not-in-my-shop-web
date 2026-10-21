const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
]);

export class InputSystem {
  constructor(joystick) {
    this.joystick = joystick;
    this.keys = new Set();
    this.movement = { x: 0, y: 0 };
    this.suspended = false;

    this.onKeyDown = (event) => {
      if (this.suspended || !MOVE_KEYS.has(event.code)) {
        return;
      }
      this.keys.add(event.code);
      if (event.code.startsWith('Arrow')) {
        event.preventDefault();
      }
    };

    this.onKeyUp = (event) => {
      this.keys.delete(event.code);
    };

    this.onBlur = () => {
      this.keys.clear();
    };

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  getMovementVector() {
    let x = 0;
    let y = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      x -= 1;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      x += 1;
    }
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      y += 1;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      y -= 1;
    }

    x += this.joystick.valueX;
    y += this.joystick.valueY;

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    this.movement.x = x;
    this.movement.y = y;
    return this.movement;
  }
}
