import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { AIAvatarState } from '../../types/store';

interface BeautyAvatar3DProps {
  state?: AIAvatarState;
  variant?: 'circular' | 'showcase';
  className?: string;
}

const _dummy = new THREE.Object3D();

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

export function BeautyAvatar3D({ state = 'idle', variant = 'showcase', className = '' }: BeautyAvatar3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const stateRef = useRef<AIAvatarState>(state);
  stateRef.current = state;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSoftwareGl = detectSoftwareWebGL();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    const width = container.clientWidth || (variant === 'circular' ? 88 : 260);
    const height = container.clientHeight || (variant === 'circular' ? 88 : 260);
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

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(variant === 'circular' ? 32 : 34, width / height, 0.1, 30);
    camera.position.set(0, variant === 'circular' ? 0.56 : 0.42, variant === 'circular' ? 2.25 : 2.65);
    camera.lookAt(0, variant === 'circular' ? 0.5 : 0.34, 0);

    const hemiLight = new THREE.HemisphereLight(0xfff9ee, 0x4a5d3f, 1.15);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyLight.position.set(2.2, 3.2, 3.0);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc5a059, 1.35);
    rimLight.position.set(-2.4, 2.0, -2.0);
    scene.add(rimLight);

    const disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] } = {
      geometries: [],
      materials: [],
    };
    const regGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposables.geometries.push(g);
      return g;
    };
    const regMat = <T extends THREE.Material>(m: T): T => {
      disposables.materials.push(m);
      return m;
    };

    // Sculpted Materials (Porcelain, Espresso Hair, Cream Coat, Sage Silk, Champagne Gold)
    const skinMat = regMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf4d8c4,
        roughness: 0.42,
        metalness: 0.02,
        clearcoat: 0.25,
        clearcoatRoughness: 0.6,
      }),
    );
    const blushMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8aaa5,
        roughness: 0.68,
        transparent: true,
        opacity: 0.44,
      }),
    );
    const hairMat = regMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x40332e,
        roughness: 0.34,
        metalness: 0.08,
        clearcoat: 0.45,
        clearcoatRoughness: 0.35,
      }),
    );
    const coatMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0xfaf7f2,
        roughness: 0.58,
        metalness: 0.03,
      }),
    );
    const sageSilkMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0x6b5349,
        roughness: 0.46,
        metalness: 0.08,
      }),
    );
    const goldMat = regMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xd6bd9b,
        metalness: 0.9,
        roughness: 0.2,
      }),
    );
    const eyeMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0x261d19,
        roughness: 0.12,
        metalness: 0.1,
      }),
    );
    const lipMat = regMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xc4807b,
        roughness: 0.32,
        clearcoat: 0.6,
      }),
    );
    const haloMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0xd6bd9b,
        emissive: 0xd6bd9b,
        emissiveIntensity: 0.5,
        metalness: 0.78,
        roughness: 0.22,
      }),
    );
    const auraRingMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8aaa5,
        emissive: 0xd8aaa5,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.55,
        roughness: 0.25,
      }),
    );

    const consultantRoot = new THREE.Group();
    scene.add(consultantRoot);

    // 1. Torso & Luxury Atelier Coat
    const torsoGroup = new THREE.Group();
    const chestMesh = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.24, 0.34, 0.62, 32)), coatMat);
    chestMesh.position.y = -0.18;
    const shouldersMesh = new THREE.Mesh(regGeo(new THREE.CapsuleGeometry(0.14, 0.44, 12, 24)), coatMat);
    shouldersMesh.rotation.z = Math.PI / 2;
    shouldersMesh.position.y = 0.05;
    const innerTopMesh = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.16, 0.21, 0.42, 24)), sageSilkMat);
    innerTopMesh.position.set(0, -0.05, 0.06);
    const pinMesh = new THREE.Mesh(regGeo(new THREE.OctahedronGeometry(0.036, 0)), goldMat);
    pinMesh.position.set(-0.14, 0.02, 0.22);
    const collarLeft = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.08, 0.24, 0.03)), coatMat);
    collarLeft.position.set(-0.11, 0.04, 0.19);
    collarLeft.rotation.z = -0.32;
    const collarRight = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.08, 0.24, 0.03)), coatMat);
    collarRight.position.set(0.11, 0.04, 0.19);
    collarRight.rotation.z = 0.32;

    torsoGroup.add(chestMesh, shouldersMesh, innerTopMesh, pinMesh, collarLeft, collarRight);
    consultantRoot.add(torsoGroup);

    // 2. Neck
    const neckMesh = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.075, 0.09, 0.2, 24)), skinMat);
    neckMesh.position.y = 0.22;
    consultantRoot.add(neckMesh);

    // 3. Expressive Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.52, 0);
    consultantRoot.add(headGroup);

    const headGeo = regGeo(new THREE.SphereGeometry(0.26, 36, 32));
    headGeo.scale(0.92, 1.06, 0.96);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headGroup.add(headMesh);

    // Rosy subtle cheek highlights
    const cheekGeo = regGeo(new THREE.SphereGeometry(0.052, 16, 16));
    cheekGeo.scale(1.1, 0.7, 0.4);
    const cheekL = new THREE.Mesh(cheekGeo, blushMat);
    cheekL.position.set(-0.125, -0.03, 0.21);
    const cheekR = new THREE.Mesh(cheekGeo, blushMat);
    cheekR.position.set(0.125, -0.03, 0.21);
    headGroup.add(cheekL, cheekR);

    // Eyes & Eyebrows
    const eyeGeo = regGeo(new THREE.SphereGeometry(0.028, 16, 16));
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.085, 0.032, 0.225);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.085, 0.032, 0.225);
    const glintGeo = regGeo(new THREE.SphereGeometry(0.009, 10, 10));
    const glintMat = regMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const glintL = new THREE.Mesh(glintGeo, glintMat);
    glintL.position.set(-0.078, 0.042, 0.25);
    const glintR = new THREE.Mesh(glintGeo, glintMat);
    glintR.position.set(0.092, 0.042, 0.25);

    const browGeo = regGeo(new THREE.TorusGeometry(0.045, 0.007, 8, 18, Math.PI * 0.68));
    const browL = new THREE.Mesh(browGeo, hairMat);
    browL.position.set(-0.085, 0.068, 0.225);
    browL.rotation.z = 0.42;
    const browR = new THREE.Mesh(browGeo, hairMat);
    browR.position.set(0.085, 0.068, 0.225);
    browR.rotation.z = 0.46;

    // Animated Lip / Smile Accent
    const lipGeo = regGeo(new THREE.CapsuleGeometry(0.015, 0.042, 8, 16));
    lipGeo.rotateZ(Math.PI / 2);
    const lipMesh = new THREE.Mesh(lipGeo, lipMat);
    lipMesh.position.set(0, -0.095, 0.232);

    // Gold Pearl Drop Earrings
    const earDropGeo = regGeo(new THREE.SphereGeometry(0.026, 16, 16));
    const earL = new THREE.Mesh(earDropGeo, goldMat);
    earL.position.set(-0.245, -0.04, 0.02);
    const earR = new THREE.Mesh(earDropGeo, goldMat);
    earR.position.set(0.245, -0.04, 0.02);

    // Sculpted Hair Waves & Crown Bun
    const hairCrownGeo = regGeo(new THREE.SphereGeometry(0.28, 32, 28, 0, Math.PI * 2, 0, Math.PI * 0.62));
    hairCrownGeo.scale(0.95, 1.04, 1.0);
    const hairCrown = new THREE.Mesh(hairCrownGeo, hairMat);
    hairCrown.position.set(0, 0.03, -0.02);
    hairCrown.rotation.x = -0.25;

    const hairBackGeo = regGeo(new THREE.CapsuleGeometry(0.21, 0.34, 14, 24));
    const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
    hairBack.position.set(0, -0.08, -0.14);

    const hairBunGeo = regGeo(new THREE.SphereGeometry(0.12, 24, 20));
    const hairBun = new THREE.Mesh(hairBunGeo, hairMat);
    hairBun.position.set(0, 0.23, -0.18);

    const hairPinGeo = regGeo(new THREE.TorusGeometry(0.125, 0.01, 10, 32));
    const hairPin = new THREE.Mesh(hairPinGeo, goldMat);
    hairPin.position.set(0, 0.23, -0.18);
    hairPin.rotation.x = Math.PI / 2.4;

    // Swept Front Fringe Waves
    const fringeGeo = regGeo(new THREE.CapsuleGeometry(0.065, 0.18, 10, 18));
    const fringeL = new THREE.Mesh(fringeGeo, hairMat);
    fringeL.position.set(-0.18, 0.1, 0.14);
    fringeL.rotation.z = 0.55;
    fringeL.rotation.y = 0.4;
    const fringeR = new THREE.Mesh(fringeGeo, hairMat);
    fringeR.position.set(0.18, 0.1, 0.14);
    fringeR.rotation.z = -0.55;
    fringeR.rotation.y = -0.4;

    headGroup.add(
      eyeL,
      eyeR,
      glintL,
      glintR,
      browL,
      browR,
      lipMesh,
      earL,
      earR,
      hairCrown,
      hairBack,
      hairBun,
      hairPin,
      fringeL,
      fringeR,
    );

    // 4. Glowing Orbital Halo & Botanical Energy Rings
    const haloRing = new THREE.Mesh(regGeo(new THREE.TorusGeometry(0.68, 0.016, 16, 72)), haloMat);
    haloRing.position.set(0, 0.45, -0.22);
    scene.add(haloRing);

    const outerAura = new THREE.Mesh(regGeo(new THREE.TorusGeometry(0.76, 0.008, 12, 72)), auraRingMat);
    outerAura.position.set(0, 0.45, -0.24);
    scene.add(outerAura);

    // 5. Floating Golden Botanical Motes (InstancedMesh)
    const moteCount = 16;
    const moteGeo = regGeo(new THREE.SphereGeometry(0.02, 12, 12));
    const moteMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6c882,
        emissive: 0xc5a059,
        emissiveIntensity: 0.7,
        roughness: 0.15,
      }),
    );
    const motes = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
    motes.frustumCulled = false;
    const seeds = Array.from({ length: moteCount }, (_, i) => ({
      angle: (i / moteCount) * Math.PI * 2,
      radius: 0.62 + (i % 3) * 0.14,
      yOffset: (i % 5) * 0.18 - 0.1,
      speed: 0.6 + (i % 4) * 0.16,
      scale: 0.6 + (i % 3) * 0.25,
    }));
    scene.add(motes);

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
            frameId = window.setTimeout(cb, 85);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 85);
      }
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.getElapsedTime();
      const mode = stateRef.current;

      // Expressive Character Animation by State
      let targetHeadY = Math.sin(t * 0.9) * 0.08;
      let targetHeadX = Math.sin(t * 1.4) * 0.03;
      let targetHeadZ = Math.cos(t * 0.7) * 0.03;
      let targetLipScaleY = 1.0;
      let targetHaloEmissive = 0.55;
      let haloColorHex = 0xc5a059;
      let moteSpeedMul = 0.65;

      if (mode === 'listening') {
        targetHeadX = 0.06;
        targetHeadZ = 0.11;
        targetHeadY = Math.sin(t * 1.6) * 0.06;
        haloColorHex = 0x6c8d58;
        targetHaloEmissive = 1.05 + Math.sin(t * 5) * 0.35;
        moteSpeedMul = 1.2;
      } else if (mode === 'thinking') {
        targetHeadX = -0.09;
        targetHeadY = Math.sin(t * 2.1) * 0.22;
        targetHeadZ = -0.06;
        haloColorHex = 0xdcb96d;
        targetHaloEmissive = 1.2;
        moteSpeedMul = 2.1;
      } else if (mode === 'speaking') {
        targetHeadX = Math.sin(t * 4.2) * 0.05;
        targetHeadY = Math.sin(t * 2.5) * 0.12;
        targetLipScaleY = 1.0 + Math.abs(Math.sin(t * 13)) * 1.65;
        haloColorHex = 0xe4c279;
        targetHaloEmissive = 1.15 + Math.sin(t * 7) * 0.3;
        moteSpeedMul = 1.5;
      }

      if (!prefersReduced) {
        consultantRoot.position.y = Math.sin(t * 1.6) * 0.025;
        headGroup.rotation.y = THREE.MathUtils.damp(headGroup.rotation.y, targetHeadY, 6, dt);
        headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, targetHeadX, 6, dt);
        headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetHeadZ, 6, dt);
        lipMesh.scale.y = THREE.MathUtils.damp(lipMesh.scale.y, targetLipScaleY, 14, dt);

        haloRing.rotation.z += dt * (mode === 'thinking' ? 1.4 : 0.3);
        outerAura.rotation.z -= dt * (mode === 'thinking' ? 1.0 : 0.22);
        outerAura.rotation.y = Math.sin(t * (mode === 'thinking' ? 2.4 : 0.8)) * 0.24;
      }

      haloMat.emissive.setHex(haloColorHex);
      haloMat.emissiveIntensity = THREE.MathUtils.damp(haloMat.emissiveIntensity, targetHaloEmissive, 8, dt);

      for (let i = 0; i < moteCount; i++) {
        const s = seeds[i];
        const phase = prefersReduced ? 0 : t * s.speed * moteSpeedMul;
        _dummy.position.set(
          Math.cos(s.angle + phase * 0.5) * s.radius,
          0.36 + s.yOffset + Math.sin(phase + i) * 0.08,
          Math.sin(s.angle + phase * 0.5) * s.radius * 0.45 - 0.1,
        );
        _dummy.scale.setScalar(s.scale);
        _dummy.updateMatrix();
        motes.setMatrixAt(i, _dummy.matrix);
      }
      motes.instanceMatrix.needsUpdate = true;

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
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposables.geometries.forEach((g) => g.dispose());
      disposables.materials.forEach((m) => m.dispose());
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [variant]);

  if (webglFailed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-gradient-to-br from-[#4A5D3F] via-[#3A4A31] to-[#C5A059] text-[#FAF6EE] font-display font-semibold ${className}`}
      >
        AB
      </div>
    );
  }

  return <div ref={mountRef} className={`relative w-full h-full ${className}`} aria-hidden="true" />;
}
