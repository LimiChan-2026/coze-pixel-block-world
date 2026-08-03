export const BlockType = {
  Grass: 'grass',
  Dirt: 'dirt',
  Stone: 'stone',
  Sand: 'sand',
  Wood: 'wood',
  Leaves: 'leaves',
  Coze: 'coze',
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

export interface BlockDefinition {
  color: number;
  label: string;
  solid: boolean;
}

export const BLOCKS: Record<BlockType, BlockDefinition> = {
  [BlockType.Grass]: { color: 0x5cae4b, label: '草方块', solid: true },
  [BlockType.Dirt]: { color: 0x895a36, label: '泥土', solid: true },
  [BlockType.Stone]: { color: 0x80858c, label: '石头', solid: true },
  [BlockType.Sand]: { color: 0xe5c56d, label: '沙子', solid: true },
  [BlockType.Wood]: { color: 0x7a4c27, label: '木头', solid: true },
  [BlockType.Leaves]: { color: 0x2f8247, label: '树叶', solid: true },
  [BlockType.Coze]: { color: 0x57dcff, label: 'COZE 方块', solid: true },
};

export interface BlockPosition {
  x: number;
  y: number;
  z: number;
}

export function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function blockKeyFromPosition(position: BlockPosition): string {
  return blockKey(position.x, position.y, position.z);
}

export function positionFromKey(key: string): BlockPosition {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}
