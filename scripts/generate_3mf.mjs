#!/usr/bin/env node
/**
 * Generates the 2-manifold watertight .3mf file for 3D printing (Bambu Studio / PrusaSlicer / Cura)
 * and writes it to both:
 *   - /Users/petreleon/code/3d-gaming/suport-tacamuri.3mf
 *   - /Users/petreleon/code/3d-gaming/public/suport-tacamuri.3mf
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

async function main() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const { buildCutleryRestGeometryMm } = await vite.ssrLoadModule('/src/cutleryRest.ts');
    const { verifyManifoldTopology, generate3mfFromGeometry } = await vite.ssrLoadModule(
      '/src/export3mf.ts'
    );

    const geometryMm = buildCutleryRestGeometryMm();
    const audit = verifyManifoldTopology(geometryMm, 1.0);

    console.log('=== 3MF 2-Manifold Topological Audit ===');
    console.log(`  isManifold             : ${audit.isManifold}`);
    console.log(`  vertexCount            : ${audit.vertexCount}`);
    console.log(`  triangleCount          : ${audit.triangleCount}`);
    console.log(`  edgeCount              : ${audit.edgeCount}`);
    console.log(`  eulerCharacteristic    : ${audit.eulerCharacteristic}`);
    console.log(`  boundaryEdgeCount      : ${audit.boundaryEdgeCount}`);
    console.log(`  nonManifoldEdgeCount   : ${audit.nonManifoldEdgeCount}`);
    console.log(`  degenerateTriangleCount: ${audit.degenerateTriangleCount}`);
    console.log(`  signedVolumeMm3        : ${audit.signedVolumeMm3.toFixed(2)} mm³`);
    console.log(`  minZMm (bed contact)   : ${audit.minZMm.toFixed(6)} mm`);
    console.log(`  bedContactVertexCount  : ${audit.bedContactVertexCount}`);
    console.log(
      `  dimensionsMm           : ${audit.dimensionsMm.x.toFixed(2)} x ${audit.dimensionsMm.y.toFixed(2)} x ${audit.dimensionsMm.z.toFixed(2)} mm`
    );

    if (!audit.isManifold) {
      throw new Error('Mesh failed 2-manifold watertight verification!');
    }

    const zipBytes = generate3mfFromGeometry(geometryMm, 1.0);

    const rootOutPath = path.resolve(process.cwd(), 'suport-tacamuri.3mf');
    const publicDir = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const publicOutPath = path.resolve(publicDir, 'suport-tacamuri.3mf');

    fs.writeFileSync(rootOutPath, zipBytes);
    fs.writeFileSync(publicOutPath, zipBytes);

    console.log(`\nSaved .3mf (${(zipBytes.length / 1024).toFixed(1)} KB) to:`);
    console.log(`  - ${rootOutPath}`);
    console.log(`  - ${publicOutPath}`);
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
