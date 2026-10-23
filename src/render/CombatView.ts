import { AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, TetrahedronGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { MAX_BOLTS, MAX_ENEMIES } from '../data/combat';
import type { CombatSystem } from '../systems/combat';
import { mergeParts, sweptPlate } from './modelParts';

const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(1, 1, 1), rotation = new Quaternion(), front = new Vector3(0, 0, -1), direction = new Vector3();
const color = new Color();
const IMPACTS = 12, SPARKS = 10;

/** Bevelled interceptor, batched into armour and dark mechanical components. */
function enemyGeometry(trim: boolean): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  if (!trim) {
    pieces.push(sweptPlate([[-.3, -9], [1.6, -4], [2.4, 2], [1.6, 6], [-1.6, 6], [-2.4, 2], [-1.6, -4]], 1.8, .13));
    for (const side of [-1, 1]) {
      pieces.push(sweptPlate([[side * 1.5, -3.7], [side * 4, -1.5], [side * 10.3, 4.4], [side * 9.6, 5.3], [side * 2, 3.6]], .42, .09).translate(0, -.55, 0));
      pieces.push(new CylinderGeometry(.85, 1.15, 6, 10).rotateX(Math.PI / 2).translate(side * 3.3, -.2, 3));
      pieces.push(sweptPlate([[side * 4.5, .6], [side * 7.8, 3.6], [side * 6.8, 3.5]], .08).translate(0, -.22, 0));
    }
  } else {
    pieces.push(new IcosahedronGeometry(1, 1).scale(.9, .75, 2.2).translate(0, 1.05, -3.3));
    pieces.push(sweptPlate([[-.7, -.9], [.7, -.9], [1.2, 4.6], [-1.2, 4.6]], .14).translate(0, 1.05, 0));
    for (const side of [-1, 1]) {
      pieces.push(new TorusGeometry(1.02, .16, 6, 16).translate(side * 3.3, -.2, 6));
      pieces.push(new CylinderGeometry(.84, .65, .8, 12, 1, true).rotateX(Math.PI / 2).translate(side * 3.3, -.2, 5.8));
      pieces.push(new CylinderGeometry(.16, .24, 3.9, 8).rotateX(Math.PI / 2).translate(side * 2.5, -.65, -3.9));
      pieces.push(sweptPlate([[-1.7, 0], [1.5, 0], [.7, 2.7], [-.6, 2.3]], .16).rotateZ(side * .4).rotateX(Math.PI / 2).translate(side * 1.7, .7, 3.6));
      for (let i = 0; i < 5; i++) pieces.push(new BoxGeometry(.65, .08, .12).translate(side * 3.3, .66, 1.7 + i * .45));
    }
  }
  return mergeParts(pieces);
}

export class CombatView {
  readonly group = new Group();
  private hullGeometry = enemyGeometry(false);
  private trimGeometry = enemyGeometry(true);
  private coreGeometry = mergeParts([-1, 1].map(side => new ConeGeometry(.58, 2.4, 10, 1, true).rotateX(Math.PI / 2).translate(side * 3.3, -.2, 1.2)));
  private boltGeometry = new BoxGeometry(.22, .22, 1);
  private armor = new MeshStandardMaterial({ color: 0xc6ccd0, metalness: .55, roughness: .55 });
  private trimMaterial = new MeshStandardMaterial({ color: 0x1d2b38, metalness: .7, roughness: .32, emissive: 0x172a3a, emissiveIntensity: .2 });
  private red = new MeshBasicMaterial({ color: 0xff6650 });
  private cyan = new MeshBasicMaterial({ color: 0x7df6ff });
  private exhaust = new MeshBasicMaterial({ color: 0xff9b65, transparent: true, opacity: .65, blending: AdditiveBlending, depthWrite: false });
  private explosionGeometry = new IcosahedronGeometry(1, 1);
  private sparkGeometry = new TetrahedronGeometry(1);
  private explosionMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .4, blending: AdditiveBlending, depthWrite: false });
  private enemies = new InstancedMesh(this.hullGeometry, this.armor, MAX_ENEMIES);
  private trim = new InstancedMesh(this.trimGeometry, this.trimMaterial, MAX_ENEMIES);
  private engines = new InstancedMesh(this.coreGeometry, this.exhaust, MAX_ENEMIES);
  private friendly = new InstancedMesh(this.boltGeometry, this.cyan, MAX_BOLTS);
  private hostile = new InstancedMesh(this.boltGeometry, this.red, MAX_BOLTS);
  private explosions = new InstancedMesh(this.explosionGeometry, this.explosionMaterial, IMPACTS);
  private sparks = new InstancedMesh(this.sparkGeometry, this.explosionMaterial, IMPACTS * SPARKS);
  private enemyMeshes = [this.enemies, this.trim, this.engines];
  private effectMeshes = [this.explosions, this.sparks];
  private meshes = [...this.enemyMeshes, this.friendly, this.hostile, ...this.effectMeshes];

  constructor() {
    for (const mesh of this.meshes) { mesh.frustumCulled = false; mesh.count = 0; this.group.add(mesh); }
    for (let i = 0; i < MAX_ENEMIES; i++) this.enemies.setColorAt(i, color.setHex(0x7e8993));
    for (let i = 0; i < IMPACTS; i++) this.explosions.setColorAt(i, color.setHex(0xffc696));
    for (let i = 0; i < IMPACTS * SPARKS; i++) this.sparks.setColorAt(i, color.setHex(0xffc696));
  }

  update(combat: CombatSystem, origin: Vector3): void {
    let n = 0;
    for (const enemy of combat.enemies) if (enemy.active) {
      const size = enemy.role === 'gunship' ? 1.25 : enemy.role === 'interceptor' ? .85 : 1;
      matrix.compose(position.copy(enemy.pos).sub(origin), enemy.quat, scale.setScalar(size));
      this.enemies.setMatrixAt(n, matrix); this.trim.setMatrixAt(n, matrix);
      this.enemies.setColorAt(n, color.setHex(enemy.flash > .1 ? 0xffdfbb : enemy.role === 'gunship' ? 0xa9947c : enemy.role === 'interceptor' ? 0x748da4 : 0x929298));
      // Scale the plume about the nozzle, never about the ship centre.
      position.set(0, 0, 6).applyQuaternion(enemy.quat).multiplyScalar(size).add(enemy.pos).sub(origin);
      matrix.compose(position, enemy.quat, scale.set(size, size, size * (enemy.boosting ? 2.1 : .65)));
      this.engines.setMatrixAt(n++, matrix);
    }
    for (const mesh of this.enemyMeshes) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    if (this.enemies.instanceColor) this.enemies.instanceColor.needsUpdate = true;
    let friendly = 0, hostile = 0;
    for (const bolt of combat.bolts) if (bolt.active) {
      direction.copy(bolt.vel).normalize(); rotation.setFromUnitVectors(front, direction);
      matrix.compose(position.copy(bolt.pos).sub(origin), rotation, scale.set(1, 1, bolt.hostile ? 9 : 16));
      (bolt.hostile ? this.hostile : this.friendly).setMatrixAt(bolt.hostile ? hostile++ : friendly++, matrix);
    }
    this.friendly.count = friendly; this.hostile.count = hostile;
    this.friendly.instanceMatrix.needsUpdate = this.hostile.instanceMatrix.needsUpdate = true;
    let impacts = 0, sparks = 0;
    for (const effect of combat.impacts) if (effect.life > 0) {
      const progress = 1 - effect.life / effect.duration;
      const fade = (1 - progress) * (1 - progress);
      const radius = effect.radius * (.16 + progress * .8);
      matrix.compose(position.copy(effect.pos).sub(origin), rotation.identity(), scale.setScalar(radius));
      this.explosions.setMatrixAt(impacts, matrix);
      this.explosions.setColorAt(impacts++, color.setRGB(1.8 * fade, .85 * fade, .3 * fade));
      for (let i = 0; i < SPARKS; i++) {
        // Fibonacci directions are deterministic, with fixed, bounded particle pools.
        const y = 1 - 2 * (i + .5) / SPARKS, ring = Math.sqrt(1 - y * y), angle = i * 2.399963;
        direction.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
        position.copy(direction).multiplyScalar(effect.radius * progress * 1.8).add(effect.pos).sub(origin);
        rotation.setFromUnitVectors(front, direction);
        const size = Math.max(.02, effect.radius * .045 * (1 - progress));
        matrix.compose(position, rotation, scale.set(size, size, size * (2 + progress * 6)));
        this.sparks.setMatrixAt(sparks, matrix);
        this.sparks.setColorAt(sparks++, color.setRGB(2.8 * fade, 1.4 * fade, .5 * fade));
      }
    }
    this.explosions.count = impacts; this.sparks.count = sparks;
    for (const mesh of this.effectMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const geo of [this.hullGeometry, this.trimGeometry, this.coreGeometry, this.boltGeometry, this.explosionGeometry, this.sparkGeometry]) geo.dispose();
    for (const mat of [this.armor, this.trimMaterial, this.red, this.cyan, this.exhaust, this.explosionMaterial]) mat.dispose();
    this.group.removeFromParent();
  }
}
