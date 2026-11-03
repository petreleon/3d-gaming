import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRedApple } from './apple';

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
 * so the woody stem, green leaf, and ruby-gold apple have crisp studio separation from every angle.
 */
function createStudioBackdropTexture(): THREE.DataTexture {
  const width = 512;
  const height = 512;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const dx = (u - 0.5) * 1.65;
      const dy = (v - 0.54) * 1.45;
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
      const pool = Math.exp(-rDist * rDist * 2.2);

      // Warm medium-slate studio surface (#475166 under the apple -> #232938 toward horizon)
      const r = Math.round(35 + pool * 36);
      const g = Math.round(41 + pool * 40);
      const b = Math.round(56 + pool * 46);

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
 * with pure continuous Gaussian falloff so the apple rests with natural grounded weight
 * without any harsh off-axis black shadow blob or bullseye ring in top view.
 */
function createContactShadowTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const dy = (y / (size - 1) - 0.5) * 2.0;
    for (let x = 0; x < size; x++) {
      const dx = (x / (size - 1) - 0.5) * 2.0;
      const rSq = dx * dx + dy * dy;

      // Pure continuous two-term Gaussian AO falloff reaching 0 smoothly at the quad boundary
      const edgeWindow = Math.max(0.0, 1.0 - rSq);
      const alpha =
        (0.76 * Math.exp(-rSq * 3.8) + 0.20 * Math.exp(-rSq * 1.4)) *
        edgeWindow *
        edgeWindow;

      const idx = (y * size + x) * 4;
      // Warm dark umber-slate shadow tint (never dead pure black)
      data[idx] = 14;
      data[idx + 1] = 10;
      data[idx + 2] = 16;
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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  appContainer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const backdropTexture = createStudioBackdropTexture();
  scene.background = backdropTexture;

  // Dedicated photographic studio environment scene with lateral softboxes (zero zenith hotspot!)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x1e1820);

  const keySoftboxGeo = new THREE.SphereGeometry(2.6, 24, 24);
  const keySoftboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff4e4).multiplyScalar(1.05),
  });
  const keySoftboxMesh = new THREE.Mesh(keySoftboxGeo, keySoftboxMat);
  // Lateral-front low elevation so top view has zero concentric white specular ring
  keySoftboxMesh.position.set(7.0, 2.2, 6.5);
  envScene.add(keySoftboxMesh);

  const fillSoftboxGeo = new THREE.SphereGeometry(3.0, 24, 24);
  const fillSoftboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x6e2822),
  });
  const fillSoftboxMesh = new THREE.Mesh(fillSoftboxGeo, fillSoftboxMat);
  fillSoftboxMesh.position.set(-6.2, 2.4, 3.4);
  envScene.add(fillSoftboxMesh);

  const lowerFloorGeo = new THREE.CircleGeometry(18, 32);
  lowerFloorGeo.rotateX(-Math.PI / 2);
  const lowerFloorMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x22181c),
    side: THREE.DoubleSide,
  });
  const lowerFloorMesh = new THREE.Mesh(lowerFloorGeo, lowerFloorMat);
  lowerFloorMesh.position.set(0, -1.5, 0);
  envScene.add(lowerFloorMesh);

  const envRenderTarget = pmremGenerator.fromScene(envScene, 0.065);
  scene.environment = envRenderTarget.texture;

  keySoftboxGeo.dispose();
  keySoftboxMat.dispose();
  fillSoftboxGeo.dispose();
  fillSoftboxMat.dispose();
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
  controls.target.set(0, 1.05, 0);

  // Studio lighting: Hemisphere fill + lateral Key Light + soft Fill + subtle Rim Light
  const hemiLight = new THREE.HemisphereLight(0xfff8f0, 0x4a3034, 1.22);
  hemiLight.position.set(0, 8, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight('#fff6eb', 1.75);
  keyLight.position.set(4.2, 2.6, 4.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 16.0;
  const d = 2.8;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 7.5;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#ffe2d1', 0.18);
  fillLight.position.set(-4.4, 2.6, 2.8);
  scene.add(fillLight);

  // Subtle warm Rim Light without creating secondary white hotspots on left_profile/back
  const rimLight = new THREE.DirectionalLight('#ffddb0', 0.28);
  rimLight.position.set(-3.8, 2.2, -4.2);
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
  floorMesh.receiveShadow = false;
  scene.add(floorMesh);

  // Soft radial Ambient Occlusion contact shadow plane at y = 0.002 (Law 6: Zero Coplanar Z-fighting)
  const contactShadowTexture = createContactShadowTexture();
  const contactShadowGeo = new THREE.PlaneGeometry(2.65, 2.45);
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
  contactShadowMesh.name = 'AppleContactShadowAO';
  contactShadowMesh.position.set(0.02, 0.002, 0.01);
  scene.add(contactShadowMesh);

  // Create the Pixar-grade 3D Red Apple
  const apple = createRedApple();
  scene.add(apple.group);

  const params = new URLSearchParams(window.location.search);
  const initialWireframe =
    params.get('wireframe') === '1' ||
    params.get('wireframe') === 'true' ||
    params.get('shading') === 'wireframe';
  if (initialWireframe) {
    apple.setWireframe(true);
  }

  let currentAction = params.get('action') ?? 'turntable';
  let elapsedSeconds = 0;
  let isAuditControlled = false;
  let wireframeEnabled = initialWireframe;

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

  updateSphericalCamera(0.68, 0.18, 4.0, 1.05);
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
      const radius = cfg.radius ?? 4.0;
      const targetY = cfg.targetY ?? 1.05;

      apple.setPose(action, t);
      scene.updateMatrixWorld(true);
      updateSphericalCamera(theta, phi, radius, targetY);
      renderer.render(scene, camera);
    },
    setWireframe: (enabled: boolean): void => {
      wireframeEnabled = enabled;
      apple.setWireframe(enabled);
      renderer.render(scene, camera);
    },
    dispose: (): void => {
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

  const btnTurntable = document.getElementById('btn-turntable');
  const btnIdle = document.getElementById('btn-idle');
  const btnWireframe = document.getElementById('btn-wireframe');

  btnTurntable?.addEventListener('click', () => {
    isAuditControlled = false;
    currentAction = 'turntable';
    btnTurntable.classList.add('active');
    btnIdle?.classList.remove('active');
  });

  btnIdle?.addEventListener('click', () => {
    isAuditControlled = false;
    currentAction = 'idle';
    elapsedSeconds = 0;
    apple.setPose('idle', 0);
    btnIdle.classList.add('active');
    btnTurntable?.classList.remove('active');
  });

  btnWireframe?.addEventListener('click', () => {
    wireframeEnabled = !wireframeEnabled;
    apple.setWireframe(wireframeEnabled);
    btnWireframe.classList.toggle('active', wireframeEnabled);
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
      if (currentAction !== 'idle') {
        elapsedSeconds += delta;
        apple.setPose(currentAction, elapsedSeconds);
      } else {
        apple.setPose('idle', 0);
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
