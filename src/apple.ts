import * as THREE from 'three';

export interface RedAppleMetrics {
  /** Minimum Y coordinate of the apple body in world/local space (must be 0.0) */
  minY: number;
  /** Maximum Y coordinate of the apple body shoulder rim */
  bodyMaxY: number;
  /** Maximum Y coordinate of the entire apple assembly (including stem) */
  totalMaxY: number;
  /** Maximum equatorial radius of the apple body */
  maxRadius: number;
  /** Exact Y height of the top stem cavity center (infundibulum floor) */
  stemCavityY: number;
  /** Exact Y height of the bottom calyx cavity center */
  calyxCavityY: number;
  /** Stem start point (buried below stemCavityY) */
  stemBasePoint: THREE.Vector3;
  /** Stem tip point */
  stemTipPoint: THREE.Vector3;
  /** Exact point on stem centerline where the leaf petiole attaches */
  leafAttachPoint: THREE.Vector3;
  /** Radius of the stem at the leaf attachment point */
  stemRadiusAtAttach: number;
  /** Minimum clearance distance between any leaf blade vertex and the apple body */
  minLeafToBodyClearance: number;
}

export interface RedAppleInstance {
  /** Root group anchored with bottom resting ring at y = 0 */
  group: THREE.Group;
  /** Pivot group used for animation (turntable rotation, gentle organic sway) */
  animGroup: THREE.Group;
  /** Sculpted C1 parametric apple body mesh */
  bodyMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  /** Woody curved stem mesh */
  stemMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  /** Group containing the sculpted 3D leaf blade and midrib/petiole veins */
  leafGroup: THREE.Group;
  /** Group containing the 5 radial calyx sepals at the bottom basin */
  calyxGroup: THREE.Group;
  /** Mathematical metrics for deterministic verification */
  metrics: RedAppleMetrics;
  /** Deterministic animation update function for time t (seconds) and action */
  setPose: (action: string, t: number) => void;
  /** Toggle wireframe mode across all apple materials for topology auditing */
  setWireframe: (enabled: boolean) => void;
  /** Release all GPU geometries, materials, and textures */
  dispose: () => void;
}

/**
 * Deterministic 3D Gradient/Value Noise with Quintic C2 Interpolation (6t^5 - 15t^4 + 10t^3)
 * and 3D Fractal Brownian Motion (FBM) + Domain Warping.
 * Evaluated directly on 3D Cartesian coordinates (X, Y, Z) so textures have zero UV seams
 * at theta = 0/2*PI, zero polar pinch rays in top view, and zero synthetic sin(N*theta) stripes.
 */
const PERM = new Uint8Array(512);
const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
  [1, 1, 0],
  [0, -1, 1],
  [-1, 1, 0],
  [0, -1, -1],
];

(function initPermutationTable() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 13374209;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
  }
})();

function fadeQuintic(t: number): number {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function gradDot(hash: number, x: number, y: number, z: number): number {
  const g = GRAD3[hash & 15];
  return g[0] * x + g[1] * y + g[2] * z;
}

/**
 * Continuous 3D Perlin/Gradient noise in [-1, 1] with quintic C2 interpolation.
 */
export function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const fz = z - Math.floor(z);

  const u = fadeQuintic(fx);
  const v = fadeQuintic(fy);
  const w = fadeQuintic(fz);

  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;

  return lerp(
    lerp(
      lerp(gradDot(PERM[AA], fx, fy, fz), gradDot(PERM[BA], fx - 1, fy, fz), u),
      lerp(gradDot(PERM[AB], fx, fy - 1, fz), gradDot(PERM[BB], fx - 1, fy - 1, fz), u),
      v
    ),
    lerp(
      lerp(gradDot(PERM[AA + 1], fx, fy, fz - 1), gradDot(PERM[BA + 1], fx - 1, fy, fz - 1), u),
      lerp(
        gradDot(PERM[AB + 1], fx, fy - 1, fz - 1),
        gradDot(PERM[BB + 1], fx - 1, fy - 1, fz - 1),
        u
      ),
      v
    ),
    w
  );
}

/**
 * Multi-octave 3D Fractal Brownian Motion (FBM) normalized to approximately [-1, 1].
 */
export function fbm3D(x: number, y: number, z: number, octaves = 4): number {
  let value = 0.0;
  let amplitude = 0.52;
  let frequency = 1.0;
  let norm = 0.0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
    norm += amplitude;
    frequency *= 2.07;
    amplitude *= 0.49;
  }
  return value / norm;
}

/**
 * Deterministic 3D hash returning [0, 1) for 3D cellular lenticel placement.
 */
function hash3D(ix: number, iy: number, iz: number): number {
  const h = PERM[(ix & 255) + PERM[(iy & 255) + PERM[iz & 255]]];
  return h / 255.0;
}

/**
 * Evaluates 3D jittered cellular distance squared to nearest lenticel center in 3D space.
 */
function cellularLenticel3D(x: number, y: number, z: number, densityThreshold: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  let minDistSq = 10.0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const cellProb = hash3D(cx * 3 + 7, cy * 5 + 13, cz * 7 + 29);
        if (cellProb > densityThreshold) {
          const jx = dx + 0.2 + 0.6 * hash3D(cx + 19, cy + 47, cz + 73) - fx;
          const jy = dy + 0.2 + 0.6 * hash3D(cx + 83, cy + 109, cz + 131) - fy;
          const jz = dz + 0.2 + 0.6 * hash3D(cx + 157, cy + 181, cz + 211) - fz;
          const dSq = jx * jx + jy * jy + jz * jz;
          if (dSq < minDistSq) {
            minDistSq = dSq;
          }
        }
      }
    }
  }
  return minDistSq;
}

/**
 * Evaluates the unshifted parametric apple surface at meridional angle alpha in [0, PI]
 * (0 = bottom calyx center, PI = top stem cavity center) and azimuth theta in [0, 2*PI].
 * Produces a plump, round, convex spheroid-cardioid Honeycrisp/Gala apple silhouette
 * (Height / Width ~ 0.80 - 0.84) with rounded convex shoulders and strict C2 funnel monotonicity.
 */
export function evaluateRawAppleSurface(alpha: number, theta: number): {
  x: number;
  y: number;
  z: number;
  r: number;
} {
  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);
  // uY goes from -1 at bottom pole (alpha=0) to +1 at top pole (alpha=PI)
  const uY = -cosA;

  // Plump, round cardioid-spheroid profile:
  // Full round cheeks at equator, graceful heart-like taper toward bottom,
  // and smooth convex dome rounding inward at top
  const shoulderTaper = 1.0 + 0.015 * uY - 0.155 * uY * uY + 0.025 * uY * uY * uY;

  const poleEnvelope = sinA * sinA * sinA;
  const organicAsymmetry =
    1.0 +
    poleEnvelope *
      (0.014 * Math.cos(5.0 * theta + 0.25) +
        0.010 * Math.cos(2.0 * theta - 0.65) +
        0.007 * Math.sin(3.0 * theta + 0.85) +
        0.006 * Math.cos(theta - 0.4));

  const equatorialRadius = 1.08;
  const r = equatorialRadius * sinA * shoulderTaper * organicAsymmetry;

  // Narrower exponential funnel (wTop = 0.075) so the outer convex dome curves all the way
  // up to uY_crest ~ 0.88 (r_crest ~ 0.41 instead of 0.56!), eliminating the wide flat top bridge!
  const wTop = 0.075;
  const topIndentation = 0.42 * Math.exp(-(1.0 - uY) / wTop);

  // Smooth exponential bottom calyx basin near uY = -1 (alpha = 0)
  const wBot = 0.125;
  const botIndentation = 0.36 * Math.exp(-(1.0 + uY) / wBot);

  // Prominent 5-carpel + bimodal apple crown undulation so the left/right shoulder domes
  // arch gracefully above the central stem cleft from side views
  const rimCrownWave =
    poleEnvelope *
    sinA *
    Math.max(0, uY) *
    (0.026 * Math.cos(5.0 * theta) - 0.022 * Math.cos(2.0 * theta) + 0.014 * Math.sin(theta - 0.35));

  const halfHeight = 1.12;
  const y = uY * halfHeight - topIndentation + botIndentation + rimCrownWave;

  const x = r * Math.cos(theta);
  const z = r * Math.sin(theta);

  return { x, y, z, r };
}

/**
 * Builds the high-resolution C1 parametric BufferGeometry for the apple body,
 * shifted so that min(y) === 0.000 exactly, with seamless periodic normals.
 */
function createAppleBodyGeometry(
  radialSegments = 112,
  meridionalSegments = 112
): {
  geometry: THREE.BufferGeometry;
  yShift: number;
  minY: number;
  bodyMaxY: number;
  maxRadius: number;
  stemCavityY: number;
  calyxCavityY: number;
} {
  const numCols = radialSegments + 1;
  const numRows = meridionalSegments + 1;
  const vertexCount = numCols * numRows;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);

  let rawMinY = Infinity;
  let rawMaxY = -Infinity;
  let maxRadius = 0;

  for (let j = 0; j < numRows; j++) {
    const v = j / meridionalSegments;
    const alpha = v * Math.PI;

    for (let i = 0; i < numCols; i++) {
      const u = i / radialSegments;
      const theta = i === radialSegments ? 0.0 : u * Math.PI * 2.0;

      const pt = evaluateRawAppleSurface(alpha, theta);
      const idx = (j * numCols + i) * 3;
      positions[idx] = pt.x;
      positions[idx + 1] = pt.y;
      positions[idx + 2] = pt.z;

      if (pt.y < rawMinY) rawMinY = pt.y;
      if (pt.y > rawMaxY) rawMaxY = pt.y;
      if (pt.r > maxRadius) maxRadius = pt.r;

      const uvIdx = (j * numCols + i) * 2;
      uvs[uvIdx] = u;
      uvs[uvIdx + 1] = v;

      // Subtle warm vertex color AO shading inside cavities and lower base
      const topCavityShade = v > 0.86 ? Math.min(1, (v - 0.86) / 0.14) : 0;
      const lowerBaseDepth = v < 0.28 ? Math.pow((0.28 - v) / 0.28, 1.35) : 0;
      colors[idx] = 1.0 - 0.12 * topCavityShade - 0.14 * lowerBaseDepth;
      colors[idx + 1] = 1.0 - 0.14 * topCavityShade - 0.22 * lowerBaseDepth;
      colors[idx + 2] = 1.0 - 0.16 * topCavityShade - 0.22 * lowerBaseDepth;
    }
  }

  // Shift all Y coordinates by -rawMinY so the apple rests at exact y = 0.000
  const yShift = -rawMinY;
  for (let k = 0; k < vertexCount; k++) {
    positions[k * 3 + 1] += yShift;
  }

  const bottomPole = evaluateRawAppleSurface(0, 0);
  const topPole = evaluateRawAppleSurface(Math.PI, 0);
  const calyxCavityY = bottomPole.y + yShift;
  const stemCavityY = topPole.y + yShift;
  const bodyMaxY = rawMaxY + yShift;

  const indices: number[] = [];
  for (let j = 0; j < meridionalSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * numCols + i;
      const b = j * numCols + i + 1;
      const c = (j + 1) * numCols + i;
      const d = (j + 1) * numCols + i + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // Unify normals across the periodic seam (i = 0 and i = radialSegments) and poles
  const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const normals = normalAttr.array as Float32Array;

  for (let j = 1; j < meridionalSegments; j++) {
    const idx0 = (j * numCols + 0) * 3;
    const idxN = (j * numCols + radialSegments) * 3;
    const nx = normals[idx0] + normals[idxN];
    const ny = normals[idx0 + 1] + normals[idxN + 1];
    const nz = normals[idx0 + 2] + normals[idxN + 2];
    const len = Math.hypot(nx, ny, nz) || 1.0;
    normals[idx0] = normals[idxN] = nx / len;
    normals[idx0 + 1] = normals[idxN + 1] = ny / len;
    normals[idx0 + 2] = normals[idxN + 2] = nz / len;
  }

  for (let i = 0; i < numCols; i++) {
    const idxBot = i * 3;
    normals[idxBot] = 0;
    normals[idxBot + 1] = -1;
    normals[idxBot + 2] = 0;

    const idxTop = (meridionalSegments * numCols + i) * 3;
    normals[idxTop] = 0;
    normals[idxTop + 1] = 1;
    normals[idxTop + 2] = 0;
  }

  normalAttr.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    yShift,
    minY: 0.0,
    bodyMaxY,
    maxRadius,
    stemCavityY,
    calyxCavityY,
  };
}

let cachedAppleSkinBuffers: {
  width: number;
  height: number;
  colorData: Uint8Array;
  roughnessData: Uint8Array;
  bumpData: Uint8Array;
} | null = null;

/**
 * Generates 1024x1024 photorealistic Honeycrisp/Gala apple skin PBR textures
 * (`colorMap`, `roughnessMap`, `bumpMap`) using 3D FBM + Domain Warping on the unit sphere.
 * Zero `Math.sin(N * theta)` calls — 100% organic, non-periodic mottled blush & lenticels.
 */
function createAppleSkinTextures(): {
  colorMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
} {
  const width = 1024;
  const height = 1024;

  if (!cachedAppleSkinBuffers) {
    const colorData = new Uint8Array(width * height * 4);
    const roughnessData = new Uint8Array(width * height * 4);
    const bumpData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      // v = 0 at bottom calyx, v = 1 at top stem cavity
      const v = y / (height - 1);
      const alpha = v * Math.PI;
      const sinA = Math.sin(alpha);
      const cosA = Math.cos(alpha);
      const uY = -cosA; // -1 at bottom, +1 at top
      const flankEnvelope = sinA * sinA;

      for (let x = 0; x < width; x++) {
        const u = x / width;
        const theta = u * Math.PI * 2.0;

        // 3D Cartesian coordinates on unit sphere (100% seamless across u=0/1 and poles!)
        const sx = sinA * Math.cos(theta);
        const sy = uY;
        const sz = sinA * Math.sin(theta);

        // 1. Large-scale 3D FBM for asymmetric golden-amber Sun-Blush patch
        // Centered on the front-right cheek (sx ~ 0.52, sy ~ -0.06, sz ~ 0.74)
        const dSunX = sx - 0.52;
        const dSunY = sy + 0.06;
        const dSunZ = sz - 0.74;
        const distSun = Math.sqrt(dSunX * dSunX + dSunY * dSunY + dSunZ * dSunZ);
        const macroFbm = fbm3D(sx * 1.65 + 2.3, sy * 1.65 - 1.1, sz * 1.65 + 4.7, 4);
        const secondaryPatch = fbm3D(sx * 2.4 - 3.8, sy * 2.1 + 2.9, sz * 2.4 - 1.5, 3);

        // sunBlush in [0, 1]: warm honey-gold / apricot cheek (~30% of surface)
        const rawBlush = 1.05 - distSun * 0.82 + macroFbm * 0.42 + secondaryPatch * 0.22;
        const sunBlush = Math.max(0.0, Math.min(1.0, rawBlush)) * Math.pow(sinA, 0.55);

        // 2. Anisotropic 3D Domain-Warped FBM for organic broken blush flecks & mottling
        // Stretched vertically in 3D space (lower frequency along Y, higher along X/Z)
        const ax = sx * 4.4;
        const ay = sy * 1.15;
        const az = sz * 4.4;

        const warpX = ax + 0.82 * fbm3D(ax + 1.7, ay + 9.2, az + 3.4, 3);
        const warpY = ay + 0.45 * fbm3D(ax + 8.3, ay + 2.8, az + 5.1, 3);
        const warpZ = az + 0.82 * fbm3D(ax + 4.9, ay + 6.1, az + 1.2, 3);

        const fleckFbm1 = fbm3D(warpX, warpY, warpZ, 4);
        const fleckFbm2 = fbm3D(warpX * 2.35 + 5.2, warpY * 1.35 - 3.1, warpZ * 2.35 + 2.7, 3);
        const organicMottle = (0.62 * fleckFbm1 + 0.38 * fleckFbm2) * flankEnvelope;

        // Combine sun-blush and organic mottled flecks into pigment factor:
        // pigment = 0 -> golden-amber sun-blush (#f2b84b / #e8722e)
        // pigment = 0.5 -> vibrant scarlet-crimson (#d9241c / #b51218)
        // pigment = 1.0 -> deep ruby-burgundy (#7c0a13 / #590710)
        const basePigment =
          0.66 - 0.54 * Math.pow(sunBlush, 1.15) + 0.28 * organicMottle - 0.14 * macroFbm;
        const pigment = Math.max(0.0, Math.min(1.0, basePigment));

        // 3-stop photorealistic color ramp:
        // Stop 0 (p=0.0): Golden-Amber Honeycrisp Blush (244, 184, 74)
        // Stop 1 (p=0.35): Warm Apricot-Scarlet Transition (230, 86, 36)
        // Stop 2 (p=0.68): Luscious Scarlet-Crimson (196, 18, 24)
        // Stop 3 (p=1.0): Deep Ruby-Burgundy (96, 8, 16)
        let r = 0.0;
        let g = 0.0;
        let b = 0.0;
        if (pigment < 0.35) {
          const t = pigment / 0.35;
          r = lerp(244, 230, t);
          g = lerp(184, 86, t);
          b = lerp(74, 36, t);
        } else if (pigment < 0.70) {
          const t = (pigment - 0.35) / 0.35;
          r = lerp(230, 194, t);
          g = lerp(86, 17, t);
          b = lerp(36, 23, t);
        } else {
          const t = (pigment - 0.70) / 0.30;
          r = lerp(194, 92, t);
          g = lerp(17, 7, t);
          b = lerp(23, 15, t);
        }

        // Subtle natural shading toward lower base
        const lowerShade = v < 0.26 ? Math.pow((0.26 - v) / 0.26, 1.3) : 0.0;
        r *= 1.0 - 0.18 * lowerShade;
        g *= 1.0 - 0.22 * lowerShade;
        b *= 1.0 - 0.20 * lowerShade;

        // 3. Natural stem-cavity russeting / olive-ochre transition (v > 0.80)
        // Modulated by 3D FBM so the russet boundary is irregular and botanical
        const russetBoundary = 0.81 + 0.035 * macroFbm + 0.02 * fleckFbm1;
        let topCavityFactor = 0.0;
        if (v > russetBoundary) {
          topCavityFactor = Math.min(1.0, Math.pow((v - russetBoundary) / (1.0 - russetBoundary), 1.35));
          // Olive-gold / cinnamon russet (#968246 -> #5c4622 deep inside stem pit)
          const deepPit = v > 0.92 ? (v - 0.92) / 0.08 : 0.0;
          const russetR = lerp(154, 88, deepPit) + 12 * fleckFbm2;
          const russetG = lerp(130, 68, deepPit) + 10 * fleckFbm2;
          const russetB = lerp(68, 34, deepPit) + 6 * fleckFbm2;
          r = lerp(r, russetR, topCavityFactor * 0.88);
          g = lerp(g, russetG, topCavityFactor * 0.88);
          b = lerp(b, russetB, topCavityFactor * 0.88);
        }

        // 4. Natural bottom calyx basin russeting (v < 0.11)
        const botBoundary = 0.11 + 0.02 * macroFbm;
        let botCavityFactor = 0.0;
        if (v < botBoundary) {
          botCavityFactor = Math.min(1.0, Math.pow((botBoundary - v) / botBoundary, 1.4));
          r = lerp(r, 92, botCavityFactor * 0.82);
          g = lerp(g, 58, botCavityFactor * 0.82);
          b = lerp(b, 34, botCavityFactor * 0.82);
        }

        // 5. Two-scale 3D Organic Lenticels (Cream-Gold speckles #f7dfa8)
        let lenticelMask = 0.0;
        if (v > 0.08 && v < 0.92) {
          // Slightly denser toward upper half of apple
          const thresh1 = 0.72 - 0.10 * Math.max(0, uY);
          const dSq1 = cellularLenticel3D(sx * 16.0, sy * 16.0, sz * 16.0, thresh1);
          if (dSq1 < 0.042) {
            lenticelMask = Math.max(lenticelMask, Math.exp(-dSq1 / 0.011));
          }
          const dSq2 = cellularLenticel3D(sx * 31.0 + 11.3, sy * 31.0 - 7.1, sz * 31.0 + 5.9, 0.76);
          if (dSq2 < 0.036) {
            lenticelMask = Math.max(lenticelMask, 0.72 * Math.exp(-dSq2 / 0.009));
          }
        }

        if (lenticelMask > 0.01) {
          const blend = lenticelMask * 0.58;
          r = lerp(r, 247, blend);
          g = lerp(g, 220, blend);
          b = lerp(b, 162, blend);
        }

        // 6. Roughness Map (1024x1024):
        // - Flanks: 0.22 .. 0.34 modulated by 3D FBM
        // - Lenticels: 0.48
        // - Upper shoulder & stem cavity (v > 0.56): ramps smoothly to 0.86
        //   to eliminate any white specular ring in top view!
        const microGrain = noise3D(sx * 28.0, sy * 28.0, sz * 28.0);
        let roughnessVal = 0.27 + 0.045 * macroFbm + 0.03 * microGrain;
        if (v > 0.56) {
          const tShoulder = Math.min(1.0, (v - 0.56) / 0.34);
          const matteCavity = tShoulder * tShoulder * (3.0 - 2.0 * tShoulder);
          roughnessVal = lerp(roughnessVal, 0.86, matteCavity);
        }
        if (v < 0.16) {
          const tBase = (0.16 - v) / 0.16;
          roughnessVal = lerp(roughnessVal, 0.58, tBase * tBase);
        }
        roughnessVal = lerp(roughnessVal, 0.48, lenticelMask);

        // 7. Bump Map (1024x1024):
        // Zero vertical stripes! Only isotropic 3D micro-pebble + subtle lenticel dimples
        const finePebble =
          0.6 * noise3D(sx * 36.0, sy * 36.0, sz * 36.0) +
          0.4 * noise3D(sx * 72.0, sy * 72.0, sz * 72.0);
        const bumpHeight = 128 + finePebble * 14.0 - lenticelMask * 22.0;

        const idx = (y * width + x) * 4;
        colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
        colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        colorData[idx + 3] = 255;

        const rByte = Math.max(0, Math.min(255, Math.round(roughnessVal * 255.0)));
        roughnessData[idx] = rByte;
        roughnessData[idx + 1] = rByte;
        roughnessData[idx + 2] = rByte;
        roughnessData[idx + 3] = 255;

        const bByte = Math.max(0, Math.min(255, Math.round(bumpHeight)));
        bumpData[idx] = bByte;
        bumpData[idx + 1] = bByte;
        bumpData[idx + 2] = bByte;
        bumpData[idx + 3] = 255;
      }
    }

    cachedAppleSkinBuffers = { width, height, colorData, roughnessData, bumpData };
  }

  const { colorData, roughnessData, bumpData } = cachedAppleSkinBuffers;

  const colorMap = new THREE.DataTexture(
    new Uint8Array(colorData),
    width,
    height,
    THREE.RGBAFormat
  );
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.ClampToEdgeWrapping;
  colorMap.magFilter = THREE.LinearFilter;
  colorMap.minFilter = THREE.LinearMipmapLinearFilter;
  colorMap.generateMipmaps = true;
  colorMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(
    new Uint8Array(roughnessData),
    width,
    height,
    THREE.RGBAFormat
  );
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.generateMipmaps = true;
  roughnessMap.needsUpdate = true;

  const bumpMap = new THREE.DataTexture(
    new Uint8Array(bumpData),
    width,
    height,
    THREE.RGBAFormat
  );
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.magFilter = THREE.LinearFilter;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.generateMipmaps = true;
  bumpMap.needsUpdate = true;

  return { colorMap, roughnessMap, bumpMap };
}

let cachedStemBuffers: {
  width: number;
  height: number;
  colorData: Uint8Array;
  bumpData: Uint8Array;
} | null = null;

/**
 * Generates 512x512 procedural woody bark textures for the stem with warm cinnamon-amber
 * longitudinal fibers and a lighter woody-tan cut top cap.
 */
function createStemTextures(): {
  stemColorMap: THREE.DataTexture;
  stemBumpMap: THREE.DataTexture;
} {
  const width = 512;
  const height = 512;

  if (!cachedStemBuffers) {
    const colorData = new Uint8Array(width * height * 4);
    const bumpData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      const t = y / (height - 1);
      for (let x = 0; x < width; x++) {
        const u = x / width;
        const theta = u * Math.PI * 2.0;
        const cx = Math.cos(theta);
        const cz = Math.sin(theta);

        // Longitudinal fibrous bark grain using 3D FBM on cylinder
        const grain = fbm3D(cx * 6.5, t * 3.2, cz * 6.5, 4);
        const fineFiber = noise3D(cx * 18.0, t * 8.0, cz * 18.0);

        // Warm cinnamon-amber / woody-ochre base (#7a4b2a .. #a66f43)
        let r = 142 + grain * 26 + fineFiber * 12;
        let g = 90 + grain * 18 + fineFiber * 8;
        let b = 52 + grain * 10 + fineFiber * 5;

        // Slightly darker near the base inside the cavity (t < 0.22)
        if (t < 0.22) {
          const k = (0.22 - t) / 0.22;
          r *= 1.0 - 0.25 * k;
          g *= 1.0 - 0.25 * k;
          b *= 1.0 - 0.25 * k;
        }

        // Lighter woody-tan abscission cut cap at the very top (t > 0.93)
        if (t > 0.93) {
          const k = (t - 0.93) / 0.07;
          r = lerp(r, 188 + fineFiber * 10, k);
          g = lerp(g, 142 + fineFiber * 8, k);
          b = lerp(b, 92 + fineFiber * 6, k);
        }

        const idx = (y * width + x) * 4;
        colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
        colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        colorData[idx + 3] = 255;

        const bVal = Math.max(0, Math.min(255, Math.round(128 + grain * 28 + fineFiber * 16)));
        bumpData[idx] = bVal;
        bumpData[idx + 1] = bVal;
        bumpData[idx + 2] = bVal;
        bumpData[idx + 3] = 255;
      }
    }

    cachedStemBuffers = { width, height, colorData, bumpData };
  }

  const stemColorMap = new THREE.DataTexture(
    new Uint8Array(cachedStemBuffers.colorData),
    width,
    height,
    THREE.RGBAFormat
  );
  stemColorMap.colorSpace = THREE.SRGBColorSpace;
  stemColorMap.wrapS = THREE.RepeatWrapping;
  stemColorMap.wrapT = THREE.ClampToEdgeWrapping;
  stemColorMap.magFilter = THREE.LinearFilter;
  stemColorMap.minFilter = THREE.LinearMipmapLinearFilter;
  stemColorMap.generateMipmaps = true;
  stemColorMap.needsUpdate = true;

  const stemBumpMap = new THREE.DataTexture(
    new Uint8Array(cachedStemBuffers.bumpData),
    width,
    height,
    THREE.RGBAFormat
  );
  stemBumpMap.colorSpace = THREE.NoColorSpace;
  stemBumpMap.wrapS = THREE.RepeatWrapping;
  stemBumpMap.wrapT = THREE.ClampToEdgeWrapping;
  stemBumpMap.magFilter = THREE.LinearFilter;
  stemBumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  stemBumpMap.generateMipmaps = true;
  stemBumpMap.needsUpdate = true;

  return { stemColorMap, stemBumpMap };
}

let cachedLeafBuffers: {
  width: number;
  height: number;
  colorData: Uint8Array;
  roughnessData: Uint8Array;
  bumpData: Uint8Array;
} | null = null;

/**
 * Generates 512x512 botanical leaf textures (`leafColorMap`, `leafRoughnessMap`, `leafBumpMap`)
 * with a bright yellow-green central midrib, 7 pairs of curved secondary veins, tertiary vein network,
 * and rich chlorophyll variation.
 */
function createLeafTextures(): {
  leafColorMap: THREE.DataTexture;
  leafRoughnessMap: THREE.DataTexture;
  leafBumpMap: Uint8Array | THREE.DataTexture;
  bumpTexture: THREE.DataTexture;
} {
  const width = 512;
  const height = 512;

  if (!cachedLeafBuffers) {
    const colorData = new Uint8Array(width * height * 4);
    const roughnessData = new Uint8Array(width * height * 4);
    const bumpData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      // s in [0, 1] along leaf length (0 = base, 1 = tip)
      const s = y / (height - 1);
      for (let x = 0; x < width; x++) {
        // w in [-1, 1] across leaf width (0 = central midrib)
        const w = (x / (width - 1)) * 2.0 - 1.0;
        const absW = Math.abs(w);

        // Organic chlorophyll variation
        const cellNoise = fbm3D(w * 6.0 + 1.2, s * 6.0 - 0.8, 0.5, 4);
        const fineCell = noise3D(w * 24.0, s * 24.0, 1.7);

        // Central midrib mask (tapers toward tip s = 0.95)
        const midribHalfWidth = 0.032 * (1.0 - 0.78 * s);
        const midribMask =
          s < 0.94 ? Math.exp(-(absW * absW) / Math.max(1e-5, midribHalfWidth * midribHalfWidth)) : 0.0;

        // 7 pairs of arched secondary lateral veins branching from midrib
        // Secondary vein trajectory: s_vein(absW) = s_root + 0.22 * absW^0.85 + 0.08 * absW^2
        const veinCoord = (s - 0.21 * Math.pow(absW, 0.85) - 0.07 * absW * absW) * 7.5;
        const distToVeinCenter = Math.abs(veinCoord - Math.round(veinCoord));
        const secVeinWidth = 0.095 * (1.0 - 0.45 * absW);
        const secVeinMask =
          absW > 0.02 && absW < 0.92 && s > 0.06 && s < 0.94
            ? Math.exp(-(distToVeinCenter * distToVeinCenter) / (secVeinWidth * secVeinWidth)) *
              (1.0 - 0.5 * absW)
            : 0.0;

        // Fine tertiary reticulate venation
        const tertiary = Math.max(0.0, Math.sin(w * 38.0 + fineCell * 2.5) * Math.sin(s * 42.0 - fineCell * 2.5));
        const veinTotal = Math.min(1.0, midribMask + secVeinMask * 0.78 + tertiary * 0.14);

        // Deep rich chlorophyll green blade (#307618 .. #428c22) with bright yellow-green veins (#9ae64c)
        const marginWarmth = Math.pow(absW, 1.8) * 0.18;
        let r = 50 + cellNoise * 12 + marginWarmth * 24;
        let g = 122 + cellNoise * 18 + marginWarmth * 22;
        let b = 26 + cellNoise * 8 + marginWarmth * 6;

        r = lerp(r, 154, veinTotal * 0.88);
        g = lerp(g, 230, veinTotal * 0.88);
        b = lerp(b, 76, veinTotal * 0.88);

        const idx = (y * width + x) * 4;
        colorData[idx] = Math.max(0, Math.min(255, Math.round(r)));
        colorData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        colorData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        colorData[idx + 3] = 255;

        const rough = 0.34 - veinTotal * 0.08 + fineCell * 0.04;
        const rByte = Math.max(0, Math.min(255, Math.round(rough * 255.0)));
        roughnessData[idx] = rByte;
        roughnessData[idx + 1] = rByte;
        roughnessData[idx + 2] = rByte;
        roughnessData[idx + 3] = 255;

        const bumpH = 128 + veinTotal * 36.0 + fineCell * 8.0;
        const bByte = Math.max(0, Math.min(255, Math.round(bumpH)));
        bumpData[idx] = bByte;
        bumpData[idx + 1] = bByte;
        bumpData[idx + 2] = bByte;
        bumpData[idx + 3] = 255;
      }
    }

    cachedLeafBuffers = { width, height, colorData, roughnessData, bumpData };
  }

  const leafColorMap = new THREE.DataTexture(
    new Uint8Array(cachedLeafBuffers.colorData),
    width,
    height,
    THREE.RGBAFormat
  );
  leafColorMap.colorSpace = THREE.SRGBColorSpace;
  leafColorMap.wrapS = THREE.ClampToEdgeWrapping;
  leafColorMap.wrapT = THREE.ClampToEdgeWrapping;
  leafColorMap.magFilter = THREE.LinearFilter;
  leafColorMap.minFilter = THREE.LinearMipmapLinearFilter;
  leafColorMap.generateMipmaps = true;
  leafColorMap.needsUpdate = true;

  const leafRoughnessMap = new THREE.DataTexture(
    new Uint8Array(cachedLeafBuffers.roughnessData),
    width,
    height,
    THREE.RGBAFormat
  );
  leafRoughnessMap.colorSpace = THREE.NoColorSpace;
  leafRoughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  leafRoughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  leafRoughnessMap.magFilter = THREE.LinearFilter;
  leafRoughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  leafRoughnessMap.generateMipmaps = true;
  leafRoughnessMap.needsUpdate = true;

  const bumpTexture = new THREE.DataTexture(
    new Uint8Array(cachedLeafBuffers.bumpData),
    width,
    height,
    THREE.RGBAFormat
  );
  bumpTexture.colorSpace = THREE.NoColorSpace;
  bumpTexture.wrapS = THREE.ClampToEdgeWrapping;
  bumpTexture.wrapT = THREE.ClampToEdgeWrapping;
  bumpTexture.magFilter = THREE.LinearFilter;
  bumpTexture.minFilter = THREE.LinearMipmapLinearFilter;
  bumpTexture.generateMipmaps = true;
  bumpTexture.needsUpdate = true;

  return { leafColorMap, leafRoughnessMap, leafBumpMap: bumpTexture, bumpTexture };
}

/**
 * Builds a closed, organically tapered tubular geometry along a CatmullRomCurve3.
 * Used for both the woody stem (with flared base & top knob) and the tapered leaf petiole/midrib.
 */
function createTaperedStemGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments = 48,
  radialSegments = 24,
  customRadiusFn?: (t: number) => number
): {
  geometry: THREE.BufferGeometry;
  radiusAt: (t: number) => number;
} {
  const radiusAt =
    customRadiusFn ??
    ((t: number): number => {
      // Flared at embedded cavity root (0.068), slender middle (0.044), natural woody knob at top (0.055)
      const baseFlare = 0.024 * Math.exp(-t * 7.5);
      const tipKnob = 0.014 * Math.exp(-((1.0 - t) * (1.0 - t)) / 0.022);
      return 0.042 + baseFlare + tipKnob;
    });

  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const numCols = radialSegments + 1;
  const numRingRows = tubularSegments + 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let j = 0; j < numRingRows; j++) {
    const t = j / tubularSegments;
    const pt = curve.getPointAt(t);
    const N = frames.normals[j];
    const B = frames.binormals[j];
    const baseR = radiusAt(t);

    for (let i = 0; i < numCols; i++) {
      const u = i / radialSegments;
      const theta = i === radialSegments ? 0.0 : u * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const barkMod = customRadiusFn ? 1.0 : 1.0 + 0.035 * Math.cos(5.0 * theta + t * 4.0);
      const r = baseR * barkMod;

      const nx = cosT * N.x + sinT * B.x;
      const ny = cosT * N.y + sinT * B.y;
      const nz = cosT * N.z + sinT * B.z;

      positions.push(pt.x + r * nx, pt.y + r * ny, pt.z + r * nz);
      normals.push(nx, ny, nz);
      uvs.push(u, t);
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < tubularSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * numCols + i;
      const b = j * numCols + i + 1;
      const c = (j + 1) * numCols + i;
      const d = (j + 1) * numCols + i + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  // Closed rounded end-cap at t = 1.0
  const tipCenter = curve.getPointAt(1.0);
  const tipTangent = curve.getTangentAt(1.0).normalize();
  const tipCapIndex = positions.length / 3;
  const capOffset = customRadiusFn ? 0.001 : 0.006;
  positions.push(
    tipCenter.x + tipTangent.x * capOffset,
    tipCenter.y + tipTangent.y * capOffset,
    tipCenter.z + tipTangent.z * capOffset
  );
  normals.push(tipTangent.x, tipTangent.y, tipTangent.z);
  uvs.push(0.5, 1.0);

  const lastRowOffset = tubularSegments * numCols;
  for (let i = 0; i < radialSegments; i++) {
    indices.push(lastRowOffset + i, lastRowOffset + i + 1, tipCapIndex);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return { geometry, radiusAt };
}

/**
 * Builds a 3D sculpted double-sided botanical leaf blade with expressive 3D pitch + roll orientation
 * (visible from all 6 audit angles: front, three_quarter, side_profile, left_profile, back, top),
 * plus a conically tapered petiole/midrib that vanishes cleanly inside the leaf tip.
 */
function createSculptedLeafGroup(
  attachPoint: THREE.Vector3,
  leafMaterial: THREE.MeshPhysicalMaterial,
  veinMaterial: THREE.MeshPhysicalMaterial
): {
  leafGroup: THREE.Group;
  bladeGeometry: THREE.BufferGeometry;
  petioleGeometry: THREE.BufferGeometry;
  worldBladePoints: THREE.Vector3[];
} {
  const leafGroup = new THREE.Group();
  leafGroup.name = 'AppleLeafGroup';

  const bladeLength = 0.84;
  const maxHalfWidth = 0.255;
  const petioleLength = 0.13;

  // Expressive 3D spine curve:
  // Rises at ~35 deg upward pitch from the stem attachment while sweeping obliquely in +X/+Z,
  // then arches gracefully outward so the leaf silhouette has strong vertical 3D relief in all side/front views!
  const evaluateLeafSpine = (s: number): THREE.Vector3 => {
    const dist = petioleLength + s * bladeLength;
    // Strong upward climb + graceful S-arch so vertical span is ~0.32 units
    const yClimb = 0.26 * Math.sin(s * Math.PI * 0.66) + 0.12 * s * (1.0 - 0.45 * s);
    // Gentle 3D S-curve sweep in XZ plane
    const azimuthWave = 0.045 * Math.sin(s * Math.PI * 1.15);
    return new THREE.Vector3(
      attachPoint.x + dist * 0.88 - azimuthWave * 0.35,
      attachPoint.y + 0.055 + yClimb,
      attachPoint.z + dist * 0.44 + azimuthWave
    );
  };

  // Orthonormal frame with pronounced 36-degree lateral roll (banking) so the broad green face
  // of the leaf is tilted toward the front/three-quarter/side/back cameras and NEVER seen edge-on!
  const dirForwardBase = new THREE.Vector3(0.88, 0.28, 0.44).normalize();
  const worldUp = new THREE.Vector3(0.0, 1.0, 0.0);
  const dirSideFlat = new THREE.Vector3().crossVectors(worldUp, dirForwardBase).normalize();
  const dirNormalFlat = new THREE.Vector3().crossVectors(dirForwardBase, dirSideFlat).normalize();

  // Petiole + Tapered Midrib curve starting strictly at attachPoint (buried inside stem)
  // and stopping at s = 0.74 where it tapers conically into the leaf blade (zero pipe protrusion!)
  const midribPoints: THREE.Vector3[] = [
    attachPoint.clone(),
    new THREE.Vector3(attachPoint.x + 0.055, attachPoint.y + 0.032, attachPoint.z + 0.026),
    evaluateLeafSpine(0.0),
    evaluateLeafSpine(0.18),
    evaluateLeafSpine(0.36),
    evaluateLeafSpine(0.55),
    evaluateLeafSpine(0.74),
  ];
  const midribCurve = new THREE.CatmullRomCurve3(midribPoints);
  const taperedMidrib = createTaperedStemGeometry(
    midribCurve,
    36,
    12,
    (t: number) => 0.0155 * Math.pow(1.0 - t, 1.45) + 0.001
  );
  const petioleGeometry = taperedMidrib.geometry;
  const petioleMesh = new THREE.Mesh(petioleGeometry, veinMaterial);
  petioleMesh.name = 'AppleLeafMidrib';
  petioleMesh.castShadow = true;
  petioleMesh.receiveShadow = true;
  leafGroup.add(petioleMesh);

  // Volumetric 3D leaf blade (upper surface + lower surface + stitched margin)
  const segS = 44;
  const segW = 24;
  const cols = segW + 1;
  const rows = segS + 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const worldBladePoints: THREE.Vector3[] = [];

  for (let layer = 0; layer < 2; layer++) {
    const signLayer = layer === 0 ? 1.0 : -1.0;

    for (let j = 0; j < rows; j++) {
      const s = j / segS; // 0 = blade base, 1 = acuminate tip
      const spinePt = evaluateLeafSpine(s);

      // Progressive natural torsion / roll angle along the blade: ~38 deg at base -> ~24 deg near tip
      const rollAngle = 0.66 - 0.22 * s;
      const cosRoll = Math.cos(rollAngle);
      const sinRoll = Math.sin(rollAngle);

      const dirSideRolled = new THREE.Vector3(
        dirSideFlat.x * cosRoll + dirNormalFlat.x * sinRoll,
        dirSideFlat.y * cosRoll + dirNormalFlat.y * sinRoll,
        dirSideFlat.z * cosRoll + dirNormalFlat.z * sinRoll
      ).normalize();

      const dirNormalRolled = new THREE.Vector3(
        -dirSideFlat.x * sinRoll + dirNormalFlat.x * cosRoll,
        -dirSideFlat.y * sinRoll + dirNormalFlat.y * cosRoll,
        -dirSideFlat.z * sinRoll + dirNormalFlat.z * cosRoll
      ).normalize();

      // Authentic ovate-acuminate apple leaf width profile with fine botanical serrations
      const baseEnvelope = Math.sin(Math.pow(s, 0.76) * Math.PI);
      const serration =
        s > 0.08 && s < 0.94
          ? 0.018 * Math.sin(s * 20.0 * Math.PI) * baseEnvelope * (1.0 - 0.3 * s)
          : 0.0;
      const halfW = maxHalfWidth * (baseEnvelope + serration);

      for (let i = 0; i < cols; i++) {
        const w = (i / segW) * 2.0 - 1.0; // -1 to +1
        const absW = Math.abs(w);

        // Smooth upward V-trough dihedral fold + gentle organic margin curl (zero corrugated tin!)
        const vTrough = 0.046 * Math.pow(absW, 1.32) * Math.sin(s * Math.PI);
        const subtleVeinRelief =
          0.0012 *
          Math.sin((s * 7.5 - absW * 2.1) * Math.PI * 2.0) *
          (1.0 - absW * 0.5) *
          baseEnvelope;

        // Real 3D blade thickness tapering cleanly at margins
        const halfThickness = 0.006 * (1.0 - 0.84 * absW * absW) * Math.sin(s * Math.PI);

        const lateralOffset = w * halfW;
        const normalOffset = vTrough + subtleVeinRelief + signLayer * halfThickness;

        const vx =
          spinePt.x + dirSideRolled.x * lateralOffset + dirNormalRolled.x * normalOffset;
        const vy =
          spinePt.y + dirSideRolled.y * lateralOffset + dirNormalRolled.y * normalOffset;
        const vz =
          spinePt.z + dirSideRolled.z * lateralOffset + dirNormalRolled.z * normalOffset;

        positions.push(vx, vy, vz);
        uvs.push((w + 1.0) * 0.5, s);
        worldBladePoints.push(new THREE.Vector3(vx, vy, vz));
      }
    }
  }

  const indices: number[] = [];
  const layerOffset = rows * cols;

  for (let j = 0; j < segS; j++) {
    for (let i = 0; i < segW; i++) {
      const a0 = j * cols + i;
      const b0 = j * cols + i + 1;
      const c0 = (j + 1) * cols + i;
      const d0 = (j + 1) * cols + i + 1;
      indices.push(a0, c0, b0);
      indices.push(b0, c0, d0);

      const a1 = layerOffset + a0;
      const b1 = layerOffset + b0;
      const c1 = layerOffset + c0;
      const d1 = layerOffset + d0;
      indices.push(a1, b1, c1);
      indices.push(b1, d1, c1);
    }
  }

  for (let j = 0; j < segS; j++) {
    const leftTopA = j * cols;
    const leftTopB = (j + 1) * cols;
    const leftBotA = layerOffset + leftTopA;
    const leftBotB = layerOffset + leftTopB;
    indices.push(leftTopA, leftBotA, leftTopB);
    indices.push(leftBotA, leftBotB, leftTopB);

    const rightTopA = j * cols + segW;
    const rightTopB = (j + 1) * cols + segW;
    const rightBotA = layerOffset + rightTopA;
    const rightBotB = layerOffset + rightTopB;
    indices.push(rightTopA, rightTopB, rightBotA);
    indices.push(rightBotA, rightTopB, rightBotB);
  }

  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setIndex(indices);
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bladeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bladeGeometry.computeVertexNormals();
  bladeGeometry.computeBoundingBox();

  const bladeMesh = new THREE.Mesh(bladeGeometry, leafMaterial);
  bladeMesh.name = 'AppleLeafBlade';
  bladeMesh.castShadow = true;
  bladeMesh.receiveShadow = true;
  leafGroup.add(bladeMesh);

  return {
    leafGroup,
    bladeGeometry,
    petioleGeometry,
    worldBladePoints,
  };
}

/**
 * Builds the 5 radial calyx sepals in the bottom basin using parent pivot groups (Law 3: No Euler Twist).
 */
function createCalyxSepalsGroup(
  calyxCavityY: number,
  sepalMaterial: THREE.MeshPhysicalMaterial
): {
  calyxGroup: THREE.Group;
  sepalGeometry: THREE.BufferGeometry;
} {
  const calyxGroup = new THREE.Group();
  calyxGroup.name = 'AppleCalyxGroup';

  const sepalShape = new THREE.Shape();
  sepalShape.moveTo(-0.022, 0.0);
  sepalShape.quadraticCurveTo(-0.026, 0.032, 0.0, 0.068);
  sepalShape.quadraticCurveTo(0.026, 0.032, 0.022, 0.0);
  sepalShape.closePath();

  const sepalGeometry = new THREE.ExtrudeGeometry(sepalShape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 2,
    bevelSize: 0.003,
    bevelThickness: 0.003,
  });
  sepalGeometry.computeVertexNormals();

  for (let k = 0; k < 5; k++) {
    const radialParent = new THREE.Group();
    radialParent.name = `CalyxSepalRadial_${k}`;
    radialParent.rotation.y = (k * Math.PI * 2.0) / 5.0;

    const sepalMesh = new THREE.Mesh(sepalGeometry, sepalMaterial);
    sepalMesh.position.set(0.0, calyxCavityY + 0.01, 0.045);
    sepalMesh.rotation.set(2.35, 0.0, 0.0);
    sepalMesh.castShadow = true;
    sepalMesh.receiveShadow = true;

    radialParent.add(sepalMesh);
    calyxGroup.add(radialParent);
  }

  return { calyxGroup, sepalGeometry };
}

/**
 * Creates the complete Pixar-grade 3D Red Apple with C1 parametric body, 1024x1024 3D-FBM skin textures,
 * warm Subsurface Scattering (SSS), embedded woody stem with bark fibers, sculpted 3D leaf with veins,
 * and radial calyx sepals.
 */
export function createRedApple(): RedAppleInstance {
  const group = new THREE.Group();
  group.name = 'RedAppleRoot';

  const animGroup = new THREE.Group();
  animGroup.name = 'RedAppleAnimPivot';
  group.add(animGroup);

  // 1. Parametric C1 Apple Body + 1024x1024 3D-FBM PBR Textures + Warm Subsurface Scattering
  const bodyData = createAppleBodyGeometry(112, 112);
  const { colorMap, roughnessMap, bumpMap } = createAppleSkinTextures();

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    map: colorMap,
    roughnessMap: roughnessMap,
    roughness: 1.0,
    bumpMap: bumpMap,
    bumpScale: 0.0008,
    vertexColors: true,
    metalness: 0.0,
    clearcoat: 0.11,
    clearcoatRoughness: 0.38,
    sheen: 0.38,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#ff6b4a'),
    ior: 1.45,
    reflectivity: 0.32,
    envMapIntensity: 0.28,
  });

  // Inject warm sub-dermal Subsurface Scattering (SSS) wrap light & UV-based top-cavity clearcoat attenuation
  bodyMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>',
      `#include <lights_physical_pars_fragment>
      vec3 computeAppleSubsurfaceScattering(const in vec3 n, const in vec3 v, const in vec3 baseCol) {
        vec3 sssLight1 = normalize(vec3(0.58, 0.52, 0.62));
        vec3 sssLight2 = normalize(vec3(-0.52, 0.42, -0.68));
        float ndl1 = dot(n, sssLight1);
        float ndl2 = dot(n, sssLight2);
        float wrap1 = smoothstep(-0.55, 0.35, ndl1) * (1.0 - smoothstep(0.12, 0.85, ndl1));
        float wrap2 = smoothstep(-0.45, 0.35, ndl2) * (1.0 - smoothstep(0.15, 0.85, ndl2));
        float rimGlow = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
        return baseCol * vec3(0.42, 0.12, 0.04) * (wrap1 * 0.85 + wrap2 * 0.45 + rimGlow * 0.30);
      }`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
      float topMatteMask = smoothstep(0.56, 0.78, vMapUv.y);
      #ifdef USE_CLEARCOAT
        material.clearcoat *= (1.0 - 0.95 * topMatteMask);
      #endif`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      reflectedLight.directSpecular *= 0.52 * (1.0 - 0.85 * topMatteMask);
      reflectedLight.indirectSpecular *= 0.75 * (1.0 - 0.82 * topMatteMask);
      reflectedLight.directDiffuse += computeAppleSubsurfaceScattering(geometryNormal, geometryViewDir, diffuseColor.rgb);`
    );
  };

  const bodyMesh = new THREE.Mesh(bodyData.geometry, bodyMaterial);
  bodyMesh.name = 'AppleBody';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  animGroup.add(bodyMesh);

  // 2. Woody Stem anchored deep inside the top stem cavity (infundibulum)
  const stemBaseY = bodyData.stemCavityY - 0.10;
  const stemBasePoint = new THREE.Vector3(0.0, stemBaseY, 0.0);
  const stemTipPoint = new THREE.Vector3(0.16, bodyData.bodyMaxY + 0.44, 0.055);

  const stemCurve = new THREE.CatmullRomCurve3([
    stemBasePoint,
    new THREE.Vector3(0.008, bodyData.stemCavityY + 0.06, 0.004),
    new THREE.Vector3(0.032, bodyData.stemCavityY + 0.25, 0.015),
    new THREE.Vector3(0.084, bodyData.stemCavityY + 0.46, 0.034),
    stemTipPoint,
  ]);

  const stemData = createTaperedStemGeometry(stemCurve, 48, 24);
  const { stemColorMap, stemBumpMap } = createStemTextures();
  const stemMaterial = new THREE.MeshPhysicalMaterial({
    map: stemColorMap,
    bumpMap: stemBumpMap,
    bumpScale: 0.003,
    color: new THREE.Color('#c98c58'),
    roughness: 0.68,
    metalness: 0.0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
    sheen: 0.35,
    sheenColor: new THREE.Color('#e8b882'),
    emissive: new THREE.Color('#2d180a'),
    emissiveIntensity: 0.18,
  });

  const stemMesh = new THREE.Mesh(stemData.geometry, stemMaterial);
  stemMesh.name = 'AppleStem';
  stemMesh.castShadow = true;
  stemMesh.receiveShadow = true;
  animGroup.add(stemMesh);

  // 3. Sculpted 3D Botanical Leaf attached at exact point on stemCurve
  const tAttach = 0.58;
  const leafAttachPoint = stemCurve.getPointAt(tAttach);
  const stemRadiusAtAttach = stemData.radiusAt(tAttach);

  const { leafColorMap, leafRoughnessMap, bumpTexture: leafBumpMap } = createLeafTextures();

  const leafMaterial = new THREE.MeshPhysicalMaterial({
    map: leafColorMap,
    roughnessMap: leafRoughnessMap,
    roughness: 0.42,
    bumpMap: leafBumpMap,
    bumpScale: 0.0022,
    color: new THREE.Color('#ffffff'),
    metalness: 0.0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.46,
    sheen: 0.28,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#a3e635'),
    emissive: new THREE.Color('#285e14'),
    emissiveIntensity: 0.18,
  });

  // Botanical chlorophyll subsurface transmittance so shaded/back views of the leaf stay vibrant green
  leafMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      reflectedLight.directDiffuse = max(reflectedLight.directDiffuse, diffuseColor.rgb * vec3(0.46, 0.58, 0.22));
      reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.18, 0.26, 0.06);`
    );
  };

  const veinMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#65a82c'),
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.08,
    sheen: 0.22,
    sheenColor: new THREE.Color('#bef264'),
    emissive: new THREE.Color('#285412'),
    emissiveIntensity: 0.22,
  });

  const leafData = createSculptedLeafGroup(leafAttachPoint, leafMaterial, veinMaterial);
  animGroup.add(leafData.leafGroup);

  // 4. Radial Calyx Sepals at the bottom basin (Law 3: No Euler Twist)
  const sepalMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#4a3b26'),
    roughness: 0.78,
    metalness: 0.0,
  });
  const calyxData = createCalyxSepalsGroup(bodyData.calyxCavityY, sepalMaterial);
  animGroup.add(calyxData.calyxGroup);

  // Compute minimum vertical/3D clearance between the leaf blade and the apple body
  let minLeafToBodyClearance = Infinity;
  for (const pt of leafData.worldBladePoints) {
    const r = Math.hypot(pt.x, pt.z);
    if (r > 0.12) {
      const verticalClearance = pt.y - bodyData.bodyMaxY;
      if (verticalClearance < minLeafToBodyClearance) {
        minLeafToBodyClearance = verticalClearance;
      }
    }
  }

  const totalMaxY = Math.max(
    stemTipPoint.y,
    ...leafData.worldBladePoints.map((p) => p.y),
    bodyData.bodyMaxY
  );

  const metrics: RedAppleMetrics = {
    minY: bodyData.minY,
    bodyMaxY: bodyData.bodyMaxY,
    totalMaxY,
    maxRadius: bodyData.maxRadius,
    stemCavityY: bodyData.stemCavityY,
    calyxCavityY: bodyData.calyxCavityY,
    stemBasePoint,
    stemTipPoint,
    leafAttachPoint,
    stemRadiusAtAttach,
    minLeafToBodyClearance,
  };

  const allMaterials: THREE.MeshPhysicalMaterial[] = [
    bodyMaterial,
    stemMaterial,
    leafMaterial,
    veinMaterial,
    sepalMaterial,
  ];

  const allGeometries: THREE.BufferGeometry[] = [
    bodyData.geometry,
    stemData.geometry,
    leafData.bladeGeometry,
    leafData.petioleGeometry,
    calyxData.sepalGeometry,
  ];

  const allTextures: THREE.Texture[] = [
    colorMap,
    roughnessMap,
    bumpMap,
    stemColorMap,
    stemBumpMap,
    leafColorMap,
    leafRoughnessMap,
    leafBumpMap,
  ];

  const setWireframe = (enabled: boolean): void => {
    for (const mat of allMaterials) {
      mat.wireframe = enabled;
      mat.needsUpdate = true;
    }
  };

  /**
   * Deterministic pose evaluation for any animation action and timestamp t (seconds).
   * Guarantees smooth continuous arcs, secondary leaf overlap motion, and firm contact at y = 0.
   */
  const setPose = (action: string, t: number): void => {
    const normalizedAction = (action || 'idle').toLowerCase();
    if (normalizedAction.includes('wireframe')) {
      setWireframe(true);
    }

    if (normalizedAction === 'idle' && t === 0) {
      animGroup.position.set(0, 0, 0);
      animGroup.rotation.set(0, 0, 0);
      animGroup.scale.set(1, 1, 1);
      leafData.leafGroup.rotation.set(0, 0, 0);
      return;
    }

    const phase = t * Math.PI;
    const turntableAngle = phase;
    const squashFactor = 1.0 + 0.032 * Math.sin(phase);
    const radialScale = 1.0 / Math.sqrt(squashFactor);

    animGroup.position.set(0, 0, 0);
    animGroup.rotation.set(0, turntableAngle, 0);
    animGroup.scale.set(radialScale, squashFactor, radialScale);

    const leafFlutter = 0.065 * Math.sin(phase * 2.0 - 0.55);
    leafData.leafGroup.position.copy(leafAttachPoint);
    leafData.leafGroup.rotation.set(leafFlutter * 0.45, 0, leafFlutter);
    for (const child of leafData.leafGroup.children) {
      child.position.set(-leafAttachPoint.x, -leafAttachPoint.y, -leafAttachPoint.z);
    }
  };

  leafData.leafGroup.position.copy(leafAttachPoint);
  for (const child of leafData.leafGroup.children) {
    child.position.set(-leafAttachPoint.x, -leafAttachPoint.y, -leafAttachPoint.z);
  }

  const dispose = (): void => {
    for (const geom of allGeometries) {
      geom.dispose();
    }
    for (const mat of allMaterials) {
      mat.dispose();
    }
    for (const tex of allTextures) {
      tex.dispose();
    }
  };

  return {
    group,
    animGroup,
    bodyMesh,
    stemMesh,
    leafGroup: leafData.leafGroup,
    calyxGroup: calyxData.calyxGroup,
    metrics,
    setPose,
    setWireframe,
    dispose,
  };
}
