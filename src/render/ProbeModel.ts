import { BoxGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, TorusGeometry, Vector2, type BufferGeometry, type Material } from 'three';
import { mergeParts } from './modelParts';

/** Four static material batches: pressure bus, thermal blanket, structure and solar cells. */
export class ProbeModel {
  readonly group = new Group();
  private geometries: BufferGeometry[] = [];
  private materials: Material[] = [];

  constructor() {
    const shell = new MeshStandardMaterial({ color: 0xa8b1ba, metalness: .65, roughness: .46, side: DoubleSide });
    const foil = new MeshStandardMaterial({ color: 0x9d8051, metalness: .75, roughness: .58 });
    const frame = new MeshStandardMaterial({ color: 0x29333d, metalness: .7, roughness: .55 });
    const solar = new MeshStandardMaterial({ color: 0x163354, metalness: .5, roughness: .28, emissive: 0x0b1830, emissiveIntensity: .25 });
    this.materials.push(shell, foil, frame, solar);
    const parts = new Map<Material, BufferGeometry[]>();
    const add = (geometry: BufferGeometry, material: Material) => {
      const batch = parts.get(material) ?? []; batch.push(geometry); parts.set(material, batch);
    };
    add(new CylinderGeometry(1, 1, 2.3, 8).rotateX(Math.PI / 2), foil);
    add(new BoxGeometry(1.55, 1.35, .16).translate(0, 0, -1.2), shell);
    add(new BoxGeometry(1.55, 1.35, .12).translate(0, 0, 1.2), frame);
    for (const x of [-.7, .7]) add(new BoxGeometry(.1, 1.5, 2.3).translate(x, 0, 0), frame);
    for (let i = 0; i < 7; i++) add(new BoxGeometry(.9, .035, .065).translate(0, -.45 + i * .14, 1.29), shell);
    // Curved high-gain dish, feed horn and three support struts.
    const profile = [new Vector2(.08, 0), new Vector2(.35, .03), new Vector2(.75, .17), new Vector2(1.1, .36), new Vector2(1.3, .55)];
    add(new LatheGeometry(profile, 24).rotateX(-Math.PI / 2).translate(0, .7, -1.55), shell);
    add(new TorusGeometry(1.3, .025, 5, 24).translate(0, .7, -2.1), frame);
    add(new CylinderGeometry(.035, .045, .85, 6).rotateX(Math.PI / 2).translate(0, .7, -1.97), frame);
    add(new CylinderGeometry(.09, .04, .22, 8).rotateX(Math.PI / 2).translate(0, .7, -2.44), foil);
    for (const side of [-1, 1]) {
      add(new CylinderGeometry(.06, .06, 3, 8).rotateZ(Math.PI / 2).translate(side * 2, 0, 0), frame);
      add(new BoxGeometry(3.7, .13, 1.65).translate(side * 3.4, 0, 0), shell);
      add(new BoxGeometry(3.5, .035, 1.5).translate(side * 3.4, .085, 0), solar);
      for (let i = 0; i <= 8; i++) add(new BoxGeometry(.018, .012, 1.5).translate(side * 3.4 - 1.72 + i * .43, .11, 0), shell);
      for (const z of [-.5, 0, .5]) add(new BoxGeometry(3.5, .012, .015).translate(side * 3.4, .11, z), shell);
      add(new CylinderGeometry(.18, .24, .32, 8).rotateZ(Math.PI / 2).translate(side * 1.5, 0, 0), foil);
      add(new CylinderGeometry(.08, .16, .35, 10).rotateZ(side * Math.PI / 2).translate(side * .95, -.45, .8), frame);
      add(new CylinderGeometry(.025, .025, 3.3, 6).rotateZ(-side * .5).translate(side * 1.4, 1.8, 1), shell);
    }
    add(new CylinderGeometry(.04, .08, 1.8, 8).translate(0, 1.6, .8), frame);
    add(new BoxGeometry(.65, .42, .65).translate(0, 2.6, .8), foil);
    add(new CylinderGeometry(.22, .22, .08, 12).rotateX(Math.PI / 2).translate(0, 2.6, .44), solar);
    for (const [material, geometries] of parts) {
      const geometry = mergeParts(geometries); this.geometries.push(geometry);
      this.group.add(new Mesh(geometry, material));
    }
    this.group.name = 'WAYFARER-3 deep space probe';
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.group.removeFromParent();
  }
}
