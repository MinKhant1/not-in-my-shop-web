# Asset Credit List

## Icons

Bundled in `src/assets/icons/`. The game loads these files locally and does not request an icon CDN at runtime.

| Icon | File | Use |
| --- | --- | --- |
| Sun | `sun.svg` | Day HUD |
| Moon | `moon.svg` | Night HUD |
| Timer | `timer.svg` | Day countdown |
| Bug | `bug.svg` | Development phase toggle |
| Sunrise | `sunrise.svg` | Start Next Day button |
| Users | `users.svg` | Day results, customers |
| Shopping bag | `shopping-bag.svg` | Day results, checkouts |
| Shield check | `shield-check.svg` | Day results, thieves caught |
| User round x | `user-round-x.svg` | Day results, thieves escaped |
| Coins | `coins.svg` | Day results, available money |
| Arrow right | `arrow-right.svg` | Continue button |

- Creator: Lucide Contributors, with portions by Cole Bemis from Feather
- Source: https://lucide.dev and https://github.com/lucide-icons/lucide/tree/0.544.0/icons
- Version downloaded: 0.544.0
- License: ISC. Portions derived from Feather are MIT.
- Attribution: ISC does not require public credit. The notice below is included because the license requires it to appear in copies. Digit7 submissions also credit third-party assets.
- Full license text: `src/assets/icons/LUCIDE-LICENSE.txt`

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2025.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

The stroke color in the bundled SVGs was changed from `currentColor` to `#fff8e8` so the icons stay visible on the dark HUD when drawn with an image tag. The shapes are unchanged.
