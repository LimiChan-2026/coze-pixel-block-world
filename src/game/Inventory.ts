import { BLOCKS, BlockType } from './Block';

export const HOTBAR_TYPES = [BlockType.Grass, BlockType.Dirt, BlockType.Stone, BlockType.Sand, BlockType.Wood] as const;

export interface PlayerStats {
  health: number;
  hunger: number;
  experience: number;
}

/** Inventory and a deliberately small survival-stat model for the demo. */
export class Inventory {
  readonly counts = new Map<BlockType, number>();
  readonly stats: PlayerStats = { health: 100, hunger: 100, experience: 0 };
  selectedIndex = 0;
  private hungerTimer = 0;

  constructor() {
    HOTBAR_TYPES.forEach((type) => this.counts.set(type, 18));
    this.counts.set(BlockType.Leaves, 0);
    this.counts.set(BlockType.Coze, 0);
  }

  get selectedType(): BlockType {
    return HOTBAR_TYPES[this.selectedIndex];
  }

  select(index: number): void {
    if (index >= 0 && index < HOTBAR_TYPES.length) this.selectedIndex = index;
  }

  add(type: BlockType, amount = 1): void {
    this.counts.set(type, (this.counts.get(type) ?? 0) + amount);
    this.stats.experience = Math.min(999, this.stats.experience + amount);
  }

  useSelected(): boolean {
    const type = this.selectedType;
    const count = this.counts.get(type) ?? 0;
    if (count <= 0) return false;
    this.counts.set(type, count - 1);
    return true;
  }

  refundSelected(): void {
    const type = this.selectedType;
    this.counts.set(type, (this.counts.get(type) ?? 0) + 1);
  }

  damage(amount: number): void {
    this.stats.health = Math.max(0, this.stats.health - amount);
  }

  update(delta: number): void {
    this.hungerTimer += delta;
    if (this.hungerTimer >= 12) {
      this.hungerTimer = 0;
      this.stats.hunger = Math.max(0, this.stats.hunger - 1);
      if (this.stats.hunger === 0) this.damage(2);
    }
  }

  describe(type: BlockType): string {
    return BLOCKS[type].label;
  }
}
