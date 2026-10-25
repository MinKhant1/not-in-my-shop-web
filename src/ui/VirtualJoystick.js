export class VirtualJoystick {
  constructor(zone, config) {
    if (!zone) {
      throw new Error('Virtual joystick zone was not found.');
    }

    this.zone = zone;
    this.maxRadius = config.maxRadius;
    this.deadzone = config.deadzone;
    this.valueX = 0;
    this.valueY = 0;
    this.pointerId = null;
    this.centerX = 0;
    this.centerY = 0;

    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    zone.append(this.base, this.knob);

    this.onPointerDown = (event) => {
      if (this.pointerId !== null || this.startsOnInteractiveUi(event)) {
        return;
      }

      this.pointerId = event.pointerId;
      const rect = this.zone.getBoundingClientRect();
      this.centerX = event.clientX - rect.left;
      this.centerY = event.clientY - rect.top;
      this.base.style.left = `${this.centerX}px`;
      this.base.style.top = `${this.centerY}px`;
      this.zone.classList.add('is-active');
      this.applyDrag(event);

      try {
        this.zone.setPointerCapture(event.pointerId);
      } catch (error) {
        // Synthetic or already-ended pointers cannot capture.
      }

      event.preventDefault();
    };

    this.onPointerMove = (event) => {
      if (event.pointerId !== this.pointerId) {
        return;
      }
      this.applyDrag(event);
      event.preventDefault();
    };

    this.onPointerUp = (event) => {
      if (event.pointerId !== this.pointerId) {
        return;
      }
      this.reset();
    };

    zone.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    zone.addEventListener('pointermove', this.onPointerMove, { passive: false });
    zone.addEventListener('pointerup', this.onPointerUp);
    zone.addEventListener('pointercancel', this.onPointerUp);
    zone.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  startsOnInteractiveUi(event) {
    const target = event.target;
    return target instanceof Element
      && Boolean(target.closest('button, a, input, textarea, select, [data-no-joystick]'));
  }

  applyDrag(event) {
    const rect = this.zone.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let dx = x - this.centerX;
    let dy = y - this.centerY;
    const distance = Math.hypot(dx, dy);

    if (distance > this.maxRadius && distance > 0) {
      const scale = this.maxRadius / distance;
      dx *= scale;
      dy *= scale;
    }

    this.knob.style.left = `${this.centerX + dx}px`;
    this.knob.style.top = `${this.centerY + dy}px`;

    let outputX = dx / this.maxRadius;
    let outputY = -dy / this.maxRadius;
    const magnitude = Math.hypot(outputX, outputY);

    if (magnitude < this.deadzone || magnitude === 0) {
      this.valueX = 0;
      this.valueY = 0;
      return;
    }

    const scaled = magnitude > 1
      ? 1
      : (magnitude - this.deadzone) / (1 - this.deadzone);
    this.valueX = (outputX / magnitude) * scaled;
    this.valueY = (outputY / magnitude) * scaled;
  }

  reset() {
    this.pointerId = null;
    this.valueX = 0;
    this.valueY = 0;
    this.knob.style.left = `${this.centerX}px`;
    this.knob.style.top = `${this.centerY}px`;
    this.zone.classList.remove('is-active');
  }
}
