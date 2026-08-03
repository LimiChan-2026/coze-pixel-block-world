import * as THREE from 'three';
import {
  BLOCKS,
  BlockType,
  blockKey,
  positionFromKey,
  type BlockPosition,
} from './Block';
import { Chunk } from './Chunk';

export interface BlockHit {
  position: BlockPosition;
  normal: THREE.Vector3;
  type: BlockType;
}

interface FaceDefinition {
  direction: readonly [number, number, number];
  vertices: ReadonlyArray<readonly [number, number, number]>;
  shade: number;
}

// Vertices are counter-clockwise when viewed from outside the block.
const FACES: readonly FaceDefinition[] = [
  { direction: [1, 0, 0], shade: 0.84, vertices: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { direction: [-1, 0, 0], shade: 0.72, vertices: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { direction: [0, 1, 0], shade: 1, vertices: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { direction: [0, -1, 0], shade: 0.62, vertices: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { direction: [0, 0, 1], shade: 0.9, vertices: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { direction: [0, 0, -1], shade: 0.78, vertices: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] },
] as const;

const TRIANGLE_VERTICES = [0, 1, 2, 0, 2, 3] as const;

/** Generates voxel terrain and batches only its visible blocks into instanced meshes. */
export class World extends THREE.Group {
  readonly blocks = new Map<string, BlockType>();
  readonly chunks = new Map<string, Chunk>();
  readonly spawn = new THREE.Vector3(0, 4.02, 6);
  readonly size = 28;

  private readonly meshGroup = new THREE.Group();
  private readonly blockMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly workingColor = new THREE.Color();
  private worldMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;

  constructor() {
    super();
    this.name = 'Voxel world';
    this.add(this.meshGroup);
    this.generate();
    this.rebuildMeshes();
  }

  getBlock(x: number, y: number, z: number): BlockType | undefined {
    return this.blocks.get(blockKey(x, y, z));
  }

  hasSolidBlock(x: number, y: number, z: number): boolean {
    const type = this.getBlock(x, y, z);
    return type ? BLOCKS[type].solid : false;
  }

  isSpawnProtected(position: BlockPosition): boolean {
    return Math.abs(position.x) <= 2 && position.z >= 4 && position.z <= 8 && position.y <= 4;
  }

  placeBlock(position: BlockPosition, type: BlockType): boolean {
    if (
      position.y < 0 ||
      position.y > 28 ||
      Math.abs(position.x) > this.size + 4 ||
      Math.abs(position.z) > this.size + 4 ||
      this.hasSolidBlock(position.x, position.y, position.z) ||
      this.isSpawnProtected(position)
    ) {
      return false;
    }
    this.setBlockData(position.x, position.y, position.z, type);
    this.rebuildMeshes();
    return true;
  }

  removeBlock(position: BlockPosition): BlockType | undefined {
    if (this.isSpawnProtected(position)) return undefined;
    const key = blockKey(position.x, position.y, position.z);
    const type = this.blocks.get(key);
    if (!type) return undefined;
    this.blocks.delete(key);
    const chunkKey = `${Math.floor(position.x / 16)},${Math.floor(position.z / 16)}`;
    this.chunks.get(chunkKey)?.delete(position.x, position.y, position.z);
    this.rebuildMeshes();
    return type;
  }

  raycast(raycaster: THREE.Raycaster): BlockHit | undefined {
    const { origin, direction } = raycaster.ray;
    let x = Math.floor(origin.x + 0.5);
    let y = Math.floor(origin.y + 0.5);
    let z = Math.floor(origin.z + 0.5);
    const stepX = Math.sign(direction.x);
    const stepY = Math.sign(direction.y);
    const stepZ = Math.sign(direction.z);
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.x);
    const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.y);
    const deltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.z);
    let maxX = stepX === 0 ? Number.POSITIVE_INFINITY : (x + (stepX > 0 ? 0.5 : -0.5) - origin.x) / direction.x;
    let maxY = stepY === 0 ? Number.POSITIVE_INFINITY : (y + (stepY > 0 ? 0.5 : -0.5) - origin.y) / direction.y;
    let maxZ = stepZ === 0 ? Number.POSITIVE_INFINITY : (z + (stepZ > 0 ? 0.5 : -0.5) - origin.z) / direction.z;
    let distance = 0;
    const normal = new THREE.Vector3();

    // Grid traversal checks at most one voxel per crossed cell instead of every rendered triangle.
    while (distance <= raycaster.far) {
      const type = this.getBlock(x, y, z);
      if (type && distance >= raycaster.near) return { position: { x, y, z }, normal: normal.clone(), type };
      if (maxX <= maxY && maxX <= maxZ) {
        x += stepX;
        distance = maxX;
        maxX += deltaX;
        normal.set(-stepX, 0, 0);
      } else if (maxY <= maxZ) {
        y += stepY;
        distance = maxY;
        maxY += deltaY;
        normal.set(0, -stepY, 0);
      } else {
        z += stepZ;
        distance = maxZ;
        maxZ += deltaZ;
        normal.set(0, 0, -stepZ);
      }
    }
    return undefined;
  }

  getSurfaceHeight(x: number, z: number): number {
    for (let y = 28; y >= 0; y -= 1) {
      if (this.hasSolidBlock(x, y, z)) return y;
    }
    return 0;
  }

  private generate(): void {
    for (let x = -this.size; x <= this.size; x += 1) {
      for (let z = -this.size; z <= this.size; z += 1) {
        const height = this.terrainHeight(x, z);
        for (let y = 0; y <= height; y += 1) {
          const surface = y === height;
          const type = surface
            ? this.isCentralPlaza(x, z)
              ? BlockType.Sand
              : BlockType.Grass
            : y < height - 2
              ? BlockType.Stone
              : BlockType.Dirt;
          this.setGeneratedBlock(x, y, z, type);
        }
      }
    }
    this.addTrees();
    this.addCozeLandmark();
  }

  private terrainHeight(x: number, z: number): number {
    if (this.isCentralPlaza(x, z)) return 3;
    const broad = Math.sin(x * 0.19) * 1.8 + Math.cos(z * 0.17) * 1.5;
    const detail = Math.sin((x + z) * 0.63) * 0.65 + Math.cos((x - z) * 0.41) * 0.5;
    return Math.max(2, Math.min(8, Math.round(5 + broad + detail)));
  }

  private isCentralPlaza(x: number, z: number): boolean {
    return Math.abs(x) <= 13 && z >= -13 && z <= 11;
  }

  private setGeneratedBlock(x: number, y: number, z: number, type: BlockType): void {
    this.setBlockData(x, y, z, type);
  }

  private setBlockData(x: number, y: number, z: number, type: BlockType): void {
    this.blocks.set(blockKey(x, y, z), type);
    const chunkX = Math.floor(x / 16);
    const chunkZ = Math.floor(z / 16);
    const chunkKey = `${chunkX},${chunkZ}`;
    let chunk = this.chunks.get(chunkKey);
    if (!chunk) {
      chunk = new Chunk(chunkX, chunkZ);
      this.chunks.set(chunkKey, chunk);
    }
    chunk.set(x, y, z, type);
  }

  private addTrees(): void {
    for (let x = -25; x <= 25; x += 5) {
      for (let z = -25; z <= 25; z += 5) {
        if (this.isCentralPlaza(x, z) || this.hash(x, z) < 0.5) continue;
        const ground = this.getSurfaceHeight(x, z);
        for (let y = 1; y <= 3; y += 1) this.setGeneratedBlock(x, ground + y, z, BlockType.Wood);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            for (let dy = 3; dy <= 4; dy += 1) {
              if (Math.abs(dx) + Math.abs(dz) === 2 && dy === 4) continue;
              this.setGeneratedBlock(x + dx, ground + dy, z + dz, BlockType.Leaves);
            }
          }
        }
      }
    }
  }

  private addCozeLandmark(): void {
    const letters = [
      ['1111', '1...', '1...', '1...', '1111'],
      ['.11.', '1..1', '1..1', '1..1', '.11.'],
      ['1111', '...1', '..1.', '.1..', '1111'],
      ['1111', '1...', '111.', '1...', '1111'],
    ];
    const startX = -10;
    const baseY = 4;
    const wallZ = -10;
    letters.forEach((rows, letterIndex) => {
      rows.forEach((row, rowIndex) => {
        [...row].forEach((pixel, columnIndex) => {
          if (pixel !== '1') return;
          const type = rowIndex % 2 === 0 ? BlockType.Coze : BlockType.Leaves;
          this.setGeneratedBlock(startX + letterIndex * 5 + columnIndex, baseY + 4 - rowIndex, wallZ, type);
        });
      });
    });
  }

  private rebuildMeshes(): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    this.blocks.forEach((type, key) => {
      const position = positionFromKey(key);
      FACES.forEach((face) => {
        const [normalX, normalY, normalZ] = face.direction;
        if (this.hasSolidBlock(position.x + normalX, position.y + normalY, position.z + normalZ)) return;
        this.workingColor.setHex(BLOCKS[type].color).multiplyScalar(face.shade);
        TRIANGLE_VERTICES.forEach((vertexIndex) => {
          const vertex = face.vertices[vertexIndex];
          positions.push(position.x + vertex[0], position.y + vertex[1], position.z + vertex[2]);
          normals.push(normalX, normalY, normalZ);
          colors.push(this.workingColor.r, this.workingColor.g, this.workingColor.b);
        });
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.blockMaterial);
    mesh.name = 'Visible voxel faces';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Swap the completed mesh atomically and keep the compiled material alive.
    const previousMesh = this.worldMesh;
    this.meshGroup.add(mesh);
    this.worldMesh = mesh;
    if (previousMesh) {
      this.meshGroup.remove(previousMesh);
      previousMesh.geometry.dispose();
    }
  }

  private hash(x: number, z: number): number {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return value - Math.floor(value);
  }
}
