import { takeAudio } from 'virtual:shop-audio';

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

const MUSIC_FADE_SECONDS = 2.4;
const CLIP_NAMES = ['bell', 'hit', 'scream', 'coin', 'win'];
// These files peak near full scale. These levels keep them clear under the effects slider.
const BELL_GAIN = 0.45;
const HIT_GAIN = 0.6;
const SCREAM_GAIN = 0.55;
const COIN_GAIN = 0.48;
const WIN_GAIN = 0.5;

export class ShopAudio {
  constructor() {
    this.context = null;
    this.lastTick = null;
    this.musicVolume = readVolume('not-in-my-shop-music', 0.5);
    this.sfxVolume = readVolume('not-in-my-shop-sfx', 0.5);
    this.musicGain = null;
    this.sfxGain = null;
    this.musicSource = null;
    this.musicStarting = false;
    this.musicArmed = false;
    this.musicBytes = null;
    this.clipBytes = new Map();
    this.clipBuffers = new Map();
    this.clipLoading = new Map();
    for (let i = 0; i < CLIP_NAMES.length; i += 1) {
      this.clipBytes.set(CLIP_NAMES[i], this.readClip(CLIP_NAMES[i]));
    }
    this.onUnlock = () => this.ensure();
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
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      this.context.resume().then(() => {
        if (this.musicArmed) {
          this.startMusic();
        }
      }).catch(() => {});
      return this.context;
    }
    if (this.musicArmed) {
      this.startMusic();
    }
    return this.context;
  }

  arm() {
    this.musicArmed = true;
    if (this.musicVolume <= 0) {
      return;
    }
    this.ensure();
  }

  setMusicVolume(value) {
    this.musicVolume = Math.min(1, Math.max(0, value));
    writeVolume('not-in-my-shop-music', this.musicVolume);
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVolume;
    }
    if (this.musicArmed && this.musicVolume > 0) {
      this.ensure();
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
    if (!this.musicArmed || this.musicVolume <= 0) {
      return;
    }
    if (this.musicSource || this.musicStarting || !this.context || !this.musicGain) {
      return;
    }
    if (this.context.state !== 'running') {
      return;
    }
    this.musicStarting = true;
    this.playMusic().finally(() => {
      this.musicStarting = false;
    });
  }

  fetchMusic() {
    return fetch(new URL('audio/background.mp3', document.baseURI)).then((response) => {
      if (!response.ok) {
        throw new Error(`Background music failed to load (${response.status})`);
      }
      return response.arrayBuffer();
    });
  }

  async playMusic() {
    if (!this.musicBytes) {
      this.musicBytes = this.fetchMusic();
    }
    let bytes;
    try {
      bytes = await this.musicBytes;
    } catch (error) {
      console.warn('Background music could not be loaded', error);
      this.musicBytes = null;
      return;
    }
    const context = this.context;
    if (!bytes || !context || !this.musicGain || this.musicSource || context.state !== 'running') {
      return;
    }
    let buffer;
    try {
      buffer = await context.decodeAudioData(bytes.slice(0));
    } catch (error) {
      console.warn('Background music could not be decoded', error);
      return;
    }
    if (this.musicSource || this.context !== context || context.state !== 'running') {
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
    this.clearUnlock();
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
