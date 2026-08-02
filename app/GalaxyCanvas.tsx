"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vGlow;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uEnergy;

  void main() {
    float twinkle = 0.76 + sin(uTime * 1.7 + aPhase) * 0.24;
    vColor = aColor;
    vGlow = twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float perspective = 42.0 / max(3.2, -mvPosition.z);
    gl_PointSize = aSize * uPixelRatio * perspective * twinkle * (1.0 + uEnergy * 0.32);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vGlow;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float halo = 1.0 - smoothstep(0.055, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.16, d);
    if (halo < 0.008) discard;
    vec3 color = vColor * (0.82 + vGlow * 0.4 + core * 1.35);
    gl_FragColor = vec4(color, halo * (0.62 + core * 0.38));
  }
`;

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(0.0, dot(viewDirection, vWorldNormal)), 2.35);
    gl_FragColor = vec4(uColor, fresnel * 0.72);
  }
`;

const morphVertexShader = /* glsl */ `
  attribute vec3 aTarget;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uTime;
  uniform float uMorph;
  uniform float uPixelRatio;

  void main() {
    float delay = fract(aPhase / 6.2831853) * 0.42;
    float localMorph = smoothstep(delay, min(0.98, delay + 0.46), uMorph);
    localMorph = localMorph * localMorph * (3.0 - 2.0 * localMorph);
    float idleAngle =
      uTime * (0.055 + aPhase * 0.003) * (1.0 - localMorph) +
      sin(localMorph * 3.14159265) * (2.0 + delay * 4.0);
    mat2 spin = mat2(cos(idleAngle), -sin(idleAngle), sin(idleAngle), cos(idleAngle));
    vec3 drifting = position;
    drifting.xy = spin * drifting.xy;
    drifting.z += sin(uTime * 0.7 + aPhase) * 0.12 * (1.0 - localMorph);
    vec3 transformed = mix(drifting, aTarget, localMorph);
    float energyArc = sin(localMorph * 3.14159265);
    transformed += vec3(
      sin(aPhase + uTime * 2.0),
      cos(aPhase * 1.7 + uTime),
      sin(aPhase * 2.3 - uTime * 0.8)
    ) * energyArc * 0.2;
    transformed += normalize(aTarget + vec3(0.001)) *
      sin(uTime * 2.0 + aPhase) * 0.025 * localMorph;

    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_PointSize = aSize * uPixelRatio * (40.0 / max(3.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const morphFragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float halo = 1.0 - smoothstep(0.06, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.14, d);
    if (halo < 0.008) discard;
    gl_FragColor = vec4(vColor * (0.9 + core * 1.8), halo * (0.7 + core * 0.3));
  }
`;

const portalTunnelVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const portalTunnelFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uTravel;
  varying vec2 vUv;

  float glowBand(float value, float power) {
    return pow(0.5 + 0.5 * sin(value), power);
  }

  void main() {
    float helixA = glowBand(vUv.y * 72.0 - uTime * 8.0 + vUv.x * 38.0, 7.0);
    float helixB = glowBand(vUv.y * 31.0 + uTime * 4.6 - vUv.x * 78.0, 11.0);
    float depthPulse = glowBand(vUv.y * 118.0 - uTime * 13.0, 18.0);
    float edgeFade = pow(max(0.0, sin(vUv.y * 3.14159265)), 0.32);
    float travelWave = 0.72 + 0.28 * sin(vUv.y * 10.0 - uTravel * 17.0);
    vec3 rose = vec3(1.55, 0.16, 0.58);
    vec3 violet = vec3(0.32, 0.12, 1.48);
    vec3 champagne = vec3(1.45, 0.72, 0.34);
    vec3 color = mix(violet, rose, smoothstep(0.08, 0.92, vUv.y));
    color = mix(color, champagne, depthPulse * 0.36);
    float energy = helixA * 0.72 + helixB * 1.18 + depthPulse * 0.58;
    float alpha = (0.045 + energy * 0.38) * edgeFade * travelWave * uOpen;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color * (0.34 + energy * 1.28), alpha);
  }
`;

const cinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uEnergy;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float edgeDistance = length(centered);
      float aberration = (0.00055 + uEnergy * 0.0065) * (0.25 + edgeDistance);
      vec2 offset = normalize(centered + vec2(0.0001)) * aberration;
      float red = texture2D(tDiffuse, vUv + offset).r;
      float green = texture2D(tDiffuse, vUv).g;
      float blue = texture2D(tDiffuse, vUv - offset).b;
      vec3 color = vec3(red, green, blue);
      float vignette = 1.0 - smoothstep(0.3, 0.82, edgeDistance);
      color *= mix(0.68, 1.0, vignette);
      float grain = random(vUv * uResolution + vec2(uTime * 41.0, -uTime * 17.0)) - 0.5;
      color += grain * 0.018;
      float flare = exp(-abs(vUv.y - 0.5) * 90.0) * uEnergy * 0.08;
      color += vec3(1.0, 0.38, 0.62) * flare;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

function gaussian() {
  return (
    Math.sqrt(-2 * Math.log(Math.max(0.0001, Math.random()))) *
    Math.cos(Math.PI * 2 * Math.random())
  );
}

function smoothstep(min: number, max: number, value: number) {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

function makeGlowTexture(rgb: [number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const [red, green, blue] = rgb;
  const gradient = context.createRadialGradient(96, 96, 0, 96, 96, 96);
  gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 1)`);
  gradient.addColorStop(0.12, `rgba(${red}, ${green}, ${blue}, 0.82)`);
  gradient.addColorStop(0.42, `rgba(${red}, ${green}, ${blue}, 0.2)`);
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeStreakTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, 320, 0);
  gradient.addColorStop(0, "rgba(255, 211, 232, 0)");
  gradient.addColorStop(0.68, "rgba(255, 170, 210, 0.2)");
  gradient.addColorStop(0.94, "rgba(255, 228, 185, 0.92)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 320, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePlanetTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const base = context.createLinearGradient(0, 0, 0, 320);
  base.addColorStop(0, "#3a0d58");
  base.addColorStop(0.25, "#be4f99");
  base.addColorStop(0.48, "#57206d");
  base.addColorStop(0.7, "#ee80aa");
  base.addColorStop(1, "#2a0b43");
  context.fillStyle = base;
  context.fillRect(0, 0, 640, 320);

  for (let band = 0; band < 26; band += 1) {
    const y = (band / 26) * 320 + Math.sin(band * 1.8) * 7;
    const height = 2 + Math.random() * 12;
    const alpha = 0.035 + Math.random() * 0.12;
    context.fillStyle =
      band % 3 === 0
        ? `rgba(255, 210, 225, ${alpha})`
        : `rgba(95, 32, 126, ${alpha})`;
    context.beginPath();
    context.moveTo(0, y);
    for (let x = 0; x <= 640; x += 32) {
      context.lineTo(x, y + Math.sin(x * 0.028 + band) * (3 + band * 0.05));
    }
    context.lineTo(640, y + height);
    context.lineTo(0, y + height);
    context.closePath();
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function makeAtmosphere(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}

function makeStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uEnergy: { value: 0 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function addStarAttributes(
  geometry: THREE.BufferGeometry,
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  phases: Float32Array,
) {
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
}

export default function GalaxyCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webGlFailed, setWebGlFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: false,
        powerPreference: "high-performance",
        stencil: false,
      });
    } catch {
      setWebGlFailed(true);
      return;
    }

    let renderDisabled = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020106);
    scene.fog = new THREE.FogExp2(0x030108, 0.013);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 120);
    camera.position.set(0, 0.15, 12.8);

    renderer.setClearColor(0x020106, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.76;
    renderer.transmissionResolutionScale = 0.5;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.setAttribute("role", "presentation");
    mount.appendChild(renderer.domElement);

    const device = navigator as Navigator & { deviceMemory?: number };
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const lowPower =
      (navigator.hardwareConcurrency ?? 8) <= 4 ||
      (device.deviceMemory ?? 8) <= 4;
    const useBloom = renderer.extensions.has("EXT_color_buffer_float") && !lowPower;

    let environmentTarget: THREE.WebGLRenderTarget | null = null;
    if (!lowPower) {
      const environment = new RoomEnvironment();
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      environmentTarget = pmremGenerator.fromScene(
        environment,
        0.04,
        0.1,
        100,
        { size: isMobile ? 64 : 128 },
      );
      scene.environment = environmentTarget.texture;
      environment.dispose();
      pmremGenerator.dispose();
    }

    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let renderPass: RenderPass | null = null;
    let cinematicPass: ShaderPass | null = null;
    let outputPass: OutputPass | null = null;
    if (useBloom) {
      composer = new EffectComposer(renderer);
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        isMobile ? 0.46 : 0.7,
        isMobile ? 0.28 : 0.38,
        isMobile ? 0.8 : 0.72,
      );
      composer.addPass(bloomPass);
      cinematicPass = new ShaderPass(cinematicShader);
      composer.addPass(cinematicPass);
      outputPass = new OutputPass();
      composer.addPass(outputPass);
    }

    const generatedTextures = new Set<THREE.Texture>();
    const galaxyMaterial = makeStarMaterial();
    const foregroundMaterial = makeStarMaterial();
    const galaxyRoot = new THREE.Group();
    const worldRoot = new THREE.Group();
    scene.add(galaxyRoot, worldRoot);

    const gold = new THREE.Color("#ffd9a0");
    const rose = new THREE.Color("#ff6fae");
    const blush = new THREE.Color("#ffd1e2");
    const violet = new THREE.Color("#8d70ff");
    const cyan = new THREE.Color("#90d7ff");
    const workingColor = new THREE.Color();

    // A tilted spiral galaxy with visible thickness, placed deep behind the hero objects.
    const galaxyCount = isMobile ? 4200 : 8200;
    const galaxyPositions = new Float32Array(galaxyCount * 3);
    const galaxyColors = new Float32Array(galaxyCount * 3);
    const galaxySizes = new Float32Array(galaxyCount);
    const galaxyPhases = new Float32Array(galaxyCount);

    for (let index = 0; index < galaxyCount; index += 1) {
      const radius = Math.pow(Math.random(), 0.58) * 15.5;
      const arm = index % 6;
      const angle =
        (arm / 6) * Math.PI * 2 +
        radius * 0.62 +
        gaussian() * (0.12 + radius * 0.018);
      const spread = gaussian() * (0.12 + radius * 0.026);
      const actualRadius = radius + spread;
      galaxyPositions[index * 3] = Math.cos(angle) * actualRadius;
      galaxyPositions[index * 3 + 1] =
        Math.sin(angle) * actualRadius * 0.68 + gaussian() * 0.12;
      galaxyPositions[index * 3 + 2] = gaussian() * (0.22 + radius * 0.035);

      const normalized = radius / 15.5;
      if (normalized < 0.22) {
        workingColor.copy(gold).lerp(blush, normalized / 0.22);
      } else if (normalized < 0.62) {
        workingColor.copy(rose).lerp(violet, (normalized - 0.22) / 0.4);
      } else {
        workingColor.copy(violet).lerp(cyan, (normalized - 0.62) / 0.38);
      }
      const brightness = 0.65 + Math.random() * 0.62;
      galaxyColors[index * 3] = workingColor.r * brightness;
      galaxyColors[index * 3 + 1] = workingColor.g * brightness;
      galaxyColors[index * 3 + 2] = workingColor.b * brightness;
      galaxySizes[index] = 0.52 + Math.pow(Math.random(), 4.8) * 3.4;
      galaxyPhases[index] = Math.random() * Math.PI * 2;
    }

    const galaxyGeometry = new THREE.BufferGeometry();
    addStarAttributes(
      galaxyGeometry,
      galaxyPositions,
      galaxyColors,
      galaxySizes,
      galaxyPhases,
    );
    const galaxyPoints = new THREE.Points(galaxyGeometry, galaxyMaterial);
    galaxyRoot.add(galaxyPoints);
    galaxyRoot.position.set(0, 0, -9);
    galaxyRoot.rotation.set(0.34, -0.08, -0.12);

    // Foreground stars surround the camera, creating unmistakable parallax and depth.
    const foregroundCount = isMobile ? 950 : 2100;
    const foregroundPositions = new Float32Array(foregroundCount * 3);
    const foregroundColors = new Float32Array(foregroundCount * 3);
    const foregroundSizes = new Float32Array(foregroundCount);
    const foregroundPhases = new Float32Array(foregroundCount);
    for (let index = 0; index < foregroundCount; index += 1) {
      const z = -34 + Math.random() * 44;
      const radius = 3.5 + Math.pow(Math.random(), 0.6) * 16;
      const angle = Math.random() * Math.PI * 2;
      foregroundPositions[index * 3] = Math.cos(angle) * radius;
      foregroundPositions[index * 3 + 1] = Math.sin(angle) * radius;
      foregroundPositions[index * 3 + 2] = z;
      const color = index % 9 === 0 ? gold : index % 4 === 0 ? rose : blush;
      foregroundColors[index * 3] = color.r;
      foregroundColors[index * 3 + 1] = color.g;
      foregroundColors[index * 3 + 2] = color.b;
      foregroundSizes[index] = 0.35 + Math.pow(Math.random(), 6) * 2.8;
      foregroundPhases[index] = Math.random() * Math.PI * 2;
    }
    const foregroundGeometry = new THREE.BufferGeometry();
    addStarAttributes(
      foregroundGeometry,
      foregroundPositions,
      foregroundColors,
      foregroundSizes,
      foregroundPhases,
    );
    const foregroundStars = new THREE.Points(
      foregroundGeometry,
      foregroundMaterial,
    );
    scene.add(foregroundStars);

    // Layered instanced billboards keep the nebula volume rich with only three draw calls.
    const glowDefinitions: Array<{
      rgb: [number, number, number];
      position: THREE.Vector3;
      scale: number;
    }> = [
      { rgb: [183, 74, 255], position: new THREE.Vector3(-5.4, 2.6, -8), scale: 8.5 },
      { rgb: [255, 72, 145], position: new THREE.Vector3(5.5, -1.8, -6), scale: 7.2 },
      { rgb: [255, 190, 122], position: new THREE.Vector3(0, -4.5, -10), scale: 6.4 },
    ];
    const nebulaGroups: THREE.Group[] = [];
    glowDefinitions.forEach((definition, definitionIndex) => {
      const texture = makeGlowTexture(definition.rgb);
      if (!texture) return;
      generatedTextures.add(texture);
      const group = new THREE.Group();
      group.position.copy(definition.position);
      const layerCount = isMobile ? 5 : 9;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: isMobile ? 0.035 : 0.052,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const volume = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        material,
        layerCount,
      );
      const layerDummy = new THREE.Object3D();
      for (let layer = 0; layer < layerCount; layer += 1) {
        const layerScale = definition.scale * (0.62 + Math.random() * 0.7);
        layerDummy.position.set(
          gaussian() * 1.25,
          gaussian() * 0.85,
          gaussian() * 1.25,
        );
        layerDummy.rotation.set(0, 0, Math.random() * Math.PI);
        layerDummy.scale.set(
          layerScale,
          layerScale * (0.7 + Math.random() * 0.35),
          1,
        );
        layerDummy.updateMatrix();
        volume.setMatrixAt(layer, layerDummy.matrix);
        volume.setColorAt(
          layer,
          new THREE.Color().setScalar(0.62 + Math.random() * 0.48),
        );
      }
      if (volume.instanceColor) volume.instanceColor.needsUpdate = true;
      volume.frustumCulled = false;
      group.add(volume);
      group.rotation.z = definitionIndex * 0.7;
      scene.add(group);
      nebulaGroups.push(group);
    });

    // Lighting for the 3D hero objects.
    scene.add(new THREE.AmbientLight(0x4d315d, 0.58));
    const roseLight = new THREE.PointLight(0xff4f9b, 28, 22, 1.8);
    roseLight.position.set(3.2, 2.2, 5.5);
    const goldLight = new THREE.PointLight(0xffd69b, 22, 20, 1.8);
    goldLight.position.set(-4, 3.4, 4.5);
    const violetLight = new THREE.PointLight(0x7656ff, 26, 24, 1.9);
    violetLight.position.set(0, -4.5, 3);
    const pulseLight = new THREE.PointLight(0xff9ac6, 0, 14, 1.6);
    pulseLight.position.set(0, 0, 3);
    scene.add(roseLight, goldLight, violetLight, pulseLight);

    // A luminous 3D gateway occupies the opening shot and the camera flies through it.
    const portalGroup = new THREE.Group();
    const portalRingCount = isMobile ? (lowPower ? 3 : 5) : 7;
    const portalRingGeometry = new THREE.TorusGeometry(
      1,
      0.015,
      6,
      isMobile ? 72 : 112,
    );
    const portalRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const portalRings = new THREE.InstancedMesh(
      portalRingGeometry,
      portalRingMaterial,
      portalRingCount,
    );
    const portalRingBaseZ = new Float32Array(portalRingCount);
    const portalRingRadius = new Float32Array(portalRingCount);
    const portalRingRotation = new Float32Array(portalRingCount * 3);
    const portalRingDummy = new THREE.Object3D();
    for (let index = 0; index < portalRingCount; index += 1) {
      portalRingBaseZ[index] = 6.4 - index * 1.05;
      portalRingRadius[index] = 1.05 + index * 0.27;
      portalRingRotation[index * 3] = index * 0.19;
      portalRingRotation[index * 3 + 1] = index * 0.12;
      portalRingRotation[index * 3 + 2] = index * 0.36;
      portalRingDummy.position.set(0, 0, portalRingBaseZ[index]);
      portalRingDummy.rotation.set(
        portalRingRotation[index * 3],
        portalRingRotation[index * 3 + 1],
        portalRingRotation[index * 3 + 2],
      );
      portalRingDummy.scale.setScalar(portalRingRadius[index]);
      portalRingDummy.updateMatrix();
      portalRings.setMatrixAt(index, portalRingDummy.matrix);
      portalRings.setColorAt(
        index,
        new THREE.Color(
          index % 3 === 0 ? 0xff78b3 : index % 3 === 1 ? 0x9276ff : 0xffd7a0,
        ),
      );
    }
    portalRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (portalRings.instanceColor) portalRings.instanceColor.needsUpdate = true;
    portalRings.frustumCulled = false;
    portalGroup.add(portalRings);

    const portalTunnelMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0.28 },
        uTravel: { value: 0 },
      },
      vertexShader: portalTunnelVertexShader,
      fragmentShader: portalTunnelFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const portalTunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(
        2.48,
        0.52,
        12,
        isMobile ? 32 : 52,
        isMobile ? 12 : 18,
        true,
      ),
      portalTunnelMaterial,
    );
    portalTunnel.rotation.x = Math.PI / 2;
    portalTunnel.position.z = 0.7;
    portalGroup.add(portalTunnel);
    const portalKnot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.1, 0.014, isMobile ? 88 : 140, 6, 2, 5),
      new THREE.MeshBasicMaterial({
        color: 0xffb4cf,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    portalKnot.position.z = 2.2;
    portalGroup.add(portalKnot);
    scene.add(portalGroup);

    // A real extruded, beveled and reflective heart — the main 3D object.
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -1.45);
    heartShape.bezierCurveTo(-0.38, -1.05, -1.35, -0.38, -1.35, 0.48);
    heartShape.bezierCurveTo(-1.35, 1.25, -0.43, 1.62, 0, 0.88);
    heartShape.bezierCurveTo(0.43, 1.62, 1.35, 1.25, 1.35, 0.48);
    heartShape.bezierCurveTo(1.35, -0.38, 0.38, -1.05, 0, -1.45);

    const heartGeometry = new THREE.ExtrudeGeometry(heartShape, {
      depth: 0.62,
      steps: 2,
      curveSegments: isMobile ? 32 : 52,
      bevelEnabled: true,
      bevelSegments: isMobile ? 5 : 9,
      bevelSize: 0.11,
      bevelThickness: 0.12,
    });
    heartGeometry.center();
    heartGeometry.computeVertexNormals();
    const heartMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb8174f,
      emissive: 0x2d0517,
      emissiveIntensity: 0.38,
      metalness: 0.24,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
      iridescence: 0.38,
      iridescenceIOR: 1.42,
      transmission: isMobile ? 0 : 0.08,
      thickness: 1.4,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const heart = new THREE.Mesh(heartGeometry, heartMaterial);
    heart.rotation.set(-0.08, 0.2, 0);
    heart.scale.setScalar(isMobile ? 0.98 : 1.18);

    const heartWire = new THREE.Mesh(
      heartGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffd8e8,
        wireframe: true,
        transparent: true,
        opacity: 0.034,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    heartWire.scale.copy(heart.scale).multiplyScalar(1.045);
    heartWire.rotation.copy(heart.rotation);

    const heartGroup = new THREE.Group();
    heartGroup.add(heart, heartWire);
    worldRoot.add(heartGroup);

    let heartGlow: THREE.Sprite<THREE.SpriteMaterial> | null = null;
    const heartGlowTexture = makeGlowTexture([226, 36, 101]);
    if (heartGlowTexture) {
      generatedTextures.add(heartGlowTexture);
      heartGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: heartGlowTexture,
          transparent: true,
          opacity: 0.065,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      heartGlow.position.z = -0.45;
      const glowScale = isMobile ? 4.7 : 5.25;
      heartGlow.scale.set(glowScale, glowScale, 1);
      heartGroup.add(heartGlow);
    }

    const ribbonPoints: THREE.Vector3[] = [];
    for (let index = 0; index < 96; index += 1) {
      const angle = (index / 96) * Math.PI * 2;
      ribbonPoints.push(
        new THREE.Vector3(
          Math.cos(angle) * 2.25,
          Math.sin(angle) * 1.42,
          Math.sin(angle * 2) * 0.42,
        ),
      );
    }
    const ribbonCurve = new THREE.CatmullRomCurve3(ribbonPoints, true);
    const ribbon = new THREE.Mesh(
      new THREE.TubeGeometry(ribbonCurve, isMobile ? 80 : 140, 0.018, 5, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd6aa,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    heartGroup.add(ribbon);

    const secondRibbon = ribbon.clone();
    secondRibbon.material = new THREE.MeshBasicMaterial({
      color: 0xa58aff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    secondRibbon.rotation.set(Math.PI / 2.4, 0.4, 0.7);
    secondRibbon.scale.setScalar(0.92);
    heartGroup.add(secondRibbon);

    // Five orbiting 3D crystals mirror the five interactive memories in the UI.
    const crystalGroup = new THREE.Group();
    const crystals: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>[] = [];
    for (let index = 0; index < 5; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0xffa2c4 : 0xa990ff,
        emissive: index % 2 === 0 ? 0x7f153f : 0x352075,
        emissiveIntensity: index === 0 ? 2.3 : 0.75,
        metalness: 0.42,
        roughness: 0.2,
      });
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(index === 0 ? 0.19 : 0.145, 0),
        material,
      );
      const angle = (index / 5) * Math.PI * 2;
      crystal.position.set(Math.cos(angle) * 2.75, Math.sin(angle) * 1.85, Math.sin(angle) * 0.55);
      crystal.rotation.set(angle, angle * 0.6, 0);
      crystalGroup.add(crystal);
      crystals.push(crystal);
    }
    crystalGroup.rotation.set(0.28, 0.12, 0);
    heartGroup.add(crystalGroup);

    // Thousands of GPU particles can collapse from a spiral cloud into a heart.
    const morphCount = isMobile ? 1350 : 2900;
    const morphPositions = new Float32Array(morphCount * 3);
    const morphTargets = new Float32Array(morphCount * 3);
    const morphColors = new Float32Array(morphCount * 3);
    const morphSizes = new Float32Array(morphCount);
    const morphPhases = new Float32Array(morphCount);
    for (let index = 0; index < morphCount; index += 1) {
      const radius = 0.24 + Math.pow(Math.random(), 0.58) * 5.45;
      const arm = index % 5;
      const angle =
        (arm / 5) * Math.PI * 2 + radius * 1.22 + gaussian() * 0.14;
      morphPositions[index * 3] = Math.cos(angle) * radius;
      morphPositions[index * 3 + 1] =
        Math.sin(angle) * radius * 0.68 + gaussian() * 0.08;
      morphPositions[index * 3 + 2] = gaussian() * (0.11 + radius * 0.055);

      const t = Math.random() * Math.PI * 2;
      const fill = Math.sqrt(Math.random());
      const hx = 16 * Math.pow(Math.sin(t), 3) * 0.108 * fill;
      const hy =
        (13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)) *
        0.108 *
        fill;
      morphTargets[index * 3] = hx + gaussian() * 0.035;
      morphTargets[index * 3 + 1] = hy + gaussian() * 0.035;
      morphTargets[index * 3 + 2] = gaussian() * 0.24;

      const color = index % 8 === 0 ? gold : index % 3 === 0 ? violet : rose;
      morphColors[index * 3] = color.r;
      morphColors[index * 3 + 1] = color.g;
      morphColors[index * 3 + 2] = color.b;
      morphSizes[index] = 0.55 + Math.pow(Math.random(), 4.5) * 2.5;
      morphPhases[index] = Math.random() * Math.PI * 2;
    }
    const morphGeometry = new THREE.BufferGeometry();
    morphGeometry.setAttribute("position", new THREE.BufferAttribute(morphPositions, 3));
    morphGeometry.setAttribute("aTarget", new THREE.BufferAttribute(morphTargets, 3));
    morphGeometry.setAttribute("aColor", new THREE.BufferAttribute(morphColors, 3));
    morphGeometry.setAttribute("aSize", new THREE.BufferAttribute(morphSizes, 1));
    morphGeometry.setAttribute("aPhase", new THREE.BufferAttribute(morphPhases, 1));
    const morphMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: morphVertexShader,
      fragmentShader: morphFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const morphParticles = new THREE.Points(morphGeometry, morphMaterial);
    heartGroup.add(morphParticles);

    // A gas giant with luminous rings and atmospheric Fresnel shading.
    const planetTexture = makePlanetTexture();
    if (planetTexture) generatedTextures.add(planetTexture);
    const planetGroup = new THREE.Group();
    const planetGeometry = new THREE.SphereGeometry(1.58, isMobile ? 36 : 64, isMobile ? 24 : 48);
    const planetMaterial = new THREE.MeshStandardMaterial({
      map: planetTexture,
      color: planetTexture ? 0xffffff : 0xb94f93,
      roughness: 0.66,
      metalness: 0.06,
      emissive: 0x2b092f,
      emissiveIntensity: 0.7,
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planet.rotation.z = -0.22;
    planetGroup.add(planet);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.72, isMobile ? 28 : 48, isMobile ? 20 : 36),
      makeAtmosphere(0xff7db2),
    );
    planetGroup.add(atmosphere);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc8d9,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const planetRing = new THREE.Mesh(
      new THREE.RingGeometry(1.92, 2.62, isMobile ? 72 : 144),
      ringMaterial,
    );
    planetRing.rotation.set(1.18, 0.08, -0.35);
    planetGroup.add(planetRing);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.78, isMobile ? 72 : 144),
      new THREE.MeshBasicMaterial({
        color: 0xffddaa,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    innerRing.rotation.copy(planetRing.rotation);
    planetGroup.add(innerRing);

    const moonPivot = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.23, 2),
      new THREE.MeshStandardMaterial({
        color: 0xffd6e4,
        emissive: 0x60304c,
        emissiveIntensity: 0.8,
        roughness: 0.62,
      }),
    );
    moon.position.set(2.9, 0.15, 0.3);
    moonPivot.add(moon);
    planetGroup.add(moonPivot);
    planetGroup.position.set(5.35, -1.6, -2.7);
    worldRoot.add(planetGroup);

    // A second distant world enhances scale and depth on the opposite side.
    const distantPlanet = new THREE.Group();
    const distantSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, isMobile ? 24 : 40, isMobile ? 18 : 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x6d55d8,
        emissive: 0x20115c,
        emissiveIntensity: 0.9,
        metalness: 0.32,
        roughness: 0.22,
        clearcoat: 0.8,
      }),
    );
    const distantAtmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, isMobile ? 22 : 34, isMobile ? 16 : 28),
      makeAtmosphere(0x8f7cff),
    );
    distantPlanet.add(distantSphere, distantAtmosphere);
    distantPlanet.position.set(-5.2, 2.5, -4.8);
    worldRoot.add(distantPlanet);

    // One instanced draw call creates a field of curved, light-reactive rose petals.
    const petalGeometry = new THREE.SphereGeometry(0.12, 8, 6);
    const petalPosition = petalGeometry.getAttribute("position") as THREE.BufferAttribute;
    const petalVector = new THREE.Vector3();
    for (let index = 0; index < petalPosition.count; index += 1) {
      petalVector.fromBufferAttribute(petalPosition, index);
      const normalizedY = petalVector.y / 0.12;
      petalVector.x *= 0.7 + (1 - Math.abs(normalizedY)) * 0.42;
      petalVector.y *= 1.55;
      petalVector.z *= 0.24;
      petalVector.z += (1 - normalizedY * normalizedY) * 0.042;
      petalPosition.setXYZ(index, petalVector.x, petalVector.y, petalVector.z);
    }
    petalGeometry.computeVertexNormals();
    const petalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd84f79,
      emissive: 0x2e0715,
      emissiveIntensity: 0.1,
      roughness: 0.46,
      metalness: 0.02,
      sheen: 1,
      sheenColor: new THREE.Color(0xf2a5bc),
      side: THREE.DoubleSide,
    });
    const petalCount = isMobile ? 72 : 150;
    const petals = new THREE.InstancedMesh(
      petalGeometry,
      petalMaterial,
      petalCount,
    );
    petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    petals.frustumCulled = false;
    const petalSeeds = new Float32Array(petalCount);
    const petalRadii = new Float32Array(petalCount);
    const petalHeights = new Float32Array(petalCount);
    const petalDepths = new Float32Array(petalCount);
    const petalSpeeds = new Float32Array(petalCount);
    for (let index = 0; index < petalCount; index += 1) {
      petalSeeds[index] = Math.random();
      petalRadii[index] = 2.3 + Math.random() * 6.8;
      petalHeights[index] = gaussian() * 2.6;
      petalDepths[index] = -4 + Math.random() * 10;
      petalSpeeds[index] = 0.06 + Math.random() * 0.18;
    }
    scene.add(petals);
    const petalDummy = new THREE.Object3D();

    // Cinematic shooting stars use textured 3D sprites rather than flat CSS marks.
    const streakTexture = makeStreakTexture();
    if (streakTexture) generatedTextures.add(streakTexture);
    type Comet = {
      sprite: THREE.Sprite;
      velocity: THREE.Vector3;
      life: number;
    };
    const comets: Comet[] = [];
    if (streakTexture) {
      for (let index = 0; index < (isMobile ? 2 : 4); index += 1) {
        const material = new THREE.SpriteMaterial({
          map: streakTexture,
          color: index % 2 === 0 ? 0xffd6e8 : 0xffdfad,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          rotation: -0.28,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(4.2, 0.28, 1);
        sprite.visible = false;
        scene.add(sprite);
        comets.push({ sprite, velocity: new THREE.Vector3(), life: 0 });
      }
    }

    // Bursts turn taps and CTA presses into 3D heart-shaped particle explosions.
    type Burst = {
      points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
      velocities: Float32Array;
      life: number;
    };
    const bursts: Burst[] = [];
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const projectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.2);

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion =
      document.documentElement.dataset.motion === "reduced" || motionMedia.matches;
    const pointerTarget = new THREE.Vector2();
    const pointerCurrent = new THREE.Vector2();
    let scrollTarget = 0;
    let scrollCurrent = 0;
    let journeyEnergy = 0;
    let pulseEnergy = 0;
    let currentElapsed = 0;
    let introStarted = false;
    let introStartedAt = 0;
    let introProgress = 0;
    let selectedMemory = 0;
    let crystalRotationTarget = 0;

    const cameraPath = new THREE.CatmullRomCurve3(
      isMobile
        ? [
            new THREE.Vector3(0, 0.35, 12.9),
            new THREE.Vector3(-1.5, 0.6, 10.8),
            new THREE.Vector3(2.2, -0.4, 9.2),
            new THREE.Vector3(-1.8, 0.9, 8.6),
            new THREE.Vector3(0, 0.2, 9.4),
          ]
        : [
            new THREE.Vector3(0, 0.2, 12.8),
            new THREE.Vector3(-2.6, 0.85, 10.2),
            new THREE.Vector3(3.35, -0.55, 8.5),
            new THREE.Vector3(-2.9, 1.25, 8.1),
            new THREE.Vector3(0, 0.1, 9.15),
          ],
      false,
      "catmullrom",
      0.45,
    );
    const targetPath = new THREE.CatmullRomCurve3(
      isMobile
        ? [
            new THREE.Vector3(0, 1.2, 0),
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(2.8, -0.8, -2.6),
            new THREE.Vector3(-1.8, 0.8, -2.5),
            new THREE.Vector3(0, 0, 0),
          ]
        : [
            new THREE.Vector3(1.9, 0.35, 0),
            new THREE.Vector3(0.5, 0, -1),
            new THREE.Vector3(4.1, -1.1, -2.5),
            new THREE.Vector3(-2.4, 1.2, -3.2),
            new THREE.Vector3(0, 0, 0),
          ],
      false,
      "catmullrom",
      0.42,
    );
    const currentLookTarget = targetPath.getPointAt(0);
    const portalLookTarget = new THREE.Vector3(0, 0, 2.1);
    const desiredCamera = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    const spawnBurst = (
      clientX: number,
      clientY: number,
      strength = 1,
      worldOrigin?: THREE.Vector3,
    ) => {
      if (reducedMotion) return;
      pointerNdc.set(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const origin = worldOrigin?.clone() ?? new THREE.Vector3();
      if (!worldOrigin && !raycaster.ray.intersectPlane(projectionPlane, origin)) {
        origin.copy(heartGroup.position).setZ(1.2);
      }

      const count = isMobile ? 64 : 118;
      const burstPositions = new Float32Array(count * 3);
      const burstColors = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const t = (index / count) * Math.PI * 2 + Math.random() * 0.09;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy =
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t);
        const direction = new THREE.Vector2(hx, hy).normalize();
        const speed = strength * (0.9 + Math.random() * 1.8);
        velocities[index * 3] = direction.x * speed + gaussian() * 0.13;
        velocities[index * 3 + 1] = direction.y * speed + gaussian() * 0.13;
        velocities[index * 3 + 2] = gaussian() * 0.48;
        burstPositions[index * 3] = origin.x;
        burstPositions[index * 3 + 1] = origin.y;
        burstPositions[index * 3 + 2] = origin.z;
        const color = index % 5 === 0 ? gold : index % 3 === 0 ? violet : rose;
        burstColors[index * 3] = color.r;
        burstColors[index * 3 + 1] = color.g;
        burstColors[index * 3 + 2] = color.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(burstColors, 3));
      const material = new THREE.PointsMaterial({
        size: isMobile ? 0.1 : 0.082,
        transparent: true,
        opacity: 1,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);
      bursts.push({ points, velocities, life: 1 });
      pulseEnergy = Math.max(pulseEnergy, 1.35 * strength);
    };

    const updateSize = () => {
      const width = Math.max(1, mount.clientWidth || window.innerWidth);
      const height = Math.max(1, mount.clientHeight || window.innerHeight);
      const maxRatio = isMobile ? (lowPower ? 1 : 1.1) : 1.45;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, maxRatio);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      galaxyMaterial.uniforms.uPixelRatio.value = pixelRatio;
      foregroundMaterial.uniforms.uPixelRatio.value = pixelRatio;
      morphMaterial.uniforms.uPixelRatio.value = pixelRatio;
      if (composer) {
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);
      }
      cinematicPass?.uniforms.uResolution.value.set(
        width * pixelRatio,
        height * pixelRatio,
      );
      bloomPass?.setSize(width, height);
    };

    const updateScroll = () => {
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollTarget = THREE.MathUtils.clamp(window.scrollY / available, 0, 1);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        if (!tapStart) return;
        pointerTarget.set(
          (event.clientX / window.innerWidth - 0.5) * 0.6,
          (event.clientY / window.innerHeight - 0.5) * 0.6,
        );
        return;
      }
      pointerTarget.set(
        (event.clientX / window.innerWidth - 0.5) * 2,
        (event.clientY / window.innerHeight - 0.5) * 2,
      );
    };

    const interactiveMeshes: THREE.Object3D[] = [
      heart,
      planet,
      moon,
      distantSphere,
      ...crystals,
    ];
    let tapStart: { x: number; y: number; at: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a")) return;
      tapStart = { x: event.clientX, y: event.clientY, at: performance.now() };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!tapStart) return;
      const distance = Math.hypot(
        event.clientX - tapStart.x,
        event.clientY - tapStart.y,
      );
      const duration = performance.now() - tapStart.at;
      tapStart = null;
      if (distance > 12 || duration > 460) return;

      pointerNdc.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      );
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
      spawnBurst(
        event.clientX,
        event.clientY,
        hit ? 1.2 : 0.72,
        hit?.point,
      );
      if (hit?.object === heart) {
        pulseEnergy = 2;
        journeyEnergy = Math.max(journeyEnergy, 0.45);
      }
    };

    const onPointerCancel = () => {
      tapStart = null;
    };

    const onBurstEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
      spawnBurst(
        detail?.x ?? window.innerWidth / 2,
        detail?.y ?? window.innerHeight / 2,
        1.12,
      );
    };

    const onJourneyEvent = () => {
      journeyEnergy = 1;
      pulseEnergy = 1.5;
    };

    const onIntroEvent = () => {
      introStarted = true;
      introStartedAt = currentElapsed;
      introProgress = 0;
      journeyEnergy = 1.65;
      pulseEnergy = 1.8;
    };

    const onMemoryEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ index?: number }>).detail;
      selectedMemory = THREE.MathUtils.clamp(detail?.index ?? 0, 0, 4);
      crystalRotationTarget = -selectedMemory * ((Math.PI * 2) / 5);
      crystals.forEach((crystal, index) => {
        crystal.material.emissiveIntensity = index === selectedMemory ? 2.6 : 0.65;
      });
      pulseEnergy = 1.15;
    };

    const onMotionEvent = (event: Event) => {
      reducedMotion = Boolean(
        (event as CustomEvent<{ reduced?: boolean }>).detail?.reduced,
      );
      if (reducedMotion) {
        pointerTarget.set(0, 0);
        pointerCurrent.set(0, 0);
      }
    };

    const onSystemMotionChange = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem("galaxy-motion") !== null) return;
      reducedMotion = event.matches;
      document.documentElement.dataset.motion = event.matches ? "reduced" : "full";
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      renderDisabled = true;
      setWebGlFailed(true);
    };

    window.addEventListener("resize", updateSize, { passive: true });
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerCancel, { passive: true });
    window.addEventListener("romance:burst", onBurstEvent);
    window.addEventListener("romance:intro", onIntroEvent);
    window.addEventListener("romance:journey", onJourneyEvent);
    window.addEventListener("romance:memory", onMemoryEvent);
    window.addEventListener("romance:motion", onMotionEvent);
    motionMedia.addEventListener("change", onSystemMotionChange);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    updateSize();
    updateScroll();

    const timer = new THREE.Timer();
    timer.connect(document);
    let animationFrame = 0;
    let lastShot = 0;
    let nextShotDelay = 2.8 + Math.random() * 3.5;
    let lastRenderedFrame = 0;

    const animate = (timestamp: number) => {
      animationFrame = window.requestAnimationFrame(animate);
      if (document.hidden || renderDisabled) return;
      const minimumFrameInterval = reducedMotion ? 90 : lowPower ? 32 : 0;
      if (timestamp - lastRenderedFrame < minimumFrameInterval) return;
      lastRenderedFrame = timestamp;

      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const visualElapsed = reducedMotion ? 0 : elapsed;
      currentElapsed = elapsed;
      if (introStarted) {
        introProgress = THREE.MathUtils.clamp(
          (elapsed - introStartedAt) / (reducedMotion ? 0.45 : 4.2),
          0,
          1,
        );
      }
      const introTravel = introStarted ? smoothstep(0.22, 0.78, introProgress) : 0;
      const introSettle = introStarted ? smoothstep(0.78, 1, introProgress) : 0;
      const introFlash = introStarted
        ? Math.exp(-Math.pow((introProgress - 0.69) / 0.052, 2))
        : 0;
      const introMorph = introStarted
        ? Math.sin(Math.min(1, introProgress / 0.82) * Math.PI) * 0.96
        : 0.06;
      const motionEase = reducedMotion ? 1 : 0.042;
      scrollCurrent += (scrollTarget - scrollCurrent) * motionEase;
      pointerCurrent.lerp(pointerTarget, reducedMotion ? 1 : 0.045);
      journeyEnergy *= reducedMotion ? 0 : Math.exp(-2.8 * delta);
      pulseEnergy *= reducedMotion ? 0 : Math.exp(-5.2 * delta);

      galaxyMaterial.uniforms.uTime.value = visualElapsed;
      foregroundMaterial.uniforms.uTime.value = visualElapsed;
      galaxyMaterial.uniforms.uEnergy.value = journeyEnergy;
      foregroundMaterial.uniforms.uEnergy.value = journeyEnergy;
      morphMaterial.uniforms.uTime.value = visualElapsed;
      morphMaterial.uniforms.uMorph.value = Math.max(
        introMorph,
        smoothstep(0.76, 0.98, scrollCurrent),
      );
      if (cinematicPass) {
        cinematicPass.uniforms.uTime.value = visualElapsed;
        cinematicPass.uniforms.uEnergy.value = Math.max(
          journeyEnergy,
          pulseEnergy * 0.22,
          introFlash * 1.6,
          Math.sin(introTravel * Math.PI) * 0.78,
        );
      }

      if (!reducedMotion) {
        galaxyRoot.rotation.z = -0.12 + elapsed * 0.008 + scrollCurrent * 0.48;
        galaxyRoot.rotation.y = -0.08 + pointerCurrent.x * 0.025;
        foregroundStars.rotation.z = elapsed * 0.002 + scrollCurrent * 0.12;
        foregroundStars.position.z = Math.sin(elapsed * 0.12) * 0.3;
        nebulaGroups.forEach((group, index) => {
          group.rotation.z += delta * (0.006 + index * 0.002);
        });
        heart.rotation.y = 0.2 + Math.sin(elapsed * 0.55) * 0.18;
        heart.rotation.x = -0.08 + Math.sin(elapsed * 0.38) * 0.055;
        heartWire.rotation.copy(heart.rotation);
        ribbon.rotation.z = elapsed * 0.19;
        secondRibbon.rotation.z -= delta * 0.12;
        planet.rotation.y += delta * 0.095;
        moonPivot.rotation.y += delta * 0.56;
        distantSphere.rotation.y -= delta * 0.08;
        distantPlanet.rotation.z = Math.sin(elapsed * 0.12) * 0.08;
      }

      const portalFade = introStarted
        ? 1 - smoothstep(0.7, 1, introProgress)
        : 1;
      portalGroup.visible = portalFade > 0.01;
      for (let index = 0; index < portalRingCount; index += 1) {
        const ringTravel = introTravel * (5.8 + index * 0.22);
        const ringScale = 1 + Math.sin(introTravel * Math.PI) * (0.08 + index * 0.015);
        portalRingDummy.position.set(0, 0, portalRingBaseZ[index] + ringTravel);
        portalRingDummy.rotation.set(
          portalRingRotation[index * 3] +
            (reducedMotion ? 0 : elapsed * 0.025 * (index % 2 === 0 ? 1 : -1)),
          portalRingRotation[index * 3 + 1],
          portalRingRotation[index * 3 + 2] +
            (reducedMotion
              ? 0
              : elapsed * (0.18 + index * 0.055) * (1 + introTravel * 2.8)),
        );
        portalRingDummy.scale.setScalar(portalRingRadius[index] * ringScale);
        portalRingDummy.updateMatrix();
        portalRings.setMatrixAt(index, portalRingDummy.matrix);
      }
      portalRings.instanceMatrix.needsUpdate = true;
      portalRingMaterial.opacity = 0.24 * portalFade * (1 + introFlash * 2.8);

      portalTunnel.visible = portalFade > 0.01;
      portalTunnelMaterial.uniforms.uTime.value = visualElapsed;
      portalTunnelMaterial.uniforms.uTravel.value = introTravel;
      portalTunnelMaterial.uniforms.uOpen.value =
        (introStarted ? 0.32 + smoothstep(0.02, 0.32, introProgress) * 0.86 : 0.28) *
        portalFade *
        (1 + introFlash * 1.5);
      const tunnelBreath = 1 + Math.sin(introTravel * Math.PI) * 0.14;
      portalTunnel.scale.set(tunnelBreath, 1, tunnelBreath);
      portalKnot.visible = portalFade > 0.01;
      (portalKnot.material as THREE.MeshBasicMaterial).opacity =
        0.17 * portalFade * (1 + introFlash * 2.2);
      if (!reducedMotion) {
        portalKnot.rotation.z += delta * (0.14 + introTravel * 1.8);
        portalKnot.rotation.y -= delta * (0.08 + introTravel * 1.1);
      }

      const introBlend = smoothstep(0.02, 0.3, scrollCurrent);
      const heroHeartX = isMobile ? 0 : THREE.MathUtils.lerp(2.35, 0, introBlend);
      const heroHeartY = isMobile
        ? THREE.MathUtils.lerp(1.72, 0.05, introBlend)
        : THREE.MathUtils.lerp(0.46, 0.05, introBlend);
      const introLayoutBlend = introStarted ? smoothstep(0.58, 1, introProgress) : 0;
      heartGroup.position.x = THREE.MathUtils.lerp(0, heroHeartX, introLayoutBlend);
      heartGroup.position.y = THREE.MathUtils.lerp(0.1, heroHeartY, introLayoutBlend);
      heartGroup.position.z = THREE.MathUtils.lerp(0.1, 0.75, smoothstep(0.76, 1, scrollCurrent));
      const finalScale = 1 + smoothstep(0.78, 1, scrollCurrent) * 0.12;
      const heartbeat = reducedMotion ? 1 : 1 + Math.sin(elapsed * 2.1) * 0.024;
      heartGroup.scale.setScalar(finalScale * heartbeat);
      const heartReveal = introStarted
        ? 0.12 + smoothstep(0.08, 0.38, introProgress) * 0.8
        : 0.12;
      heartMaterial.opacity = heartReveal;
      (heartWire.material as THREE.MeshBasicMaterial).opacity = 0.034 * heartReveal;
      if (heartGlow) {
        heartGlow.material.opacity =
          (0.045 + pulseEnergy * 0.012 + finalScale * 0.008) *
          (1 + introFlash * 0.7);
      }

      crystalGroup.rotation.z += (crystalRotationTarget - crystalGroup.rotation.z) * 0.055;
      crystalGroup.rotation.y = reducedMotion ? 0.12 : 0.12 + Math.sin(elapsed * 0.25) * 0.24;
      crystals.forEach((crystal, index) => {
        if (!reducedMotion) {
          crystal.rotation.x += delta * (0.4 + index * 0.06);
          crystal.rotation.y += delta * (0.55 + index * 0.04);
        }
        const selectedScale = index === selectedMemory ? 1.42 : 1;
        const nextScale = crystal.scale.x + (selectedScale - crystal.scale.x) * 0.08;
        crystal.scale.setScalar(nextScale);
      });

      const finalPetalFocus = smoothstep(0.72, 1, scrollCurrent);
      const introPetalInfluence = introStarted
        ? 1 - smoothstep(0.78, 1, introProgress)
        : 0;
      for (let index = 0; index < petalCount; index += 1) {
        const seed = petalSeeds[index];
        const angle =
          seed * Math.PI * 2 +
          visualElapsed * petalSpeeds[index] +
          scrollCurrent * (2.5 + seed * 4.2);
        const idleRadius = THREE.MathUtils.lerp(
          petalRadii[index],
          1.8 + seed * 2.2,
          finalPetalFocus,
        );
        const idleX = heartGroup.position.x + Math.cos(angle) * idleRadius;
        const idleY =
          heartGroup.position.y +
          petalHeights[index] +
          Math.sin(angle * 1.7 + visualElapsed * 0.16) * 0.8;
        const idleZ =
          petalDepths[index] +
          Math.sin(angle * 0.8 + seed * 8) * (0.5 + finalPetalFocus * 0.4);

        const t = introTravel;
        const inverse = 1 - t;
        const controlX = Math.sin(seed * 19) * 3.8;
        const controlY = Math.cos(seed * 13) * 3.2;
        const controlZ = 3.2 + seed * 2.4;
        const portalX = 0;
        const portalY = 0;
        const portalZ = 7.2;
        const curveX =
          inverse * inverse * idleX +
          2 * inverse * t * controlX +
          t * t * portalX;
        const curveY =
          inverse * inverse * idleY +
          2 * inverse * t * controlY +
          t * t * portalY;
        const curveZ =
          inverse * inverse * idleZ +
          2 * inverse * t * controlZ +
          t * t * portalZ;

        petalDummy.position.set(
          THREE.MathUtils.lerp(idleX, curveX, introPetalInfluence),
          THREE.MathUtils.lerp(idleY, curveY, introPetalInfluence),
          THREE.MathUtils.lerp(idleZ, curveZ, introPetalInfluence),
        );
        petalDummy.rotation.set(
          visualElapsed * (0.35 + seed * 1.2) + seed * 8,
          visualElapsed * (0.5 + seed) - angle,
          angle * 0.7,
        );
        const baseScale = (0.48 + seed * 0.9) * (1 + finalPetalFocus * 0.28);
        const introScale = introStarted
          ? THREE.MathUtils.lerp(1, 1.8, Math.sin(introTravel * Math.PI))
          : 1;
        petalDummy.scale.setScalar(baseScale * introScale);
        petalDummy.updateMatrix();
        petals.setMatrixAt(index, petalDummy.matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
      petalMaterial.emissiveIntensity =
        0.1 + introFlash * 0.72 + finalPetalFocus * 0.14;

      planetGroup.rotation.z = Math.sin(visualElapsed * 0.13) * 0.025;
      pulseLight.intensity = pulseEnergy * 32;
      heartMaterial.emissiveIntensity =
        0.38 + pulseEnergy * 0.46 + introFlash * 0.58;
      const readingDim = Math.sin(scrollCurrent * Math.PI);
      renderer.toneMappingExposure =
        0.76 - readingDim * 0.12 + introFlash * 0.16;
      if (bloomPass) {
        bloomPass.strength = Math.max(
          0.26,
          (isMobile ? 0.46 : 0.7) -
            readingDim * 0.12 +
            pulseEnergy * 0.1 +
            journeyEnergy * 0.16 +
            introFlash * 0.62 +
            Math.sin(introTravel * Math.PI) * 0.16,
        );
      }

      cameraPath.getPointAt(scrollCurrent, desiredCamera);
      targetPath.getPointAt(scrollCurrent, desiredTarget);
      if (!introStarted) {
        desiredTarget.copy(portalLookTarget);
      } else if (introProgress < 1) {
        desiredTarget.lerpVectors(
          portalLookTarget,
          desiredTarget,
          smoothstep(0.7, 1, introProgress),
        );
      }
      desiredCamera.x += pointerCurrent.x * (isMobile ? 0.18 : 0.52);
      desiredCamera.y -= pointerCurrent.y * (isMobile ? 0.12 : 0.34);
      const introFlight = introTravel * (1 - introSettle);
      desiredCamera.x += Math.sin(introTravel * Math.PI) * (isMobile ? -0.35 : -0.72);
      desiredCamera.y += Math.sin(introTravel * Math.PI * 2) * 0.2;
      desiredCamera.z -= journeyEnergy * 1.45 + introFlight * (isMobile ? 12.4 : 13.2);
      camera.position.lerp(desiredCamera, reducedMotion ? 1 : 0.055);
      currentLookTarget.lerp(desiredTarget, reducedMotion ? 1 : 0.06);
      const introFov = Math.sin(introTravel * Math.PI) * (isMobile ? 17 : 24);
      camera.fov +=
        (50 + journeyEnergy * 10 + introFov + introFlash * 6 - camera.fov) * 0.08;
      camera.updateProjectionMatrix();
      camera.lookAt(currentLookTarget);

      if (!reducedMotion && elapsed - lastShot > nextShotDelay) {
        const comet = comets.find((candidate) => candidate.life <= 0);
        if (comet) {
          comet.life = 1;
          comet.sprite.visible = true;
          (comet.sprite.material as THREE.SpriteMaterial).opacity = 0.95;
          comet.sprite.position.set(
            5 + Math.random() * 7,
            2 + Math.random() * 6,
            -2 + Math.random() * 7,
          );
          comet.velocity.set(-7.5 - Math.random() * 3.5, -2.1 - Math.random(), -0.2);
        }
        lastShot = elapsed;
        nextShotDelay = 3.2 + Math.random() * 5.2;
      }

      comets.forEach((comet) => {
        if (comet.life <= 0) return;
        comet.life -= delta * 0.62;
        comet.sprite.position.addScaledVector(comet.velocity, delta);
        (comet.sprite.material as THREE.SpriteMaterial).opacity = Math.max(
          0,
          Math.sin(comet.life * Math.PI),
        );
        if (comet.life <= 0) comet.sprite.visible = false;
      });

      for (let burstIndex = bursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
        const burst = bursts[burstIndex];
        burst.life -= delta * 0.66;
        const attribute = burst.points.geometry.getAttribute("position") as THREE.BufferAttribute;
        const array = attribute.array as Float32Array;
        for (let index = 0; index < array.length / 3; index += 1) {
          array[index * 3] += burst.velocities[index * 3] * delta;
          array[index * 3 + 1] += burst.velocities[index * 3 + 1] * delta;
          array[index * 3 + 2] += burst.velocities[index * 3 + 2] * delta;
          burst.velocities[index * 3] *= 0.982;
          burst.velocities[index * 3 + 1] *= 0.982;
          burst.velocities[index * 3 + 2] *= 0.985;
        }
        attribute.needsUpdate = true;
        burst.points.material.opacity = Math.max(0, burst.life);
        if (burst.life <= 0) {
          scene.remove(burst.points);
          burst.points.geometry.dispose();
          burst.points.material.dispose();
          bursts.splice(burstIndex, 1);
        }
      }

      if (composer) composer.render();
      else renderer.render(scene, camera);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("romance:burst", onBurstEvent);
      window.removeEventListener("romance:intro", onIntroEvent);
      window.removeEventListener("romance:journey", onJourneyEvent);
      window.removeEventListener("romance:memory", onMemoryEvent);
      window.removeEventListener("romance:motion", onMotionEvent);
      motionMedia.removeEventListener("change", onSystemMotionChange);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);

      bursts.forEach((burst) => {
        burst.points.geometry.dispose();
        burst.points.material.dispose();
      });
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
      generatedTextures.forEach((texture) => texture.dispose());
      environmentTarget?.dispose();
      bloomPass?.dispose();
      renderPass?.dispose();
      cinematicPass?.dispose();
      outputPass?.dispose();
      composer?.dispose();
      timer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="three-canvas" ref={mountRef} aria-hidden="true">
      {webGlFailed ? <div className="galaxy-fallback" /> : null}
    </div>
  );
}
