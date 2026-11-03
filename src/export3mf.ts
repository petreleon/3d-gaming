import * as THREE from 'three';

export interface ManifoldAuditReport {
  isManifold: boolean;
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
  eulerCharacteristic: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  degenerateTriangleCount: number;
  signedVolumeMm3: number;
  minZMm: number;
  bedContactVertexCount: number;
  dimensionsMm: {
    x: number;
    y: number;
    z: number;
  };
  boundsMm: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export interface Mesh3mfData {
  /** Vertices in 3MF millimeter space: X = length, Y = width (-Z_three), Z = height (Y_three >= 0) */
  vertices: Array<[number, number, number]>;
  /** Triangles as [v1, v2, v3] with outward-pointing normals */
  triangles: Array<[number, number, number]>;
}

/**
 * Extracts welded 3MF vertices and triangles in millimeter coordinates from a BufferGeometry.
 * Applies a right-handed coordinate rotation (X_3mf = X_three, Y_3mf = -Z_three, Z_3mf = Y_three)
 * and shifts Z_3mf so the flat printing base rests at exact z = 0.000 mm.
 */
export function extract3mfMeshFromGeometry(
  geometry: THREE.BufferGeometry,
  scaleToMm = 1.0
): Mesh3mfData {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) {
    throw new Error('BufferGeometry is missing a position attribute.');
  }

  const rawVertices: Array<[number, number, number]> = [];
  let minZ = Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i) * scaleToMm;
    const y = -posAttr.getZ(i) * scaleToMm;
    const z = posAttr.getY(i) * scaleToMm;
    if (z < minZ) {
      minZ = z;
    }
    rawVertices.push([x, y, z]);
  }

  // Shift Z so the lowest point on the base is at exact 0.000 mm
  const zShift = Math.abs(minZ) < 1e-6 ? -minZ : -minZ;
  for (let i = 0; i < rawVertices.length; i++) {
    let zVal = rawVertices[i][2] + zShift;
    if (Math.abs(zVal) < 1e-5) {
      zVal = 0.0;
    }
    rawVertices[i][2] = zVal;
  }

  // Weld vertices within 1e-4 mm so topological sharing is exact even if duplicate indices exist
  const weldMap = new Map<string, number>();
  const uniqueVertices: Array<[number, number, number]> = [];
  const oldToNewIndex = new Int32Array(rawVertices.length);

  for (let i = 0; i < rawVertices.length; i++) {
    const [x, y, z] = rawVertices[i];
    const key = `${Math.round(x * 10000)},${Math.round(y * 10000)},${Math.round(z * 10000)}`;
    let mapped = weldMap.get(key);
    if (mapped === undefined) {
      mapped = uniqueVertices.length;
      uniqueVertices.push([x, y, z]);
      weldMap.set(key, mapped);
    }
    oldToNewIndex[i] = mapped;
  }

  const triangles: Array<[number, number, number]> = [];
  const indexAttr = geometry.getIndex();

  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      const a = oldToNewIndex[indexAttr.getX(i)];
      const b = oldToNewIndex[indexAttr.getX(i + 1)];
      const c = oldToNewIndex[indexAttr.getX(i + 2)];
      triangles.push([a, b, c]);
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      const a = oldToNewIndex[i];
      const b = oldToNewIndex[i + 1];
      const c = oldToNewIndex[i + 2];
      triangles.push([a, b, c]);
    }
  }

  // Check signed volume; if negative, flip triangle orientation so normals face outward
  let signedVolume6 = 0;
  for (let i = 0; i < triangles.length; i++) {
    const [ia, ib, ic] = triangles[i];
    const va = uniqueVertices[ia];
    const vb = uniqueVertices[ib];
    const vc = uniqueVertices[ic];
    const crossX = vb[1] * vc[2] - vb[2] * vc[1];
    const crossY = vb[2] * vc[0] - vb[0] * vc[2];
    const crossZ = vb[0] * vc[1] - vb[1] * vc[0];
    signedVolume6 += va[0] * crossX + va[1] * crossY + va[2] * crossZ;
  }

  if (signedVolume6 < 0) {
    for (let i = 0; i < triangles.length; i++) {
      const tmp = triangles[i][1];
      triangles[i][1] = triangles[i][2];
      triangles[i][2] = tmp;
    }
  }

  return {
    vertices: uniqueVertices,
    triangles,
  };
}

/**
 * Performs a rigorous forensic 2-manifold and watertightness audit on a BufferGeometry.
 */
export function verifyManifoldTopology(
  geometry: THREE.BufferGeometry,
  scaleToMm = 1.0
): ManifoldAuditReport {
  const { vertices, triangles } = extract3mfMeshFromGeometry(geometry, scaleToMm);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let bedContactVertexCount = 0;

  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (Math.abs(z) <= 1e-4) {
      bedContactVertexCount++;
    }
  }

  const directedHalfEdges = new Map<string, number>();
  const undirectedEdges = new Map<string, { forward: number; backward: number }>();
  let degenerateTriangleCount = 0;
  let signedVolume6 = 0;

  const addHalfEdge = (u: number, v: number): void => {
    const dirKey = `${u}->${v}`;
    directedHalfEdges.set(dirKey, (directedHalfEdges.get(dirKey) ?? 0) + 1);

    const minIdx = Math.min(u, v);
    const maxIdx = Math.max(u, v);
    const undirKey = `${minIdx}_${maxIdx}`;
    let entry = undirectedEdges.get(undirKey);
    if (!entry) {
      entry = { forward: 0, backward: 0 };
      undirectedEdges.set(undirKey, entry);
    }
    if (u < v) {
      entry.forward++;
    } else {
      entry.backward++;
    }
  };

  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    if (a === b || b === c || c === a) {
      degenerateTriangleCount++;
      continue;
    }

    const va = vertices[a];
    const vb = vertices[b];
    const vc = vertices[c];

    const abx = vb[0] - va[0];
    const aby = vb[1] - va[1];
    const abz = vb[2] - va[2];
    const acx = vc[0] - va[0];
    const acy = vc[1] - va[1];
    const acz = vc[2] - va[2];

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const doubleArea = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (doubleArea < 1e-7) {
      degenerateTriangleCount++;
    }

    const crossX = vb[1] * vc[2] - vb[2] * vc[1];
    const crossY = vb[2] * vc[0] - vb[0] * vc[2];
    const crossZ = vb[0] * vc[1] - vb[1] * vc[0];
    signedVolume6 += va[0] * crossX + va[1] * crossY + va[2] * crossZ;

    addHalfEdge(a, b);
    addHalfEdge(b, c);
    addHalfEdge(c, a);
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;

  for (const [, counts] of undirectedEdges) {
    const total = counts.forward + counts.backward;
    if (total === 1) {
      boundaryEdgeCount++;
    } else if (total !== 2 || counts.forward !== 1 || counts.backward !== 1) {
      nonManifoldEdgeCount++;
    }
  }

  const vertexCount = vertices.length;
  const triangleCount = triangles.length;
  const edgeCount = undirectedEdges.size;
  const eulerCharacteristic = vertexCount - edgeCount + triangleCount;
  const signedVolumeMm3 = signedVolume6 / 6.0;

  const isManifold =
    boundaryEdgeCount === 0 &&
    nonManifoldEdgeCount === 0 &&
    degenerateTriangleCount === 0 &&
    signedVolumeMm3 > 0;

  return {
    isManifold,
    vertexCount,
    triangleCount,
    edgeCount,
    eulerCharacteristic,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    degenerateTriangleCount,
    signedVolumeMm3,
    minZMm: minZ,
    bedContactVertexCount,
    dimensionsMm: {
      x: maxX - minX,
      y: maxY - minY,
      z: maxZ - minZ,
    },
    boundsMm: {
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
    },
  };
}

/**
 * Precomputed IEEE 802.3 CRC-32 lookup table for standard ZIP archive creation.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const idx = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[idx];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  path: string;
  content: Uint8Array;
}

/**
 * Packs an array of files into a standards-compliant uncompressed PKZIP archive (.3mf container).
 */
export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = entry.content;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + file name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // PK\x03\x04
    localView.setUint16(4, 20, true); // Version needed to extract (2.0)
    localView.setUint16(6, 0, true); // General purpose bit flag
    localView.setUint16(8, 0, true); // Compression method: 0 (STORE)
    localView.setUint16(10, 0x4000, true); // Mod time
    localView.setUint16(12, 0x5663, true); // Mod date
    localView.setUint32(14, crc, true); // CRC-32
    localView.setUint32(18, size, true); // Compressed size
    localView.setUint32(22, size, true); // Uncompressed size
    localView.setUint16(26, nameBytes.length, true); // File name length
    localView.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    // Central directory file header (46 bytes + file name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // PK\x01\x02
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed
    centralView.setUint16(8, 0, true); // Bit flag
    centralView.setUint16(10, 0, true); // Compression method: 0 (STORE)
    centralView.setUint16(12, 0x4000, true); // Mod time
    centralView.setUint16(14, 0x5663, true); // Mod date
    centralView.setUint32(16, crc, true); // CRC-32
    centralView.setUint32(20, size, true); // Compressed size
    centralView.setUint32(24, size, true); // Uncompressed size
    centralView.setUint16(28, nameBytes.length, true); // File name length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // Comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal file attributes
    centralView.setUint32(38, 0, true); // External file attributes
    centralView.setUint32(42, localOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (let i = 0; i < centralChunks.length; i++) {
    centralSize += centralChunks[i].length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // PK\x05\x06
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, entries.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, entries.length, true); // Total number of central directory records
  eocdView.setUint32(12, centralSize, true); // Size of central directory
  eocdView.setUint32(16, localOffset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  const totalLength = localOffset + centralSize + eocd.length;
  const output = new Uint8Array(totalLength);
  let cursor = 0;

  for (let i = 0; i < localChunks.length; i++) {
    output.set(localChunks[i], cursor);
    cursor += localChunks[i].length;
  }
  for (let i = 0; i < centralChunks.length; i++) {
    output.set(centralChunks[i], cursor);
    cursor += centralChunks[i].length;
  }
  output.set(eocd, cursor);

  return output;
}

/**
 * Generates a complete, slicer-ready .3mf archive (Bambu Studio, PrusaSlicer, Cura)
 * from the cutlery rest BufferGeometry.
 */
export function generate3mfFromGeometry(
  geometry: THREE.BufferGeometry,
  scaleToMm = 1.0
): Uint8Array {
  const { vertices, triangles } = extract3mfMeshFromGeometry(geometry, scaleToMm);
  const encoder = new TextEncoder();

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  const vertexLines = new Array<string>(vertices.length);
  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    vertexLines[i] =
      `          <vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}" />`;
  }

  const triangleLines = new Array<string>(triangles.length);
  for (let i = 0; i < triangles.length; i++) {
    const [v1, v2, v3] = triangles[i];
    triangleLines[i] = `          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`;
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="ro-RO" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Title">Suport Igienic Tacamuri (Cutit, Lingura, Furculita)</metadata>
  <metadata name="Designer">3D Gaming Studio Procedural CAD</metadata>
  <metadata name="Description">Suport ergonomic 3D-printable cu extensie inalta V+U pentru gatul tacamului (fara contact cu partea cu care se mananca) si opritor posterior cu capota anti-basculare pentru imobilizare.</metadata>
  <metadata name="Application">Three.js Parametric 2-Manifold CAD Exporter</metadata>
  <resources>
    <m:basematerials id="1">
      <m:base name="Terracotta Ceramic-PLA" displaycolor="#D4653B" />
    </m:basematerials>
    <object id="2" name="Suport_Igienic_Tacamuri" type="model" pid="1" pindex="0">
      <mesh>
        <vertices>
${vertexLines.join('\n')}
        </vertices>
        <triangles>
${triangleLines.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
  </build>
</model>`;

  return createZipArchive([
    { path: '[Content_Types].xml', content: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', content: encoder.encode(relsXml) },
    { path: '3D/3dmodel.model', content: encoder.encode(modelXml) },
  ]);
}

/**
 * Parses a stored PKZIP (.3mf) byte array and returns a Map of file paths to UTF-8 text contents.
 * Used by automated tests to verify the generated .3mf structure and XML payload.
 */
export function parse3mfArchiveEntries(zipBytes: Uint8Array): Map<string, string> {
  const decoder = new TextDecoder();
  const entries = new Map<string, string>();
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

  let offset = 0;
  while (offset + 30 <= zipBytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) {
      break;
    }
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const path = decoder.decode(zipBytes.subarray(nameStart, nameStart + nameLen));
    const content = decoder.decode(zipBytes.subarray(dataStart, dataStart + compressedSize));
    entries.set(path, content);
    offset = dataStart + compressedSize;
  }

  return entries;
}
