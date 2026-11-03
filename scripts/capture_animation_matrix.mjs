#!/usr/bin/env node
/**
 * Script de Audit Vizual & Spargere a Animațiilor în Matrice de Imagini (Grid R x C)
 * Destinat exclusiv Subagenților Verificatori (`subagent-verificator`, `verificator-animatii-3d`, `verificator-modelare-3d`).
 *
 * Exemple de utilizare:
 *   1. Spargerea unei animații într-o matrice 4x4 (16 cadre) din 2 unghiuri (three_quarter + side_profile):
 *      node scripts/capture_animation_matrix.mjs --mode matrix --action walk --duration 1.6 --rows 4 --cols 4 --out /tmp/animation-matrix
 *
 *   2. Captură statică multi-unghi (6 unghiuri + matrice 2x3 de ansamblu) pentru verificarea unui model 3D:
 *      node scripts/capture_animation_matrix.mjs --mode angles --out /tmp/visual-audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function resolvePuppeteer() {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    '/opt/homebrew/lib/node_modules/threejs-devtools-mcp/package.json',
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const req = createRequire(candidate);
        return req('puppeteer-core');
      }
    } catch {
      // încercăm următorul candidat
    }
  }
  throw new Error(
    'Nu s-a putut încărca puppeteer-core. Instalați puppeteer-core în proiect sau verificați /opt/homebrew/lib/node_modules/threejs-devtools-mcp.'
  );
}

function parseArgs(argv) {
  const opts = {
    mode: 'matrix', // 'matrix' | 'angles'
    url: 'http://localhost:3000',
    out: '/tmp/animation-matrix',
    action: 'idle',
    start: 0.0,
    duration: 2.0,
    rows: 4,
    cols: 4,
    radius: 4.0,
    targetY: 1.1,
    cellWidth: 480,
    cellHeight: 360,
    views: 'three_quarter,side_profile',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--mode' && next) { opts.mode = next; i++; }
    else if (arg === '--url' && next) { opts.url = next; i++; }
    else if (arg === '--out' && next) { opts.out = next; i++; }
    else if (arg === '--action' && next) { opts.action = next; i++; }
    else if (arg === '--start' && next) { opts.start = Number(next); i++; }
    else if (arg === '--duration' && next) { opts.duration = Number(next); i++; }
    else if (arg === '--rows' && next) { opts.rows = Number(next); i++; }
    else if (arg === '--cols' && next) { opts.cols = Number(next); i++; }
    else if (arg === '--radius' && next) { opts.radius = Number(next); i++; }
    else if (arg === '--targetY' && next) { opts.targetY = Number(next); i++; }
    else if (arg === '--views' && next) { opts.views = next; i++; }
  }
  return opts;
}

const VIEW_PRESETS = {
  front: { theta: 0.0, phi: 0.14 },
  three_quarter: { theta: 0.68, phi: 0.18 },
  side_profile: { theta: 1.5708, phi: 0.12 },
  left_profile: { theta: -1.5708, phi: 0.12 },
  back: { theta: 3.1416, phi: 0.15 },
  top: { theta: 0.0, phi: 1.35 },
};

async function stitchMatrixInPage(browser, cells, meta) {
  const { rows, cols, cellWidth, cellHeight, title, outPath } = meta;
  const headerHeight = 52;
  const totalWidth = cols * cellWidth;
  const totalHeight = headerHeight + rows * cellHeight;

  const stitchPage = await browser.newPage();
  await stitchPage.setViewport({ width: totalWidth, height: totalHeight, deviceScaleFactor: 1 });

  await stitchPage.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: ${totalWidth}px;
            height: ${totalHeight}px;
            background: #0f172a;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            overflow: hidden;
          }
          .header {
            height: ${headerHeight}px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            background: #1e293b;
            border-bottom: 2px solid #38bdf8;
            font-size: 16px;
            font-weight: 700;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(${cols}, ${cellWidth}px);
            grid-template-rows: repeat(${rows}, ${cellHeight}px);
          }
          .cell {
            position: relative;
            width: ${cellWidth}px;
            height: ${cellHeight}px;
            border: 1px solid #334155;
            overflow: hidden;
            background: #090d16;
          }
          .cell img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .badge {
            position: absolute;
            top: 8px;
            left: 8px;
            background: rgba(15, 23, 42, 0.88);
            border: 1px solid #38bdf8;
            color: #f8fafc;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.3px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <span>${title}</span>
          <span>Grid: ${rows}x${cols} (${cells.length} cadre)</span>
        </div>
        <div class="grid">
          ${cells
            .map(
              (c) => `
            <div class="cell">
              <img src="data:image/png;base64,${c.base64}" />
              <div class="badge">${c.label}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </body>
    </html>
  `);

  await stitchPage.screenshot({ path: outPath });
  await stitchPage.close();
}

async function main() {
  const opts = parseArgs(process.argv);
  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const puppeteer = resolvePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=metal', '--window-size=1280,960'],
    defaultViewport: { width: 1280, height: 960, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[PAGE ${msg.type().toUpperCase()}]:`, msg.text());
      }
    });
    page.on('pageerror', (err) => {
      console.log('[PAGE ERROR]:', err.message);
    });

    await page.goto(opts.url, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));

    const canvasEl = (await page.$('canvas')) || page;

    if (opts.mode === 'angles') {
      const viewKeys = ['front', 'three_quarter', 'side_profile', 'left_profile', 'back', 'top'];
      const cells = [];

      for (let i = 0; i < viewKeys.length; i++) {
        const vKey = viewKeys[i];
        const preset = VIEW_PRESETS[vKey];
        await page.evaluate(
          (cfg) => {
            const stage = window.__gameStage || window.__childStage;
            if (stage && typeof stage.setAuditPose === 'function') {
              stage.setAuditPose(cfg);
            }
          },
          {
            action: opts.action,
            t: opts.start,
            theta: preset.theta,
            phi: preset.phi,
            radius: opts.radius,
            targetY: opts.targetY,
          }
        );
        await new Promise((r) => setTimeout(r, 140));
        const frameFile = path.join(outDir, `angle_0${i + 1}_${vKey}.png`);
        await canvasEl.screenshot({ path: frameFile });
        const base64 = fs.readFileSync(frameFile).toString('base64');
        cells.push({
          label: `#${i + 1} | View: ${vKey} (θ=${preset.theta.toFixed(2)}, φ=${preset.phi.toFixed(2)})`,
          base64,
        });
        console.log(`Capturat unghi: ${frameFile}`);
      }

      const matrixFile = path.join(outDir, `angles_matrix_${opts.action}.png`);
      await stitchMatrixInPage(browser, cells, {
        rows: 2,
        cols: 3,
        cellWidth: opts.cellWidth,
        cellHeight: opts.cellHeight,
        title: `MULTI-ANGLE 3D AUDIT | Action: ${opts.action}`,
        outPath: matrixFile,
      });
      console.log(`Matrice Multi-Unghi generată: ${matrixFile}`);
      return;
    }

    // Mode === 'matrix': Spargerea animației într-o matrice R x C de imagini
    const totalFrames = opts.rows * opts.cols;
    const requestedViews = opts.views
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const viewName of requestedViews) {
      const preset = VIEW_PRESETS[viewName] || VIEW_PRESETS.three_quarter;
      const cells = [];

      for (let k = 0; k < totalFrames; k++) {
        const progress = totalFrames > 1 ? k / (totalFrames - 1) : 0;
        const t = opts.start + progress * opts.duration;
        const pct = Math.round(progress * 100);

        const hasHook = await page.evaluate(
          (cfg) => {
            const stage = window.__gameStage || window.__childStage;
            if (stage && typeof stage.setAuditPose === 'function') {
              stage.setAuditPose(cfg);
              return true;
            }
            return false;
          },
          {
            action: opts.action,
            t,
            theta: preset.theta,
            phi: preset.phi,
            radius: opts.radius,
            targetY: opts.targetY,
          }
        );

        if (hasHook) {
          await new Promise((r) => setTimeout(r, 100));
        } else if (k > 0) {
          const stepMs = Math.max(40, Math.round((opts.duration * 1000) / Math.max(1, totalFrames - 1)));
          await new Promise((r) => setTimeout(r, stepMs));
        }

        const idxStr = String(k).padStart(2, '0');
        const frameFile = path.join(
          outDir,
          `frame_${opts.action}_${viewName}_${idxStr}_t${t.toFixed(2)}s.png`
        );
        await canvasEl.screenshot({ path: frameFile });
        const base64 = fs.readFileSync(frameFile).toString('base64');

        cells.push({
          label: `#${idxStr} | t=${t.toFixed(2)}s | ${pct}%`,
          base64,
        });
      }

      const matrixFile = path.join(
        outDir,
        `matrix_${opts.action}_${viewName}_${opts.rows}x${opts.cols}.png`
      );
      await stitchMatrixInPage(browser, cells, {
        rows: opts.rows,
        cols: opts.cols,
        cellWidth: opts.cellWidth,
        cellHeight: opts.cellHeight,
        title: `ANIMATION MATRIX: ${opts.action} | View: ${viewName} | T=[${opts.start.toFixed(2)}s .. ${(opts.start + opts.duration).toFixed(2)}s]`,
        outPath: matrixFile,
      });
      console.log(`Matrice Animație (${opts.rows}x${opts.cols}) generată: ${matrixFile}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[EROARE CAPTURE_ANIMATION_MATRIX]:', err);
  process.exit(1);
});
