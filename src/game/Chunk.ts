import type { BlockType } from './Block';
import { blockKey } from './Block';

/** A small data-only chunk. Rendering is coordinated by World for fewer draw calls. */
export class Chunk {
  readonly blocks = new Map<string, BlockType>();

  constructor(
    readonly chunkX: number,
    readonly chunkZ: number,
    readonly size = 16,
  ) {}

  set(x: number, y: number, z: number, type: BlockType): void {
    this.blocks.set(blockKey(x, y, z), type);
  }

  delete(x: number, y: number, z: number): boolean {
    return this.blocks.delete(blockKey(x, y, z));
  }
}
