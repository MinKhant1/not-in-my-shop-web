import { takeAudio } from 'virtual:shop-audio';

function readVolume(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') {
      return fallback;
    }
    const value = Number(raw);
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

const CLIP_NAMES = ['bell', 'hit', 'scream', 'coin', 'win', 'announce'];
// These files peak near full scale. These levels keep them clear under the effects slider.
const BELL_GAIN = 0.45;
const HIT_GAIN = 0.6;
const SCREAM_GAIN = 0.55;
const COIN_GAIN = 0.48;
const WIN_GAIN = 0.5;
const ANNOUNCE_GAIN = 0.5;

export class ShopAudio {
  constructor() {
    this.context = null;
    this.lastTick = null;
    this.musicVolume = readVolume('not-in-my-shop-music', 0.4);
    this.sfxVolume = readVolume('not-in-my-shop-sfx', 0.4);
    this.sfxGain = null;
    this.musicEl = null;
    this.clipBytes = new Map();
    this.clipBuffers = new Map();
    this.clipLoading = new Map();
    for (let i = 0; i < CLIP_NAMES.length; i += 1) {
      this.clipBytes.set(CLIP_NAMES[i], this.readClip(CLIP_NAMES[i]));
    }
    this.onUnlock = () => {
      this.ensure();
      this.startMusic();
    };
    window.addEventListener('pointerdown', this.onUnlock);
    window.addEventListener('keydown', this.onUnlock);
    window.addEventListener('touchend', this.onUnlock);
  }

  clearUnlock() {
    window.removeEventListener('pointerdown', this.onUnlock);
    window.removeEventListener('keydown', this.onUnlock);
    window.removeEventListener('touchend', this.onUnlock);
  }

  readClip(name) {
    try {
      return Promise.resolve(takeAudio(name));
    } catch (error) {
      console.warn('Audio unavailable', error);
      return Promise.resolve(null);
    }
  }

  ensure() {
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return null;
      }
      this.context = new AudioCtx();
      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
    return this.context;
  }

  arm() {
    this.ensure();
    this.startMusic();
  }

  setMusicVolume(value) {
    this.musicVolume = Math.min(1, Math.max(0, value));
    writeVolume('not-in-my-shop-music', this.musicVolume);
    if (this.musicEl) {
      this.musicEl.volume = this.musicVolume;
    }
    if (this.musicVolume > 0) {
      this.startMusic();
    } else {
      this.musicEl?.pause();
    }
  }

  setSfxVolume(value) {
    this.sfxVolume = Math.min(1, Math.max(0, value));
    writeVolume('not-in-my-shop-sfx', this.sfxVolume);
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  startMusic() {
    if (this.musicVolume <= 0) {
      this.musicEl?.pause();
      return;
    }
    if (!this.musicEl) {
      const music = new Audio('/assets/audio/background.mp3');
      music.loop = true;
      music.preload = 'none';
      this.musicEl = music;
    }
    this.musicEl.volume = this.musicVolume;
    if (!this.musicEl.paused) {
      return;
    }
    this.musicEl.play().then(() => {
      this.clearUnlock();
    }).catch(() => {
      // The next click retries. A blocked autoplay should not save the file.
    });
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

  shopBell() {
    this.playClip('bell', BELL_GAIN);
  }

  hit() {
    this.playClip('hit', HIT_GAIN);
  }

  scream() {
    this.playClip('scream', SCREAM_GAIN);
  }

  coin() {
    this.playClip('coin', COIN_GAIN);
  }

  win() {
    this.playClip('win', WIN_GAIN);
  }

  playClip(name, level) {
    if (!this.ensure()) {
      return;
    }
    this.startClip(name, level);
  }

  async startClip(name, level) {
    const buffer = await this.clipBuffer(name);
    const context = this.context;
    if (!buffer || !context) {
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(level, context.currentTime);
    source.connect(gain);
    gain.connect(this.sfxGain || context.destination);
    source.start();
  }

  clipBuffer(name) {
    if (this.clipBuffers.has(name)) {
      return this.clipBuffers.get(name);
    }
    if (!this.clipLoading.has(name)) {
      this.clipLoading.set(name, this.decodeClip(name));
    }
    return this.clipLoading.get(name);
  }

  async decodeClip(name) {
    const bytes = await this.clipBytes.get(name);
    const context = this.context;
    if (!bytes || !context) {
      this.clipLoading.delete(name);
      return null;
    }
    try {
      const buffer = await context.decodeAudioData(bytes.slice(0));
      this.clipBuffers.set(name, buffer);
      return buffer;
    } catch (error) {
      console.warn('Sound could not be decoded', error);
      this.clipLoading.delete(name);
      return null;
    }
  }

  bell() {
    this.tone(880, 0.28, 'sine', 0.05);
    this.tone(1320, 0.4, 'sine', 0.03);
  }

  announce() {
    this.playClip('announce', ANNOUNCE_GAIN);
  }
}
