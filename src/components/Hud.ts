import { BLOCKS } from '../game/Block';
import { HOTBAR_TYPES, type Inventory } from '../game/Inventory';

export interface HudEvents {
  onStart: () => void;
  onAction: (action: 'place' | 'remove') => void;
  onSelect: (index: number) => void;
  onJump: () => void;
  onMove: (x: number, y: number) => void;
  onLook: (x: number, y: number) => void;
}

/** DOM overlay kept separate from the renderer so gameplay modules stay UI-agnostic. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly startScreen: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly hotbar: HTMLDivElement;
  private readonly toastNode: HTMLDivElement;
  private readonly targetNode: HTMLDivElement;
  private toastTimeout = 0;
  private lastStatusMarkup = '';
  private lastHotbarMarkup = '';
  private currentTarget = '';

  constructor(private readonly events: HudEvents) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <header class="game-header">
        <div class="brand"><span class="brand-mark">◈</span><span>COZE BLOCK WORLD</span></div>
        <div id="status" class="status"></div>
      </header>
      <div class="target" id="target">对准方块以交互</div>
      <div class="crosshair" aria-hidden="true"></div>
      <div class="help-card"><b>探索提示</b><span>WASD 移动 · 空格跳跃 · Shift 冲刺</span><span>左键放置 · 右键破坏 · R 切换雨天</span></div>
      <div class="toast" id="toast"></div>
      <div class="hotbar" id="hotbar"></div>
      <div class="touch-controls">
        <div class="joystick-shell" id="joystick"><i></i></div>
        <div class="touch-look" id="touch-look"></div>
        <div class="touch-actions">
          <button data-action="remove">破坏</button>
          <button data-action="place">放置</button>
          <button id="jump">跳跃</button>
        </div>
      </div>
      <section class="start-screen" id="start-screen">
        <div class="start-panel">
          <div class="eyebrow">WEBGL · VOXEL SANDBOX</div>
          <h1>COZE 像素方块世界</h1>
          <p>探索随机生成的方块荒野，在出生点前方寻找 COZE 地标。</p>
          <button class="start-button" id="start-button">进入世界</button>
          <small>建议使用桌面端 Chrome、Edge 或手机浏览器横屏体验</small>
        </div>
      </section>`;
    document.querySelector('#app')?.append(this.root);
    this.startScreen = this.root.querySelector<HTMLDivElement>('#start-screen')!;
    this.status = this.root.querySelector<HTMLDivElement>('#status')!;
    this.hotbar = this.root.querySelector<HTMLDivElement>('#hotbar')!;
    this.toastNode = this.root.querySelector<HTMLDivElement>('#toast')!;
    this.targetNode = this.root.querySelector<HTMLDivElement>('#target')!;
    this.bindEvents();
  }

  update(inventory: Inventory, weather: string): void {
    const { health, hunger, experience } = inventory.stats;
    const statusMarkup = `<span>♥ ${health}</span><span>✦ ${hunger}</span><span>◆ ${experience}</span><span class="weather">${weather}</span>`;
    const hotbarMarkup = HOTBAR_TYPES.map((type, index) => {
      const selected = index === inventory.selectedIndex ? ' selected' : '';
      const count = inventory.counts.get(type) ?? 0;
      return `<button class="slot${selected}" data-slot="${index}" title="${BLOCKS[type].label}"><i style="--block:${BLOCKS[type].color}"></i><span>${index + 1}</span><b>${count}</b></button>`;
    }).join('');
    if (statusMarkup !== this.lastStatusMarkup) {
      this.status.innerHTML = statusMarkup;
      this.lastStatusMarkup = statusMarkup;
    }
    if (hotbarMarkup !== this.lastHotbarMarkup) {
      this.hotbar.innerHTML = hotbarMarkup;
      this.lastHotbarMarkup = hotbarMarkup;
    }
  }

  setTarget(label?: string): void {
    const nextTarget = label ?? '';
    if (nextTarget === this.currentTarget) return;
    this.currentTarget = nextTarget;
    this.targetNode.textContent = label ? `▣ ${label}` : '对准方块以交互';
    this.targetNode.classList.toggle('active', Boolean(label));
  }

  setStarted(started: boolean): void {
    this.startScreen.classList.toggle('hidden', started);
  }

  toast(message: string): void {
    window.clearTimeout(this.toastTimeout);
    this.toastNode.textContent = message;
    this.toastNode.classList.add('show');
    this.toastTimeout = window.setTimeout(() => this.toastNode.classList.remove('show'), 1800);
  }

  private bindEvents(): void {
    this.root.querySelector('#start-button')?.addEventListener('click', () => this.events.onStart());
    this.root.addEventListener('click', (event) => {
      const element = event.target as HTMLElement;
      const action = element.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
      if (action === 'place' || action === 'remove') this.events.onAction(action);
      const slot = element.closest<HTMLButtonElement>('[data-slot]')?.dataset.slot;
      if (slot !== undefined) this.events.onSelect(Number(slot));
    });
    this.root.querySelector('#jump')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.events.onJump();
    });
    this.installJoystick();
    this.installTouchLook();
  }

  private installJoystick(): void {
    const joystick = this.root.querySelector<HTMLElement>('#joystick')!;
    const knob = joystick.querySelector<HTMLElement>('i')!;
    let pointerId: number | undefined;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const rect = joystick.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      const length = Math.max(1, Math.hypot(x, y));
      const clampX = x / length;
      const clampY = y / length;
      knob.style.transform = `translate(${clampX * 28}px, ${clampY * 28}px)`;
      this.events.onMove(clampX, clampY);
    };
    joystick.addEventListener('pointerdown', (event) => {
      pointerId = event.pointerId;
      joystick.setPointerCapture(pointerId);
      move(event);
    });
    joystick.addEventListener('pointermove', move);
    const stop = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      knob.style.transform = '';
      this.events.onMove(0, 0);
    };
    joystick.addEventListener('pointerup', stop);
    joystick.addEventListener('pointercancel', stop);
  }

  private installTouchLook(): void {
    const surface = this.root.querySelector<HTMLElement>('#touch-look')!;
    let pointerId: number | undefined;
    let previousX = 0;
    let previousY = 0;
    surface.addEventListener('pointerdown', (event) => {
      pointerId = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      surface.setPointerCapture(pointerId);
    });
    surface.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      this.events.onLook(event.clientX - previousX, event.clientY - previousY);
      previousX = event.clientX;
      previousY = event.clientY;
    });
    const stop = (event: PointerEvent) => {
      if (event.pointerId === pointerId) pointerId = undefined;
    };
    surface.addEventListener('pointerup', stop);
    surface.addEventListener('pointercancel', stop);
  }
}
