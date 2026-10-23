import { ExtrudeGeometry, Shape, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake static components into one draw per material; consume all source geometries. */
export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry.clone());
  try {
    const merged = mergeGeometries(flat, false);
    if (!merged) throw new Error('Static model geometry could not be merged');
    return merged;
  } finally {
    for (const geometry of [...parts, ...flat]) geometry.dispose();
  }
}

/** Bevelled plate in the XZ plane. Local Y is up. */
export function sweptPlate(points: [number, number][], thickness: number, bevel = .04): BufferGeometry {
  const outline = new Shape();
  outline.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) outline.lineTo(...points[i]);
  outline.closePath();
  return new ExtrudeGeometry(outline, { depth: thickness, steps: 1, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 })
    .rotateX(Math.PI / 2).translate(0, thickness / 2, 0);
}
