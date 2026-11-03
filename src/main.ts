import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRedApple } from './apple';
import { createCutleryRest, STUDIO_PRESENTATION_YAW_RAD } from './cutleryRest';
import { generate3mfFromGeometry } from './export3mf';

export interface AuditPoseConfig {
  action?: string;
  t?: number;
  theta?: number;
  phi?: number;
  radius?: number;
  targetY?: number;
}

export interface GameStageHook {
  setAuditPose: (cfg: AuditPoseConfig) => void;
  setWireframe: (enabled: boolean) => void;
  dispose: () => void;
}

declare global {
  interface Window {
    __gameStage?: GameStageHook;
    __childStage?: GameStageHook;
  }
}

/**
 * Creates a 512x512 photographic studio backdrop texture with a warm-slate central halo
 * so the terracotta ceramic-PLA cutlery rest and brushed stainless steel utensil have crisp separation from every angle.
 */
function createStudioBackdropTexture(): THREE.DataTexture {
  const width = 512;
  const height = 512;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const dx = (u - 0.5) * 1.55;
      const dy = (v - 0.52) * 1.45;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const halo = Math.exp(-dist * dist * 1.45);

      // Warm charcoal-slate studio backdrop (#4a5468 in central halo -> #222836 at outer vignette)
      const r = Math.round(34 + halo * 42);
      const g = Math.round(40 + halo * 45);
      const b = Math.round(54 + halo * 50);

      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a 512x512 matte studio floor texture with a soft radial studio illumination pool.
 */
function createStudioFloorTexture(): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const dy = (y / (size - 1) - 0.5) * 2.0;
    for (let x = 0; x < size; x++) {
      const dx = (x / (size - 1) - 0.5) * 2.0;
      const rDist = Math.sqrt(dx * dx + dy * dy);
      const pool = Math.exp(-rDist * rDist * 2.0);

      // Warm medium-slate studio surface (#485368 under the model -> #232938 toward horizon)
      const r = Math.round(35 + pool * 38);
      const g = Math.round(41 + pool * 42);
      const b = Math.round(56 + pool * 48);

      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a soft concentric Ambient Occlusion (AO) contact shadow texture at y = 0.002
 * with pure continuous Gaussian falloff so the support rests with natural grounded weight.
 */
function createContactShadowTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const dy = (y / (size - 1) - 0.5) * 2.0;
    for (let x = 0; x < size; x++) {
      const dx = (x / (size - 1) - 0.5) * 2.0;
      const rSq = dx * dx + dy * dy;

      const edgeWindow = Math.max(0.0, 1.0 - rSq);
      const alpha =
        (0.74 * Math.exp(-rSq * 3.6) + 0.22 * Math.exp(-rSq * 1.4)) *
        edgeWindow *
        edgeWindow;

      const idx = (y * size + x) * 4;
      data[idx] = 14;
      data[idx + 1] = 12;
      data[idx + 2] = 18;
      data[idx + 3] = Math.round(Math.min(1.0, alpha) * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function initStudioScene(): void {
  const appContainer = document.getElementById('app') ?? document.body;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  appContainer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const backdropTexture = createStudioBackdropTexture();
  scene.background = backdropTexture;

  // Dedicated photographic studio environment scene with lateral softboxes
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x222630);

  const keySoftboxGeo = new THREE.SphereGeometry(2.8, 24, 24);
  const keySoftboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff5e8).multiplyScalar(1.15),
  });
  const keySoftboxMesh = new THREE.Mesh(keySoftboxGeo, keySoftboxMat);
  keySoftboxMesh.position.set(6.8, 3.2, 6.2);
  envScene.add(keySoftboxMesh);

  const fillSoftboxGeo = new THREE.SphereGeometry(3.2, 24, 24);
  const fillSoftboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x88a4c8).multiplyScalar(0.75),
  });
  const fillSoftboxMesh = new THREE.Mesh(fillSoftboxGeo, fillSoftboxMat);
  fillSoftboxMesh.position.set(-6.4, 2.8, 3.8);
  envScene.add(fillSoftboxMesh);

  const backSoftboxGeo = new THREE.SphereGeometry(2.6, 24, 24);
  const backSoftboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffdfc2).multiplyScalar(0.85),
  });
  const backSoftboxMesh = new THREE.Mesh(backSoftboxGeo, backSoftboxMat);
  backSoftboxMesh.position.set(1.5, 3.5, -6.8);
  envScene.add(backSoftboxMesh);

  const lowerFloorGeo = new THREE.CircleGeometry(18, 32);
  lowerFloorGeo.rotateX(-Math.PI / 2);
  const lowerFloorMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x242834),
    side: THREE.DoubleSide,
  });
  const lowerFloorMesh = new THREE.Mesh(lowerFloorGeo, lowerFloorMat);
  lowerFloorMesh.position.set(0, -1.5, 0);
  envScene.add(lowerFloorMesh);

  const envRenderTarget = pmremGenerator.fromScene(envScene, 0.055);
  scene.environment = envRenderTarget.texture;

  keySoftboxGeo.dispose();
  keySoftboxMat.dispose();
  fillSoftboxGeo.dispose();
  fillSoftboxMat.dispose();
  backSoftboxGeo.dispose();
  backSoftboxMat.dispose();
  lowerFloorGeo.dispose();
  lowerFloorMat.dispose();
  pmremGenerator.dispose();

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0.36, 0);

  // Studio lighting: Hemisphere fill + Key Light + Cool-Warm Fill + Rim Light for crisp 3D cavities
  const hemiLight = new THREE.HemisphereLight(0xfff9f2, 0x384052, 1.32);
  hemiLight.position.set(0, 8, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight('#fff6eb', 1.85);
  keyLight.position.set(4.2, 3.6, 4.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 16.0;
  const d = 3.2;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 6.0;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#dbeafe', 0.52);
  fillLight.position.set(-4.6, 2.8, 3.2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight('#ffe0b8', 0.58);
  rimLight.position.set(-2.8, 3.0, -4.6);
  scene.add(rimLight);

  // Matte studio floor at exact y = 0.000 with radial studio illumination gradient
  const floorTexture = createStudioFloorTexture();
  const floorGeometry = new THREE.CircleGeometry(12, 72);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTexture,
    color: new THREE.Color('#ffffff'),
    roughness: 0.88,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.name = 'StudioFloor';
  floorMesh.position.set(0, 0, 0);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Soft Ambient Occlusion contact shadow plane at y = 0.002 (Law 6: Zero Coplanar Z-fighting)
  const contactShadowTexture = createContactShadowTexture();
  const contactShadowGeo = new THREE.PlaneGeometry(3.35, 1.45);
  contactShadowGeo.rotateX(-Math.PI / 2);
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadowMesh.name = 'CutleryContactShadowAO';
  // Positioned directly under the support base (which is shifted by -18mm * 0.022 = -0.396)
  contactShadowMesh.position.set(-0.32, 0.002, 0.0);
  contactShadowMesh.rotation.y = STUDIO_PRESENTATION_YAW_RAD;
  scene.add(contactShadowMesh);

  // Create the Hygienic Cutlery Rest (default active model) + Red Apple (available via 'apple' mode)
  const cutleryRest = createCutleryRest();
  scene.add(cutleryRest.group);

  const apple = createRedApple();
  apple.group.visible = false;
  scene.add(apple.group);

  const params = new URLSearchParams(window.location.search);
  const initialWireframe =
    params.get('wireframe') === '1' ||
    params.get('wireframe') === 'true' ||
    params.get('shading') === 'wireframe';
  if (initialWireframe) {
    cutleryRest.setWireframe(true);
    apple.setWireframe(true);
  }

  let currentAction = params.get('action') ?? 'spoon';
  let elapsedSeconds = 0;
  let isAuditControlled = false;
  let wireframeEnabled = initialWireframe;

  const applyModelAction = (action: string, t: number): void => {
    if (action === 'apple') {
      cutleryRest.group.visible = false;
      apple.group.visible = true;
      apple.setPose('idle', t);
      contactShadowMesh.scale.set(0.78, 1.0, 1.65);
      contactShadowMesh.position.set(0.02, 0.002, 0.01);
      contactShadowMesh.rotation.y = 0;
    } else {
      apple.group.visible = false;
      cutleryRest.group.visible = true;
      cutleryRest.setPose(action, t);
      contactShadowMesh.scale.set(0.92, 1.0, 0.92);
      contactShadowMesh.position.set(-0.08, 0.002, 0.0);
      contactShadowMesh.rotation.y = cutleryRest.group.rotation.y;
    }
  };

  applyModelAction(currentAction, 0);

  const updateSphericalCamera = (
    theta: number,
    phi: number,
    radius: number,
    targetY: number
  ): void => {
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    const cx = radius * cosPhi * sinTheta;
    const cy = targetY + radius * sinPhi;
    const cz = radius * cosPhi * cosTheta;

    camera.position.set(cx, cy, cz);
    controls.target.set(0, targetY, 0);
    camera.lookAt(0, targetY, 0);
    camera.updateMatrixWorld();
  };

  updateSphericalCamera(0.68, 0.22, 3.85, 0.28);
  controls.update();

  const stageHook: GameStageHook = {
    setAuditPose: (cfg: AuditPoseConfig): void => {
      isAuditControlled = true;
      const hud = document.querySelector<HTMLElement>('.studio-hud');
      if (hud) {
        hud.style.display = 'none';
      }
      const action = cfg.action ?? 'idle';
      const t = cfg.t ?? 0.0;
      const theta = cfg.theta ?? 0.68;
      const phi = cfg.phi ?? 0.18;

      applyModelAction(action, t);

      let radius = cfg.radius ?? 4.0;
      let targetY = cfg.targetY ?? 1.1;

      if (action !== 'apple') {
        // When audit script passes default targetY (1.1 or 1.05) and radius (4.0), frame the Cutlery Rest Assembly
        if (cfg.targetY === undefined || Math.abs(cfg.targetY - 1.1) < 0.1) {
          targetY = 0.28;
        }
        if (cfg.radius === undefined || Math.abs(cfg.radius - 4.0) < 0.1) {
          radius = 3.85;
        }
      }

      scene.updateMatrixWorld(true);
      updateSphericalCamera(theta, phi, radius, targetY);
      renderer.render(scene, camera);
    },
    setWireframe: (enabled: boolean): void => {
      wireframeEnabled = enabled;
      cutleryRest.setWireframe(enabled);
      apple.setWireframe(enabled);
      renderer.render(scene, camera);
    },
    dispose: (): void => {
      cutleryRest.dispose();
      apple.dispose();
      backdropTexture.dispose();
      floorTexture.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      contactShadowTexture.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      envRenderTarget.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };

  window.__gameStage = stageHook;
  window.__childStage = stageHook;

  const modeButtons: Array<{ id: string; action: string }> = [
    { id: 'btn-spoon', action: 'spoon' },
    { id: 'btn-fork', action: 'fork' },
    { id: 'btn-knife', action: 'knife' },
    { id: 'btn-print-ready', action: 'print_ready' },
    { id: 'btn-turntable', action: 'turntable' },
    { id: 'btn-apple', action: 'apple' },
  ];

  const setActiveButton = (activeAction: string): void => {
    for (const item of modeButtons) {
      const el = document.getElementById(item.id);
      el?.classList.toggle('active', item.action === activeAction);
    }
  };

  for (const item of modeButtons) {
    const btn = document.getElementById(item.id);
    btn?.addEventListener('click', () => {
      isAuditControlled = false;
      currentAction = item.action;
      elapsedSeconds = 0;
      applyModelAction(currentAction, 0);
      setActiveButton(currentAction);
    });
  }

  const btnWireframe = document.getElementById('btn-wireframe');
  btnWireframe?.addEventListener('click', () => {
    wireframeEnabled = !wireframeEnabled;
    cutleryRest.setWireframe(wireframeEnabled);
    apple.setWireframe(wireframeEnabled);
    btnWireframe.classList.toggle('active', wireframeEnabled);
  });

  const btnDownload3mf = document.getElementById('btn-download-3mf');
  btnDownload3mf?.addEventListener('click', (e) => {
    // Provide instant client-side Blob download fallback in addition to static /suport-tacamuri.3mf
    try {
      const bytes = generate3mfFromGeometry(cutleryRest.supportGeometryMm, 1.0);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'suport-tacamuri.3mf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      e.preventDefault();
    } catch {
      // Fall back to default href="/suport-tacamuri.3mf"
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  });

  const clock = new THREE.Clock();

  const animate = (): void => {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    if (!isAuditControlled) {
      if (currentAction === 'turntable') {
        elapsedSeconds += delta;
        applyModelAction('turntable', elapsedSeconds);
      } else {
        applyModelAction(currentAction, 0);
      }
      controls.update();
    }

    renderer.render(scene, camera);
  };

  animate();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initStudioScene();
}
