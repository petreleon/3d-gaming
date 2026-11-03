import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildCutleryRestGeometryMm,
  computeRawSignedVolume,
  createCutleryRest,
  evaluateSupportProfileAtX,
} from './cutleryRest';
import {
  generate3mfFromGeometry,
  parse3mfArchiveEntries,
  verifyManifoldTopology,
} from './export3mf';

describe('Suport Igienic Tacâmuri (.3mf) — Audit Geometric, Topologic 2-Manifold & Profil |_|', () => {
  it('garantează că geometria suportului este 100% 2-Manifold Watertight (0 muchii deschise, 2E = 3F), are rawSignedVolume > 0 și contact perfect cu patul la z = 0.000 mm', () => {
    const rig = createCutleryRest();
    const supportGeo = rig.supportGeometryMm;

    // 1. Direct raw signed volume check (outward winding order in Three.js) on all 4 meshes
    expect(computeRawSignedVolume(supportGeo)).toBeGreaterThan(25000);
    expect(computeRawSignedVolume(rig.utensilGeometriesMm.spoon)).toBeGreaterThan(1000);
    expect(computeRawSignedVolume(rig.utensilGeometriesMm.fork)).toBeGreaterThan(800);
    expect(computeRawSignedVolume(rig.utensilGeometriesMm.knife)).toBeGreaterThan(1000);

    // 2. Forensic 2-manifold watertight verification
    const audit = verifyManifoldTopology(supportGeo, 1.0);
    expect(audit.isManifold).toBe(true);
    expect(audit.boundaryEdgeCount).toBe(0);
    expect(audit.nonManifoldEdgeCount).toBe(0);
    expect(audit.degenerateTriangleCount).toBe(0);
    expect(audit.edgeCount * 2).toBe(audit.triangleCount * 3);
    expect([0, 2]).toContain(audit.eulerCharacteristic);
    expect(audit.signedVolumeMm3).toBeGreaterThan(25000);

    // Exact flat bed contact at z = 0.000 mm for support-free FDM/SLA printing
    expect(Math.abs(audit.minZMm)).toBeLessThan(1e-5);
    expect(audit.bedContactVertexCount).toBeGreaterThan(2500);

    // Physical print dimensions (~112 x 44 x 34 mm — clean |_| channel profile)
    expect(audit.dimensionsMm.x).toBeGreaterThanOrEqual(110);
    expect(audit.dimensionsMm.x).toBeLessThanOrEqual(114);
    expect(audit.dimensionsMm.y).toBeGreaterThanOrEqual(42);
    expect(audit.dimensionsMm.y).toBeLessThanOrEqual(46);
    expect(audit.dimensionsMm.z).toBeGreaterThanOrEqual(32);
    expect(audit.dimensionsMm.z).toBeLessThanOrEqual(36);

    rig.dispose();
  });

  it('verifică profilul |_| (bază orizontală plată _ de 21.4 mm + pereți verticali |, fără formă de V), puntea superioară din spate, mijlocul coborât și baza anti-răsturnare', () => {
    const rig = createCutleryRest();
    const supportPos = rig.supportGeometryMm.getAttribute('position');

    // 1. Verify the solid Upper Stopper Roof Bridge across the rear tail zone (x in [-36, -24] mm, |z| < 5 mm)
    let rearRoofVertexCount = 0;
    let rearTunnelFloorVertexCount = 0;
    for (let i = 0; i < supportPos.count; i++) {
      const x = supportPos.getX(i);
      const y = supportPos.getY(i);
      const z = supportPos.getZ(i);
      if (x >= -36.0 && x <= -24.0 && Math.abs(z) < 5.0) {
        if (y >= 23.5) {
          rearRoofVertexCount++;
        } else if (y >= 6.0 && y <= 9.0) {
          rearTunnelFloorVertexCount++;
        }
      }
    }
    expect(rearRoofVertexCount).toBeGreaterThan(20);
    expect(rearTunnelFloorVertexCount).toBeGreaterThan(15);

    const rearStopper = evaluateSupportProfileAtX(-42.0);
    expect(rearStopper.centerFloorHeightMm).toBeGreaterThanOrEqual(21.5);

    const rearBridge = evaluateSupportProfileAtX(-30.0);
    expect(rearBridge.hasUpperStopperRoof).toBe(true);
    expect(rearBridge.upperStopperCeilingYMm).toBeGreaterThanOrEqual(23.5);
    expect(rearBridge.upperStopperRoofTopYMm).toBeGreaterThanOrEqual(30.5);

    // 2. Reduced Middle Deck Between the Two Heads (x = -11.5 mm)
    const midDeck = evaluateSupportProfileAtX(-11.5);
    expect(midDeck.wallHeightMm).toBeLessThan(6.5);
    expect(midDeck.centerFloorHeightMm).toBeGreaterThanOrEqual(4.8);

    // 3. Head #2 — Tall Front Neck Pillar with |_| Profile (x = +11.2 mm, exact ring i = 74):
    // Verify that the resting floor is 100% FLAT HORIZONTAL (_) across z in [-9.5, +9.5] mm (NO V-shape!),
    // bounded by vertical inner side walls (|) rising to y = 34.0 mm.
    const frontPillar = evaluateSupportProfileAtX(11.0);
    expect(frontPillar.centerFloorHeightMm).toBeGreaterThanOrEqual(21.5);
    expect(frontPillar.wallHeightMm).toBeGreaterThanOrEqual(33.5);
    expect(frontPillar.channelFlatFloorWidthMm).toBeGreaterThanOrEqual(21.0);

    let flatFloorMinY = Infinity;
    let flatFloorMaxY = -Infinity;
    let flatFloorVertexCount = 0;
    let sideWallTopMaxY = -Infinity;

    for (let i = 0; i < supportPos.count; i++) {
      const x = supportPos.getX(i);
      const y = supportPos.getY(i);
      const z = supportPos.getZ(i);
      if (Math.abs(x - 11.2) < 0.45 && y > 12.0) {
        if (Math.abs(z) <= 9.5) {
          flatFloorVertexCount++;
          if (y < flatFloorMinY) flatFloorMinY = y;
          if (y > flatFloorMaxY) flatFloorMaxY = y;
        } else if (Math.abs(z) >= 10.6 && Math.abs(z) <= 13.5) {
          if (y > sideWallTopMaxY) sideWallTopMaxY = y;
        }
      }
    }

    expect(flatFloorVertexCount).toBeGreaterThanOrEqual(12);
    // Floor _ is flat within < 0.05 mm across the entire 19 mm central span (zero V-notch!)
    expect(flatFloorMaxY - flatFloorMinY).toBeLessThan(0.05);
    expect(flatFloorMinY).toBeGreaterThanOrEqual(21.8);
    // Vertical walls | rise >= 11.5 mm above the flat floor _
    expect(sideWallTopMaxY - flatFloorMaxY).toBeGreaterThanOrEqual(11.5);

    // 4. Forward Anti-Tipping Lower Stabilizer Under the Edible Part (x = +42 mm)
    const frontStabilizer = evaluateSupportProfileAtX(42.0);
    expect(frontStabilizer.wallHeightMm).toBeLessThan(6.5);
    expect(frontStabilizer.basePlateHeightMm).toBeGreaterThanOrEqual(5.2);

    rig.dispose();
  });

  it('demonstrează că partea comestibilă plutește la >= 16 mm deasupra bazei inferioare, iar capătul de coadă se oprește în partea superioară sub puntea din spate', () => {
    const rig = createCutleryRest();
    const supportPos = rig.supportGeometryMm.getAttribute('position');

    const supportFrontVertices: Array<[number, number, number]> = [];
    for (let i = 0; i < supportPos.count; i++) {
      const sx = supportPos.getX(i);
      if (sx > 2.0) {
        supportFrontVertices.push([sx, supportPos.getY(i), supportPos.getZ(i)]);
      }
    }

    const utensils: Array<{
      name: string;
      geo: THREE.BufferGeometry;
    }> = [
      { name: 'spoon', geo: rig.utensilGeometriesMm.spoon },
      { name: 'fork', geo: rig.utensilGeometriesMm.fork },
      { name: 'knife', geo: rig.utensilGeometriesMm.knife },
    ];

    for (const { name, geo } of utensils) {
      const pos = geo.getAttribute('position');
      let minEatingHeightAboveTableMm = Infinity;
      let minVerticalClearanceAboveStabilizerMm = Infinity;
      let minDistanceToSupportMm = Infinity;
      let tailMinYUnderBridge = Infinity;
      let tailMaxYUnderBridge = -Infinity;
      let eatingVertexCount = 0;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        if (x >= -35.0 && x <= -25.0) {
          if (y < tailMinYUnderBridge) tailMinYUnderBridge = y;
          if (y > tailMaxYUnderBridge) tailMaxYUnderBridge = y;
        }

        // Edible part of utensil (x >= 34 mm, directly above the forward lower stabilizer x in [23, 64] mm)
        if (x >= 34.0) {
          eatingVertexCount++;
          if (y < minEatingHeightAboveTableMm) {
            minEatingHeightAboveTableMm = y;
          }
          const stabilizerWallY = evaluateSupportProfileAtX(Math.min(x, 64.0)).wallHeightMm;
          const verticalGap = y - stabilizerWallY;
          if (verticalGap < minVerticalClearanceAboveStabilizerMm) {
            minVerticalClearanceAboveStabilizerMm = verticalGap;
          }

          for (let k = 0; k < supportFrontVertices.length; k++) {
            const [sx, sy, sz] = supportFrontVertices[k];
            const dist = Math.hypot(x - sx, y - sy, z - sz);
            if (dist < minDistanceToSupportMm) {
              minDistanceToSupportMm = dist;
            }
          }
        }
      }

      expect(eatingVertexCount, `${name} must have eating head vertices at x >= 34mm`).toBeGreaterThan(100);
      expect(
        minEatingHeightAboveTableMm,
        `${name} eating part must float >= 22 mm above the table`
      ).toBeGreaterThanOrEqual(22.0);
      expect(
        minVerticalClearanceAboveStabilizerMm,
        `${name} eating part must have >= 16.0 mm vertical air gap above the forward stabilizer base`
      ).toBeGreaterThanOrEqual(16.0);
      expect(
        minDistanceToSupportMm,
        `${name} eating part must have >= 9.5 mm 3D clearance from the support`
      ).toBeGreaterThanOrEqual(9.5);

      // Handle tail sits HIGH (y in [19.8, 24.5] mm), stopped against the Upper Stopper Roof ceiling (~24.0 mm)
      expect(tailMinYUnderBridge, `${name} tail bottom must sit high above rear floor`).toBeGreaterThanOrEqual(19.8);
      expect(tailMaxYUnderBridge, `${name} tail top must stop against upper roof ceiling`).toBeGreaterThanOrEqual(23.4);
      expect(tailMaxYUnderBridge, `${name} tail top must stay under upper roof top`).toBeLessThanOrEqual(24.8);
    }

    rig.setPose('idle', 0);
    const supportWorldBox = new THREE.Box3().setFromObject(rig.supportMesh);
    expect(Math.abs(supportWorldBox.min.y)).toBeLessThan(1e-5);

    rig.dispose();
  });

  it('validează arhiva .3mf generată (structură PKZIP, XML 3MF Core v1.2.1 și fișierele salvate pe disc)', () => {
    const supportGeo = buildCutleryRestGeometryMm();
    const zipBytes = generate3mfFromGeometry(supportGeo, 1.0);

    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
    expect(zipBytes[2]).toBe(0x03);
    expect(zipBytes[3]).toBe(0x04);

    const entries = parse3mfArchiveEntries(zipBytes);
    expect(entries.has('[Content_Types].xml')).toBe(true);
    expect(entries.has('_rels/.rels')).toBe(true);
    expect(entries.has('3D/3dmodel.model')).toBe(true);

    const modelXml = entries.get('3D/3dmodel.model') ?? '';
    expect(modelXml).toContain('unit="millimeter"');
    expect(modelXml).toContain('<object id="2" name="Suport_Igienic_Tacamuri" type="model"');
    expect(modelXml).toContain('<vertices>');
    expect(modelXml).toContain('<triangles>');
    expect(modelXml).toContain('<build>');

    const root3mf = path.resolve(process.cwd(), 'suport-tacamuri.3mf');
    const public3mf = path.resolve(process.cwd(), 'public/suport-tacamuri.3mf');
    expect(fs.existsSync(root3mf)).toBe(true);
    expect(fs.existsSync(public3mf)).toBe(true);
    expect(fs.statSync(root3mf).size).toBeGreaterThan(500_000);
  });
});
