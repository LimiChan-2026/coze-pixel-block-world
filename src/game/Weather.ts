import * as THREE from 'three';

export interface WeatherState {
  isNight: boolean;
  isRaining: boolean;
  phase: number;
}

/** Day/night light and a low-cost local rain particle field. */
export class Weather {
  readonly sun = new THREE.DirectionalLight(0xfff0c7, 2.3);
  readonly skyLight = new THREE.HemisphereLight(0x9ad4ff, 0x33442d, 1.7);
  readonly state: WeatherState = { isNight: false, isRaining: false, phase: 0.2 };

  private readonly rain: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly rainPositions: Float32Array;
  private readonly daySky = new THREE.Color(0x73bced);
  private readonly nightSky = new THREE.Color(0x071126);
  private readonly currentSky = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -34;
    this.sun.shadow.camera.right = 34;
    this.sun.shadow.camera.top = 34;
    this.sun.shadow.camera.bottom = -34;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 100;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.skyLight);

    const geometry = new THREE.BufferGeometry();
    const rainDropCount = window.matchMedia('(pointer: coarse)').matches ? 350 : 600;
    this.rainPositions = new Float32Array(rainDropCount * 3);
    for (let index = 0; index < this.rainPositions.length; index += 3) this.resetDrop(index, new THREE.Vector3());
    geometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const material = new THREE.PointsMaterial({ color: 0xb4e4ff, size: 0.075, transparent: true, opacity: 0.72 });
    this.rain = new THREE.Points(geometry, material);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  toggleRain(): boolean {
    this.state.isRaining = !this.state.isRaining;
    this.rain.visible = this.state.isRaining;
    return this.state.isRaining;
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    this.state.phase = (this.state.phase + delta / 150) % 1;
    const angle = this.state.phase * Math.PI * 2 - Math.PI * 0.45;
    const height = Math.sin(angle);
    const daylight = THREE.MathUtils.clamp(height * 1.6 + 0.32, 0.06, 1);
    this.state.isNight = daylight < 0.28;
    this.sun.position.set(Math.cos(angle) * 42, height * 48 + 8, Math.sin(angle) * 35);
    this.sun.intensity = daylight * (this.state.isRaining ? 1.2 : 2.3);
    this.skyLight.intensity = 0.3 + daylight * 1.45;
    this.currentSky.copy(this.nightSky).lerp(this.daySky, daylight);
    if (this.state.isRaining) this.currentSky.multiplyScalar(0.72);
    this.scene.background = this.currentSky;
    if (this.scene.fog) this.scene.fog.color.copy(this.currentSky);
    if (this.state.isRaining) this.updateRain(delta, playerPosition);
  }

  label(): string {
    if (this.state.isRaining) return this.state.isNight ? '夜雨' : '小雨';
    return this.state.isNight ? '夜晚' : '晴天';
  }

  private updateRain(delta: number, playerPosition: THREE.Vector3): void {
    for (let index = 0; index < this.rainPositions.length; index += 3) {
      this.rainPositions[index + 1] -= 18 * delta;
      if (this.rainPositions[index + 1] < playerPosition.y - 2) this.resetDrop(index, playerPosition);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private resetDrop(index: number, origin: THREE.Vector3): void {
    this.rainPositions[index] = origin.x + (Math.random() - 0.5) * 25;
    this.rainPositions[index + 1] = origin.y + 5 + Math.random() * 15;
    this.rainPositions[index + 2] = origin.z + (Math.random() - 0.5) * 25;
  }
}
