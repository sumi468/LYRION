import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Reusable orbital-surface outpost; no assets are allocated during descent. Local Y is up. */
export class LandingView {
  readonly group=new Group();
  private geos:BufferGeometry[]=[];
  private mats:Material[]=[];
  constructor(){
    const deck=new MeshStandardMaterial({color:0x384550,metalness:.65,roughness:.65});
    const light=new MeshBasicMaterial({color:0xf0b66e});
    const shell=new MeshStandardMaterial({color:0x87989b,metalness:.4,roughness:.65});
    const add=(geometry:BufferGeometry,material:Material)=>{this.geos.push(geometry);this.group.add(new Mesh(geometry,material));};
    this.mats.push(deck,light,shell);
    add(new CylinderGeometry(16,16.8,.7,12),deck);
    add(new RingGeometry(13.7,14.1,48).rotateX(-Math.PI/2).translate(0,.37,0),light);
    const markings=[new BoxGeometry(4,.025,.35).translate(0,.38,3),new BoxGeometry(4,.025,.35).translate(0,.38,-3),new BoxGeometry(.35,.025,6).translate(-1.4,.38,0),new BoxGeometry(.35,.025,6).translate(1.4,.38,0)];
    const containers=[new BoxGeometry(7,3,4).translate(22,1.5,8),new BoxGeometry(6,2.5,4).translate(22,1.25,1)];
    const merged=mergeGeometries(markings)!;for(const geo of markings)geo.dispose();add(merged,light);
    const housing=mergeGeometries(containers)!;for(const geo of containers)geo.dispose();add(housing,shell);
    const posts:BufferGeometry[]=[];
    for(let i=0;i<6;i++){const angle=i*Math.PI/3;posts.push(new BoxGeometry(.4,2,.4).translate(Math.cos(angle)*15,1,Math.sin(angle)*15));}
    const beacons=mergeGeometries(posts)!;for(const geo of posts)geo.dispose();add(beacons,light);
    this.group.visible=false;
  }
  dispose():void {for(const geo of this.geos)geo.dispose();for(const mat of this.mats)mat.dispose();this.group.removeFromParent();}
}
