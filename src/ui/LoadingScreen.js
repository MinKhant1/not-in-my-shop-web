// HTML overlay shown before the module loads. This only reports the
// existing LoadingManager and hides after the first rendered frame.
export class LoadingScreen {
  constructor() {
    this.root = document.querySelector('#boot-screen');
    this.bar = document.querySelector('#boot-bar');
    this.fill = this.bar?.querySelector('span') ?? null;
    this.percent = document.querySelector('#boot-percent');
    this.error = document.querySelector('#boot-error');
    this.closed = false;
    document.querySelector('#boot-retry')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  attach(manager) {
    if (!manager) {
      return;
    }
    manager.onProgress = (_url, loaded, total) => {
      this.showProgress(loaded, total);
    };
  }

  showProgress(loaded, total) {
    if (!this.bar || !this.fill || !(total > 0)) {
      return;
    }
    const value = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
    this.bar.classList.remove('is-indeterminate');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.bar.setAttribute('aria-valuenow', String(value));
    this.fill.style.width = `${value}%`;
    if (this.percent) {
      this.percent.hidden = false;
      this.percent.textContent = `${value}%`;
    }
  }

  fail() {
    this.root?.classList.add('is-failed');
    this.root?.setAttribute('aria-busy', 'false');
    if (this.error) {
      this.error.hidden = false;
    }
  }

  async finish() {
    if (!this.root || this.closed) {
      return;
    }
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    if (this.closed) {
      return;
    }
    this.root.classList.add('is-done');
    this.root.setAttribute('aria-busy', 'false');
    await new Promise((resolve) => {
      let settled = false;
      const done = (event) => {
        if (settled || (event && (event.target !== this.root || event.propertyName !== 'opacity'))) {
          return;
        }
        settled = true;
        this.root.removeEventListener('transitionend', done);
        this.root.hidden = true;
        this.closed = true;
        resolve();
      };
      this.root.addEventListener('transitionend', done);
      window.setTimeout(done, 700);
    });
  }
}
