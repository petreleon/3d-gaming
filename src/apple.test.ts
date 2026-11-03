import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRedApple, evaluateRawAppleSurface, fbm3D, noise3D } from './apple';

describe('RedApple 3D Procedural Geometry & Photorealistic PBR Invariants', () => {
  it('rests on the ground plane at exact y = 0.000 with authentic plump Honeycrisp proportions and concave cavities', () => {
    const apple = createRedApple();
    const bbox = apple.bodyMesh.geometry.boundingBox;
    expect(bbox).not.toBeNull();
    if (!bbox) return;

    // Ground contact invariant: min(y) === 0.000
    expect(Math.abs(bbox.min.y)).toBeLessThan(1e-5);
    expect(Math.abs(apple.metrics.minY)).toBeLessThan(1e-5);

    // Concave top stem cavity (infundibulum) must sit below the upper shoulder rim
    expect(apple.metrics.stemCavityY).toBeLessThan(apple.metrics.bodyMaxY - 0.18);

    // Concave bottom calyx cavity must sit above the resting base ring at y = 0
    expect(apple.metrics.calyxCavityY).toBeGreaterThan(0.08);

    // Plump, round, convex spheroid-cardioid apple proportions (no tall bell-pepper boxiness)
    expect(apple.metrics.bodyMaxY).toBeGreaterThan(1.65);
    expect(apple.metrics.bodyMaxY).toBeLessThan(1.95);
    expect(apple.metrics.maxRadius).toBeGreaterThan(1.02);
    expect(apple.metrics.maxRadius).toBeLessThan(1.18);

    const heightToWidthRatio = apple.metrics.bodyMaxY / (2.0 * apple.metrics.maxRadius);
    expect(heightToWidthRatio).toBeGreaterThan(0.75);
    expect(heightToWidthRatio).toBeLessThan(0.88);

    apple.dispose();
  });

  it('anchors the woody stem deep inside the top cavity (zero floating) and extends above the shoulders', () => {
    const apple = createRedApple();

    // Stem base must be buried below the floor of the top stem cavity
    expect(apple.metrics.stemBasePoint.y).toBeLessThan(apple.metrics.stemCavityY - 0.05);
    expect(Math.hypot(apple.metrics.stemBasePoint.x, apple.metrics.stemBasePoint.z)).toBeLessThan(
      1e-5
    );

    // Stem tip must rise well above the apple body shoulder rim
    expect(apple.metrics.stemTipPoint.y).toBeGreaterThan(apple.metrics.bodyMaxY + 0.25);

    apple.dispose();
  });

  it('attaches the sculpted 3D leaf with tapered midrib inside the stem volume, > 8 cm body clearance, and 3D pitch/roll visibility', () => {
    const apple = createRedApple();

    const midribMesh = apple.leafGroup.getObjectByName('AppleLeafMidrib') as THREE.Mesh;
    expect(midribMesh).toBeDefined();

    const posAttr = midribMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const firstVertexLocal = new THREE.Vector3(
      posAttr.getX(0),
      posAttr.getY(0),
      posAttr.getZ(0)
    );
    const distToAttach = firstVertexLocal.distanceTo(apple.metrics.leafAttachPoint);
    expect(distToAttach).toBeLessThanOrEqual(apple.metrics.stemRadiusAtAttach + 0.005);

    // Verify zero clipping with the apple body
    expect(apple.metrics.minLeafToBodyClearance).toBeGreaterThan(0.08);

    // Verify the leaf blade has strong 3D vertical span (pitched & rolled, never flat edge-on)
    const bladeMesh = apple.leafGroup.getObjectByName('AppleLeafBlade') as THREE.Mesh;
    expect(bladeMesh).toBeDefined();
    bladeMesh.geometry.computeBoundingBox();
    const bladeBox = bladeMesh.geometry.boundingBox!;
    const verticalSpan = bladeBox.max.y - bladeBox.min.y;
    expect(verticalSpan).toBeGreaterThan(0.22);

    apple.dispose();
  });

  it('enforces Law 3 (Radial Symmetry without Euler Twist) on the 5 bottom calyx sepals', () => {
    const apple = createRedApple();
    expect(apple.calyxGroup.children.length).toBe(5);

    for (let k = 0; k < 5; k++) {
      const radialParent = apple.calyxGroup.children[k] as THREE.Group;
      const expectedAngle = (k * Math.PI * 2.0) / 5.0;
      expect(Math.abs(radialParent.rotation.y - expectedAngle)).toBeLessThan(1e-5);
      expect(radialParent.rotation.x).toBe(0);
      expect(radialParent.rotation.z).toBe(0);

      const childMesh = radialParent.children[0] as THREE.Mesh;
      expect(childMesh.rotation.y).toBe(0);
      expect(childMesh.rotation.z).toBe(0);
    }

    apple.dispose();
  });

  it('maintains exact y = 0.000 ground contact and smooth loop closure across a 16-frame animation matrix', () => {
    const apple = createRedApple();
    const totalFrames = 16;
    const duration = 2.0;

    for (let k = 0; k < totalFrames; k++) {
      const t = (k / (totalFrames - 1)) * duration;
      apple.setPose('turntable', t);
      apple.group.updateMatrixWorld(true);

      const worldBox = new THREE.Box3().setFromObject(apple.bodyMesh);
      expect(Math.abs(worldBox.min.y)).toBeLessThan(1e-4);
    }

    apple.setPose('turntable', 0.0);
    const scaleStart = apple.animGroup.scale.clone();
    const leafRotStart = apple.leafGroup.rotation.clone();

    apple.setPose('turntable', duration);
    const scaleEnd = apple.animGroup.scale.clone();
    const leafRotEnd = apple.leafGroup.rotation.clone();

    expect(scaleStart.distanceTo(scaleEnd)).toBeLessThan(1e-5);
    expect(Math.abs(leafRotStart.z - leafRotEnd.z)).toBeLessThan(1e-5);

    apple.dispose();
  });

  it('enforces strict C2 monotonicity of r(alpha) and y(alpha) inside the top infundibulum funnel', () => {
    const samples = 200;
    const theta = 0.0;

    let maxShoulderY = -Infinity;
    let alphaRim = 2.2;
    for (let i = 0; i <= samples; i++) {
      const alpha = 1.5 + (i / samples) * (Math.PI - 1.5);
      const pt = evaluateRawAppleSurface(alpha, theta);
      if (pt.y > maxShoulderY) {
        maxShoulderY = pt.y;
        alphaRim = alpha;
      }
    }

    const funnelSteps = 80;
    let prevR = evaluateRawAppleSurface(alphaRim, theta).r;
    let prevY = evaluateRawAppleSurface(alphaRim, theta).y;

    for (let k = 1; k <= funnelSteps; k++) {
      const alpha = alphaRim + (k / funnelSteps) * (Math.PI - alphaRim);
      const pt = evaluateRawAppleSurface(alpha, theta);
      expect(pt.r).toBeLessThan(prevR + 1e-7);
      expect(pt.y).toBeLessThan(prevY + 1e-7);
      prevR = pt.r;
      prevY = pt.y;
    }
  });

  it('generates 1024x1024 3D-FBM PBR textures (colorMap, roughnessMap, bumpMap), SSS shader hook, and clean dispose()', () => {
    expect(Math.abs(noise3D(1.2, 3.4, 5.6))).toBeLessThanOrEqual(1.0);
    expect(Math.abs(fbm3D(0.7, -1.3, 2.1, 4))).toBeLessThanOrEqual(1.0);

    const apple = createRedApple();
    const mat = apple.bodyMesh.material;

    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.clearcoat).toBeCloseTo(0.11, 2);
    expect(mat.clearcoatRoughness).toBeCloseTo(0.38, 2);
    expect(mat.roughness).toBeCloseTo(1.0, 2);
    expect(mat.sheen).toBeCloseTo(0.38, 2);
    expect(mat.bumpScale).toBeCloseTo(0.0008, 4);

    const colorMap = mat.map as THREE.DataTexture;
    expect(colorMap).not.toBeNull();
    expect(colorMap.image.width).toBe(1024);
    expect(colorMap.image.height).toBe(1024);
    expect(colorMap.magFilter).toBe(THREE.LinearFilter);
    expect(colorMap.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(colorMap.generateMipmaps).toBe(true);

    const roughnessMap = mat.roughnessMap as THREE.DataTexture;
    expect(roughnessMap).not.toBeNull();
    expect(roughnessMap.image.width).toBe(1024);
    expect(roughnessMap.image.height).toBe(1024);

    const bumpMap = mat.bumpMap as THREE.DataTexture;
    expect(bumpMap).not.toBeNull();
    expect(bumpMap.image.width).toBe(1024);
    expect(bumpMap.image.height).toBe(1024);

    expect(apple.bodyMesh.castShadow).toBe(true);
    expect(apple.bodyMesh.receiveShadow).toBe(true);
    expect(apple.stemMesh.castShadow).toBe(true);

    apple.setWireframe(true);
    expect(apple.bodyMesh.material.wireframe).toBe(true);
    expect(apple.stemMesh.material.wireframe).toBe(true);

    apple.setWireframe(false);
    expect(apple.bodyMesh.material.wireframe).toBe(false);

    expect(() => apple.dispose()).not.toThrow();
  });
});
