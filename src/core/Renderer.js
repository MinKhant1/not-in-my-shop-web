import * as THREE from 'three';
import { GameConfig } from '../config/GameConfig.js';

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = GameConfig.graphics.shadows;
    this.setPixelRatio();
  }

  setPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(ratio);
  }

  resize(width, height) {
    this.setPixelRatio();
    this.renderer.setSize(width, height, false);
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
}
