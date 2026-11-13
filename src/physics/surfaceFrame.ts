import {Matrix4,Quaternion,Vector3} from 'three';
import type {BodyDef} from '../data/types';
import {ReferenceFrame} from './frames';
import {bodyRotation,bodyPointVelocity} from './worldScale';
import {solidHeight} from './terrain';
const normal=new Vector3(),north=new Vector3(),zero=new Vector3(),rotation=new Quaternion(),orientation=new Quaternion(),matrix=new Matrix4(),up=new Vector3(0,1,0);
export function updateSurfaceFrame(body:BodyDef,localNormal:Vector3,time:number,center:Vector3,orbitalVelocity:Vector3,out:ReferenceFrame):void{
 bodyRotation(body,time,rotation);normal.copy(localNormal).applyQuaternion(rotation);
 out.position.copy(center).addScaledVector(normal,body.radius+solidHeight(body,localNormal)+.35);
 north.copy(up).addScaledVector(localNormal,-localNormal.y);if(north.lengthSq()<.01)north.set(1,0,0).addScaledVector(localNormal,-localNormal.x);north.normalize();
 matrix.lookAt(zero,north,localNormal);orientation.setFromRotationMatrix(matrix);out.rotation.copy(rotation).multiply(orientation);
 bodyPointVelocity(body,out.position,center,orbitalVelocity,out.velocity);
 out.angularVelocity.copy(up).applyAxisAngle(zAxis,body.axialTilt).multiplyScalar(Math.PI*2/body.rotationPeriod);
}
const zAxis=new Vector3(0,0,1);
