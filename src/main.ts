import * as THREE from 'three';
import { Hud } from './components/Hud';
import type { BlockPosition } from './game/Block';
import { EntitySystem } from './game/Entity';
import { Inventory } from './game/Inventory';
import { Player } from './game/Player';
import { Renderer } from './game/Renderer';
import { Weather } from './game/Weather';
import { World } from './game/World';
import './style.css';

class BlockWorldGame {
  private readonly renderer = new Renderer();
  private readonly world = new World();
  private readonly inventory = new Inventory();
  private readonly weather = new Weather(this.renderer.scene);
  private readonly entities = new EntitySystem(this.world);
  private readonly raycaster = new THREE.Raycaster();
  private readonly screenCenter = new THREE.Vector2();
  private readonly clock = new THREE.Clock();
  private readonly player: Player;
  private readonly hud: Hud;
  private started = false;
  private isTouch = window.matchMedia('(pointer: coarse)').matches;
  private statusElapsed = 0;

  constructor() {
    document.querySelector('#app')?.append(this.renderer.renderer.domElement);
    this.renderer.scene.add(this.world, this.entities);
    this.player = new Player(this.renderer.camera, this.renderer.renderer.domElement, this.world, {
      onFallDamage: (amount) => this.damagePlayer(amount, `坠落造成 ${amount} 点伤害`),
      onLockChange: (locked) => {
        if (this.started && !this.isTouch) this.hud.setStarted(locked);
      },
    });
    this.renderer.scene.add(this.player.object);
    this.raycaster.far = 7;
    this.hud = new Hud({
      onStart: () => this.start(),
      onAction: (action) => this.interact(action),
      onSelect: (index) => this.selectSlot(index),
      onJump: () => this.player.jump(),
      onMove: (x, y) => this.player.setMobileMove(x, y),
      onLook: (x, y) => this.player.look(x, y),
    });
    this.bindGameInput();
    this.hud.update(this.inventory, this.weather.label());
    this.loop();
  }

  private start(): void {
    this.started = true;
    if (this.isTouch) {
      this.player.setTouchActive(true);
      this.hud.setStarted(true);
      this.hud.toast('触屏模式已开启：左侧移动，右侧转向');
    } else {
      this.player.requestLock();
    }
  }

  private bindGameInput(): void {
    const canvas = this.renderer.renderer.domElement;
    document.addEventListener('contextmenu', (event) => event.preventDefault(), true);
    canvas.addEventListener('mousedown', (event) => {
      if (!this.started || this.isTouch || !this.player.isActive()) return;
      if (event.button === 0) this.interact('place');
      if (event.button === 2) this.interact('remove');
    });
    window.addEventListener('keydown', (event) => {
      if (!this.started || !this.player.isActive()) return;
      const number = Number(event.key);
      if (number >= 1 && number <= 5) this.selectSlot(number - 1);
      if (event.code === 'KeyR') {
        const raining = this.weather.toggleRain();
        this.hud.toast(raining ? '天空开始下雨了' : '雨停了，天空放晴');
      }
    });
  }

  private selectSlot(index: number): void {
    this.inventory.select(index);
    this.hud.update(this.inventory, this.weather.label());
    this.hud.toast(`已选择：${this.inventory.describe(this.inventory.selectedType)}`);
  }

  private interact(action: 'place' | 'remove'): void {
    if (!this.started) return;
    this.raycaster.setFromCamera(this.screenCenter, this.renderer.camera);
    const hit = this.world.raycast(this.raycaster);
    if (!hit) {
      this.hud.toast('范围内没有可交互的方块');
      return;
    }
    if (action === 'remove') {
      const removed = this.world.removeBlock(hit.position);
      if (removed) {
        this.inventory.add(removed);
        this.renderer.requestShadowUpdate();
        this.hud.toast(`收集了 ${this.inventory.describe(removed)}`);
      } else {
        this.hud.toast('出生点保护区域无法破坏');
      }
    } else {
      if (!this.inventory.useSelected()) {
        this.hud.toast('该方块已经用完');
        return;
      }
      const position = this.placePosition(hit.position, hit.normal);
      if (this.positionIntersectsPlayer(position) || !this.world.placeBlock(position, this.inventory.selectedType)) {
        this.inventory.refundSelected();
        this.hud.toast('这里不能放置方块');
      } else {
        this.renderer.requestShadowUpdate();
        this.hud.toast(`放置了 ${this.inventory.describe(this.inventory.selectedType)}`);
      }
    }
    this.hud.update(this.inventory, this.weather.label());
  }

  private placePosition(position: BlockPosition, normal: THREE.Vector3): BlockPosition {
    return {
      x: position.x + Math.round(normal.x),
      y: position.y + Math.round(normal.y),
      z: position.z + Math.round(normal.z),
    };
  }

  private positionIntersectsPlayer(position: BlockPosition): boolean {
    const playerPosition = this.player.getPosition();
    return (
      Math.abs(position.x - playerPosition.x) < 0.8 &&
      Math.abs(position.z - playerPosition.z) < 0.8 &&
      position.y + 0.5 > playerPosition.y &&
      position.y - 0.5 < playerPosition.y + this.player.height
    );
  }

  private damagePlayer(amount: number, message: string): void {
    this.inventory.damage(amount);
    this.hud.toast(message);
    if (this.inventory.stats.health === 0) {
      this.player.reset();
      this.inventory.stats.health = 100;
      this.inventory.stats.hunger = 100;
      this.hud.toast('生命耗尽，已回到出生点');
    }
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.started && this.player.isActive()) {
      this.player.update(delta);
      this.weather.update(delta, this.player.getPosition());
      this.entities.update(delta, this.player.getPosition(), this.weather.state.isNight, (damage) => {
        this.damagePlayer(damage, `夜行生物造成 ${damage} 点伤害`);
      });
      this.inventory.update(delta);
      this.updateTarget();
      this.statusElapsed += delta;
      if (this.statusElapsed > 0.25) {
        this.hud.update(this.inventory, this.weather.label());
        this.statusElapsed = 0;
      }
    }
    this.renderer.render(delta);
  };

  private updateTarget(): void {
    if (!this.started || !this.player.isActive()) return;
    this.raycaster.setFromCamera(this.screenCenter, this.renderer.camera);
    const hit = this.world.raycast(this.raycaster);
    this.hud.setTarget(hit ? this.inventory.describe(hit.type) : undefined);
  }
}

new BlockWorldGame();
