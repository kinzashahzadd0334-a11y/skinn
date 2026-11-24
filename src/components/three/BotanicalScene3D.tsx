import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelFinish, ModelSilhouette, Product3DConfig } from '../../types/store';
import { resolveMediaUrl } from '../../db/mediaResolver';

export type CameraPreset = 'hero' | 'detail' | 'top' | 'profile';
export type StudioBackdrop = 'sage' | 'blush' | 'linen' | 'obsidian';

interface BotanicalScene3DProps {
  silhouette: ModelSilhouette;
  finish: ModelFinish;
  productLabel: string;
  volumeLabel: string;
  modelConfig?: Product3DConfig;
  explodedAmount?: number;
  cameraPreset?: CameraPreset;
  autoRotate?: boolean;
  interactive?: boolean;
  theme?: 'light' | 'dark';
  backdrop?: StudioBackdrop;
  className?: string;
  fallbackImage?: string;
}

type NormalizedThemeFinish = 'emerald' | 'ivory' | 'aqua';

interface BackdropSpec {
  isDark: boolean;
  bgTop: string;
  bgMid: string;
  bgGlow: string;
  bgBottom: string;
  fogHex: number;
  floorHex: number;
  envShell: number;
  envBg: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyIntensity: number;
  fillColor: number;
  fillIntensity: number;
  rimColor: number;
  rimIntensity: number;
  plinthTint: number;
}

const STUDIO_BACKDROPS: Record<StudioBackdrop, BackdropSpec> = {
  sage: {
    isDark: false,
    bgTop: '#B5C4B0',
    bgMid: '#D4DFCF',
    bgGlow: '#EDF3EA',
    bgBottom: '#B0BFA9',
    fogHex: 0xb6c4b0,
    floorHex: 0xc2cfbc,
    envShell: 0xd8e2d3,
    envBg: 0xcdd8c8,
    hemiSky: 0xfffcf6,
    hemiGround: 0xb8c5b3,
    hemiIntensity: 0.88,
    keyIntensity: 1.58,
    fillColor: 0xeef6f1,
    fillIntensity: 0.78,
    rimColor: 0xfff3de,
    rimIntensity: 1.12,
    plinthTint: 0xfaf6ee,
  },
  blush: {
    isDark: false,
    bgTop: '#D2B9B0',
    bgMid: '#EADAD4',
    bgGlow: '#F8EFEA',
    bgBottom: '#CEB4AB',
    fogHex: 0xd0b8af,
    floorHex: 0xdcc5bd,
    envShell: 0xead8d1,
    envBg: 0xdfd0ca,
    hemiSky: 0xfffaf7,
    hemiGround: 0xcab2a9,
    hemiIntensity: 0.88,
    keyIntensity: 1.55,
    fillColor: 0xfaf0ec,
    fillIntensity: 0.76,
    rimColor: 0xfff1dc,
    rimIntensity: 1.12,
    plinthTint: 0xfaf6ee,
  },
  linen: {
    isDark: false,
    bgTop: '#D2C5B1',
    bgMid: '#E8DFCF',
    bgGlow: '#FAF5EC',
    bgBottom: '#CEC0AB',
    fogHex: 0xd1c4b0,
    floorHex: 0xddd2c0,
    envShell: 0xe8dfd0,
    envBg: 0xdfd6c5,
    hemiSky: 0xfffcf6,
    hemiGround: 0xcbbfab,
    hemiIntensity: 0.86,
    keyIntensity: 1.55,
    fillColor: 0xf3f6f2,
    fillIntensity: 0.75,
    rimColor: 0xfff2db,
    rimIntensity: 1.1,
    plinthTint: 0xfaf6ee,
  },
  obsidian: {
    isDark: true,
    bgTop: '#0E110D',
    bgMid: '#1B2018',
    bgGlow: '#2C3429',
    bgBottom: '#0C0F0B',
    fogHex: 0x11140f,
    floorHex: 0x161a13,
    envShell: 0x242921,
    envBg: 0x1a1e18,
    hemiSky: 0xf5ebd8,
    hemiGround: 0x262b22,
    hemiIntensity: 1.05,
    keyIntensity: 2.05,
    fillColor: 0xd9e8df,
    fillIntensity: 0.95,
    rimColor: 0xf3dfbb,
    rimIntensity: 1.65,
    plinthTint: 0xe7dfd1,
  },
};

function resolveBackdrop(backdrop: StudioBackdrop | undefined, theme: 'light' | 'dark'): StudioBackdrop {
  if (backdrop && backdrop in STUDIO_BACKDROPS) return backdrop;
  return theme === 'dark' ? 'obsidian' : 'sage';
}

const _targetVec = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();

function normalizeFinish(finish: ModelFinish, silhouette: ModelSilhouette): NormalizedThemeFinish {
  if (finish === 'emerald' || finish === 'ivory' || finish === 'aqua') {
    return finish;
  }
  if (finish === 'amber') return silhouette === 'jar' ? 'ivory' : 'emerald';
  if (finish === 'olive') return silhouette === 'dropper' ? 'emerald' : 'ivory';
  if (finish === 'champagne') return silhouette === 'pump' ? 'aqua' : 'ivory';
  return silhouette === 'jar' ? 'ivory' : silhouette === 'pump' ? 'aqua' : 'emerald';
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Custom photographic softbox studio environment for realistic specular streaks
 * across cylindrical glass, meniscus edges, and brushed champagne gold caps.
 */
function createPhotographicStudioEnvScene(spec: BackdropSpec): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(spec.envBg);
  const isDark = spec.isDark;

  const shellMat = new THREE.MeshBasicMaterial({
    color: spec.envShell,
    side: THREE.BackSide,
  });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 16), shellMat);
  envScene.add(shell);

  // Tall vertical softbox left (key strip for crisp bottle shoulder reflection)
  const leftSoftboxMat = new THREE.MeshBasicMaterial({ color: 0xfffcf5 });
  leftSoftboxMat.color.multiplyScalar(isDark ? 3.8 : 2.9);
  const leftSoftbox = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 7.5), leftSoftboxMat);
  leftSoftbox.position.set(-4.6, 2.2, 2.8);
  leftSoftbox.lookAt(0, 1.0, 0);
  envScene.add(leftSoftbox);

  // Tall vertical softbox right (cool/clean studio fill edge highlight)
  const rightSoftboxMat = new THREE.MeshBasicMaterial({ color: 0xf7fbf9 });
  rightSoftboxMat.color.multiplyScalar(isDark ? 2.8 : 2.3);
  const rightSoftbox = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 7.0), rightSoftboxMat);
  rightSoftbox.position.set(4.8, 2.0, 1.9);
  rightSoftbox.lookAt(0, 1.0, 0);
  envScene.add(rightSoftbox);

  // Overhead silk diffuser panel (illuminates cap chamfers & dropper shoulder)
  const topPanelMat = new THREE.MeshBasicMaterial({ color: 0xfff8eb });
  topPanelMat.color.multiplyScalar(isDark ? 2.4 : 2.0);
  const topPanel = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.5), topPanelMat);
  topPanel.position.set(0, 5.6, 0.4);
  topPanel.rotation.x = Math.PI / 2;
  envScene.add(topPanel);

  // Warm champagne bounce strip behind glass for backlit botanical liquid luminance
  const backBounceMat = new THREE.MeshBasicMaterial({ color: isDark ? 0xe7d9ba : 0xfffbf2 });
  backBounceMat.color.multiplyScalar(isDark ? 1.8 : 1.75);
  const backBounce = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 5.2), backBounceMat);
  backBounce.position.set(0, 1.6, -5.2);
  backBounce.lookAt(0, 1.0, 0);
  envScene.add(backBounce);

  // Dark vertical negative-fill flags (gives crisp dark silhouette edges on clear glass!)
  const flagMat = new THREE.MeshBasicMaterial({ color: isDark ? 0x0c0e0b : 0xcbc3b4 });
  const flagLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 7.2), flagMat);
  flagLeft.position.set(-2.5, 1.5, -3.2);
  flagLeft.lookAt(0, 1.0, 0);
  const flagRight = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 7.2), flagMat);
  flagRight.position.set(2.7, 1.5, -3.2);
  flagRight.lookAt(0, 1.0, 0);
  envScene.add(flagLeft, flagRight);

  return envScene;
}

function createStudioBackdropTexture(spec: BackdropSpec): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Seamless vertical studio cyclorama sweep
    const sweep = ctx.createLinearGradient(0, 0, 0, 1024);
    sweep.addColorStop(0.0, spec.bgTop);
    sweep.addColorStop(0.48, spec.bgMid);
    sweep.addColorStop(1.0, spec.bgBottom);
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, 1024, 1024);

    // Soft backlit studio key-glow behind vessel for editorial depth
    const glow = ctx.createRadialGradient(512, 440, 40, 512, 460, 510);
    glow.addColorStop(0.0, spec.bgGlow);
    glow.addColorStop(0.55, `${spec.bgGlow}55`);
    glow.addColorStop(1.0, `${spec.bgMid}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle perimeter vignette for studio framing
    const vignette = ctx.createRadialGradient(512, 490, 260, 512, 512, 740);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, spec.isDark ? 'rgba(0,0,0,0.32)' : 'rgba(28,34,26,0.09)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 1024, 1024);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFloorAlphaMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 34, 128, 128, 124);
    grad.addColorStop(0.0, '#ffffff');
    grad.addColorStop(0.45, '#d0d0d0');
    grad.addColorStop(0.78, '#404040');
    grad.addColorStop(1.0, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createLuxuryLabelTexture(
  title: string,
  subtitle: string,
  themeFinish: NormalizedThemeFinish,
  labelBgColor = '#FBF8F1',
  labelTextColor = '#1C3B2B',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Warm textured ivory cotton paper (or admin override)
    ctx.fillStyle = labelBgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle organic paper grain fibers
    for (let i = 0; i < 4200; i++) {
      const x = (i * 73) % canvas.width;
      const y = ((i * 197) + Math.floor(i / 40) * 13) % canvas.height;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 58, 43, 0.018)' : 'rgba(197, 160, 89, 0.02)';
      ctx.fillRect(x, y, 2, 1);
    }

    // Fine outer frame & champagne inner rule
    ctx.strokeStyle = labelTextColor;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(197, 160, 89, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(58, 58, canvas.width - 116, canvas.height - 116);

    // Brand monogram & wordmark
    ctx.fillStyle = labelTextColor;
    ctx.textAlign = 'center';
    ctx.font = '600 32px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('AURELIA BOTANICA', canvas.width / 2, 152);

    // Delicate brushed gold botanical divider
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(330, 186);
    ctx.lineTo(694, 186);
    ctx.stroke();

    // Small minimalist botanical diamond mark
    ctx.fillStyle = labelTextColor;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 174);
    ctx.lineTo(canvas.width / 2 + 10, 186);
    ctx.lineTo(canvas.width / 2, 198);
    ctx.lineTo(canvas.width / 2 - 10, 186);
    ctx.closePath();
    ctx.fill();

    // Product title in editorial serif
    ctx.fillStyle = labelTextColor;
    ctx.font = '600 66px "Cormorant Garamond", Georgia, serif';
    const words = title.split(' ');
    const splitAt = Math.ceil(words.length / 2);
    const line1 = words.slice(0, splitAt).join(' ');
    const line2 = words.slice(splitAt).join(' ');
    ctx.fillText(line1, canvas.width / 2, 326);
    if (line2) {
      ctx.fillText(line2, canvas.width / 2, 404);
    }

    // Subtle formulation descriptor
    const tagline =
      themeFinish === 'emerald'
        ? 'CONCENTRATED BOTANICAL ELIXIR'
        : themeFinish === 'ivory'
        ? 'CERAMIDE BARRIER COMPLEX'
        : 'PURE BOTANICAL GEL FORMULA';

    ctx.fillStyle = labelTextColor;
    ctx.globalAlpha = 0.82;
    ctx.font = '500 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(tagline, canvas.width / 2, 514);
    ctx.globalAlpha = 1;

    // Bottom horizontal rule
    ctx.strokeStyle = 'rgba(197, 160, 89, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(220, 566);
    ctx.lineTo(804, 566);
    ctx.stroke();

    ctx.fillStyle = labelTextColor;
    ctx.font = '600 30px "JetBrains Mono", monospace';
    ctx.fillText(`${subtitle.toUpperCase()}  ·  SMALL BATCH`, canvas.width / 2, 636);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBrushedMetalMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      const shade = 152 + Math.round((Math.sin(y * 0.7) * 0.5 + 0.5) * 48 + ((y * 37) % 24));
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createPaperBumpMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6500; i++) {
      const x = (i * 53) % 256;
      const y = ((i * 139) + Math.floor(i / 32) * 7) % 256;
      const v = i % 2 === 0 ? 150 : 108;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 2, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createIvoryStoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#F6F1E7';
    ctx.fillRect(0, 0, 512, 512);
    // Subtle mineral limestone/ivory veining
    for (let i = 0; i < 36; i++) {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(218, 208, 190, 0.25)' : 'rgba(255, 253, 248, 0.35)';
      ctx.lineWidth = 2 + (i % 4);
      ctx.beginPath();
      const yBase = (i * 19) % 512;
      ctx.moveTo(0, yBase);
      ctx.bezierCurveTo(170, yBase + (i % 2 === 0 ? 22 : -18), 340, yBase - 14, 512, yBase + 8);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAquaGelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#D7EFE8');
    grad.addColorStop(0.5, '#C4E7DD');
    grad.addColorStop(1, '#B3DFD3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle suspended botanical micro-bubbles inside clear gel
    for (let i = 0; i < 95; i++) {
      const bx = (i * 79 + 29) % 512;
      const by = (i * 113 + 17) % 512;
      const r = 1.5 + (i % 4) * 1.1;
      const bubble = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, 0.2, bx, by, r);
      bubble.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      bubble.addColorStop(0.6, 'rgba(225, 248, 242, 0.35)');
      bubble.addColorStop(1, 'rgba(180, 224, 212, 0)');
      ctx.fillStyle = bubble;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRefractiveShadowTexture(tintHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Outer soft ambient occlusion shadow
    const ao = ctx.createRadialGradient(256, 256, 36, 256, 256, 245);
    ao.addColorStop(0, 'rgba(28, 34, 26, 0.34)');
    ao.addColorStop(0.32, 'rgba(28, 34, 26, 0.16)');
    ao.addColorStop(0.65, 'rgba(28, 34, 26, 0.05)');
    ao.addColorStop(1, 'rgba(28, 34, 26, 0)');
    ctx.fillStyle = ao;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle glass refraction caustic glow ring around base perimeter
    const caustic = ctx.createRadialGradient(256, 256, 62, 256, 256, 150);
    caustic.addColorStop(0, 'rgba(255, 255, 255, 0)');
    caustic.addColorStop(0.45, tintHex);
    caustic.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = caustic;
    ctx.fillRect(0, 0, 512, 512);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function BotanicalScene3D({
  silhouette,
  finish,
  productLabel,
  volumeLabel,
  modelConfig,
  explodedAmount = 0,
  cameraPreset = 'hero',
  autoRotate = true,
  interactive = true,
  theme = 'light',
  backdrop,
  className = '',
  fallbackImage,
}: BotanicalScene3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const effectiveBackdrop = modelConfig?.backdrop || backdrop;
  const activeBackdrop = resolveBackdrop(effectiveBackdrop, theme);
  const effectiveSilhouette = modelConfig?.silhouette || silhouette;
  const effectiveFinish = modelConfig?.finish || finish;
  const effectiveLabel = modelConfig?.labelTitleOverride?.trim() || productLabel;
  const configSerialized = JSON.stringify(modelConfig || null);

  const stateRef = useRef({
    silhouette: effectiveSilhouette,
    finish: effectiveFinish,
    productLabel: effectiveLabel,
    volumeLabel,
    modelConfig,
    explodedAmount,
    cameraPreset,
    autoRotate,
    activeBackdrop,
  });
  stateRef.current = {
    silhouette: effectiveSilhouette,
    finish: effectiveFinish,
    productLabel: effectiveLabel,
    volumeLabel,
    modelConfig,
    explodedAmount,
    cameraPreset,
    autoRotate,
    activeBackdrop,
  };

  const rebuildModelRef = useRef<(() => void) | null>(null);
  const triggerCameraPresetRef = useRef<((preset: CameraPreset) => void) | null>(null);
  const applyBackdropRef = useRef<((nextBackdrop: StudioBackdrop, lightMult?: number) => void) | null>(null);

  useEffect(() => {
    rebuildModelRef.current?.();
  }, [effectiveSilhouette, effectiveFinish, effectiveLabel, volumeLabel, configSerialized]);

  useEffect(() => {
    triggerCameraPresetRef.current?.(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    applyBackdropRef.current?.(activeBackdrop, modelConfig?.lightIntensity);
  }, [activeBackdrop, modelConfig?.lightIntensity]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSoftwareGl = detectSoftwareWebGL();
    const isMobileViewport = window.innerWidth < 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, isMobileViewport ? 1.75 : 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 520;
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    const onContextRestored = () => {
      setWebglFailed(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const initialSpec = STUDIO_BACKDROPS[stateRef.current.activeBackdrop];
    const scene = new THREE.Scene();
    let activeBgTex: THREE.Texture = createStudioBackdropTexture(initialSpec);
    scene.background = activeBgTex;
    const sceneFog = new THREE.FogExp2(initialSpec.fogHex, initialSpec.isDark ? 0.028 : 0.02);
    scene.fog = sceneFog;

    // Custom photographic softbox reflection map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    let currentEnvTarget: THREE.WebGLRenderTarget | null = null;
    const generateEnvForSpec = (spec: BackdropSpec) => {
      const studioEnvScene = createPhotographicStudioEnvScene(spec);
      const nextTarget = pmremGenerator.fromScene(studioEnvScene, 0.026);
      studioEnvScene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      if (currentEnvTarget) {
        currentEnvTarget.dispose();
      }
      currentEnvTarget = nextTarget;
      scene.environment = nextTarget.texture;
    };
    generateEnvForSpec(initialSpec);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 45);
    camera.position.set(2.35, 2.05, 4.45);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.02, 0);
    controls.enablePan = false;
    controls.enableZoom = interactive;
    controls.enableRotate = interactive;
    controls.rotateSpeed = 0.78;
    controls.zoomSpeed = 0.82;
    controls.minDistance = 2.25;
    controls.maxDistance = 6.8;
    controls.minPolarAngle = 0.22;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;

    // Commercial 3-point + softbox studio lighting rig
    const hemiLight = new THREE.HemisphereLight(
      initialSpec.hemiSky,
      initialSpec.hemiGround,
      initialSpec.hemiIntensity,
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, initialSpec.keyIntensity);
    keyLight.position.set(3.4, 5.2, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(isMobileViewport ? 1024 : 2048, isMobileViewport ? 1024 : 2048);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 15;
      const d = 2.6;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.018;
      keyLight.shadow.radius = 4;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(initialSpec.fillColor, initialSpec.fillIntensity);
    fillLight.position.set(-3.8, 2.8, 2.4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(initialSpec.rimColor, initialSpec.rimIntensity);
    rimLight.position.set(-2.6, 3.4, -4.0);
    scene.add(rimLight);

    let leftSoftboxLight: THREE.RectAreaLight | null = null;
    let rightSoftboxLight: THREE.RectAreaLight | null = null;
    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      leftSoftboxLight = new THREE.RectAreaLight(0xfffaf0, initialSpec.isDark ? 4.4 : 3.4, 2.0, 4.2);
      leftSoftboxLight.position.set(-3.2, 2.1, 2.4);
      leftSoftboxLight.lookAt(0, 1.0, 0);
      scene.add(leftSoftboxLight);

      rightSoftboxLight = new THREE.RectAreaLight(0xf3faf6, initialSpec.isDark ? 2.8 : 2.2, 1.4, 3.8);
      rightSoftboxLight.position.set(3.2, 1.9, 1.8);
      rightSoftboxLight.lookAt(0, 1.0, 0);
      scene.add(rightSoftboxLight);
    }

    // Shared procedural textures
    const brushedMetalMap = createBrushedMetalMap();
    const paperBumpMap = createPaperBumpMap();
    const ivoryStoneTex = createIvoryStoneTexture();
    ivoryStoneTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorAlphaMap = createFloorAlphaMap();

    // Minimal Ivory Circular Display Pedestal with Subtle Champagne Gold Rim
    const plinthGroup = new THREE.Group();
    const plinthPts = [
      new THREE.Vector2(0, -0.22),
      new THREE.Vector2(1.48, -0.22),
      new THREE.Vector2(1.52, -0.19),
      new THREE.Vector2(1.52, -0.025),
      new THREE.Vector2(1.48, 0.0),
      new THREE.Vector2(0, 0.0),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPts, 72);
    const plinthMat = new THREE.MeshPhysicalMaterial({
      color: initialSpec.plinthTint,
      map: ivoryStoneTex,
      roughness: 0.36,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.9,
    });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.receiveShadow = !isSoftwareGl;
    plinthGroup.add(plinthMesh);

    const goldTrimGeo = new THREE.TorusGeometry(1.495, 0.011, 16, 80);
    goldTrimGeo.rotateX(Math.PI / 2);
    const goldTrimMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8bd86,
      metalness: 0.94,
      roughness: 0.2,
      roughnessMap: brushedMetalMap,
      anisotropy: 0.85,
    });
    const plinthRing = new THREE.Mesh(goldTrimGeo, goldTrimMat);
    plinthRing.position.y = -0.008;
    plinthGroup.add(plinthRing);

    // Feathered soft studio tabletop disc beneath pedestal (blends seamlessly into cyclorama)
    const studioFloorGeo = new THREE.CircleGeometry(6.2, 64);
    studioFloorGeo.rotateX(-Math.PI / 2);
    const studioFloorMat = new THREE.MeshStandardMaterial({
      color: initialSpec.floorHex,
      alphaMap: floorAlphaMap,
      transparent: true,
      roughness: 0.92,
      metalness: 0.0,
      depthWrite: false,
    });
    const studioFloor = new THREE.Mesh(studioFloorGeo, studioFloorMat);
    studioFloor.position.y = -0.221;
    studioFloor.receiveShadow = !isSoftwareGl;
    plinthGroup.add(studioFloor);

    // Dynamic contact + subtle glass caustic shadow plane on top of ivory pedestal
    const shadowPlaneGeo = new THREE.PlaneGeometry(2.15, 2.15);
    const shadowMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.004;
    plinthGroup.add(shadowPlane);

    scene.add(plinthGroup);

    // Root container for active luxury cosmetic product
    const productRoot = new THREE.Group();
    scene.add(productRoot);

    const partRefs: {
      liquid?: THREE.Object3D;
      label?: THREE.Object3D;
      collar?: THREE.Object3D;
      cap?: THREE.Object3D;
      dropletTip?: THREE.Object3D;
    } = {};

    const baseHeights = {
      liquid: 0,
      label: 0,
      collar: 0,
      cap: 0,
      dropletTip: 0,
    };

    const disposableAssets: {
      geometries: THREE.BufferGeometry[];
      materials: THREE.Material[];
      textures: THREE.Texture[];
    } = {
      geometries: [plinthGeo, goldTrimGeo, studioFloorGeo, shadowPlaneGeo],
      materials: [plinthMat, goldTrimMat, studioFloorMat, shadowMat],
      textures: [brushedMetalMap, paperBumpMap, ivoryStoneTex, floorAlphaMap],
    };

    applyBackdropRef.current = (nextBackdrop: StudioBackdrop, lightMult = 1) => {
      const spec = STUDIO_BACKDROPS[nextBackdrop];
      const mult = typeof lightMult === 'number' && lightMult > 0 ? lightMult : 1;
      const nextBgTex = createStudioBackdropTexture(spec);
      scene.background = nextBgTex;
      activeBgTex.dispose();
      activeBgTex = nextBgTex;

      sceneFog.color.setHex(spec.fogHex);
      sceneFog.density = spec.isDark ? 0.028 : 0.02;
      studioFloorMat.color.setHex(spec.floorHex);
      plinthMat.color.setHex(spec.plinthTint);

      hemiLight.color.setHex(spec.hemiSky);
      hemiLight.groundColor.setHex(spec.hemiGround);
      hemiLight.intensity = spec.hemiIntensity * mult;
      keyLight.intensity = spec.keyIntensity * mult;
      fillLight.color.setHex(spec.fillColor);
      fillLight.intensity = spec.fillIntensity * mult;
      rimLight.color.setHex(spec.rimColor);
      rimLight.intensity = spec.rimIntensity * mult;
      if (leftSoftboxLight) leftSoftboxLight.intensity = (spec.isDark ? 4.4 : 3.4) * mult;
      if (rightSoftboxLight) rightSoftboxLight.intensity = (spec.isDark ? 2.8 : 2.2) * mult;

      generateEnvForSpec(spec);
    };

    const gltfLoader = new GLTFLoader();
    let activeBuildNonce = 0;

    let activeModelDisposables: {
      geometries: THREE.BufferGeometry[];
      materials: THREE.Material[];
      textures: THREE.Texture[];
    } = {
      geometries: [],
      materials: [],
      textures: [],
    };

    let activeShadowTex: THREE.Texture | null = null;
    let switchTransitionProgress = 1;

    function clearCurrentModel() {
      while (productRoot.children.length > 0) {
        productRoot.remove(productRoot.children[0]);
      }
      activeModelDisposables.geometries.forEach((g) => g.dispose());
      activeModelDisposables.materials.forEach((m) => m.dispose());
      activeModelDisposables.textures.forEach((t) => t.dispose());
      activeModelDisposables = { geometries: [], materials: [], textures: [] };
      partRefs.liquid = undefined;
      partRefs.label = undefined;
      partRefs.collar = undefined;
      partRefs.cap = undefined;
      partRefs.dropletTip = undefined;
    }

    function buildProductModel() {
      activeBuildNonce += 1;
      const myNonce = activeBuildNonce;
      clearCurrentModel();
      const { silhouette: sil, finish: fin, productLabel: pLabel, volumeLabel: vLabel, modelConfig: cfg } =
        stateRef.current;
      const themeFinish = normalizeFinish(fin, sil);

      // Update caustic-tinted contact shadow beneath vessel
      if (activeShadowTex) activeShadowTex.dispose();
      const causticRgba =
        themeFinish === 'emerald'
          ? 'rgba(134, 176, 130, 0.24)'
          : themeFinish === 'ivory'
          ? 'rgba(168, 184, 158, 0.18)'
          : 'rgba(130, 198, 186, 0.24)';
      activeShadowTex = createRefractiveShadowTexture(causticRgba);
      shadowMat.map = activeShadowTex;
      shadowMat.needsUpdate = true;

      // Load custom GLB/GLTF 3D model when configured in 3D Product Studio
      if (cfg?.mode === 'glb' && cfg.glbUrl) {
        void resolveMediaUrl(cfg.glbUrl).then((resolvedGlbUrl) => {
          if (disposed || myNonce !== activeBuildNonce || !resolvedGlbUrl) return;
          gltfLoader.load(
            resolvedGlbUrl,
            (gltf) => {
              if (disposed || myNonce !== activeBuildNonce) {
                gltf.scene.traverse((obj) => {
                  if ((obj as THREE.Mesh).isMesh) {
                    const m = obj as THREE.Mesh;
                    m.geometry?.dispose();
                    const mats = Array.isArray(m.material) ? m.material : [m.material];
                    mats.forEach((mat) => mat?.dispose());
                  }
                });
                return;
              }
              const loaded = gltf.scene;
              const box = new THREE.Box3().setFromObject(loaded);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z, 0.001);
              const scale = 1.92 / maxDim;
              loaded.scale.setScalar(scale);

              const scaledBox = new THREE.Box3().setFromObject(loaded);
              const center = scaledBox.getCenter(new THREE.Vector3());
              loaded.position.x -= center.x;
              loaded.position.z -= center.z;
              loaded.position.y -= scaledBox.min.y - 0.006;

              loaded.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                  const m = obj as THREE.Mesh;
                  m.castShadow = !isSoftwareGl;
                  m.receiveShadow = !isSoftwareGl;
                  if (m.geometry) activeModelDisposables.geometries.push(m.geometry);
                  const mats = Array.isArray(m.material) ? m.material : [m.material];
                  mats.forEach((mat) => {
                    if (mat) activeModelDisposables.materials.push(mat);
                  });
                }
              });

              productRoot.add(loaded);
              switchTransitionProgress = 0;
              productRoot.scale.setScalar(0.92);
              productRoot.position.y = 0.045;
            },
            undefined,
            () => {
              // Silently ignore invalid external URL without crashing WebGL canvas
            },
          );
        });
        return;
      }

      // Brushed champagne gold metallic material (customizable via Admin 3D Studio)
      const champagneGoldMat = new THREE.MeshPhysicalMaterial({
        color: cfg?.capColor || 0xd9be89,
        metalness: cfg?.capMetalness ?? 0.95,
        roughness: cfg?.capRoughness ?? 0.21,
        roughnessMap: brushedMetalMap,
        bumpMap: brushedMetalMap,
        bumpScale: 0.0025,
        anisotropy: 0.85,
        envMapIntensity: 1.25,
      });

      // Matte luxury soft-touch ivory material (dropper bulb & pump actuator)
      const matteIvoryMat = new THREE.MeshPhysicalMaterial({
        color: 0xf4efe6,
        roughness: 0.74,
        metalness: 0.0,
        sheen: 0.28,
        sheenRoughness: 0.65,
        sheenColor: new THREE.Color(0xffffff),
      });

      // Cotton-textured warm ivory label with dark green typography
      const labelTex = createLuxuryLabelTexture(
        pLabel,
        vLabel,
        themeFinish,
        cfg?.labelBgColor || '#FBF8F1',
        cfg?.labelTextColor || '#1C3B2B',
      );
      labelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const labelMat = new THREE.MeshStandardMaterial({
        map: labelTex,
        bumpMap: paperBumpMap,
        bumpScale: 0.0018,
        roughness: 0.76,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      activeModelDisposables.materials.push(champagneGoldMat, matteIvoryMat, labelMat);
      activeModelDisposables.textures.push(labelTex);

      if (sil === 'dropper') {
        // GLOW SERUM: Transparent Frosted Emerald Glass + Golden-Green Serum + Matte Ivory & Champagne Gold Dropper
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: cfg?.bottleColor || (themeFinish === 'aqua' ? 0xd2ece4 : themeFinish === 'ivory' ? 0xeef3eb : 0xc1ded0),
          attenuationColor: new THREE.Color(
            cfg?.bottleColor || (themeFinish === 'aqua' ? 0x76bcae : themeFinish === 'ivory' ? 0x93ab8c : 0x1e5c42),
          ),
          attenuationDistance: 0.95,
          roughness: cfg?.glassRoughness ?? 0.18,
          metalness: 0.0,
          transmission: isSoftwareGl ? 0 : cfg?.glassTransmission ?? 0.88,
          transparent: true,
          opacity: isSoftwareGl ? 0.54 : 1.0,
          ior: 1.52,
          thickness: 0.95,
          clearcoat: 1.0,
          clearcoatRoughness: 0.07,
          envMapIntensity: 1.45,
          depthWrite: false,
        });

        const liquidMat = new THREE.MeshPhysicalMaterial({
          color: cfg?.liquidColor || (themeFinish === 'aqua' ? 0xc0e8de : 0xb5ca70),
          attenuationColor: new THREE.Color(cfg?.liquidColor || (themeFinish === 'aqua' ? 0x8cc9ba : 0x87a338)),
          attenuationDistance: 0.65,
          roughness: 0.05,
          metalness: 0.0,
          transmission: isSoftwareGl ? 0 : 0.74,
          transparent: true,
          opacity: isSoftwareGl ? 0.82 : 0.96,
          ior: 1.37,
          thickness: 0.65,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
        });

        const clearPipetteMat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.05,
          transmission: isSoftwareGl ? 0 : 0.94,
          transparent: true,
          opacity: isSoftwareGl ? 0.45 : 0.98,
          ior: 1.48,
          thickness: 0.15,
          depthWrite: false,
        });

        activeModelDisposables.materials.push(glassMat, liquidMat, clearPipetteMat);

        // 1. Thick-walled frosted emerald glass serum bottle
        const bottlePts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.39, 0),
          new THREE.Vector2(0.445, 0.032),
          new THREE.Vector2(0.455, 0.085),
          new THREE.Vector2(0.455, 0.96),
          new THREE.Vector2(0.44, 1.06),
          new THREE.Vector2(0.36, 1.19),
          new THREE.Vector2(0.22, 1.29),
          new THREE.Vector2(0.205, 1.33),
          new THREE.Vector2(0.205, 1.46),
          new THREE.Vector2(0.175, 1.46),
          new THREE.Vector2(0.175, 1.27),
        ];
        const bottleGeo = new THREE.LatheGeometry(bottlePts, 64);
        const bottleMesh = new THREE.Mesh(bottleGeo, glassMat);
        bottleMesh.renderOrder = 3;
        bottleMesh.castShadow = !isSoftwareGl;

        // Thick solid glass punt at bottle base for authentic luxury refraction
        const puntGeo = new THREE.CylinderGeometry(0.415, 0.395, 0.105, 48);
        const puntMesh = new THREE.Mesh(puntGeo, glassMat);
        puntMesh.position.y = 0.054;
        puntMesh.renderOrder = 2;

        // 2. Golden-green serum liquid with realistic concave top meniscus
        const liquidPts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.388, 0),
          new THREE.Vector2(0.396, 0.025),
          new THREE.Vector2(0.396, 0.78),
          new THREE.Vector2(0.375, 0.782),
          new THREE.Vector2(0.28, 0.758),
          new THREE.Vector2(0, 0.752),
        ];
        const serumGeo = new THREE.LatheGeometry(liquidPts, 48);
        const serumMesh = new THREE.Mesh(serumGeo, liquidMat);
        serumMesh.position.y = 0.115;
        serumMesh.renderOrder = 1;
        baseHeights.liquid = 0.115;
        partRefs.liquid = serumMesh;

        // 3. Curved warm ivory botanical paper label with dark green text
        const labelGeo = new THREE.CylinderGeometry(0.458, 0.458, 0.62, 48, 1, true, -0.92, 1.84);
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.y = 0.54;
        labelMesh.renderOrder = 4;
        baseHeights.label = 0.54;
        partRefs.label = labelMesh;

        // 4. Precision stepped brushed champagne-gold collar
        const collarGroup = new THREE.Group();
        const collarPts = [
          new THREE.Vector2(0.215, -0.105),
          new THREE.Vector2(0.242, -0.105),
          new THREE.Vector2(0.25, -0.09),
          new THREE.Vector2(0.25, 0.07),
          new THREE.Vector2(0.236, 0.095),
          new THREE.Vector2(0.19, 0.095),
        ];
        const collarGeo = new THREE.LatheGeometry(collarPts, 56);
        const collarMesh = new THREE.Mesh(collarGeo, champagneGoldMat);
        collarMesh.castShadow = !isSoftwareGl;

        const collarKnurlRingGeo = new THREE.TorusGeometry(0.248, 0.008, 12, 56);
        collarKnurlRingGeo.rotateX(Math.PI / 2);
        const collarKnurlBottom = new THREE.Mesh(collarKnurlRingGeo, champagneGoldMat);
        collarKnurlBottom.position.y = -0.075;
        const collarKnurlTop = new THREE.Mesh(collarKnurlRingGeo, champagneGoldMat);
        collarKnurlTop.position.y = 0.062;

        collarGroup.add(collarMesh, collarKnurlBottom, collarKnurlTop);
        collarGroup.position.y = 1.49;
        baseHeights.collar = 1.49;
        partRefs.collar = collarGroup;

        // 5. Matte Ivory Sculpted Dropper Bulb + Gold Collar Accent + Borosilicate Pipette
        const capGroup = new THREE.Group();
        const bulbPts = [
          new THREE.Vector2(0.165, 0.0),
          new THREE.Vector2(0.158, 0.06),
          new THREE.Vector2(0.145, 0.24),
          new THREE.Vector2(0.12, 0.36),
          new THREE.Vector2(0.068, 0.415),
          new THREE.Vector2(0, 0.425),
        ];
        const bulbGeo = new THREE.LatheGeometry(bulbPts, 48);
        const bulbMesh = new THREE.Mesh(bulbGeo, matteIvoryMat);
        bulbMesh.position.y = 0.035;
        bulbMesh.castShadow = !isSoftwareGl;

        const bulbAccentRingGeo = new THREE.TorusGeometry(0.168, 0.012, 14, 48);
        bulbAccentRingGeo.rotateX(Math.PI / 2);
        const bulbAccentRing = new THREE.Mesh(bulbAccentRingGeo, champagneGoldMat);
        bulbAccentRing.position.y = 0.032;

        const pipettePts = [
          new THREE.Vector2(0.032, 0),
          new THREE.Vector2(0.032, -0.78),
          new THREE.Vector2(0.022, -0.94),
          new THREE.Vector2(0.011, -1.03),
          new THREE.Vector2(0.0, -1.03),
        ];
        const pipetteGeo = new THREE.LatheGeometry(pipettePts, 28);
        const pipetteMesh = new THREE.Mesh(pipetteGeo, clearPipetteMat);
        pipetteMesh.renderOrder = 2;

        capGroup.add(bulbMesh, bulbAccentRing, pipetteMesh);
        capGroup.position.y = 1.56;
        baseHeights.cap = 1.56;
        partRefs.cap = capGroup;

        // 6. Precision serum drop clinging to pipette tip
        const tipPts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.034, 0.032),
          new THREE.Vector2(0.026, 0.072),
          new THREE.Vector2(0, 0.125),
        ];
        const tipGeo = new THREE.LatheGeometry(tipPts, 24);
        const tipMesh = new THREE.Mesh(tipGeo, liquidMat);
        tipMesh.position.y = 0.43;
        tipMesh.renderOrder = 2;
        baseHeights.dropletTip = 0.43;
        partRefs.dropletTip = tipMesh;

        activeModelDisposables.geometries.push(
          bottleGeo,
          puntGeo,
          serumGeo,
          labelGeo,
          collarGeo,
          collarKnurlRingGeo,
          bulbGeo,
          bulbAccentRingGeo,
          pipetteGeo,
          tipGeo,
        );
        productRoot.add(serumMesh, puntMesh, bottleMesh, labelMesh, collarGroup, capGroup, tipMesh);
      } else if (sil === 'jar') {
        // BARRIER CREAM: Frosted Ivory Container + Soft Sage-Green Details + Brushed Champagne Gold Cap
        const jarGlassMat = new THREE.MeshPhysicalMaterial({
          color: cfg?.bottleColor || 0xf4efe5,
          roughness: cfg?.glassRoughness ?? 0.34,
          metalness: 0.0,
          transmission: isSoftwareGl ? 0 : cfg?.glassTransmission ?? 0.38,
          transparent: true,
          opacity: isSoftwareGl ? 0.92 : 0.98,
          ior: 1.49,
          thickness: 0.7,
          clearcoat: 0.72,
          clearcoatRoughness: 0.16,
          envMapIntensity: 1.2,
          depthWrite: true,
        });

        const sageDetailMat = new THREE.MeshPhysicalMaterial({
          color: 0x6f8765,
          roughness: 0.38,
          metalness: 0.04,
          clearcoat: 0.45,
          clearcoatRoughness: 0.2,
        });

        const creamCoreMat = new THREE.MeshPhysicalMaterial({
          color: cfg?.liquidColor || 0xf8f6ef,
          roughness: 0.35,
          metalness: 0.0,
          sheen: 0.35,
          sheenRoughness: 0.45,
          sheenColor: new THREE.Color(0xffffff),
        });

        activeModelDisposables.materials.push(jarGlassMat, sageDetailMat, creamCoreMat);

        // 1. Thick double-walled frosted ivory jar
        const jarPts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.53, 0),
          new THREE.Vector2(0.605, 0.045),
          new THREE.Vector2(0.625, 0.11),
          new THREE.Vector2(0.625, 0.68),
          new THREE.Vector2(0.605, 0.74),
          new THREE.Vector2(0.55, 0.77),
          new THREE.Vector2(0.55, 0.82),
          new THREE.Vector2(0.49, 0.82),
        ];
        const jarGeo = new THREE.LatheGeometry(jarPts, 64);
        const jarMesh = new THREE.Mesh(jarGeo, jarGlassMat);
        jarMesh.castShadow = !isSoftwareGl;
        jarMesh.renderOrder = 2;

        // 2. Whipped botanical barrier cream core inside
        const creamGeo = new THREE.CylinderGeometry(0.51, 0.49, 0.56, 48);
        const swirlPts = [
          new THREE.Vector2(0, 0.09),
          new THREE.Vector2(0.16, 0.045),
          new THREE.Vector2(0.36, 0.025),
          new THREE.Vector2(0.49, 0.0),
          new THREE.Vector2(0, 0),
        ];
        const swirlGeo = new THREE.LatheGeometry(swirlPts, 48);
        const creamGroup = new THREE.Group();
        const creamBody = new THREE.Mesh(creamGeo, creamCoreMat);
        const creamSwirl = new THREE.Mesh(swirlGeo, creamCoreMat);
        creamSwirl.position.y = 0.28;
        creamGroup.add(creamBody, creamSwirl);
        creamGroup.position.y = 0.36;
        baseHeights.liquid = 0.36;
        partRefs.liquid = creamGroup;

        // 3. Soft sage-green botanical rim gasket & recessed base detail
        const collarGroup = new THREE.Group();
        const sageNeckBandGeo = new THREE.CylinderGeometry(0.562, 0.562, 0.075, 56);
        const sageNeckBand = new THREE.Mesh(sageNeckBandGeo, sageDetailMat);
        const sealingDiscGeo = new THREE.CylinderGeometry(0.505, 0.505, 0.028, 48);
        const sealingDisc = new THREE.Mesh(sealingDiscGeo, matteIvoryMat);
        sealingDisc.position.y = 0.03;
        collarGroup.add(sageNeckBand, sealingDisc);
        collarGroup.position.y = 0.785;
        baseHeights.collar = 0.785;
        partRefs.collar = collarGroup;

        // 4. Warm ivory label with dark green typography
        const labelGeo = new THREE.CylinderGeometry(0.629, 0.629, 0.42, 48, 1, true, -0.88, 1.76);
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.y = 0.39;
        labelMesh.renderOrder = 3;
        baseHeights.label = 0.39;
        partRefs.label = labelMesh;

        // 5. Weighted brushed champagne-gold chamfered lid with sage-green top crest
        const lidGroup = new THREE.Group();
        const lidPts = [
          new THREE.Vector2(0.56, -0.11),
          new THREE.Vector2(0.618, -0.11),
          new THREE.Vector2(0.628, -0.09),
          new THREE.Vector2(0.628, 0.085),
          new THREE.Vector2(0.598, 0.118),
          new THREE.Vector2(0, 0.118),
        ];
        const lidGeo = new THREE.LatheGeometry(lidPts, 64);
        const lidMesh = new THREE.Mesh(lidGeo, champagneGoldMat);
        lidMesh.castShadow = !isSoftwareGl;

        const topMedallionGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.012, 48);
        const topMedallion = new THREE.Mesh(topMedallionGeo, sageDetailMat);
        topMedallion.position.y = 0.116;

        const topMedallionRimGeo = new THREE.TorusGeometry(0.322, 0.008, 12, 56);
        topMedallionRimGeo.rotateX(Math.PI / 2);
        const topMedallionRim = new THREE.Mesh(topMedallionRimGeo, champagneGoldMat);
        topMedallionRim.position.y = 0.12;

        lidGroup.add(lidMesh, topMedallion, topMedallionRim);
        lidGroup.position.y = 0.94;
        baseHeights.cap = 0.94;
        partRefs.cap = lidGroup;

        activeModelDisposables.geometries.push(
          jarGeo,
          creamGeo,
          swirlGeo,
          sageNeckBandGeo,
          sealingDiscGeo,
          labelGeo,
          lidGeo,
          topMedallionGeo,
          topMedallionRimGeo,
        );
        productRoot.add(creamGroup, jarMesh, labelMesh, collarGroup, lidGroup);
      } else {
        // GEL CLEANSER: Transparent Pale Aqua-Green Bottle + Clear Gel Texture + Matte Ivory Pump
        const aquaGlassMat = new THREE.MeshPhysicalMaterial({
          color: cfg?.bottleColor || (themeFinish === 'emerald' ? 0xc2dfd0 : 0xd5efe7),
          attenuationColor: new THREE.Color(
            cfg?.bottleColor || (themeFinish === 'emerald' ? 0x2c6b4e : 0x8ccab9),
          ),
          attenuationDistance: 1.25,
          roughness: cfg?.glassRoughness ?? 0.09,
          metalness: 0.0,
          transmission: isSoftwareGl ? 0 : cfg?.glassTransmission ?? 0.91,
          transparent: true,
          opacity: isSoftwareGl ? 0.48 : 1.0,
          ior: 1.51,
          thickness: 0.8,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          envMapIntensity: 1.4,
          depthWrite: false,
        });

        const aquaGelTex = createAquaGelTexture();
        aquaGelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const clearGelMat = new THREE.MeshPhysicalMaterial({
          color: cfg?.liquidColor || 0xdff5ee,
          map: aquaGelTex,
          attenuationColor: new THREE.Color(cfg?.liquidColor || 0x9bd3c4),
          attenuationDistance: 0.9,
          roughness: 0.08,
          metalness: 0.0,
          transmission: isSoftwareGl ? 0 : 0.72,
          transparent: true,
          opacity: isSoftwareGl ? 0.76 : 0.94,
          ior: 1.35,
          thickness: 0.65,
          clearcoat: 0.9,
        });

        const dipTubeMat = new THREE.MeshPhysicalMaterial({
          color: 0xf4f9f7,
          roughness: 0.25,
          transparent: true,
          opacity: 0.55,
        });

        activeModelDisposables.materials.push(aquaGlassMat, clearGelMat, dipTubeMat);
        activeModelDisposables.textures.push(aquaGelTex);

        // 1. Sleek tall cylindrical bottle with heavy clear base punt & soft rounded shoulders
        const pumpPts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.37, 0),
          new THREE.Vector2(0.425, 0.036),
          new THREE.Vector2(0.435, 0.09),
          new THREE.Vector2(0.435, 1.32),
          new THREE.Vector2(0.415, 1.44),
          new THREE.Vector2(0.31, 1.56),
          new THREE.Vector2(0.185, 1.63),
          new THREE.Vector2(0.185, 1.74),
          new THREE.Vector2(0.16, 1.74),
        ];
        const bottleGeo = new THREE.LatheGeometry(pumpPts, 64);
        const bottleMesh = new THREE.Mesh(bottleGeo, aquaGlassMat);
        bottleMesh.renderOrder = 3;
        bottleMesh.castShadow = !isSoftwareGl;

        const basePuntGeo = new THREE.CylinderGeometry(0.395, 0.375, 0.1, 48);
        const basePunt = new THREE.Mesh(basePuntGeo, aquaGlassMat);
        basePunt.position.y = 0.05;
        basePunt.renderOrder = 2;

        // 2. Clear botanical gel texture core with concave meniscus
        const gelPts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.372, 0),
          new THREE.Vector2(0.382, 0.03),
          new THREE.Vector2(0.382, 1.15),
          new THREE.Vector2(0.36, 1.152),
          new THREE.Vector2(0.24, 1.132),
          new THREE.Vector2(0, 1.126),
        ];
        const gelGeo = new THREE.LatheGeometry(gelPts, 48);
        const gelMesh = new THREE.Mesh(gelGeo, clearGelMat);
        gelMesh.position.y = 0.11;
        gelMesh.renderOrder = 1;
        baseHeights.liquid = 0.11;
        partRefs.liquid = gelMesh;

        // 3. Warm ivory label with dark green typography
        const labelGeo = new THREE.CylinderGeometry(0.438, 0.438, 0.84, 48, 1, true, -0.9, 1.8);
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.y = 0.72;
        labelMesh.renderOrder = 4;
        baseHeights.label = 0.72;
        partRefs.label = labelMesh;

        // 4. Matte ivory & champagne gold lock collar
        const collarGroup = new THREE.Group();
        const collarGeo = new THREE.CylinderGeometry(0.205, 0.218, 0.16, 48);
        const collarMesh = new THREE.Mesh(collarGeo, champagneGoldMat);
        collarMesh.castShadow = !isSoftwareGl;
        const collarLipGeo = new THREE.TorusGeometry(0.212, 0.01, 12, 48);
        collarLipGeo.rotateX(Math.PI / 2);
        const collarLip = new THREE.Mesh(collarLipGeo, champagneGoldMat);
        collarLip.position.y = -0.07;
        collarGroup.add(collarMesh, collarLip);
        collarGroup.position.y = 1.77;
        baseHeights.collar = 1.77;
        partRefs.collar = collarGroup;

        // 5. Matte ivory pump actuator + curved dispensing spout + internal dip tube
        const pumpGroup = new THREE.Group();
        const stemGeo = new THREE.CylinderGeometry(0.068, 0.072, 0.22, 28);
        const stemMesh = new THREE.Mesh(stemGeo, champagneGoldMat);

        const headPts = [
          new THREE.Vector2(0, -0.045),
          new THREE.Vector2(0.145, -0.045),
          new THREE.Vector2(0.15, 0.045),
          new THREE.Vector2(0.132, 0.065),
          new THREE.Vector2(0, 0.065),
        ];
        const headGeo = new THREE.LatheGeometry(headPts, 40);
        const headMesh = new THREE.Mesh(headGeo, matteIvoryMat);
        headMesh.position.y = 0.135;
        headMesh.castShadow = !isSoftwareGl;

        // Smooth contoured pump spout
        const spoutShape = new THREE.Shape();
        spoutShape.moveTo(0.06, -0.025);
        spoutShape.lineTo(0.31, -0.032);
        spoutShape.quadraticCurveTo(0.35, -0.032, 0.35, -0.005);
        spoutShape.quadraticCurveTo(0.35, 0.025, 0.30, 0.032);
        spoutShape.lineTo(0.06, 0.045);
        spoutShape.closePath();
        const spoutGeo = new THREE.ExtrudeGeometry(spoutShape, {
          depth: 0.056,
          bevelEnabled: true,
          bevelThickness: 0.016,
          bevelSize: 0.014,
          bevelSegments: 4,
        });
        spoutGeo.translate(0, 0, -0.028);
        const spoutMesh = new THREE.Mesh(spoutGeo, matteIvoryMat);
        spoutMesh.position.y = 0.145;
        spoutMesh.castShadow = !isSoftwareGl;

        // Internal curved dip tube reaching bottom corner
        const tubeCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, -0.1, 0),
          new THREE.Vector3(0, -0.95, 0),
          new THREE.Vector3(0.08, -1.68, 0.04),
        ]);
        const dipTubeGeo = new THREE.TubeGeometry(tubeCurve, 20, 0.018, 12, false);
        const dipTubeMesh = new THREE.Mesh(dipTubeGeo, dipTubeMat);
        dipTubeMesh.renderOrder = 2;

        pumpGroup.add(stemMesh, headMesh, spoutMesh, dipTubeMesh);
        pumpGroup.position.y = 1.92;
        baseHeights.cap = 1.92;
        partRefs.cap = pumpGroup;

        activeModelDisposables.geometries.push(
          bottleGeo,
          basePuntGeo,
          gelGeo,
          labelGeo,
          collarGeo,
          collarLipGeo,
          stemGeo,
          headGeo,
          spoutGeo,
          dipTubeGeo,
        );
        productRoot.add(gelMesh, basePunt, bottleMesh, labelMesh, collarGroup, pumpGroup);
      }

      // Trigger smooth scale/settle transition when switching products
      switchTransitionProgress = 0;
      productRoot.scale.setScalar(0.92);
      productRoot.position.y = 0.045;
    }

    buildProductModel();
    rebuildModelRef.current = buildProductModel;

    // Smooth camera preset transitions
    let camTransitionActive = false;
    triggerCameraPresetRef.current = (preset: CameraPreset) => {
      if (preset === 'hero') {
        _camGoal.set(2.35, 2.05, 4.45);
        _lookGoal.set(0, 1.02, 0);
      } else if (preset === 'detail') {
        _camGoal.set(0.38, 1.52, 2.75);
        _lookGoal.set(0, 1.18, 0);
      } else if (preset === 'top') {
        _camGoal.set(0.15, 4.35, 1.9);
        _lookGoal.set(0, 0.9, 0);
      } else {
        _camGoal.set(-3.35, 1.35, 2.75);
        _lookGoal.set(0, 0.96, 0);
      }
      camTransitionActive = true;
    };

    let userInteracting = false;
    const onControlsStart = () => {
      camTransitionActive = false;
      userInteracting = true;
    };
    const onControlsEnd = () => {
      userInteracting = false;
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const { explodedAmount: exp, autoRotate: rotate } = stateRef.current;

      // Smooth damped transition when switching products
      if (switchTransitionProgress < 1) {
        const nextScale = THREE.MathUtils.damp(productRoot.scale.x, 1.0, 9, dt);
        productRoot.scale.setScalar(nextScale);
        productRoot.position.y = THREE.MathUtils.damp(productRoot.position.y, 0.0, 9, dt);
        if (Math.abs(1.0 - nextScale) < 0.001) {
          productRoot.scale.setScalar(1.0);
          productRoot.position.y = 0.0;
          switchTransitionProgress = 1;
        }
      }

      // Smooth exponential damping on exploded-view assembly
      if (partRefs.liquid) {
        partRefs.liquid.position.y = THREE.MathUtils.damp(
          partRefs.liquid.position.y,
          baseHeights.liquid + exp * 0.1,
          6,
          dt,
        );
      }
      if (partRefs.label) {
        partRefs.label.position.y = THREE.MathUtils.damp(
          partRefs.label.position.y,
          baseHeights.label + exp * 0.04,
          6,
          dt,
        );
      }
      if (partRefs.collar) {
        partRefs.collar.position.y = THREE.MathUtils.damp(
          partRefs.collar.position.y,
          baseHeights.collar + exp * 0.42,
          6,
          dt,
        );
      }
      if (partRefs.cap) {
        partRefs.cap.position.y = THREE.MathUtils.damp(
          partRefs.cap.position.y,
          baseHeights.cap + exp * 0.88,
          6,
          dt,
        );
      }
      if (partRefs.dropletTip) {
        partRefs.dropletTip.position.y = THREE.MathUtils.damp(
          partRefs.dropletTip.position.y,
          baseHeights.dropletTip + exp * 0.34,
          6,
          dt,
        );
      }

      // Subtle luxury idle rotation (pauses smoothly while dragging)
      if (rotate && !userInteracting && !prefersReduced) {
        productRoot.rotation.y += dt * 0.22;
      }

      if (camTransitionActive) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 5.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 5.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 5.5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _lookGoal.x, 5.5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _lookGoal.y, 5.5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _lookGoal.z, 5.5, dt);
        _targetVec.copy(camera.position).sub(_camGoal);
        if (_targetVec.lengthSq() < 0.0008) {
          camTransitionActive = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('end', onControlsEnd);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      clearCurrentModel();
      if (activeShadowTex) activeShadowTex.dispose();
      activeBgTex.dispose();
      disposableAssets.geometries.forEach((g) => g.dispose());
      disposableAssets.materials.forEach((m) => m.dispose());
      disposableAssets.textures.forEach((t) => t.dispose());
      if (currentEnvTarget) {
        (currentEnvTarget as THREE.WebGLRenderTarget).dispose();
      }
      pmremGenerator.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [interactive]);

  if (webglFailed) {
    return (
      <div className={`relative flex items-center justify-center bg-[#BAC7B6] rounded-2xl overflow-hidden ${className}`}>
        {fallbackImage ? (
          <img
            src={fallbackImage}
            alt={productLabel}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="p-8 text-center">
            <p className="font-display text-2xl text-[#1C3B2B]">{productLabel}</p>
            <p className="text-sm text-[#5C6156] mt-1">{volumeLabel}</p>
          </div>
        )}
      </div>
    );
  }

  return <div ref={mountRef} className={`relative w-full h-full ${className}`} />;
}
