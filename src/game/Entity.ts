import * as THREE from 'three';
import type { World } from './World';

interface Creature {
  mesh: THREE.Group;
  direction: THREE.Vector2;
  speed: number;
  hostile: boolean;
  attackCooldown: number;
}

/** A tiny wandering-creature system: sheep roam by day; slimes pursue at night. */
export class EntitySystem extends THREE.Group {
  private readonly creatures: Creature[] = [];

  constructor(private readonly world: World) {
    super();
    this.name = 'Creatures';
    this.spawnCreatures();
  }

  update(delta: number, playerPosition: THREE.Vector3, night: boolean, onAttack: (damage: number) => void): void {
    this.creatures.forEach((creature, index) => {
      creature.attackCooldown = Math.max(0, creature.attackCooldown - delta);
      const position = creature.mesh.position;
      const distance = position.distanceTo(playerPosition);
      if (night && creature.hostile && distance < 12) {
        creature.direction.set(playerPosition.x - position.x, playerPosition.z - position.z).normalize();
      } else if (Math.sin(performance.now() * 0.0008 + index * 9) > 0.994) {
        creature.direction.rotateAround(new THREE.Vector2(), (Math.random() - 0.5) * 1.8);
      }
      const speed = night && creature.hostile ? 1.55 : creature.speed;
      position.x += creature.direction.x * speed * delta;
      position.z += creature.direction.y * speed * delta;
      const limit = this.world.size - 0.5;
      position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
      position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
      const ground = this.world.getSurfaceHeight(Math.round(position.x), Math.round(position.z));
      position.y = ground + 1.05;
      creature.mesh.rotation.y = Math.atan2(-creature.direction.x, -creature.direction.y);
      if (night && creature.hostile && distance < 1.2 && creature.attackCooldown === 0) {
        onAttack(4);
        creature.attackCooldown = 1.3;
      }
    });
  }

  private spawnCreatures(): void {
    const locations = [
      [-17, 15, false],
      [18, -17, false],
      [-21, -16, true],
      [20, 17, true],
    ] as const;
    locations.forEach(([x, z, hostile]) => {
      const creature = this.createCreature(hostile);
      creature.mesh.position.set(x, this.world.getSurfaceHeight(x, z) + 1.05, z);
      this.add(creature.mesh);
      this.creatures.push(creature);
    });
  }

  private createCreature(hostile: boolean): Creature {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.8, 1.25),
      new THREE.MeshLambertMaterial({ color: hostile ? 0x6b48ad : 0xf3f0de }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.65, 0.62),
      new THREE.MeshLambertMaterial({ color: hostile ? 0x8f67d4 : 0xffffff }),
    );
    head.position.set(0, 0.25, -0.67);
    head.castShadow = true;
    group.add(head);
    return {
      mesh: group,
      direction: new THREE.Vector2(Math.random() - 0.5, Math.random() - 0.5).normalize(),
      speed: 0.55 + Math.random() * 0.35,
      hostile,
      attackCooldown: 0,
    };
  }
}
