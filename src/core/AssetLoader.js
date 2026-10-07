import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MINI_MARKET_TEXTURE = '/models/textures/variation-a.png';

// 1x1 stand-in so GLTFLoader does not request the missing Textures/colormap.png.
const MISSING_COLORMAP_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function redirectMissingColormap(url) {
  const normalized = url.replace(/\\/g, '/');
  if (normalized.endsWith('Textures/colormap.png')) {
    return MISSING_COLORMAP_PLACEHOLDER;
  }
  return url;
}

export class AssetLoader {
  constructor({ debug = false } = {}) {
    this.debug = debug;
    this.manager = new THREE.LoadingManager();
    this.manager.setURLModifier(redirectMissingColormap);
    this.loader = new GLTFLoader(this.manager);
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.cache = new Map();
    this.textureCache = new Map();
  }

  loadTexture(path) {
    let pending = this.textureCache.get(path);
    if (!pending) {
      pending = new Promise((resolve, reject) => {
        this.textureLoader.load(
          path,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestMipmapNearestFilter;
            texture.generateMipmaps = true;
            texture.needsUpdate = true;
            if (this.debug) {
              console.log('Loaded texture:', path);
            }
            resolve(texture);
          },
          undefined,
          (error) => {
            console.error('Failed to load texture:', path, error);
            reject(error);
          }
        );
      });
      this.textureCache.set(path, pending);
      pending.catch(() => {
        this.textureCache.delete(path);
      });
    }
    return pending;
  }

  getMiniMarketTexture() {
    return this.loadTexture(MINI_MARKET_TEXTURE);
  }

  load(url) {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = this.fetch(url);
      this.cache.set(url, pending);
      pending.catch(() => {
        this.cache.delete(url);
      });
    }

    return pending.then((gltf) => this.instantiate(gltf));
  }

  fetch(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          if (this.debug) {
            console.log('Loaded asset:', url);
          }
          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error('Failed to load asset:', url, error);
          reject(error);
        }
      );
    });
  }

  instantiate(gltf) {
    return {
      scene: SkeletonUtils.clone(gltf.scene),
      animations: gltf.animations
    };
  }
}
