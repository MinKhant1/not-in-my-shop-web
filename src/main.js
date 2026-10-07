import './styles/main.css';
import { Game } from './core/Game.js';

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
