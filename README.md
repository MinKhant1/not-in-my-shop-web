# Not In My Shop

A browser shop sim built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/). You run a small store from open to close: ring up honest customers, catch the ones walking out with unpaid goods, and spend the night expanding the floor.

The day starts at 9:00 AM and closes at 9:00 PM. After close, a results screen shows customers, checkouts, thieves caught, and what you earned or lost. Progress is saved in the browser.

## Play

Stand on the gold **NEW SHOP** circle and hold to start, or **CONTINUE** to load a saved shop. A tutorial pad outside the door walks through the three jobs.

- **Checkout.** Stand in a checkout circle while a customer waits. They pay, then leave.
- **Catch thieves.** A mark over a shopper means they are stealing. Pick up the broom from the grocery stand and walk into range. Swings are automatic while the broom is out.
- **Upgrade.** After close, floor pads unlock new aisles (electronics, sports, clothing, jewellery), fixtures, a cashier, a security guard, cameras, an intercom, roller skates, and stronger brooms. Stand on a pad and hold to pay.

Honest customers browse, queue, and pay. Thieves try to leave with the goods. Knock one down and the dropped items can be recovered. A long checkout line makes waiting customers angry.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | On-screen joystick |
| Checkout, pickups, purchases | Walk onto the floor circle and hold | Same |
| Attack | Automatic while the broom is equipped and a thief is in range | Same |
| Intercom (once bought) | E or Space, or the ability button | Ability button |
| Pause | Escape or the pause button | Pause button |
| Scene editor | F2 | — |

Pause also sets music and sound, restarts the day, or returns to the main menu.

## Run locally

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

The dev server listens on port 5173 and is reachable from other devices on the network (`host: true`).

```bash
npm run build    # static build in dist/
npm run preview  # serve that build
```

Audio files in `audio-source/` are packed into the bundle at build time. They are not loaded as separate requests.

## Scene editor

Press **F2** during a dev or preview session to edit the shop in place. Move, rotate, and scale objects, place models from `public/models/`, and save with **Ctrl+S** (or **Cmd+S**). Saves write:

- `public/scene-overrides.json` — placed, moved, and deleted objects
- `public/prefabs.json` — saved prefabs

The save API exists only while `npm run dev` or `npm run preview` is running. A plain static host will load those files and will not write them back.

Editor shortcuts, while the editor is open: **W** move, **E** rotate, **R** scale, **F** focus selection, **Delete** remove, **Ctrl+D** duplicate, **Ctrl+Z** / **Ctrl+Y** undo and redo.

## Layout

```
src/
  core/         game loop, renderer, asset loading
  entities/     player
  shoppers/     customers and thieves
  checkout/     lanes, cashier hire
  economy/      money, purchases, save
  weapons/      broom, swings, upgrades
  security/     guard, cameras, intercom
  daynight/     clock, lighting, day results, audio
  world/        store, street, sections
  menu/         main menu
  editor/       in-game scene editor
  ui/           HUD, pause, joystick, tutorial
public/         models, UI art, scene data
audio-source/   music and effects packed by Vite
```

Tuning for speed, prices, day length, and spawn rates lives in `src/config/GameConfig.js`.

## Credits

Third-party icons and their licenses are listed in [ASSET_CREDITS.md](ASSET_CREDITS.md).
