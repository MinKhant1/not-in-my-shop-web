export class ShopAudio {
  constructor() {
    this.context = null;
    this.lastTick = null;
  }

  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      return this.context;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    this.context = new AudioCtx();
    return this.context;
  }

  tone(frequency, duration, type, gainValue) {
    const context = this.ensure();
    if (!context) {
      return;
    }
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  tick() {
    this.tone(1400, 0.035, 'square', 0.025);
  }

  bell() {
    this.tone(880, 0.28, 'sine', 0.05);
    this.tone(1320, 0.4, 'sine', 0.03);
  }
}
