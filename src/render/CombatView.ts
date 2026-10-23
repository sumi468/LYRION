import { AdditiveBlending, BoxGeometry, Color, ConeGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { MAX_BOLTS, MAX_ENEMIES } from '../data/combat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CombatSystem } from '../systems/combat';

const matrix=new Matrix4(),position=new Vector3(),scale=new Vector3(1,1,1),rotation=new Quaternion(),front=new Vector3(0,0,-1),direction=new Vector3();
const color=new Color();
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
  private armor=new MeshStandardMaterial({color:0xb0b8c5,metalness:.7,roughness:.45,emissive:0x310d10,emissiveIntensity:.35});
  private red=new MeshBasicMaterial({color:0xff4b47});
  private cyan=new MeshBasicMaterial({color:0x7df6ff});
  private explosionGeometry=new IcosahedronGeometry(1,1);
  private explosionMaterial=new MeshBasicMaterial({color:0xffae70,wireframe:true,transparent:true,opacity:.7,blending:AdditiveBlending,depthWrite:false});
  private enemies=new InstancedMesh(this.hullGeometry,this.armor,MAX_ENEMIES);
  private engines=new InstancedMesh(this.coreGeometry,this.red,MAX_ENEMIES);
  private friendly=new InstancedMesh(this.boltGeometry,this.cyan,MAX_BOLTS);
  private hostile=new InstancedMesh(this.boltGeometry,this.red,MAX_BOLTS);
  private explosions=new InstancedMesh(this.explosionGeometry,this.explosionMaterial,12);
  constructor(){
    for(const mesh of [this.enemies,this.engines,this.friendly,this.hostile,this.explosions]){mesh.frustumCulled=false;mesh.count=0;this.group.add(mesh);}
    for(let i=0;i<MAX_ENEMIES;i++)this.enemies.setColorAt(i,color.setHex(0x596472));
  }
  update(combat:CombatSystem,origin:Vector3):void {
    let n=0;
    for(const enemy of combat.enemies)if(enemy.active){
      const size=enemy.role==='gunship'?1.25:enemy.role==='interceptor'?.85:1;
      matrix.compose(position.copy(enemy.pos).sub(origin),enemy.quat,scale.setScalar(size));
      this.enemies.setMatrixAt(n,matrix);
      this.enemies.setColorAt(n,color.setHex(enemy.flash>.1?0xffd0aa:enemy.role==='gunship'?0x857564:enemy.role==='interceptor'?0x536e86:0x676573));
      matrix.compose(position.copy(enemy.pos).sub(origin),enemy.quat,scale.set(size,size,enemy.boosting?size*3:size));this.engines.setMatrixAt(n,matrix);n++;
    }
    this.enemies.count=this.engines.count=n;this.enemies.instanceMatrix.needsUpdate=this.engines.instanceMatrix.needsUpdate=true;
    if(this.enemies.instanceColor)this.enemies.instanceColor.needsUpdate=true;
    let friendly=0,hostile=0;
    for(const bolt of combat.bolts)if(bolt.active){
      direction.copy(bolt.vel).normalize();rotation.setFromUnitVectors(front,direction);
      matrix.compose(position.copy(bolt.pos).sub(origin),rotation,scale.set(1,1,bolt.hostile?9:16));
      (bolt.hostile?this.hostile:this.friendly).setMatrixAt(bolt.hostile?hostile++:friendly++,matrix);
    }
    this.friendly.count=friendly;this.hostile.count=hostile;this.friendly.instanceMatrix.needsUpdate=this.hostile.instanceMatrix.needsUpdate=true;
    let impacts=0;
    for(const effect of combat.impacts)if(effect.life>0){
      const progress=1-effect.life/effect.duration;
      matrix.compose(position.copy(effect.pos).sub(origin),rotation.identity(),scale.setScalar(effect.radius*(.2+progress)*Math.sin(Math.PI*Math.min(.98,progress+.02))));
      this.explosions.setMatrixAt(impacts++,matrix);
    }
    this.explosions.count=impacts;this.explosions.instanceMatrix.needsUpdate=true;
  }
  dispose():void {for(const mesh of [this.enemies,this.engines,this.friendly,this.hostile,this.explosions])mesh.dispose();for(const geo of [this.hullGeometry,this.coreGeometry,this.boltGeometry,this.explosionGeometry])geo.dispose();for(const mat of [this.armor,this.red,this.cyan,this.explosionMaterial])mat.dispose();this.group.removeFromParent();}
}
