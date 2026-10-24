function readVolume(key, fallback) {
  try {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value));
    }
  } catch {
    // A blocked storage read keeps the default level.
  }
  return fallback;
}

function writeVolume(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The slider still applies for this visit.
  }
}

const MUSIC_URL = '/assets/audio/background.mp3';
const MUSIC_FADE_SECONDS = 2.4;

export class ShopAudio {
  constructor() {
    this.context = null;
    this.lastTick = null;
    this.musicVolume = readVolume('not-in-my-shop-music', 0.2);
    this.sfxVolume = readVolume('not-in-my-shop-sfx', 1);
    this.musicGain = null;
    this.sfxGain = null;
    this.musicSource = null;
    this.musicStarted = false;
    this.musicBytes = fetch(MUSIC_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Background music failed to load (${response.status})`);
        }
        return response.arrayBuffer();
      })
      .catch((error) => {
        console.warn('Background music unavailable', error);
        return null;
      });
    window.addEventListener('keydown', () => this.ensure(), { once: true });
  }

  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      this.startMusic();
      return this.context;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    this.context = new AudioCtx();
    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.context.destination);
    this.startMusic();
    return this.context;
  }

  setMusicVolume(value) {
    this.musicVolume = Math.min(1, Math.max(0, value));
    writeVolume('not-in-my-shop-music', this.musicVolume);
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVolume;
    }
    this.ensure();
  }

  setSfxVolume(value) {
    this.sfxVolume = Math.min(1, Math.max(0, value));
    writeVolume('not-in-my-shop-sfx', this.sfxVolume);
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  startMusic() {
    if (this.musicStarted || !this.context || !this.musicGain) {
      return;
    }
    this.musicStarted = true;
    this.playMusic();
  }

  async playMusic() {
    const bytes = await this.musicBytes;
    const context = this.context;
    if (!bytes || !context || !this.musicGain || this.musicSource) {
      if (!bytes) {
        this.musicStarted = false;
      }
      return;
    }
    let buffer;
    try {
      buffer = await context.decodeAudioData(bytes.slice(0));
    } catch (error) {
      console.warn('Background music could not be decoded', error);
      this.musicStarted = false;
      return;
    }
    if (this.musicSource || this.context !== context) {
      return;
    }
    const source = context.createBufferSource();
    const fade = context.createGain();
    const now = context.currentTime;
    source.buffer = buffer;
    source.loop = true;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_SECONDS);
    source.connect(fade);
    fade.connect(this.musicGain);
    source.start(now);
    this.musicSource = source;
  }

  tone(frequency, duration, type, gainValue) {
    const context = this.ensure();
    if (!context) {
      return;
    }
    this.scheduleTone(context, context.currentTime, frequency, duration, type, gainValue);
  }

  scheduleTone(context, when, frequency, duration, type, gainValue) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain);
    gain.connect(this.sfxGain || context.destination);
    oscillator.start(when);
    oscillator.stop(when + duration);
  }

  tick() {
    this.tone(1400, 0.035, 'square', 0.025);
  }

  bell() {
    this.tone(880, 0.28, 'sine', 0.05);
    this.tone(1320, 0.4, 'sine', 0.03);
  }

  // Short PA chime. Scheduled on the audio clock so it stays in time with the game.
  announce() {
    const context = this.ensure();
    if (!context) {
      return;
    }
    const now = context.currentTime;
    this.scheduleTone(context, now, 494, 0.16, 'square', 0.03);
    this.scheduleTone(context, now + 0.14, 659, 0.16, 'square', 0.028);
    this.scheduleTone(context, now + 0.3, 784, 0.34, 'triangle', 0.036);
    this.scheduleTone(context, now + 0.46, 392, 0.42, 'sine', 0.02);
  }
}
