# Not In My Shop

Digit7 Jam 2026 submission README.

| | |
| --- | --- |
| Game title | Not In My Shop |
| Team name | Team ACE |
| Main contact | MinKhant1 (GitHub). Email, phone, and Telegram are entered on the Digit7 Jam Developer Portal. |
| Genre | Arcade shop simulator |
| Build version | 0.1.0 |
| Submission commit | `737032a` on `main`. If a later commit or tag is the playable build, replace this hash so the URL, ZIP, and repository match. |
| Repository | https://github.com/MinKhant1/not-in-my-shop-web |
| Estimated play | 3 to 10 minutes for one shop day. Days can be repeated from the saved shop. |

## Short description

You run a small shop from open to close. Honest customers browse, queue, and pay. Some shoppers try to walk out with unpaid goods. Ring up the line, stop the thieves, and after 9:00 PM spend what you earned on a bigger floor.

The shop clock runs from 9:00 AM to 9:00 PM. One day lasts about two minutes. At close, a results screen shows customers, checkouts, thieves caught, thieves who escaped, and the money you have left. Progress stays in the browser.

## How to open and play

The game is a browser page. It does not need an app install.

**Hosted build.** Open the playable HTTPS link from the Digit7 Jam hosting environment. Wait for the loading screen. The bar fills while models and audio load. When it finishes, the shop appears and you can move.

**Playable ZIP.** Unzip `Digit7Jam_TeamACE_NotInMyShop.zip` and open `index.html` through a local static server. Opening the file directly (`file://`) can block model loads. From the project, the matching production folder is `dist/` after `npm run build`.

**From source** (reviewers with repository access):

```bash
npm install
npm run dev
```

Open http://localhost:5173 . The dev server also accepts connections from other devices on the same network.

```bash
npm run build
npm run preview
```

`npm run build` writes the playable site to `dist/`. `npm run preview` serves that folder. The playable ZIP should contain only the contents of `dist/`, not this repository.

**First session**

1. Click or tap the page once so the browser allows sound.
2. Walk onto the gold **NEW SHOP** circle and hold until the day starts. You can name the shop.
3. A tutorial pad outside the door covers checkout, catching thieves, and upgrades.
4. On a later visit, **CONTINUE** loads the saved shop. **CREDITS** lists the team and asset sources. **FEEDBACK** is optional.

## Controls and gameplay

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | On-screen joystick |
| Start a shop, continue, checkout, pickups, purchases | Walk onto the floor circle and hold | Same |
| Attack | Automatic while the broom is equipped and a thief is in range | Same |
| Intercom, after it is bought | E or Space, or the ability button | Ability button |
| Pause | Escape or the pause button | Pause button |

Pause sets music and sound volume, restarts the day, or returns to the main menu.

**Checkout.** Stand in a checkout circle while a customer is waiting. They pay, then leave. A long line makes waiting customers angry.

**Thieves.** A mark over a shopper means they are stealing. Pick up the broom from the grocery stand by walking into its circle. Swings happen on their own while the broom is out and a thief is close enough. Knocking a thief down drops the stolen goods so they can be recovered. From day 2, some thieves carry a whole shelf and are slower and tougher.

**After close.** Floor pads unlock new aisles (electronics, sports, clothing, jewellery), fixtures, a cashier, a security guard, cameras, an intercom, roller skates, and stronger brooms. Stand on a pad and hold to pay. Then start the next day.

Honest customers are the income. Missed thieves and angry queues cost you. Hired help and cameras cover the floor when you cannot be everywhere.

## Supported browsers

Tested target: current stable Google Chrome, Microsoft Edge, Mozilla Firefox, and Apple Safari, on desktop and on mobile.

The page needs WebGL. A browser with WebGL turned off, or a very old browser, will not start the game. No extensions, flags, or developer tools are required.

## Supported devices

- Windows 10 and Windows 11
- Recent supported macOS
- Android 10 or later
- iOS 16 or later

Desktop uses the keyboard. Phones and tablets use the on-screen joystick and buttons. Both are part of the same page.

## Recommended orientation, resolution, and aspect ratio

| | |
| --- | --- |
| Recommended orientation | Landscape |
| Portrait | Playable. The camera pulls back on a narrow screen. |
| Recommended desktop viewport | 1280 × 720 (16:9) |
| Minimum mobile viewport | 360 × 640 |
| Control method | Keyboard on desktop. Joystick and on-screen buttons on touch devices. |

The layout fills the browser window. Normal play does not need horizontal scrolling or browser zoom. Fullscreen is optional. The game stays playable in a normal window.

## Known bugs and limitations

- The first visit downloads 3D models. A loading bar is shown. On a slow connection this can take longer than 10 seconds.
- Sound starts after the first click or tap. That is a browser rule, not a missing file.
- Shop progress and volume are stored in `localStorage` for this site. Private browsing, a different browser, or cleared site data starts you without a save. **CONTINUE** needs an existing save.
- The scene editor (F2) is a development tool. It can save layout files only while `npm run dev` or `npm run preview` is running. The hosted game loads the saved layout and does not write it back. Judges do not need F2.
- There is no account, cloud save, or online leaderboard.

## Internet, APIs, and third-party services

Play needs a network only to load the page and its files from the host you opened. After loading, the shop runs in the browser. There is no game server, login, score API, analytics, or advertising.

- Progress and audio settings use `localStorage` on the device.
- **FEEDBACK** opens a Google Form in a new tab: https://docs.google.com/forms/d/e/1FAIpQLSf8CUUSx4tPHo77xMg_KlK_eY_GS3RcFAoQCTeykflh7Yu6_Q/viewform?usp=dialog  
  The form is optional. The shop still runs if it is blocked or offline.
- The scene editor’s save requests exist only on the local dev server. They are not part of the hosted build.

The game does not collect personal data, and it does not load hidden trackers.

## Third-party tools and libraries

| Name | Role | Source | License |
| --- | --- | --- | --- |
| Three.js | 3D rendering at runtime | https://threejs.org/ | MIT |
| Vite | Development server and production build. It is not a separate runtime the player installs. | https://vite.dev/ | MIT |
| Node.js | Required only to install, run, and build from source | https://nodejs.org/ | Node.js license |

The playable page is HTML5 and WebGL. It does not use Phaser, Unity, or Godot.

## Asset credit summary

A fuller Lucide notice is in `ASSET_CREDITS.md` and `src/assets/icons/LUCIDE-LICENSE.txt`. In-game credits use the same sources.

| Type | What | Creator / source | License |
| --- | --- | --- | --- |
| 3D | City Builder Bits | Kay Lousberg | See the pack license supplied with the download |
| 3D | Mini Market GLB Pack | Eclair Assets | See the pack license supplied with the download |
| 3D | Low Poly Road Pack | Stars and Shells Studio | See the pack license supplied with the download |
| 3D | City Kit Commercial and Roads | Kenney | CC0 |
| 3D | Animals | Styloo | See the pack license supplied with the download |
| Music | Cosy Quirky | Pixabay | Pixabay Content License |
| Icons | HUD and results icons in `src/assets/icons/` | Lucide Contributors, with portions by Cole Bemis (Feather). Version 0.544.0. https://lucide.dev | ISC. Feather portions are MIT. |
| Engine | Rendering | Three.js, https://github.com/mrdoob/three.js | MIT |

The team has the right to use these packs in this jam build. License files for the 3D packs and music are submitted with the Asset Credit List and License Proof on the Developer Portal. No AI-generated art, music, voice, or icons are in the game.

## AI tools

| Tool | Purpose | Affected work | Human review |
| --- | --- | --- | --- |
| Cursor, with an AI coding assistant | Help writing and revising gameplay code, UI, and this README | Source under `src/`, and this file | The team plays the build, checks the result, and decides what is submitted. The team is responsible for the code. |

No AI-generated art, music, voice, or other media assets are included. The models, music, and icons above are third-party packs, not generated for this project.

## Private repository access

1. Repository: https://github.com/MinKhant1/not-in-my-shop-web
2. Visibility: private. Before the deadline, the team grants read access to the reviewer account or email announced by Digit7s.
3. Branch: `main`
4. Submission commit: `737032a`
5. Build from that commit with `npm install` and `npm run build`. The playable files are in `dist/`.
6. Dependency lists: `package.json` and `package-lock.json`
7. The repository does not contain API keys or hosting passwords.

## Special testing notes

- Use the hosted URL or a static server. Do not open `index.html` as a `file://` link.
- Allow the loading screen to finish before judging input.
- Click or tap once if the shop is silent.
- To see a full loop: start **NEW SHOP**, check out one customer, pick up the broom and stop a marked thief, wait for 9:00 PM, then buy one floor pad.
- To retest a new shop, return to the main menu and start **NEW SHOP**, or clear site data for the playable origin.
- Ignore F2. That editor is for development only.
- The hosted build and the playable ZIP are the same `dist/` output. Source, screenshots, and this README are submitted separately and are not inside the ZIP.

## Build version

- Package version: `0.1.0` (`package.json`)
- Release identifier: Digit7 Jam playable build matching commit `737032a`
- ZIP name: `Digit7Jam_TeamACE_NotInMyShop.zip`
