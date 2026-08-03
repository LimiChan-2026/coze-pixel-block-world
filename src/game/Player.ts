import * as THREE from 'three';
import type { World } from './World';

export interface PlayerEvents {
  onFallDamage: (amount: number) => void;
  onLockChange: (locked: boolean) => void;
}

/** First-person movement plus lightweight voxel AABB collision detection. */
export class Player {
  readonly object = new THREE.Object3D();
  readonly camera: THREE.PerspectiveCamera;
  readonly velocity = new THREE.Vector3();
  readonly eyeHeight = 1.62;
  readonly height = 1.75;
  readonly radius = 0.28;

  private readonly pitch = new THREE.Object3D();
  private readonly keys = new Set<string>();
  private readonly mobileMove = new THREE.Vector2();
  private locked = false;
  private touchActive = false;
  private grounded = false;
  private wantsJump = false;
  private peakY = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    private readonly domElement: HTMLElement,
    private readonly world: World,
    private readonly events: PlayerEvents,
  ) {
    this.camera = camera;
    this.object.add(this.pitch);
    this.pitch.add(camera);
    camera.position.set(0, this.eyeHeight, 0);
    this.object.position.copy(world.spawn);
    this.peakY = this.object.position.y;
    this.installInputHandlers();
  }

  requestLock(): void {
    this.domElement.requestPointerLock();
  }

  setTouchActive(active: boolean): void {
    this.touchActive = active;
  }

  isActive(): boolean {
    return this.locked || this.touchActive;
  }

  reset(): void {
    this.object.position.copy(this.world.spawn);
    this.object.rotation.y = 0;
    this.pitch.rotation.x = 0;
    this.velocity.set(0, 0, 0);
    this.peakY = this.object.position.y;
    this.grounded = false;
    this.wantsJump = false;
    this.keys.clear();
    this.mobileMove.set(0, 0);
  }

  update(delta: number): void {
    if (!this.locked && !this.touchActive) return;

    const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = isSprinting ? 7 : 4.3;
    const keyboardX = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    // Three.js cameras face -Z by default, so forward input must also be -Z.
    const keyboardZ = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    const inputX = THREE.MathUtils.clamp(keyboardX + this.mobileMove.x, -1, 1);
    const inputZ = THREE.MathUtils.clamp(keyboardZ + this.mobileMove.y, -1, 1);
    const movement = new THREE.Vector3(inputX, 0, inputZ);
    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(speed * delta).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.object.rotation.y);
      this.moveAxis('x', movement.x);
      this.moveAxis('z', movement.z);
    }

    if ((this.keys.has('Space') || this.wantsJump) && this.grounded) {
      this.velocity.y = 8.1;
      this.grounded = false;
    }
    this.wantsJump = false;

    this.velocity.y = Math.max(this.velocity.y - 24 * delta, -28);
    this.moveAxis('y', this.velocity.y * delta);
    this.peakY = Math.max(this.peakY, this.object.position.y);

    if (this.object.position.y < -10) {
      this.reset();
    }
  }

  setMobileMove(x: number, y: number): void {
    this.mobileMove.set(x, y);
  }

  jump(): void {
    this.wantsJump = true;
  }

  look(deltaX: number, deltaY: number): void {
    this.object.rotation.y -= deltaX * 0.003;
    this.pitch.rotation.x = THREE.MathUtils.clamp(this.pitch.rotation.x - deltaY * 0.003, -1.45, 1.45);
  }

  getPosition(): THREE.Vector3 {
    return this.object.position;
  }

  private installInputHandlers(): void {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      if (!this.locked) {
        this.keys.clear();
        this.mobileMove.set(0, 0);
      }
      this.events.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (event) => {
      if (this.locked) this.look(event.movementX, event.movementY);
    });
    window.addEventListener('keydown', (event) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number): void {
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.06));
    const increment = amount / steps;
    for (let index = 0; index < steps; index += 1) {
      const candidate = this.object.position.clone();
      candidate[axis] += increment;
      if (this.collides(candidate)) {
        if (axis === 'y') {
          if (increment < 0) {
            const fallDistance = this.peakY - this.object.position.y;
            if (fallDistance > 4.5) this.events.onFallDamage(Math.ceil((fallDistance - 4) * 4));
            this.grounded = true;
          }
          this.velocity.y = 0;
          this.peakY = this.object.position.y;
        }
        return;
      }
      this.object.position.copy(candidate);
    }
    if (axis === 'y' && amount < 0) this.grounded = false;
  }

  private collides(position: THREE.Vector3): boolean {
    const minX = Math.floor(position.x - this.radius + 0.5);
    const maxX = Math.floor(position.x + this.radius + 0.5);
    const minY = Math.floor(position.y + 0.02 + 0.5);
    const maxY = Math.floor(position.y + this.height - 0.02 + 0.5);
    const minZ = Math.floor(position.z - this.radius + 0.5);
    const maxZ = Math.floor(position.z + this.radius + 0.5);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (this.world.hasSolidBlock(x, y, z)) return true;
        }
      }
    }
    return false;
  }
}
