// Shared supermarket colors. Change these values to recolor procedural
// furniture, floors, highlights, and UI that read from this module.
export const StorePalette = {
  floorPrimary: 0xcfc2d4,
  floorSecondary: 0xa89dbb,
  wall: 0xd9d0e1,
  wallTrim: 0x79708f,
  ceiling: 0xb7afc5,

  shelfFrame: 0xb9b1cf,
  shelfHighlight: 0xe6ddf0,
  shelfShadow: 0x9188ad,
  shelfSurface: 0xdad2e5,
  wood: 0xddaa7c,
  woodHighlight: 0xf0c69b,
  counterSurface: 0xf2dfc7,
  counterBase: 0xa99cbf,

  orange: 0xffa94d,
  yellow: 0xffd66b,
  sky: 0x6488dd,
  coral: 0xf47e79,
  mint: 0x75d9ad,
  lavender: 0xa58de2,

  highlight: 0x65e9c3,
  upgrade: 0xffca45,
  success: 0x75d9ad,
  danger: 0xf47e79,
  inactive: 0x8f8da4,

  uiBackground: 0x20283e,
  uiBackgroundSecondary: 0x34405c,
  uiText: 0xffffff,
  uiGold: 0xffca45,
  uiMint: 0x65e9c3,
  uiDisabled: 0x80889c,

  roughness: 0.86,
  metalness: 0.04
};

export function paletteHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function floorColorAt(x, z) {
  const checker = (Math.round(x) + Math.round(z)) & 1;
  return checker ? StorePalette.floorSecondary : StorePalette.floorPrimary;
}

function hueOf(red, green, blue, span) {
  let hue = 0;
  const max = Math.max(red, green, blue);
  if (max === red) {
    hue = ((green - blue) / span) % 6;
  } else if (max === green) {
    hue = (blue - red) / span + 2;
  } else {
    hue = (red - green) / span + 4;
  }
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

// Flat fixture colors are darker than the grocery shelves. Map them onto the same pastels.
export function brightShelfColor(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const span = max - min;
  const saturation = max === 0 ? 0 : span / max;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  if (saturation < 0.28) {
    if (luminance < 0.55) {
      return StorePalette.shelfFrame;
    }
    if (luminance < 0.78) {
      return StorePalette.shelfSurface;
    }
    return StorePalette.shelfHighlight;
  }

  const hue = hueOf(red, green, blue, span);
  const wood = hue >= 12 && hue <= 48 && saturation < 0.62 && luminance < 0.58;
  if (wood) {
    if (luminance < 0.42) {
      return StorePalette.shelfFrame;
    }
    return StorePalette.shelfSurface;
  }

  if (hue < 16 || hue >= 345) {
    return StorePalette.coral;
  }
  if (hue < 42) {
    return StorePalette.orange;
  }
  if (hue < 75) {
    return StorePalette.yellow;
  }
  if (hue < 165) {
    return StorePalette.mint;
  }
  if (hue < 255) {
    return StorePalette.sky;
  }
  if (hue < 330) {
    return StorePalette.lavender;
  }
  return StorePalette.coral;
}

const SECTION_ACCENTS = {
  grocery: StorePalette.mint,
  electronics: StorePalette.sky,
  sports: StorePalette.orange,
  clothing: StorePalette.lavender,
  jewellery: StorePalette.upgrade
};

export function sectionAccent(sectionId) {
  return SECTION_ACCENTS[sectionId] ?? StorePalette.lavender;
}
