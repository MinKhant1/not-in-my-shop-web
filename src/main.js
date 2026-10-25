import './styles/main.css';
import { Game } from './core/Game.js';
import { LoadingScreen } from './ui/LoadingScreen.js';

const SCROLLABLE = '#menu-panel, #pause-modal, #settings-modal, #tutorial-modal, #results-panel';
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 32;

function allowsPageGesture(target) {
  return target instanceof Element && Boolean(target.closest(`input, textarea, select, ${SCROLLABLE}`));
}

function allowsTextGesture(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function blockBrowserZoom(event) {
  if (event.touches && event.touches.length > 1) {
    event.preventDefault();
    return;
  }
  if (!allowsPageGesture(event.target)) {
    event.preventDefault();
  }
}

// Mobile browsers zoom the page on a second tap in the same spot. Stopping that
// tap's default action leaves the first tap's click, and pointer controls, intact.
let lastTap = { time: 0, x: 0, y: 0 };

function blockDoubleTapZoom(event) {
  if (event.changedTouches?.length !== 1 || allowsTextGesture(event.target)) {
    lastTap.time = 0;
    return;
  }
  const touch = event.changedTouches[0];
  const now = Date.now();
  const dx = touch.clientX - lastTap.x;
  const dy = touch.clientY - lastTap.y;
  const closeInTime = now - lastTap.time <= DOUBLE_TAP_MS;
  const closeInPlace = dx * dx + dy * dy <= DOUBLE_TAP_SLOP * DOUBLE_TAP_SLOP;
  if (lastTap.time > 0 && closeInTime && closeInPlace) {
    event.preventDefault();
  }
  lastTap.time = now;
  lastTap.x = touch.clientX;
  lastTap.y = touch.clientY;
}

// A non-passive touchstart keeps the rest of the tap cancelable on iOS/Chrome.
// Multi-finger starts are blocked here; a second single tap is blocked on touchend
// so pointer controls such as the joystick still receive that tap.
document.addEventListener('touchstart', (event) => {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false, capture: true });
document.addEventListener('touchmove', blockBrowserZoom, { passive: false });
document.addEventListener('touchend', blockDoubleTapZoom, { passive: false, capture: true });
document.addEventListener('dblclick', (event) => {
  if (!allowsTextGesture(event.target)) {
    event.preventDefault();
  }
}, { capture: true });
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });

const app = document.querySelector('#app');
const canvas = document.querySelector('#game-canvas');
const loading = new LoadingScreen();
const game = new Game(canvas, app);

loading.attach(game.loader.manager);
game.input.suspended = true;
game.init().then(async () => {
  game.input.suspended = true;
  await loading.finish();
  game.input.suspended = false;
}).catch((error) => {
  console.error('Failed to start Not In My Shop', error);
  game.input.suspended = true;
  loading.fail();
});
