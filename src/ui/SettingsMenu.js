export class SettingsMenu {
  constructor(game) {
    this.game = game;
    this.button = document.querySelector('#settings-button');
    this.root = document.querySelector('#settings-modal');
    this.music = document.querySelector('#settings-music');
    this.sfx = document.querySelector('#settings-sfx');
    this.heldSuspension = false;
    this.syncSliders();

    this.button?.addEventListener('click', () => this.toggle());
    this.root?.querySelector('#settings-close')?.addEventListener('click', () => this.close());
    this.music?.addEventListener('input', () => {
      this.game.audio.setMusicVolume(Number(this.music.value) / 100);
      this.game.pauseMenu?.syncSliders();
    });
    this.sfx?.addEventListener('input', () => {
      this.game.audio.setSfxVolume(Number(this.sfx.value) / 100);
      this.game.pauseMenu?.syncSliders();
    });
    this.sfx?.addEventListener('change', () => {
      this.game.audio.tick();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape' || event.repeat || !this.isOpen()) {
        return;
      }
      event.preventDefault();
      this.close();
    });
  }

  isOpen() {
    return this.root?.hidden === false;
  }

  syncSliders() {
    const audio = this.game.audio;
    if (this.music) {
      this.music.value = String(Math.round(audio.musicVolume * 100));
    }
    if (this.sfx) {
      this.sfx.value = String(Math.round(audio.sfxVolume * 100));
    }
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.open();
  }

  open() {
    if (!this.root || this.game.editor?.active || this.game.mainMenu?.state === 'PLAYING') {
      return;
    }
    this.syncSliders();
    this.heldSuspension = this.game.input.suspended === true;
    this.game.input.suspended = true;
    this.game.input.keys.clear();
    this.game.input.joystick?.reset?.();
    this.root.hidden = false;
    this.game.audio.ensure();
  }

  close() {
    if (!this.root || this.root.hidden) {
      return;
    }
    this.root.hidden = true;
    if (!this.heldSuspension && !this.game.paused) {
      this.game.input.suspended = false;
    }
    this.heldSuspension = false;
  }
}
