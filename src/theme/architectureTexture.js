import * as THREE from 'three';
import { StorePalette } from './storePalette.js';

function rgb(color) {
  return {
    r: (color >> 16) & 255,
    g: (color >> 8) & 255,
    b: color & 255
  };
}

const TRIM = rgb(StorePalette.wallTrim);
const WALL = rgb(StorePalette.wall);
const CEILING = rgb(StorePalette.ceiling);
const HIGHLIGHT = rgb(StorePalette.shelfHighlight);

function neutralTarget(luminance) {
  if (luminance < 0.4) {
    return TRIM;
  }
  if (luminance < 0.7) {
    return WALL;
  }
  if (luminance < 0.86) {
    return CEILING;
  }
  return HIGHLIGHT;
}

// Keeps the wall atlas layout, but turns muddy grays into the store palette.
export function createArchitectureTexture(source) {
  const image = source?.image;
  if (!image || !image.width) {
    return source;
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const target = neutralTarget(luminance);
    pixels[i] = target.r;
    pixels[i + 1] = target.g;
    pixels[i + 2] = target.b;
  }
  context.putImageData(frame, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
