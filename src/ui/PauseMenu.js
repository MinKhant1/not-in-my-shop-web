export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.button = document.querySelector('#pause-button');
    this.root = document.querySelector('#pause-modal');
    this.music = document.querySelector('#pause-music');
    this.sfx = document.querySelector('#pause-sfx');
    this.syncSliders();

    this.button?.addEventListener('click', () => this.toggle());
    this.root?.querySelector('#pause-resume')?.addEventListener('click', () => this.close(true));
    this.root?.querySelector('#pause-restart')?.addEventListener('click', () => {
      this.game.restartCurrentDay();
      this.close(true);
    });
    this.root?.querySelector('#pause-main-menu')?.addEventListener('click', () => {
      this.game.mainMenu?.exitToMenu();
    });
    this.music?.addEventListener('input', () => {
      this.game.audio.setMusicVolume(Number(this.music.value) / 100);
    });
    this.sfx?.addEventListener('input', () => {
      this.game.audio.setSfxVolume(Number(this.sfx.value) / 100);
    });
    this.sfx?.addEventListener('change', () => {
      this.game.audio.tick();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape' || event.repeat) {
        return;
      }
      if (this.game.editor?.active || this.game.mainMenu?.state !== 'PLAYING') {
        return;
      }
      event.preventDefault();
      this.toggle();
    });
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
    if (this.game.paused) {
      this.close(true);
      return;
    }
    this.open();
  }

  open() {
    if (!this.root || this.game.mainMenu?.state !== 'PLAYING' || this.game.editor?.active) {
      return;
    }
    this.syncSliders();
    this.game.paused = true;
    this.game.input.suspended = true;
    this.game.input.keys.clear();
    this.game.input.joystick?.reset?.();
    document.body.classList.add('is-paused');
    this.root.hidden = false;
    this.button?.setAttribute('aria-label', 'Resume');
    this.game.audio.ensure();
  }

  close(resume) {
    if (this.root) {
      this.root.hidden = true;
    }
    document.body.classList.remove('is-paused');
    this.game.paused = false;
    this.button?.setAttribute('aria-label', 'Pause');
    if (resume) {
      this.game.input.suspended = false;
    }
  }
}
