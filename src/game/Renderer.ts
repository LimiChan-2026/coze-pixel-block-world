import * as THREE from 'three';

/** Owns WebGL setup and keeps renderer details out of the game orchestrator. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 180);
  private readonly basePixelRatio: number;
  private resolutionScale = 1;
  private performanceElapsed = 0;
  private performanceFrames = 0;
  private shadowElapsed = 0;

  constructor() {
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    this.basePixelRatio = Math.min(window.devicePixelRatio, mobile ? 1.2 : 1.5);
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.Fog(0x73bced, 35, 82);
    this.scene.background = new THREE.Color(0x73bced);
    window.addEventListener('resize', () => this.resize());
  }

  render(delta: number): void {
    this.updatePerformance(delta);
    this.shadowElapsed += delta;
    if (this.shadowElapsed >= 0.35) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowElapsed = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }

  requestShadowUpdate(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private updatePerformance(delta: number): void {
    this.performanceElapsed += delta;
    this.performanceFrames += 1;
    if (this.performanceElapsed < 2) return;
    const fps = this.performanceFrames / this.performanceElapsed;
    const previousScale = this.resolutionScale;
    if (fps < 45) this.resolutionScale = Math.max(0.65, this.resolutionScale - 0.1);
    else if (fps > 58) this.resolutionScale = Math.min(1, this.resolutionScale + 0.05);
    if (previousScale !== this.resolutionScale) {
      this.renderer.setPixelRatio(this.basePixelRatio * this.resolutionScale);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    this.performanceElapsed = 0;
    this.performanceFrames = 0;
  }
}
