import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, TorusGeometry, type BufferGeometry, type Material } from 'three';
import { mergeParts, sweptPlate } from './modelParts';

const SUPPORT_POINTS = [[21, 0], [25, 0], [21, 8], [25, 8], [21.5, -5], [21.5, -7], [28, -7], [28, -2]];

/** Six material batches and one support instance batch; no descent-time allocations. */
export class LandingView {
  readonly group = new Group();
  private geos: BufferGeometry[] = [];
  private mats: Material[] = [];
  private supports: InstancedMesh;
  private fittedRadius = 0;
  private supportMatrix = new Matrix4();

  constructor() {
    const deck = new MeshStandardMaterial({ color: 0x34414b, metalness: .55, roughness: .7 });
    const shell = new MeshStandardMaterial({ color: 0xb4bbb8, metalness: .35, roughness: .65 });
    const frame = new MeshStandardMaterial({ color: 0x17232e, metalness: .7, roughness: .5 });
    const paint = new MeshStandardMaterial({ color: 0xcba975, roughness: .85, metalness: .05 });
    const solar = new MeshStandardMaterial({ color: 0x183548, metalness: .5, roughness: .3, emissive: 0x0b1b2e, emissiveIntensity: .3 });
    const light = new MeshBasicMaterial({ color: 0xffd5a0 });
    this.mats.push(deck, shell, frame, paint, solar, light);
    const parts = new Map<Material, BufferGeometry[]>();
    const add = (geometry: BufferGeometry, material: Material) => {
      const batch = parts.get(material) ?? [];
      batch.push(geometry); parts.set(material, batch);
    };
    // Segmented deck, recessed service centre, load-bearing rim and radial seams.
    add(new CylinderGeometry(16, 16.8, .7, 24), deck);
    add(new CylinderGeometry(5.8, 5.8, .04, 12).translate(0, .365, 0), frame);
    add(new RingGeometry(13.7, 14.05, 72).rotateX(-Math.PI / 2).translate(0, .365, 0), paint);
    add(new TorusGeometry(16.1, .18, 5, 48).rotateX(Math.PI / 2).translate(0, -.22, 0), frame);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      add(new BoxGeometry(.045, .025, 9.6).translate(0, .365, 10.8).rotateY(angle), frame);
      add(new BoxGeometry(.6, .035, 1.5).translate(0, .38, 15).rotateY(angle), paint);
      if (i % 2 === 0) {
        add(new CylinderGeometry(.42, .65, 2.6, 6).translate(0, -1.35, 15).rotateY(angle), frame);
        add(new CylinderGeometry(.25, .35, .2, 8).translate(0, .48, 15).rotateY(angle), light);
      }
    }
    for (const x of [-1.4, 1.4]) add(new BoxGeometry(.35, .025, 6).translate(x, .4, 0), paint);
    for (const z of [-3, 3]) add(new BoxGeometry(4, .025, .35).translate(0, .4, z), paint);
    // Protected bridge, pressure habitat, airlock and equipment compartment.
    add(new BoxGeometry(7, .35, 2).translate(18.5, .1, 2), frame);
    for (const z of [1, 3]) {
      add(new BoxGeometry(5, .08, .08).translate(18.5, 1.15, z), shell);
      for (const x of [16, 18.5, 21]) add(new BoxGeometry(.08, 1, .08).translate(x, .65, z), shell);
    }
    add(new CylinderGeometry(2.4, 2.4, 9, 8).rotateX(Math.PI / 2).translate(23, 2, 4), shell);
    add(new BoxGeometry(5.4, .65, 10).translate(23, -.15, 4), frame);
    add(new CylinderGeometry(1.25, 1.25, 3, 12).rotateZ(Math.PI / 2).translate(20.2, 1.5, 2), shell);
    add(new CylinderGeometry(1.05, 1.05, .07, 12).rotateZ(Math.PI / 2).translate(18.67, 1.5, 2), frame);
    add(new BoxGeometry(.05, 1.25, .55).translate(18.61, 1.6, 2), solar);
    add(new BoxGeometry(.05, .07, 1).translate(18.57, 2.6, 2), light);
    for (const z of [0, 2.5, 5.5, 8]) {
      add(new BoxGeometry(.1, .55, .85).translate(20.75, 2.65, z), solar);
      add(new BoxGeometry(4.9, .12, .12).translate(23, 3.8, z), frame);
      add(new BoxGeometry(.14, 3.6, .14).translate(25.35, 1.9, z), frame);
    }
    add(sweptPlate([[-2, -2], [2, -2], [2.3, 1.6], [-2.3, 1.6]], .18).translate(23, 4.1, 4), shell);
    add(new BoxGeometry(3.4, 2.2, 2.8).translate(23, 1.1, 12), deck);
    for (let i = 0; i < 5; i++) add(new BoxGeometry(2.9, .08, .06).translate(23, .5 + i * .3, 13.45), frame);
    // Solar array and fuel cells are recognisable from the approach camera.
    for (const z of [-7, -2]) {
      add(new CylinderGeometry(.12, .18, 3, 8).translate(28, 1.1, z), frame);
      add(new BoxGeometry(5.2, .18, 3.8).rotateZ(.18).translate(28, 2.8, z), shell);
      add(new BoxGeometry(4.9, .08, 3.5).rotateZ(.18).translate(28, 2.92, z), solar);
      for (let i = -2; i <= 2; i++) add(new BoxGeometry(.025, .015, 3.5).translate(i * .8, .07, 0).rotateZ(.18).translate(28, 2.92, z), shell);
    }
    for (const z of [-5, -7]) {
      add(new CylinderGeometry(.7, .7, 2.6, 12).translate(21.5, 1.3, z), shell);
      for (const y of [.3, 2.2]) add(new TorusGeometry(.72, .06, 5, 12).rotateX(Math.PI / 2).translate(21.5, y, z), paint);
    }
    add(new CylinderGeometry(.09, .18, 7, 8).translate(25, 3.5, 9), frame);
    add(new CylinderGeometry(.12, 1.1, .4, 16, 1, true).rotateX(.7).translate(25, 6.7, 9), shell);
    add(new BoxGeometry(.12, .12, .12).translate(25, 7.1, 9), light);
    for (const [material, geometries] of parts) {
      const geometry = mergeParts(geometries);
      this.geos.push(geometry); this.group.add(new Mesh(geometry, material));
    }
    const supportGeometry = new CylinderGeometry(.45, .65, 1, 6);
    this.geos.push(supportGeometry);
    this.supports = new InstancedMesh(supportGeometry, frame, SUPPORT_POINTS.length);
    this.supports.frustumCulled = false;
    this.group.add(this.supports);
    this.fitSurface(160);
    this.group.name = 'LX modular surface outpost';
    this.group.visible = false;
  }

  /** Extend the building foundations to the curved ground, including the smallest moons. */
  fitSurface(radius: number): void {
    if (this.fittedRadius === radius) return;
    this.fittedRadius = radius;
    for (let i = 0; i < SUPPORT_POINTS.length; i++) {
      const [x, z] = SUPPORT_POINTS[i];
      const drop = radius - Math.sqrt(Math.max(0, radius * radius - x * x - z * z));
      const height = drop + .6;
      this.supportMatrix.makeScale(1, height, 1).setPosition(x, -.2 - height / 2, z);
      this.supports.setMatrixAt(i, this.supportMatrix);
    }
    this.supports.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.supports.dispose();
    for (const geometry of this.geos) geometry.dispose();
    for (const material of this.mats) material.dispose();
    this.group.removeFromParent();
  }
}
