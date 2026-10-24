import { DayPhase } from '../daynight/DayNightController.js';
import { formatGameTime } from '../daynight/shopTime.js';
import moonUrl from '../assets/icons/moon.svg';
import bugUrl from '../assets/icons/bug.svg';
import usersUrl from '../assets/icons/users.svg';
import clipboardUrl from '../assets/icons/clipboard-check.svg';
import caughtUrl from '../assets/icons/shield-star.svg';
import escapedUrl from '../assets/icons/runner.svg';

const CLOCK_ART = '/assets/ui/clock-layers';
const ARCH = { x: 0.1464, y: 0.1777, w: 0.7003, h: 0.442 };
const FOUR_PM = 7 / 12;
const SEVEN_PM = 10 / 12;

function skyWeights(progress, nightPhase) {
  if (nightPhase) {
    return { day: 0, evening: 0, night: 1, stars: 1, moon: 1, sun: 0 };
  }
  let day = 1;
  let evening = 0;
  let night = 0;
  if (progress > FOUR_PM && progress <= SEVEN_PM) {
    const t = (progress - FOUR_PM) / (SEVEN_PM - FOUR_PM);
    day = 1 - t;
    evening = t;
  } else if (progress > SEVEN_PM) {
    const t = (progress - SEVEN_PM) / (1 - SEVEN_PM);
    day = 0;
    evening = 1 - t;
    night = t;
  }
  const stars = progress <= SEVEN_PM ? 0 : (progress - SEVEN_PM) / (1 - SEVEN_PM);
  const sun = progress < 0.9 ? 1 : 1 - (progress - 0.9) / 0.1;
  return { day, evening, night, stars, moon: stars * 0.45, sun };
}

function stripBakedMoon(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const width = canvas.width;
  const height = canvas.height;
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let index = 0; index < width * height; index += 1) {
    if (seen[index]) {
      continue;
    }
    const alpha = data[index * 4 + 3];
    const light = data[index * 4] + data[index * 4 + 1] + data[index * 4 + 2];
    if (alpha < 24 || light < 48) {
      continue;
    }
    stack.push(index);
    seen[index] = 1;
    const pixels = [];
    while (stack.length > 0) {
      const current = stack.pop();
      pixels.push(current);
      const x = current % width;
      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (let n = 0; n < neighbors.length; n += 1) {
        const next = neighbors[n];
        if (next < 0 || next >= width * height || seen[next]) {
          continue;
        }
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) {
          continue;
        }
        const nextAlpha = data[next * 4 + 3];
        const nextLight = data[next * 4] + data[next * 4 + 1] + data[next * 4 + 2];
        if (nextAlpha < 24 || nextLight < 48) {
          continue;
        }
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (pixels.length > 8000) {
      for (let i = 0; i < pixels.length; i += 1) {
        data[pixels[i] * 4 + 3] = 0;
      }
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

function signedG(amount) {
  const value = Math.round(amount);
  if (value > 0) {
    return `+${value}G`;
  }
  if (value < 0) {
    return `${value}G`;
  }
  return '0G';
}

export class DayNightHUD {
  constructor(app, controller, audio, getMoney) {
    this.controller = controller;
    this.audio = audio;
    this.getMoney = getMoney;
    this.minuteShown = null;
    this.resultsShown = false;
    this.countTimer = 0;
    this.countDone = false;
    this.debugPreview = false;
    this.tickSecond = null;

    this.dayLabel = document.querySelector('#clock-day');
    this.plaque = document.querySelector('#clock-plaque');
    this.skyDay = document.querySelector('#sky-day');
    this.skyEvening = document.querySelector('#sky-evening');
    this.skyNight = document.querySelector('#sky-night');
    this.skyFillDay = document.querySelector('#sky-fill-day');
    this.skyFillEvening = document.querySelector('#sky-fill-evening');
    this.skyFillNight = document.querySelector('#sky-fill-night');
    this.stars = document.querySelector('#clock-stars');
    this.sun = document.querySelector('#clock-sun');
    this.moon = document.querySelector('#clock-moon');
    this.cloud1 = document.querySelector('#cloud-1');
    this.cloud2 = document.querySelector('#cloud-2');
    this.mountains = document.querySelector('#clock-mountains');
    this.town = document.querySelector('#clock-town');
    this.wood = document.querySelector('#clock-wood');
    this.plaqueArt = document.querySelector('#clock-plaque-art');
    this.drift1 = 0;
    this.drift2 = 0.37;
    this.motionTime = 0;
    this.seenDay = controller.dayNumber;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.announcement = document.querySelector('#closing-announcement');
    this.scrim = document.querySelector('#closing-scrim');
    this.panel = document.querySelector('#results-panel');
    this.continueButton = document.querySelector('#results-continue');

    this.preloadClockArt();
    this.setIcon('#results-moon', moonUrl);
    this.setIcon('#stat-customers-icon', usersUrl);
    this.setIcon('#stat-checkouts-icon', clipboardUrl);
    this.setIcon('#stat-caught-icon', caughtUrl);
    this.setIcon('#stat-escaped-icon', escapedUrl);
    this.continueButton.addEventListener('click', () => this.onContinue());
    this.scrim.addEventListener('click', () => {
      if (this.controller.phase === DayPhase.RESULTS && !this.countDone) {
        this.finishCount();
      }
    });

    if (import.meta.env.DEV) {
      this.debugButton = document.createElement('button');
      this.debugButton.id = 'debug-phase';
      this.debugButton.type = 'button';
      this.debugButton.setAttribute('data-no-joystick', '');
      const icon = document.createElement('img');
      icon.src = bugUrl;
      icon.alt = '';
      icon.width = 14;
      icon.height = 14;
      this.debugButton.append(icon, document.createTextNode('DEBUG: DAY / NIGHT'));
      this.debugButton.addEventListener('click', () => {
        this.controller.debugToggle();
        this.render();
      });
      this.shopButton = document.createElement('button');
      this.shopButton.id = 'debug-shop';
      this.shopButton.type = 'button';
      this.shopButton.setAttribute('data-no-joystick', '');
      const shopIcon = document.createElement('img');
      shopIcon.src = bugUrl;
      shopIcon.alt = '';
      shopIcon.width = 14;
      shopIcon.height = 14;
      this.shopLabel = document.createTextNode('DEBUG: SHOP HUD');
      this.shopButton.append(shopIcon, this.shopLabel);
      this.shopButton.addEventListener('click', () => this.toggleShopPreview());
      app.append(this.debugButton, this.shopButton);
    }

    window.addEventListener('pointerdown', () => this.audio.ensure(), { once: true });
    this.paintClock(0);
    this.render();
  }

  setIcon(selector, url) {
    const icon = document.querySelector(selector);
    if (icon) {
      icon.src = url;
    }
  }

  preloadClockArt() {
    const assign = (element, file) => {
      const url = `${CLOCK_ART}/${file}`;
      element.src = url;
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = url;
    };
    assign(this.skyDay, 'sky_day.png');
    assign(this.skyEvening, 'sky_evening.png');
    assign(this.skyNight, 'sky_night.png');
    assign(this.sun, 'sun.png');
    assign(this.moon, 'moon.png');
    assign(this.mountains, 'mountains.png');
    assign(this.town, 'town.png');
    assign(this.wood, 'frame.png');
    assign(this.plaqueArt, 'plaque.png');
    const cloud1 = `${CLOCK_ART}/cloud_1.png`;
    const cloud2 = `${CLOCK_ART}/cloud_2.png`;
    this.cloud1.querySelectorAll('img').forEach((img) => { img.src = cloud1; });
    this.cloud2.querySelectorAll('img').forEach((img) => { img.src = cloud2; });
    const stars = new Image();
    stars.decoding = 'async';
    stars.onload = () => {
      const cleaned = stripBakedMoon(stars);
      const ctx = this.stars.getContext('2d');
      ctx.clearRect(0, 0, this.stars.width, this.stars.height);
      ctx.drawImage(cleaned, 0, 0, this.stars.width, this.stars.height);
    };
    stars.src = `${CLOCK_ART}/stars.png`;
  }

  setOpacity(element, value) {
    const next = Math.max(0, Math.min(1, value)).toFixed(3);
    if (element.dataset.opacity === next) {
      return;
    }
    element.dataset.opacity = next;
    element.style.opacity = next;
  }

  setSprite(element, x, y) {
    const nx = x.toFixed(4);
    const ny = y.toFixed(4);
    if (element.dataset.nx !== nx) {
      element.dataset.nx = nx;
      element.style.setProperty('--nx', nx);
    }
    if (element.dataset.ny !== ny) {
      element.dataset.ny = ny;
      element.style.setProperty('--ny', ny);
    }
  }

  dayProgress() {
    const duration = this.controller.dayDuration || 120;
    return Math.min(1, Math.max(0, this.controller.elapsedSeconds() / duration));
  }

  paintClock(dt) {
    const night = this.controller.displayPhase() === DayPhase.NIGHT;
    if (this.seenDay !== this.controller.dayNumber) {
      this.seenDay = this.controller.dayNumber;
      this.drift1 = 0;
      this.drift2 = 0.37;
      this.motionTime = 0;
    }
    const paused = document.hidden || this.controller.blocksPlay();
    if (!paused && !this.reduceMotion.matches) {
      this.motionTime += dt;
      this.drift1 = (this.drift1 + dt * 0.028) % 1;
      this.drift2 = (this.drift2 + dt * 0.017) % 1;
    }
    this.cloud1.style.transform = `translate3d(${-this.drift1 * 50}%, 0, 0)`;
    this.cloud2.style.transform = `translate3d(${-this.drift2 * 50}%, 0, 0)`;

    const progress = this.dayProgress();
    const weights = skyWeights(progress, night);
    const twinkle = this.reduceMotion.matches ? 1 : 0.9 + Math.sin(this.motionTime * 2.1) * 0.1;
    this.setOpacity(this.skyFillDay, weights.day);
    this.setOpacity(this.skyDay, weights.day);
    this.setOpacity(this.skyFillEvening, weights.evening);
    this.setOpacity(this.skyEvening, weights.evening);
    this.setOpacity(this.skyFillNight, weights.night);
    this.setOpacity(this.skyNight, weights.night);
    this.setOpacity(this.stars, weights.stars * twinkle);
    this.setOpacity(this.sun, weights.sun);
    this.setOpacity(this.moon, weights.moon);
    const shade = (1 - weights.night * 0.42).toFixed(3);
    const filter = shade === '1.000' ? 'none' : `brightness(${shade})`;
    if (this.sceneryFilter !== filter) {
      this.sceneryFilter = filter;
      this.mountains.style.filter = filter;
      this.town.style.filter = filter;
      this.cloud1.style.filter = filter;
      this.cloud2.style.filter = filter;
    }

    const along = night ? 0.22 : 0.16 + progress * 0.68;
    const rise = night ? 0.22 : 0.75 - Math.sin(progress * Math.PI) * 0.48;
    const bob = this.reduceMotion.matches ? 0 : Math.sin(this.motionTime * 0.18) * 0.02;
    this.setSprite(
      this.sun,
      ARCH.x + along * ARCH.w,
      ARCH.y + rise * ARCH.h
    );
    this.setSprite(
      this.moon,
      ARCH.x + (0.28 + bob) * ARCH.w,
      ARCH.y + (0.24 + bob * 0.6) * ARCH.h
    );
  }

  update(dt) {
    this.watchTick();
    this.paintClock(dt);
    if (this.controller.phase === DayPhase.RESULTS && this.resultsShown && !this.countDone) {
      this.countTimer += dt;
      this.paintCount(Math.min(1, this.countTimer / 1.15));
      if (this.countTimer >= 1.15) {
        this.finishCount();
      }
    }
    this.render();
  }

  watchTick() {
    if (!this.controller.closingSoon()) {
      this.tickSecond = null;
      return;
    }
    const second = Math.ceil(this.controller.remaining);
    if (this.tickSecond === null) {
      this.tickSecond = second;
      return;
    }
    if (second !== this.tickSecond) {
      this.tickSecond = second;
      this.audio.tick();
    }
  }

  toggleShopPreview() {
    this.debugPreview = !this.debugPreview;
    this.resultsShown = false;
    this.countDone = false;
    this.render();
  }

  previewSnapshot() {
    return {
      dayNumber: this.controller.dayNumber,
      customers: 16,
      checkouts: 6,
      thievesCaught: 1,
      thievesEscaped: 5,
      checkoutIncome: 60,
      moneyStolen: 55,
      net: 5
    };
  }

  onContinue() {
    if (this.debugPreview) {
      this.toggleShopPreview();
      return;
    }
    if (this.controller.phase !== DayPhase.RESULTS) {
      return;
    }
    if (!this.countDone) {
      this.finishCount();
      return;
    }
    this.controller.continueToNight();
    this.resultsShown = false;
    this.render();
  }

  showResults(snapshot, immediate = false) {
    this.resultsShown = true;
    this.countDone = false;
    this.countTimer = 0;
    this.snapshot = snapshot;
    document.querySelector('#results-day').textContent = `DAY ${snapshot.dayNumber} COMPLETE`;
    this.paintCount(0);
    this.panel.classList.remove('is-ready');
    this.panel.classList.remove('is-playing');
    void this.panel.offsetWidth;
    this.panel.classList.add('is-playing');
    if (immediate) {
      this.finishCount();
    }
  }

  paintCount(progress) {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return;
    }
    const ease = Math.min(1, progress);
    const customers = Math.round(snapshot.customers * ease);
    const checkouts = Math.round(snapshot.checkouts * ease);
    const caught = Math.round(snapshot.thievesCaught * ease);
    document.querySelector('#stat-customers').textContent = String(customers);
    document.querySelector('#stat-checkouts').textContent = String(checkouts);
    document.querySelector('#stat-caught').textContent = String(caught);
    this.paintSigned(document.querySelector('#stat-income'), snapshot.checkoutIncome * ease);
    document.querySelector('#stat-escaped').textContent = String(Math.round(snapshot.thievesEscaped * ease));
    this.paintSigned(document.querySelector('#stat-stolen'), -snapshot.moneyStolen * ease);
    this.paintSigned(document.querySelector('#stat-net'), snapshot.net * ease);
  }

  paintSigned(element, amount) {
    element.textContent = signedG(amount);
    element.classList.toggle('is-plus', amount > 0.5);
    element.classList.toggle('is-minus', amount < -0.5);
  }

  finishCount() {
    this.countDone = true;
    this.paintCount(1);
    this.panel.classList.add('is-ready');
  }

  render() {
    const night = this.controller.displayPhase() === DayPhase.NIGHT;
    this.dayLabel.textContent = `${night ? 'NIGHT' : 'DAY'} ${this.controller.dayNumber}`;
    const label = night
      ? 'SHOP CLOSED'
      : (this.controller.remaining <= 0 ? '9:00 PM' : formatGameTime(this.controller.gameMinutes()));
    if (label !== this.minuteShown) {
      this.minuteShown = label;
      this.plaque.textContent = label;
    }

    if (this.debugButton) {
      const locked = this.controller.phase !== DayPhase.DAY && this.controller.phase !== DayPhase.NIGHT;
      this.debugButton.disabled = locked;
    }

    const closing = this.controller.phase === DayPhase.CLOSING;
    if (this.debugPreview && (closing || this.controller.phase === DayPhase.RESULTS)) {
      this.debugPreview = false;
      this.resultsShown = false;
    }
    const preview = this.debugPreview;
    const results = this.controller.phase === DayPhase.RESULTS || preview;
    if (this.shopLabel) {
      this.shopLabel.data = preview ? 'DEBUG: HIDE SHOP HUD' : 'DEBUG: SHOP HUD';
    }
    this.announcement.hidden = !closing;
    this.scrim.hidden = !closing && !results;
    this.scrim.classList.toggle('is-results', results);
    this.panel.hidden = !results;
    if (results && !this.resultsShown) {
      const snapshot = preview ? this.previewSnapshot() : this.controller.results;
      if (snapshot) {
        this.showResults(snapshot, preview);
      }
    }
    if (!results && !closing) {
      this.resultsShown = false;
      this.countDone = false;
    }
  }
}
