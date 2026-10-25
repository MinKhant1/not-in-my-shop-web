import './styles/main.css';
import { Game } from './core/Game.js';

const SCROLLABLE = '#menu-panel, #pause-modal, #tutorial-modal, #results-panel';

function allowsPageGesture(target) {
  return target instanceof Element && Boolean(target.closest(`input, textarea, select, ${SCROLLABLE}`));
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

document.addEventListener('touchmove', blockBrowserZoom, { passive: false });
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });

const app = document.querySelector('#app');
const canvas = document.querySelector('#game-canvas');
const game = new Game(canvas, app);

game.init().catch((error) => {
  console.error('Failed to start Not In My Shop', error);
  const note = document.createElement('p');
  note.id = 'load-error';
  note.textContent = 'The store failed to load. Check the browser console for details.';
  app.appendChild(note);
});
