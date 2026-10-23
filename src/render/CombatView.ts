import { BoxGeometry, ConeGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CombatSystem } from '../systems/combat';

const matrix=new Matrix4(),position=new Vector3(),scale=new Vector3(1,1,1),rotation=new Quaternion(),front=new Vector3(0,0,-1),direction=new Vector3();
function enemyGeometry():BufferGeometry {
  const pieces=[new ConeGeometry(4,18,6).rotateX(-Math.PI/2),new BoxGeometry(22,.8,5).translate(0,-1,3),new BoxGeometry(.8,5,5).translate(0,2,4),
    new BoxGeometry(2,2,7).translate(-4,-.6,2),new BoxGeometry(2,2,7).translate(4,-.6,2),new BoxGeometry(1.1,1.1,4).translate(0,-1,-5)];
  const flat=pieces.map(g=>g.toNonIndexed());const merged=mergeGeometries(flat)!;for(const geo of [...pieces,...flat])geo.dispose();return merged;
}
export class CombatView {
  readonly group=new Group();
  private hullGeometry=enemyGeometry();
  private coreGeometry=new BoxGeometry(9,1.8,.5).translate(0,0,6);
  private boltGeometry=new BoxGeometry(.22,.22,1);
  private armor=new MeshStandardMaterial({color:0x3c414c,metalness:.8,roughness:.4,emissive:0x310d10,emissiveIntensity:.2});
  private red=new MeshBasicMaterial({color:0xff4b47});
  private cyan=new MeshBasicMaterial({color:0x7df6ff});
  private enemies=new InstancedMesh(this.hullGeometry,this.armor,3);
  private engines=new InstancedMesh(this.coreGeometry,this.red,3);
  private friendly=new InstancedMesh(this.boltGeometry,this.cyan,96);
  private hostile=new InstancedMesh(this.boltGeometry,this.red,96);
  constructor(){for(const mesh of [this.enemies,this.engines,this.friendly,this.hostile]){mesh.frustumCulled=false;mesh.count=0;this.group.add(mesh);}}
  update(combat:CombatSystem,origin:Vector3):void {
    let n=0;
    for(const enemy of combat.enemies)if(enemy.active){
      matrix.compose(position.copy(enemy.pos).sub(origin),enemy.quat,scale.setScalar(1));
      this.enemies.setMatrixAt(n,matrix);this.engines.setMatrixAt(n,matrix);n++;
    }
    this.enemies.count=this.engines.count=n;this.enemies.instanceMatrix.needsUpdate=this.engines.instanceMatrix.needsUpdate=true;
    let friendly=0,hostile=0;
    for(const bolt of combat.bolts)if(bolt.active){
      direction.copy(bolt.vel).normalize();rotation.setFromUnitVectors(front,direction);
      matrix.compose(position.copy(bolt.pos).sub(origin),rotation,scale.set(1,1,bolt.hostile?9:16));
      (bolt.hostile?this.hostile:this.friendly).setMatrixAt(bolt.hostile?hostile++:friendly++,matrix);
    }
    this.friendly.count=friendly;this.hostile.count=hostile;this.friendly.instanceMatrix.needsUpdate=this.hostile.instanceMatrix.needsUpdate=true;
  }
  dispose():void {for(const mesh of [this.enemies,this.engines,this.friendly,this.hostile])mesh.dispose();for(const geo of [this.hullGeometry,this.coreGeometry,this.boltGeometry])geo.dispose();for(const mat of [this.armor,this.red,this.cyan])mat.dispose();this.group.removeFromParent();}
}
