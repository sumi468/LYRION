/** Strict segment/sphere overlap. A tangent or outward departure from the surface is safe. */
export function segmentIntersectsSphere(start:Readonly<{x:number;y:number;z:number}>,end:Readonly<{x:number;y:number;z:number}>,centre:Readonly<{x:number;y:number;z:number}>,radius:number):boolean {
  const x=start.x-centre.x,y=start.y-centre.y,z=start.z-centre.z;
  const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,lengthSq=dx*dx+dy*dy+dz*dz;
  const t=lengthSq>1e-12?Math.max(0,Math.min(1,-(x*dx+y*dy+z*dz)/lengthSq)):0;
  const px=x+dx*t,py=y+dy*t,pz=z+dz*t,safeRadius=Math.max(0,radius-1e-5);
  return px*px+py*py+pz*pz<safeRadius*safeRadius;
}
