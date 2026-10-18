import * as THREE from 'three';

function readLook(config, phase) {
  const source = phase === 'night' ? config.night : config.day;
  return {
    background: new THREE.Color(source.background),
    hemisphereSky: new THREE.Color(source.hemisphereSky),
    hemisphereGround: new THREE.Color(source.hemisphereGround),
    hemisphereIntensity: source.hemisphereIntensity,
    sunColor: new THREE.Color(source.sunColor),
    sunIntensity: source.sunIntensity,
    fillColor: new THREE.Color(source.fillColor),
    fillIntensity: source.fillIntensity
  };
}

export class DayNightLighting {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.transitionSeconds = config.transitionSeconds ?? 1.5;
    this.background = new THREE.Color();
    this.hemisphereSky = new THREE.Color();
    this.hemisphereGround = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.fillColor = new THREE.Color();
    this.hemisphereIntensity = 0;
    this.sunIntensity = 0;
    this.fillIntensity = 0;
    this.target = readLook(config, 'day');

    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.hemisphere.name = 'sky-light';
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.name = 'sun-light';
    this.sun.position.set(8, 6, 5);
    this.fill = new THREE.DirectionalLight(0xffc27a, 0);
    this.fill.name = 'shop-fill';
    this.fill.position.set(0.2, 4.5, 1.2);
    scene.add(this.hemisphere, this.sun, this.fill);
    scene.background = this.background;
    this.apply(1);
  }

  setPhase(phase) {
    this.target = readLook(this.config, phase === 'night' ? 'night' : 'day');
  }

  update(dt) {
    const tau = Math.max(0.25, this.transitionSeconds * 0.45);
    const blend = 1 - Math.exp(-dt / tau);
    this.apply(blend);
  }

  apply(blend) {
    this.background.lerp(this.target.background, blend);
    this.hemisphereSky.lerp(this.target.hemisphereSky, blend);
    this.hemisphereGround.lerp(this.target.hemisphereGround, blend);
    this.sunColor.lerp(this.target.sunColor, blend);
    this.fillColor.lerp(this.target.fillColor, blend);
    this.hemisphereIntensity += (this.target.hemisphereIntensity - this.hemisphereIntensity) * blend;
    this.sunIntensity += (this.target.sunIntensity - this.sunIntensity) * blend;
    this.fillIntensity += (this.target.fillIntensity - this.fillIntensity) * blend;

    this.hemisphere.color.copy(this.hemisphereSky);
    this.hemisphere.groundColor.copy(this.hemisphereGround);
    this.hemisphere.intensity = this.hemisphereIntensity;
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = this.sunIntensity;
    this.fill.color.copy(this.fillColor);
    this.fill.intensity = this.fillIntensity;
    document.body.style.backgroundColor = `#${this.background.getHexString()}`;
  }
}
