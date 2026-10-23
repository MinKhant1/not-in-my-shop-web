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
    gain.connect(context.destination);
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
