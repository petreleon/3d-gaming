import * as THREE from 'three';

export type CutleryMode = 'idle' | 'spoon' | 'fork' | 'knife' | 'print_ready' | 'turntable';

export interface SupportSectionProfile {
  xMm: number;
  baseHalfWidthMm: number;
  outerHalfWidthMm: number;
  basePlateHeightMm: number;
  wallHeightMm: number;
  centerFloorHeightMm: number;
  channelFlatFloorWidthMm: number;
  hasUpperStopperRoof: boolean;
  upperStopperCeilingYMm: number;
  upperStopperRoofTopYMm: number;
}

export interface CutleryRestRig {
  group: THREE.Group;
  supportMesh: THREE.Mesh;
  /** Raw unscaled BufferGeometry in millimeter coordinates (X in [-48, +64], Y in [0, 34], Z in [-22, +22]) for .3mf export & tests */
  supportGeometryMm: THREE.BufferGeometry;
  spoonMesh: THREE.Mesh;
  forkMesh: THREE.Mesh;
  knifeMesh: THREE.Mesh;
  /** Raw millimeter-space utensil geometries for exact clearance / hygiene unit tests */
  utensilGeometriesMm: {
    spoon: THREE.BufferGeometry;
    fork: THREE.BufferGeometry;
    knife: THREE.BufferGeometry;
  };
  setPose: (action: string, t: number) => void;
  setWireframe: (enabled: boolean) => void;
  dispose: () => void;
}

/** Conversion factor from physical millimeters to Three.js scene units */
export const MM_TO_SCENE = 0.0205;

/** Longitudinal X offset in mm applied when a utensil is mounted so [-48, +84] mm is centered at X = 0 */
export const VISUAL_CENTER_OFFSET_X_MM = -18.0;

/** Subtle studio presentation yaw in idle mode so front/back and side/left profiles show rich 3D volume */
export const STUDIO_PRESENTATION_YAW_RAD = 0.22;

export const SUPPORT_MIN_X_MM = -48.0;
export const SUPPORT_MAX_X_MM = 64.0;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

/** Smooth bump window equal to 1 inside [a1, b0] with smoothstep ramps on [a0, a1] and [b0, b1] */
function smoothWindow(x: number, a0: number, a1: number, b0: number, b1: number): number {
  return smoothstep(a0, a1, x) * (1.0 - smoothstep(b0, b1, x));
}

function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function valueNoise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const uz = fz * fz * (3.0 - 2.0 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;

  return nxy0 + (nxy1 - nxy0) * uz;
}

function fbm3D(x: number, y: number, z: number, octaves = 4): number {
  let value = 0.0;
  let amplitude = 0.5;
  let freq = 1.0;
  let norm = 0.0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise3D(x * freq, y * freq, z * freq);
    norm += amplitude;
    freq *= 2.03;
    amplitude *= 0.5;
  }
  return value / norm;
}

/**
 * Computes the raw signed volume of an indexed BufferGeometry directly in its native coordinate space.
 */
export function computeRawSignedVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  if (!pos || !idx) {
    return 0;
  }
  let signedVolume6 = 0.0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);

    const ax = pos.getX(a);
    const ay = pos.getY(a);
    const az = pos.getZ(a);
    const bx = pos.getX(b);
    const by = pos.getY(b);
    const bz = pos.getZ(b);
    const cx = pos.getX(c);
    const cy = pos.getY(c);
    const cz = pos.getZ(c);

    const crossX = by * cz - bz * cy;
    const crossY = bz * cx - bx * cz;
    const crossZ = bx * cy - by * cx;
    signedVolume6 += ax * crossX + ay * crossY + az * crossZ;
  }
  return signedVolume6 / 6.0;
}

/**
 * Compacts any unreferenced vertices and ensures outward-pointing triangle winding (rawSignedVolume > 0)
 * before computing vertex normals.
 */
function ensurePositiveWindingAndNormals(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const idx = geometry.getIndex();

  if (pos && idx) {
    const usedMap = new Int32Array(pos.count).fill(-1);
    let newCount = 0;
    for (let i = 0; i < idx.count; i++) {
      const oldV = idx.getX(i);
      if (usedMap[oldV] === -1) {
        usedMap[oldV] = newCount++;
      }
    }
    if (newCount < pos.count) {
      const newPos = new Float32Array(newCount * 3);
      const newUv = uv ? new Float32Array(newCount * 2) : null;
      for (let oldV = 0; oldV < pos.count; oldV++) {
        const mapped = usedMap[oldV];
        if (mapped !== -1) {
          newPos[mapped * 3] = pos.getX(oldV);
          newPos[mapped * 3 + 1] = pos.getY(oldV);
          newPos[mapped * 3 + 2] = pos.getZ(oldV);
          if (newUv && uv) {
            newUv[mapped * 2] = uv.getX(oldV);
            newUv[mapped * 2 + 1] = uv.getY(oldV);
          }
        }
      }
      const newIndices = new Uint32Array(idx.count);
      for (let i = 0; i < idx.count; i++) {
        newIndices[i] = usedMap[idx.getX(i)];
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
      if (newUv) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));
      }
      geometry.setIndex(new THREE.BufferAttribute(newIndices, 1));
    }
  }

  const finalIdx = geometry.getIndex();
  if (finalIdx && computeRawSignedVolume(geometry) < 0) {
    for (let i = 0; i < finalIdx.count; i += 3) {
      const b = finalIdx.getX(i + 1);
      const c = finalIdx.getX(i + 2);
      finalIdx.setX(i + 1, c);
      finalIdx.setX(i + 2, b);
    }
    finalIdx.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/**
 * Evaluates the exact parametric cross-section descriptors of the Cutlery Rest at coordinate xMm in [-48, +64] (length = 112 mm).
 *
 * Key Architectural Features:
 *  1. Flat-Bottomed `|_|` Saddle Profile (ZERO V-Shape!):
 *     - Instead of a V-notch, the resting channel has a wide, flat horizontal floor `_`
 *       (channelFlatFloorWidthMm = 21.4 mm, z in [-10.7, +10.7] mm) and vertical side walls `|`
 *       rising cleanly to the flat top rims!
 *  2. Head #1 — Rear Stopper & Upper Stopper Roof Bridge (x in [-48.0, -22.5] mm):
 *     - Rear Stopper Back-Wall (x in [-48, -38.5] mm): blocks backward sliding.
 *     - Upper Stopper Roof Bridge (x in [-36.8, -23.2] mm): closed horizontal upper bridge at y in [24.0, 31.4] mm
 *       over the rectangular `|_|` rear tunnel (floor at y = 7.0 mm) that stops the handle tail from lifting upward.
 *  3. Reduced Middle Section Between the Two Supports (x in [-22.5, -1.0] mm, centered at x = -11.5 mm):
 *     - Low flat deck (wallHeight = 6.0 mm, centerFloorHeight = 5.4 mm) between the two supports.
 *  4. Head #2 — Tall Front `|_|` Neck Pillar (x in [-1.0, +23.0] mm, peak at x = +11.0 mm):
 *     - Flat horizontal resting floor `_` at y = 22.0 mm (width = 21.4 mm) + vertical side walls `|` rising to y = 34.0 mm!
 *  5. Forward Anti-Tipping Lower Stabilizer Extension Under the Edible Part (x in [+23.0, +64.0] mm):
 *     - Flat lower base (height = 5.8 mm, width = 44.0 mm) extending on the table underneath the floating
 *       edible part (y in [22.2, 31.5] mm), providing >= 16.0 mm of vertical air clearance!
 */
export function evaluateSupportProfileAtX(xMm: number): SupportSectionProfile {
  const x = clamp(xMm, SUPPORT_MIN_X_MM, SUPPORT_MAX_X_MM);

  const distFromEnd = Math.min(x - SUPPORT_MIN_X_MM, SUPPORT_MAX_X_MM - x);
  const endRound = Math.pow(clamp(distFromEnd / 6.0, 0.32, 1.0), 0.45);

  const rearHeadWeight = smoothWindow(x, -47.8, -43.5, -24.5, -18.0);
  const frontPillarWeight = smoothWindow(x, -1.5, 6.0, 16.0, 24.5);

  // Clean, straight architectural outer width (~44.0 mm total width, halfWidth = 22.0 mm) for crisp `|_|` walls
  const rawHalfWidth = 21.6;
  const baseHalfWidthMm = rawHalfWidth * endRound;
  const outerHalfWidthMm = (rawHalfWidth + 0.4) * endRound;

  const tailDrop = 1.0 - 0.14 * smoothstep(43.5, 48.0, -x);
  const noseDrop = 1.0 - 0.16 * smoothstep(58.5, 64.0, x);

  const basePlateHeightMm = 5.8 * tailDrop * noseDrop;

  // Total wall height H_wall(x): rises from 5.8 mm base up to 31.2 mm at Rear Head and 34.0 mm at Front Pillar
  const wallHeightMm =
    (5.8 + 25.4 * rearHeadWeight + 28.2 * frontPillarWeight) *
    tailDrop *
    noseDrop;

  // Centerline floor height H_center(x) (the flat horizontal `_` floor of the `|_|` profile!):
  // - Rear Stopper Back-Wall (x in [-48, -38.5] mm): rises to ~25.5 mm to block backward sliding
  // - Rear Tunnel Floor under Upper Stopper Bridge (x in [-36.8, -23.2] mm): flat floor at 7.0 mm
  // - Middle Deck (x in [-20, -2] mm) & Forward Stabilizer Base (x in [+25, +62] mm): flat at 5.2 mm
  // - Front `|_|` Neck Pillar (x in [+6, +16] mm): flat horizontal resting floor at 22.0 mm!
  const rearStopperWall = 18.5 * (1.0 - smoothstep(-40.5, -37.2, x)) * rearHeadWeight;
  const rearPocketFloor = 1.8 * rearHeadWeight;
  const frontSaddleFloor = 17.2 * frontPillarWeight;

  const rawCenterHeight =
    (5.2 + rearPocketFloor + rearStopperWall + frontSaddleFloor) *
    tailDrop *
    noseDrop;

  const centerFloorHeightMm = Math.min(rawCenterHeight, wallHeightMm - 0.6);

  // Wide flat horizontal resting floor `_` of the `|_|` channel: 21.4 mm wide (z in [-10.7, +10.7] mm)
  const channelFlatFloorWidthMm = 21.4 * endRound;

  const hasUpperStopperRoof = x >= -37.0 && x <= -23.0;
  const upperStopperCeilingYMm = hasUpperStopperRoof ? 24.0 : wallHeightMm;
  const upperStopperRoofTopYMm = hasUpperStopperRoof ? 31.2 : wallHeightMm;

  return {
    xMm: x,
    baseHalfWidthMm,
    outerHalfWidthMm,
    basePlateHeightMm,
    wallHeightMm,
    centerFloorHeightMm,
    channelFlatFloorWidthMm,
    hasUpperStopperRoof,
    upperStopperCeilingYMm,
    upperStopperRoofTopYMm,
  };
}

/**
 * Evaluates the exact centerline resting height (in mm) of the utensil bottom along X:
 * - At the Rear Tail End (x in [-36.5, -23.5] mm): the handle tail sits HIGH at y_bottom = 21.0 mm
 *   so its top surface (y_top = 23.8 mm) presses directly against the flat underside ceiling (y = 24.0 mm)
 *   of the Upper Stopper Roof Bridge ("se oprește în partea superioară și nu cade"), while leaving
 *   14.0 mm of open rectangular tunnel space underneath the handle tail (above the y = 7.0 mm floor)!
 * - At the Front `|_|` Neck Pillar (x = +11.0 mm): the utensil neck rests directly on the WIDE FLAT
 *   HORIZONTAL FLOOR `_` at y_bottom = 22.1 mm!
 * - Over the Forward Stabilizer Base (x in [+25, +82] mm): the eating part floats at y in [22.2, 31.0] mm
 *   above the 5.8 mm lower stabilizer base (>= 16.2 mm vertical air clearance!).
 */
function evaluateUtensilRestingBottomYMm(xMm: number): number {
  const t = clamp((xMm - -36.5) / (11.0 - -36.5), 0.0, 1.0);
  const linearY = 21.0 + (22.5 - 21.0) * t;
  const arch = Math.sin(t * Math.PI) * 0.25;
  let frontCantileverCurve = 0.0;
  if (xMm > 11.0) {
    const u = clamp((xMm - 11.0) / 71.0, 0.0, 1.0);
    frontCantileverCurve = 0.6 * Math.sin(u * Math.PI * 0.65) + 2.6 * u;
  }
  return linearY + arch + frontCantileverCurve;
}

/**
 * Builds the 100% 2-Manifold Watertight BufferGeometry of the Hygienic Cutlery Rest in millimeter coordinates
 * with a crisp `|_|` cross-section profile (wide flat horizontal resting floor `_` + vertical side walls `|`).
 *
 * Ring parameterization (M = 48, NS = 96):
 * For u = |2*k/M - 1| in [0, 1]:
 * - k in [16 .. 32] (u in [0.000, 0.333], 17 vertices):
 *     WIDE FLAT HORIZONTAL FLOOR `_` of `|_|`: z in [-10.7, +10.7] mm, y = hCenter (100% flat, zero V-notch!)
 * - k_R in [33 .. 40] (u in (0.333, 0.667], j_R = 96 - k_R in [56 .. 63], 8 vertical steps):
 *     VERTICAL INNER SIDE WALL `|` of `|_|`: rises from y = hCenter to y = hWall at |z| in [10.7, 12.1] mm!
 * - k_R in [41 .. 45] (u in (0.667, 0.875], j_R in [51 .. 55]):
 *     FLAT HORIZONTAL TOP RIM of the vertical wall `|`: |z| in [12.1, 20.8] mm, y = hWall!
 * - k_R in [46 .. 48] (u in (0.875, 1.000]):
 *     VERTICAL OUTER WALL descending to the bottom corner (yCorner, +-wOuter).
 */
export function buildCutleryRestGeometryMm(): THREE.BufferGeometry {
  const NX = 140;
  const M = 48;
  const NS = 2 * M; // 96 vertices per ring

  // Bridge longitudinal index range: i in [14 .. 31] corresponds to x in [-36.8 .. -23.2] mm
  const I_BRIDGE_START = 14;
  const I_BRIDGE_END = 31;
  // On the vertical inner wall `|` (j_R in [56 .. 63]):
  // j_R = 56 is the top inner corner (y = hWall = 31.2 mm),
  // j_R = 58 is on the vertical inner wall at y = 24.0 mm (ceiling height of the Upper Stopper Roof Bridge)!
  // Left wall mirror is j_L = 3*M - j_R = 144 - j_R (86 .. 88).
  const J_RIGHT_TOP = 56;
  const J_RIGHT_BOT = 59;
  const N_BRIDGE_STEPS = 16;

  const mainVertexCount = (NX + 1) * NS;
  const nBridgeI = I_BRIDGE_END - I_BRIDGE_START; // 17
  const nBridgeM = J_RIGHT_BOT - J_RIGHT_TOP; // 3
  const bridgePerimeterCount = 2 * (nBridgeI + nBridgeM); // 40 vertices per bridge ring
  const interiorBridgeRingCount = N_BRIDGE_STEPS - 1;
  const totalVertices = mainVertexCount + interiorBridgeRingCount * bridgePerimeterCount;

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);

  const lengthMm = SUPPORT_MAX_X_MM - SUPPORT_MIN_X_MM;

  for (let i = 0; i <= NX; i++) {
    const uLong = i / NX;
    const xBaseMm = SUPPORT_MIN_X_MM + uLong * lengthMm;
    const prof = evaluateSupportProfileAtX(xBaseMm);

    const wBase = prof.baseHalfWidthMm;
    const wOuter = prof.outerHalfWidthMm;
    const hWall = prof.wallHeightMm;
    const hCenter = prof.centerFloorHeightMm;
    const wChannelHalf = prof.channelFlatFloorWidthMm * 0.5; // 10.7 mm * endRound

    const yCorner = Math.min(1.6, hCenter * 0.35);

    // Inner wall top Z coordinate (nearly vertical `|` wall: only 1.3 mm draft over full wall height)
    const zInnerTop = wChannelHalf + (wOuter - wChannelHalf) * 0.13;
    // Outer wall top Z coordinate
    const zOuterTop = wOuter - (wOuter - wChannelHalf) * 0.08;

    // Shared lateral Z coordinate function z(k) so lower path k and upper path (2M - k) align vertically!
    const evalLateralZ = (k: number): number => {
      const s = k / M;
      const uSigned = 2.0 * s - 1.0;
      const absU = Math.abs(uSigned);
      const signU = uSigned < 0 ? -1.0 : uSigned > 0 ? 1.0 : 0.0;

      if (absU <= 16.0 / 48.0 + 1e-6) {
        // Segment 1 (k in 16..32, |u| in [0, 1/3]): Flat horizontal channel floor `_`
        const t1 = absU / (16.0 / 48.0);
        return signU * (t1 * wChannelHalf);
      } else if (absU <= 32.0 / 48.0 + 1e-6) {
        // Segment 2 (k_R in 33..40, |u| in (1/3, 2/3]): Vertical inner wall `|`
        const t2 = (absU - 16.0 / 48.0) / (16.0 / 48.0);
        return signU * (wChannelHalf + t2 * (zInnerTop - wChannelHalf));
      } else if (absU <= 42.0 / 48.0 + 1e-6) {
        // Segment 3 (k_R in 41..45, |u| in (2/3, 7/8]): Flat horizontal top wall rim
        const t3 = (absU - 32.0 / 48.0) / (10.0 / 48.0);
        return signU * (zInnerTop + t3 * (zOuterTop - zInnerTop));
      } else {
        // Segment 4 (k_R in 46..48, |u| in (7/8, 1]): Outer vertical flank
        const t4 = (absU - 42.0 / 48.0) / (6.0 / 48.0);
        return signU * (zOuterTop + t4 * (wOuter - zOuterTop));
      }
    };

    const evalLowerPoint = (k: number): [number, number] => {
      const s = k / M;
      const uSigned = 2.0 * s - 1.0;
      const absU = Math.abs(uSigned);
      const z = evalLateralZ(k);

      // Strictly flat on the printing bed y = 0.000 mm across |u| <= 7/8 (k in 3..45)
      if (absU <= 42.0 / 48.0 + 1e-6) {
        return [0.0, z];
      }

      // 45-degree elephant-foot bottom chamfer on the outermost 3 steps (k = 0..2 and 46..48)
      const t4 = (absU - 42.0 / 48.0) / (6.0 / 48.0);
      const y = t4 * yCorner;
      void wBase;
      return [y, z];
    };

    const evalUpperPoint = (k: number): [number, number] => {
      const s = k / M;
      const uSigned = 2.0 * s - 1.0;
      const absU = Math.abs(uSigned);
      const z = evalLateralZ(k);

      if (absU <= 16.0 / 48.0 + 1e-6) {
        // Segment 1 (k in 16..32): 100% FLAT HORIZONTAL FLOOR `_` of `|_|`!
        return [hCenter, z];
      } else if (absU <= 32.0 / 48.0 + 1e-6) {
        // Segment 2 (k_R in 33..40, j_R in 56..63): VERTICAL INNER SIDE WALL `|` of `|_|`!
        // Ascends from hCenter (at k_R = 32) to hWall (at k_R = 40, j_R = 56).
        // Notice: at k_R = 37 (j_R = 59), t2 = 5/8 = 0.625, placing y right at ~24.0 mm in the rear bridge zone!
        const t2 = (absU - 16.0 / 48.0) / (16.0 / 48.0);
        const y = hCenter + smoothstep(0.0, 1.0, t2) * (hWall - hCenter);
        return [y, z];
      } else if (absU <= 42.0 / 48.0 + 1e-6) {
        // Segment 3 (k_R in 41..45): Flat horizontal top wall crest of `|`
        const t3 = (absU - 32.0 / 48.0) / (10.0 / 48.0);
        const subtleCrown = Math.sin(t3 * Math.PI) * 0.25;
        return [hWall + subtleCrown, z];
      } else {
        // Segment 4 (k_R in 46..48): Vertical outer wall descending to yCorner
        const t4 = (absU - 42.0 / 48.0) / (6.0 / 48.0);
        const y = hWall - smoothstep(0.0, 1.0, t4) * (hWall - yCorner);
        return [y, z];
      }
    };

    for (let k = 0; k <= M; k++) {
      const [yMm, zMm] = evalLowerPoint(k);
      const vIdx = i * NS + k;
      positions[vIdx * 3] = xBaseMm;
      positions[vIdx * 3 + 1] = yMm;
      positions[vIdx * 3 + 2] = zMm;
      uvs[vIdx * 2] = uLong;
      uvs[vIdx * 2 + 1] = k / NS;
    }

    for (let k = 1; k < M; k++) {
      const j = 2 * M - k;
      const [yMm, zMm] = evalUpperPoint(k);
      const vIdx = i * NS + j;
      positions[vIdx * 3] = xBaseMm;
      positions[vIdx * 3 + 1] = yMm;
      positions[vIdx * 3 + 2] = zMm;
      uvs[vIdx * 2] = uLong;
      uvs[vIdx * 2 + 1] = j / NS;
    }
  }

  // Build ordered perimeter list (i, m) for the Upper Stopper Bridge patch where m in 0..nBridgeM
  // On Right wall: j_R = J_RIGHT_TOP + m (56..59)
  // On Left wall:  j_L = 3*M - j_R = 144 - j_R (88..85)
  const patchPerimeterIM: Array<{ i: number; m: number }> = [];
  for (let i = I_BRIDGE_START; i < I_BRIDGE_END; i++) {
    patchPerimeterIM.push({ i, m: 0 });
  }
  for (let m = 0; m < nBridgeM; m++) {
    patchPerimeterIM.push({ i: I_BRIDGE_END, m });
  }
  for (let i = I_BRIDGE_END; i > I_BRIDGE_START; i--) {
    patchPerimeterIM.push({ i, m: nBridgeM });
  }
  for (let m = nBridgeM; m > 0; m--) {
    patchPerimeterIM.push({ i: I_BRIDGE_START, m });
  }

  const bridgeRings: number[][] = new Array(N_BRIDGE_STEPS + 1);
  bridgeRings[0] = new Array(bridgePerimeterCount);
  bridgeRings[N_BRIDGE_STEPS] = new Array(bridgePerimeterCount);

  for (let p = 0; p < bridgePerimeterCount; p++) {
    const { i, m } = patchPerimeterIM[p];
    const jRight = J_RIGHT_TOP + m;
    const jLeft = 3 * M - jRight;
    bridgeRings[0][p] = i * NS + jRight;
    bridgeRings[N_BRIDGE_STEPS][p] = i * NS + jLeft;
  }

  // Populate interior bridge vertices for s = 1 .. N_BRIDGE_STEPS - 1 (flat horizontal roof & ceiling!)
  for (let s = 1; s < N_BRIDGE_STEPS; s++) {
    const alpha = s / N_BRIDGE_STEPS;
    const archSin = Math.sin(alpha * Math.PI);
    bridgeRings[s] = new Array(bridgePerimeterCount);

    for (let p = 0; p < bridgePerimeterCount; p++) {
      const { i, m } = patchPerimeterIM[p];
      const vRight = bridgeRings[0][p];
      const vLeft = bridgeRings[N_BRIDGE_STEPS][p];

      const xR = positions[vRight * 3];
      const yR = positions[vRight * 3 + 1];
      const zR = positions[vRight * 3 + 2];
      const zL = positions[vLeft * 3 + 2];

      const mNorm = m / nBridgeM;
      let xOffset = 0.0;
      if (i === I_BRIDGE_END && m > 0 && m < nBridgeM) {
        xOffset = +0.55 * Math.sin(mNorm * Math.PI) * archSin;
      } else if (i === I_BRIDGE_START && m > 0 && m < nBridgeM) {
        xOffset = -0.55 * Math.sin(mNorm * Math.PI) * archSin;
      }

      // Flat horizontal bridge matching the crisp `|_|` architectural geometry
      const yArch = (1.0 - mNorm) * 0.25 * archSin;

      const x = xR + xOffset;
      const y = yR + yArch;
      const z = (1.0 - alpha) * zR + alpha * zL;

      const vIdx = mainVertexCount + (s - 1) * bridgePerimeterCount + p;
      bridgeRings[s][p] = vIdx;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;
      uvs[vIdx * 2] = i / NX;
      uvs[vIdx * 2 + 1] = alpha;
    }
  }

  const indices: number[] = [];

  const J_LEFT_BOT = 3 * M - J_RIGHT_BOT; // 85
  const J_LEFT_TOP = 3 * M - J_RIGHT_TOP; // 88

  for (let i = 0; i < NX; i++) {
    const rowA = i * NS;
    const rowB = (i + 1) * NS;
    const inBridgeI = i >= I_BRIDGE_START && i < I_BRIDGE_END;

    for (let j = 0; j < NS; j++) {
      if (inBridgeI) {
        if (
          (j >= J_RIGHT_TOP && j < J_RIGHT_BOT) ||
          (j >= J_LEFT_BOT && j < J_LEFT_TOP)
        ) {
          continue;
        }
      }

      const jNext = (j + 1) % NS;
      const a = rowA + j;
      const b = rowB + j;
      const c = rowB + jNext;
      const d = rowA + jNext;

      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  for (let s = 0; s < N_BRIDGE_STEPS; s++) {
    const ringA = bridgeRings[s];
    const ringB = bridgeRings[s + 1];
    for (let p = 0; p < bridgePerimeterCount; p++) {
      const pNext = (p + 1) % bridgePerimeterCount;
      const a = ringA[p];
      const b = ringA[pNext];
      const c = ringB[pNext];
      const d = ringB[p];

      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  // Rear Vertical Ribbon Cap at i = 0
  const rearRow = 0;
  indices.push(rearRow + 0, rearRow + 1, rearRow + (2 * M - 1));

  for (let k = 1; k <= M - 2; k++) {
    const botA = rearRow + k;
    const botB = rearRow + (k + 1);
    const topB = rearRow + (2 * M - (k + 1));
    const topA = rearRow + (2 * M - k);

    indices.push(botA, botB, topB);
    indices.push(botA, topB, topA);
  }

  indices.push(rearRow + (M - 1), rearRow + M, rearRow + (M + 1));

  // Front Vertical Ribbon Cap at i = NX
  const frontRow = NX * NS;
  indices.push(frontRow + 0, frontRow + (2 * M - 1), frontRow + 1);

  for (let k = 1; k <= M - 2; k++) {
    const botA = frontRow + k;
    const botB = frontRow + (k + 1);
    const topB = frontRow + (2 * M - (k + 1));
    const topA = frontRow + (2 * M - k);

    indices.push(botA, topB, botB);
    indices.push(botA, topA, topB);
  }

  indices.push(frontRow + (M - 1), frontRow + (M + 1), frontRow + M);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  ensurePositiveWindingAndNormals(geometry);

  return geometry;
}

/**
 * Builds a closed 3D geometry for the Stainless Steel Spoon in millimeter coordinates:
 * - Handle tail (x in [-36.5, -23.5] mm) sits HIGH at y in [21.0, 23.8] mm directly underneath the
 *   flat Upper Stopper Roof Bridge ceiling (y ~ 24.0 mm);
 * - Neck (x in [+5, +17] mm) rests flat on the wide horizontal floor `_` (y = 22.0 mm) of the Front `|_|` Pillar;
 * - Concave spoon bowl (x in [+25, +82] mm) floats at y in [22.2, 31.0] mm above the forward stabilizer base.
 */
export function buildSpoonGeometryMm(): THREE.BufferGeometry {
  const NX = 84;
  const NS = 48;
  const totalRingVerts = (NX + 1) * NS;
  const rearPole = totalRingVerts;
  const frontPole = totalRingVerts + 1;
  const positions = new Float32Array((totalRingVerts + 2) * 3);
  const uvs = new Float32Array((totalRingVerts + 2) * 2);

  const xMin = -36.5;
  const xMax = 82.0;

  for (let i = 0; i <= NX; i++) {
    const u = i / NX;
    const x = xMin + u * (xMax - xMin);
    const baseY = evaluateUtensilRestingBottomYMm(x);

    const endRear = Math.pow(clamp((x - xMin + 0.4) / 5.5, 0.12, 1.0), 0.55);
    const tailFlare = 1.6 * (1.0 - smoothstep(-36.0, -8.0, x));
    const neckPinch = -1.4 * smoothWindow(x, -6.0, 4.0, 17.0, 27.0);
    const bowlSine =
      x > 24.0 ? Math.sin(clamp((x - 24.0) / (xMax - 24.0), 0.0, 1.0) * Math.PI) : 0.0;

    const halfWidth =
      (4.6 + tailFlare + neckPinch) * endRear * (1.0 - smoothstep(24.0, 34.0, x)) +
      17.4 * Math.pow(bowlSine, 0.78);

    const thickness = 2.4 - 0.75 * smoothstep(22.0, 35.0, x);
    const bowlRimLift = 5.1 * Math.pow(bowlSine, 0.85);
    const bowlConcavity = 5.6 * Math.pow(bowlSine, 1.05);

    for (let j = 0; j < NS; j++) {
      const theta = (j / NS) * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const z = cosT * halfWidth;
      const radialR2 = cosT * cosT;

      const rimArch = bowlRimLift * radialR2 - bowlConcavity * (1.0 - radialR2) * 0.35;
      const handleCrown = 0.30 * (1.0 - radialR2) * (1.0 - smoothstep(20.0, 31.0, x));
      const yMid = baseY + thickness * 0.5 + rimArch + handleCrown;
      const localHalfThick = (thickness * 0.5) * (0.45 + 0.55 * Math.sqrt(1.0 - 0.65 * radialR2));
      const y = yMid + sinT * localHalfThick;

      const idx = i * NS + j;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = j / NS;
    }
  }

  positions[rearPole * 3] = xMin - 0.35;
  positions[rearPole * 3 + 1] = evaluateUtensilRestingBottomYMm(xMin) + 1.2;
  positions[rearPole * 3 + 2] = 0.0;

  positions[frontPole * 3] = xMax + 0.35;
  positions[frontPole * 3 + 1] = evaluateUtensilRestingBottomYMm(xMax) + 1.7;
  positions[frontPole * 3 + 2] = 0.0;

  const indices: number[] = [];
  for (let i = 0; i < NX; i++) {
    const rA = i * NS;
    const rB = (i + 1) * NS;
    for (let j = 0; j < NS; j++) {
      const jN = (j + 1) % NS;
      indices.push(rA + j, rB + j, rB + jN);
      indices.push(rA + j, rB + jN, rA + jN);
    }
  }
  for (let j = 0; j < NS; j++) {
    const jN = (j + 1) % NS;
    indices.push(rearPole, j, jN);
    indices.push(frontPole, NX * NS + jN, NX * NS + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  ensurePositiveWindingAndNormals(geo);
  return geo;
}

/**
 * Builds the 3D Stainless Steel Fork in millimeter coordinates resting on the flat `|_|` saddle floor.
 */
export function buildForkGeometryMm(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const appendLoftTube = (
    xStart: number,
    xEnd: number,
    nx: number,
    ns: number,
    evalRingPoint: (x: number, u: number, theta: number) => [number, number, number]
  ): void => {
    const baseVertex = positions.length / 3;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const x = xStart + u * (xEnd - xStart);
      for (let j = 0; j < ns; j++) {
        const theta = (j / ns) * Math.PI * 2.0;
        const [px, py, pz] = evalRingPoint(x, u, theta);
        positions.push(px, py, pz);
        uvs.push(u, j / ns);
      }
    }
    const rearCenterIdx = positions.length / 3;
    const [rx, ry, rz] = evalRingPoint(xStart - 0.25, 0, 0);
    positions.push(rx, ry, rz);
    uvs.push(0, 0.5);

    const frontCenterIdx = positions.length / 3;
    const [fx, fy, fz] = evalRingPoint(xEnd + 0.25, 1, 0);
    positions.push(fx, fy, fz);
    uvs.push(1, 0.5);

    for (let i = 0; i < nx; i++) {
      const rA = baseVertex + i * ns;
      const rB = baseVertex + (i + 1) * ns;
      for (let j = 0; j < ns; j++) {
        const jN = (j + 1) % ns;
        indices.push(rA + j, rB + j, rB + jN);
        indices.push(rA + j, rB + jN, rA + jN);
      }
    }
    for (let j = 0; j < ns; j++) {
      const jN = (j + 1) % ns;
      indices.push(rearCenterIdx, baseVertex + j, baseVertex + jN);
      indices.push(frontCenterIdx, baseVertex + nx * ns + jN, baseVertex + nx * ns + j);
    }
  };

  // 1. Main handle + neck + fork shoulder (x in [-36.5, +43.5] mm)
  appendLoftTube(-36.5, 43.5, 60, 36, (x, _u, theta) => {
    const baseY = evaluateUtensilRestingBottomYMm(x);
    const endRear = Math.pow(clamp((x - -36.5 + 0.4) / 5.5, 0.15, 1.0), 0.55);
    const tailFlare = 1.6 * (1.0 - smoothstep(-36.0, -8.0, x));
    const neckPinch = -1.4 * smoothWindow(x, -6.0, 4.0, 17.0, 27.0);
    const shoulderFlare = 7.4 * smoothstep(23.0, 40.0, x);
    const halfWidth = (4.6 + tailFlare + neckPinch + shoulderFlare) * endRear;
    const thickness = 2.4 - 0.65 * smoothstep(22.0, 41.0, x);

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const z = cosT * halfWidth;
    const scoop = -0.35 * smoothstep(26.0, 43.5, x) * (1.0 - 0.35 * cosT * cosT);
    const y = baseY + thickness * 0.5 + scoop + sinT * (thickness * 0.5);
    return [x, y, z];
  });

  // 2. Four sleek, slender, gracefully curved 3D tines (x in [+41.5, +81.5] mm)
  const tineZOffsets = [-9.6, -3.2, 3.2, 9.6];
  for (const zCenterBase of tineZOffsets) {
    appendLoftTube(41.5, 81.5, 28, 20, (x, u, theta) => {
      const baseY = evaluateUtensilRestingBottomYMm(x);
      const taper = 1.0 - 0.76 * Math.pow(u, 1.25);
      const halfW = 1.25 * taper;
      const halfH = 0.60 * taper;
      const curveY = -0.35 + 1.45 * u * u;
      const zCenter = zCenterBase * (1.0 - 0.07 * u);
      const z = zCenter + Math.cos(theta) * halfW;
      const y = baseY + 0.85 + curveY + Math.sin(theta) * halfH;
      return [x, y, z];
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  ensurePositiveWindingAndNormals(geo);
  return geo;
}

/**
 * Builds the 3D Stainless Steel Dinner Knife resting on the flat `|_|` saddle floor (y = 22.0 mm).
 */
export function buildKnifeGeometryMm(): THREE.BufferGeometry {
  const NX = 84;
  const NS = 40;
  const totalRingVerts = (NX + 1) * NS;
  const rearPole = totalRingVerts;
  const frontPole = totalRingVerts + 1;
  const positions = new Float32Array((totalRingVerts + 2) * 3);
  const uvs = new Float32Array((totalRingVerts + 2) * 2);

  const xMin = -36.5;
  const xMax = 84.0;

  for (let i = 0; i <= NX; i++) {
    const u = i / NX;
    const x = xMin + u * (xMax - xMin);

    const bladeBlend = smoothstep(-5.0, 5.0, x);
    const endRear = Math.pow(clamp((x - xMin + 0.4) / 5.5, 0.14, 1.0), 0.55);

    const handleTopY = 23.6 + 0.5 * smoothstep(-36.5, 4.0, x);
    const handleBotY = handleTopY - 3.6;

    const tipDist = clamp((x - 50.0) / (xMax - 50.0), 0.0, 1.0);
    const bladeTopY = 32.5 - 3.0 * Math.pow(tipDist, 1.85);

    const bellyRise =
      x > 23.0 ? 8.2 * Math.pow(clamp((x - 23.0) / (xMax - 23.0), 0.0, 1.0), 2.05) : 0.0;
    const bladeBotY = Math.min(22.1 + bellyRise, bladeTopY - 0.9);

    const yBottom = (1.0 - bladeBlend) * handleBotY + bladeBlend * bladeBotY;
    const yTop = (1.0 - bladeBlend) * handleTopY + bladeBlend * bladeTopY;
    const height = Math.max(0.9, yTop - yBottom);

    const tipThicknessTaper =
      1.0 - 0.68 * Math.pow(clamp((x - 40.0) / (xMax - 40.0), 0.0, 1.0), 1.4);
    const handleHalfWidth = 5.6 * endRear * (1.0 - 0.28 * smoothstep(-32.0, 0.0, x));
    const bolsterFlare = 1.3 * smoothWindow(x, -6.0, -2.0, 2.0, 6.0);
    const bladeHalfThick = 1.15 * tipThicknessTaper;

    for (let j = 0; j < NS; j++) {
      const theta = (j / NS) * Math.PI * 2.0;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const vNorm = 0.5 * (sinT + 1.0);
      const y = yBottom + vNorm * height;

      const bladeWedge = 0.18 + 0.82 * Math.pow(vNorm, 0.62);
      const halfZ =
        (1.0 - bladeBlend) * (handleHalfWidth + bolsterFlare) +
        bladeBlend * (bladeHalfThick * bladeWedge + bolsterFlare * 0.35);
      const z = cosT * halfZ;

      const idx = i * NS + j;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = j / NS;
    }
  }

  positions[rearPole * 3] = xMin - 0.35;
  positions[rearPole * 3 + 1] = 21.8;
  positions[rearPole * 3 + 2] = 0.0;

  const lastRingTopY = positions[(NX * NS + Math.floor(NS * 0.25)) * 3 + 1];
  const lastRingBotY = positions[(NX * NS + Math.floor(NS * 0.75)) * 3 + 1];
  positions[frontPole * 3] = xMax + 0.35;
  positions[frontPole * 3 + 1] = 0.5 * (lastRingTopY + lastRingBotY);
  positions[frontPole * 3 + 2] = 0.0;

  const indices: number[] = [];
  for (let i = 0; i < NX; i++) {
    const rA = i * NS;
    const rB = (i + 1) * NS;
    for (let j = 0; j < NS; j++) {
      const jN = (j + 1) % NS;
      indices.push(rA + j, rB + j, rB + jN);
      indices.push(rA + j, rB + jN, rA + jN);
    }
  }
  for (let j = 0; j < NS; j++) {
    const jN = (j + 1) % NS;
    indices.push(rearPole, j, jN);
    indices.push(frontPole, NX * NS + jN, NX * NS + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  ensurePositiveWindingAndNormals(geo);
  return geo;
}

/**
 * Generates high-resolution procedural PBR textures for the Warm Terracotta / Ceramic-Amber
 * 3D-printed composite support (organic multi-octave mineral grain + subtle realistic FDM micro-layering).
 */
function createSupportCeramicPbrTextures(): {
  albedoMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
} {
  const width = 512;
  const height = 512;
  const albedoData = new Uint8Array(width * height * 4);
  const roughData = new Uint8Array(width * height * 4);
  const bumpData = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);

      const pX = u * 9.5;
      const pY = v * 9.5;
      const grainMacro = fbm3D(pX + 1.7, pY + 3.1, 0.8, 4);
      const grainMicro = fbm3D(pX * 4.2, pY * 4.2, 2.4, 3);
      const fleckNoise = valueNoise3D(pX * 14.0, pY * 14.0, 5.1);

      const microLayer =
        0.5 + 0.5 * Math.sin((v * 82.0 + grainMicro * 1.4) * Math.PI * 2.0);

      const warmTone = clamp(
        0.48 + (grainMacro - 0.5) * 0.42 + (grainMicro - 0.5) * 0.22,
        0.0,
        1.0
      );
      const isMineralFleck = fleckNoise > 0.83 ? (fleckNoise - 0.83) / 0.17 : 0.0;

      let r = 188 + warmTone * 44 - isMineralFleck * 36 + microLayer * 5;
      let g = 82 + warmTone * 38 - isMineralFleck * 24 + microLayer * 3;
      let b = 48 + warmTone * 24 - isMineralFleck * 14 + microLayer * 2;

      r = clamp(Math.round(r), 0, 255);
      g = clamp(Math.round(g), 0, 255);
      b = clamp(Math.round(b), 0, 255);

      const idx = (y * width + x) * 4;
      albedoData[idx] = r;
      albedoData[idx + 1] = g;
      albedoData[idx + 2] = b;
      albedoData[idx + 3] = 255;

      const roughVal = clamp(
        0.38 + (0.5 - grainMacro) * 0.12 + (0.5 - microLayer) * 0.04,
        0.28,
        0.54
      );
      const rByte = Math.round(roughVal * 255);
      roughData[idx] = rByte;
      roughData[idx + 1] = rByte;
      roughData[idx + 2] = rByte;
      roughData[idx + 3] = 255;

      const bumpVal = clamp(
        0.5 + (grainMicro - 0.5) * 0.35 + (microLayer - 0.5) * 0.18,
        0.0,
        1.0
      );
      const bByte = Math.round(bumpVal * 255);
      bumpData[idx] = bByte;
      bumpData[idx + 1] = bByte;
      bumpData[idx + 2] = bByte;
      bumpData[idx + 3] = 255;
    }
  }

  const configureTex = (
    data: Uint8Array<ArrayBuffer>,
    colorSpace: THREE.ColorSpace
  ): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    tex.colorSpace = colorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    albedoMap: configureTex(albedoData, THREE.SRGBColorSpace),
    roughnessMap: configureTex(roughData, THREE.NoColorSpace),
    bumpMap: configureTex(bumpData, THREE.NoColorSpace),
  };
}

/**
 * Generates a fine brushed 18/10 stainless steel texture for the cutlery utensils.
 */
function createBrushedSteelTextures(): {
  albedoMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
} {
  const width = 256;
  const height = 256;
  const albedoData = new Uint8Array(width * height * 4);
  const roughData = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const streak = fbm3D(u * 3.5, v * 42.0, 1.2, 3);
      const sheen = 232 + Math.round((streak - 0.5) * 18);
      const idx = (y * width + x) * 4;
      albedoData[idx] = clamp(sheen, 210, 252);
      albedoData[idx + 1] = clamp(sheen + 2, 212, 254);
      albedoData[idx + 2] = clamp(sheen + 6, 216, 255);
      albedoData[idx + 3] = 255;

      const roughByte = Math.round(clamp(0.18 + (0.5 - streak) * 0.08, 0.12, 0.26) * 255);
      roughData[idx] = roughByte;
      roughData[idx + 1] = roughByte;
      roughData[idx + 2] = roughByte;
      roughData[idx + 3] = 255;
    }
  }

  const albedoMap = new THREE.DataTexture(albedoData, width, height, THREE.RGBAFormat);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, width, height, THREE.RGBAFormat);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;

  return { albedoMap, roughnessMap };
}

/**
 * Scales a millimeter-space BufferGeometry into Three.js scene units with exact base contact at y = 0.000.
 */
function createSceneScaledGeometry(geometryMm: THREE.BufferGeometry): THREE.BufferGeometry {
  const cloned = geometryMm.clone();
  const pos = cloned.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const xScene = pos.getX(i) * MM_TO_SCENE;
    const yScene = pos.getY(i) * MM_TO_SCENE;
    const zScene = pos.getZ(i) * MM_TO_SCENE;
    pos.setXYZ(i, xScene, yScene, zScene);
  }
  pos.needsUpdate = true;
  cloned.computeVertexNormals();
  cloned.computeBoundingBox();
  cloned.computeBoundingSphere();
  return cloned;
}

/**
 * Creates the complete Hygienic Cutlery Rest + 3 Interchangeable Stainless Steel Utensils (Spoon, Fork, Knife).
 */
export function createCutleryRest(): CutleryRestRig {
  const group = new THREE.Group();
  group.name = 'CutleryRestAssembly';
  group.position.set(0, 0, 0);
  group.rotation.y = STUDIO_PRESENTATION_YAW_RAD;

  const contentOffsetGroup = new THREE.Group();
  contentOffsetGroup.name = 'CutleryRestCenteredContent';
  contentOffsetGroup.position.set(VISUAL_CENTER_OFFSET_X_MM * MM_TO_SCENE, 0, 0);
  group.add(contentOffsetGroup);

  const supportGeometryMm = buildCutleryRestGeometryMm();
  const spoonGeometryMm = buildSpoonGeometryMm();
  const forkGeometryMm = buildForkGeometryMm();
  const knifeGeometryMm = buildKnifeGeometryMm();

  const supportSceneGeo = createSceneScaledGeometry(supportGeometryMm);
  const spoonSceneGeo = createSceneScaledGeometry(spoonGeometryMm);
  const forkSceneGeo = createSceneScaledGeometry(forkGeometryMm);
  const knifeSceneGeo = createSceneScaledGeometry(knifeGeometryMm);

  const supportTextures = createSupportCeramicPbrTextures();
  const supportMaterial = new THREE.MeshPhysicalMaterial({
    map: supportTextures.albedoMap,
    roughnessMap: supportTextures.roughnessMap,
    bumpMap: supportTextures.bumpMap,
    bumpScale: 0.0035,
    roughness: 0.92,
    metalness: 0.03,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    reflectivity: 0.55,
    sheen: 0.18,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ffbfa0'),
  });

  const steelTextures = createBrushedSteelTextures();
  const steelMaterial = new THREE.MeshPhysicalMaterial({
    map: steelTextures.albedoMap,
    roughnessMap: steelTextures.roughnessMap,
    color: new THREE.Color('#eef4fa'),
    metalness: 0.86,
    roughness: 0.88,
    clearcoat: 0.35,
    clearcoatRoughness: 0.16,
    reflectivity: 0.95,
  });

  const supportMesh = new THREE.Mesh(supportSceneGeo, supportMaterial);
  supportMesh.name = 'CutleryRestSupport';
  supportMesh.castShadow = true;
  supportMesh.receiveShadow = true;
  contentOffsetGroup.add(supportMesh);

  const spoonMesh = new THREE.Mesh(spoonSceneGeo, steelMaterial);
  spoonMesh.name = 'UtensilSpoon';
  spoonMesh.castShadow = true;
  spoonMesh.receiveShadow = true;
  contentOffsetGroup.add(spoonMesh);

  const forkMesh = new THREE.Mesh(forkSceneGeo, steelMaterial);
  forkMesh.name = 'UtensilFork';
  forkMesh.castShadow = true;
  forkMesh.receiveShadow = true;
  forkMesh.visible = false;
  contentOffsetGroup.add(forkMesh);

  const knifeMesh = new THREE.Mesh(knifeSceneGeo, steelMaterial);
  knifeMesh.name = 'UtensilKnife';
  knifeMesh.castShadow = true;
  knifeMesh.receiveShadow = true;
  knifeMesh.visible = false;
  contentOffsetGroup.add(knifeMesh);

  const setActiveUtensil = (mode: string): void => {
    if (mode === 'print_ready') {
      spoonMesh.visible = false;
      forkMesh.visible = false;
      knifeMesh.visible = false;
      contentOffsetGroup.position.set(-8.0 * MM_TO_SCENE, 0, 0);
    } else if (mode === 'fork') {
      spoonMesh.visible = false;
      forkMesh.visible = true;
      knifeMesh.visible = false;
      contentOffsetGroup.position.set(VISUAL_CENTER_OFFSET_X_MM * MM_TO_SCENE, 0, 0);
    } else if (mode === 'knife') {
      spoonMesh.visible = false;
      forkMesh.visible = false;
      knifeMesh.visible = true;
      contentOffsetGroup.position.set(VISUAL_CENTER_OFFSET_X_MM * MM_TO_SCENE, 0, 0);
    } else {
      spoonMesh.visible = true;
      forkMesh.visible = false;
      knifeMesh.visible = false;
      contentOffsetGroup.position.set(VISUAL_CENTER_OFFSET_X_MM * MM_TO_SCENE, 0, 0);
    }
  };

  const setPose = (action: string, t: number): void => {
    const safeT = Number.isFinite(t) ? t : 0;
    group.position.set(0, 0, 0);
    group.rotation.set(0, STUDIO_PRESENTATION_YAW_RAD, 0);

    if (action === 'turntable' || action === 'walk' || action === 'showcase') {
      setActiveUtensil('spoon');
      const duration = 8.0;
      const angle = (safeT / duration) * Math.PI * 2.0;
      group.rotation.y = STUDIO_PRESENTATION_YAW_RAD + angle;
    } else {
      setActiveUtensil(action);
    }

    group.updateMatrixWorld(true);
  };

  const setWireframe = (enabled: boolean): void => {
    supportMaterial.wireframe = enabled;
    steelMaterial.wireframe = enabled;
    supportMaterial.needsUpdate = true;
    steelMaterial.needsUpdate = true;
  };

  const dispose = (): void => {
    supportGeometryMm.dispose();
    spoonGeometryMm.dispose();
    forkGeometryMm.dispose();
    knifeGeometryMm.dispose();
    supportSceneGeo.dispose();
    spoonSceneGeo.dispose();
    forkSceneGeo.dispose();
    knifeSceneGeo.dispose();
    supportMaterial.dispose();
    steelMaterial.dispose();
    supportTextures.albedoMap.dispose();
    supportTextures.roughnessMap.dispose();
    supportTextures.bumpMap.dispose();
    steelTextures.albedoMap.dispose();
    steelTextures.roughnessMap.dispose();
  };

  return {
    group,
    supportMesh,
    supportGeometryMm,
    spoonMesh,
    forkMesh,
    knifeMesh,
    utensilGeometriesMm: {
      spoon: spoonGeometryMm,
      fork: forkGeometryMm,
      knife: knifeGeometryMm,
    },
    setPose,
    setWireframe,
    dispose,
  };
}
