"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vGlow;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uEnergy;

  void main() {
    float twinkle = 0.76 + sin(uTime * 1.7 + aPhase) * 0.24;
    vColor = color;
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
    vertexColors: true,
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
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
    scene.background = new THREE.Color(0x03020a);
    scene.fog = new THREE.FogExp2(0x05030d, 0.012);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 120);
    camera.position.set(0, 0.15, 12.8);

    renderer.setClearColor(0x03020a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.setAttribute("role", "presentation");
    mount.appendChild(renderer.domElement);

    const device = navigator as Navigator & { deviceMemory?: number };
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const lowPower =
      (navigator.hardwareConcurrency ?? 8) <= 4 ||
      (device.deviceMemory ?? 8) <= 4;
    const useBloom =
      renderer.extensions.has("EXT_color_buffer_float") && (!lowPower || !isMobile);

    let environmentTarget: THREE.WebGLRenderTarget | null = null;
    if (!lowPower) {
      const environment = new RoomEnvironment();
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      environmentTarget = pmremGenerator.fromScene(environment, 0.04);
      scene.environment = environmentTarget.texture;
      environment.dispose();
      pmremGenerator.dispose();
    }

    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let renderPass: RenderPass | null = null;
    let outputPass: OutputPass | null = null;
    if (useBloom) {
      composer = new EffectComposer(renderer);
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        isMobile ? 0.72 : 1.05,
        isMobile ? 0.38 : 0.52,
        isMobile ? 0.62 : 0.48,
      );
      composer.addPass(bloomPass);
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

    // Layered sprite volumes make the nebulae feel suspended in 3D space.
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
      for (let layer = 0; layer < (isMobile ? 5 : 9); layer += 1) {
        const material = new THREE.SpriteMaterial({
          map: texture,
          color: 0xffffff,
          transparent: true,
          opacity: 0.07 + Math.random() * 0.085,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          rotation: Math.random() * Math.PI,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(
          gaussian() * 1.25,
          gaussian() * 0.85,
          gaussian() * 1.25,
        );
        const layerScale = definition.scale * (0.62 + Math.random() * 0.7);
        sprite.scale.set(layerScale, layerScale * (0.7 + Math.random() * 0.35), 1);
        group.add(sprite);
      }
      group.rotation.z = definitionIndex * 0.7;
      scene.add(group);
      nebulaGroups.push(group);
    });

    // Lighting for the 3D hero objects.
    scene.add(new THREE.AmbientLight(0x5b3d76, 1.05));
    const roseLight = new THREE.PointLight(0xff4f9b, 58, 22, 1.8);
    roseLight.position.set(3.2, 2.2, 5.5);
    const goldLight = new THREE.PointLight(0xffd69b, 46, 20, 1.8);
    goldLight.position.set(-4, 3.4, 4.5);
    const violetLight = new THREE.PointLight(0x7656ff, 52, 24, 1.9);
    violetLight.position.set(0, -4.5, 3);
    const pulseLight = new THREE.PointLight(0xff9ac6, 0, 14, 1.6);
    pulseLight.position.set(0, 0, 3);
    scene.add(roseLight, goldLight, violetLight, pulseLight);

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
      color: 0xff4f93,
      emissive: 0x7d123e,
      emissiveIntensity: 1.45,
      metalness: 0.18,
      roughness: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.62,
      iridescenceIOR: 1.42,
      transmission: isMobile ? 0 : 0.18,
      thickness: 1.4,
    });
    const heart = new THREE.Mesh(heartGeometry, heartMaterial);
    heart.rotation.set(-0.08, 0.2, 0);
    heart.scale.setScalar(isMobile ? 1.15 : 1.3);

    const heartWire = new THREE.Mesh(
      heartGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffd8e8,
        wireframe: true,
        transparent: true,
        opacity: 0.095,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    heartWire.scale.copy(heart.scale).multiplyScalar(1.045);
    heartWire.rotation.copy(heart.rotation);

    const heartGroup = new THREE.Group();
    heartGroup.add(heart, heartWire);
    worldRoot.add(heartGroup);

    const heartGlowTexture = makeGlowTexture([255, 75, 145]);
    if (heartGlowTexture) {
      generatedTextures.add(heartGlowTexture);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: heartGlowTexture,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.position.z = -0.45;
      glow.scale.set(6.8, 6.8, 1);
      heartGroup.add(glow);
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
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    heartGroup.add(ribbon);

    const secondRibbon = ribbon.clone();
    secondRibbon.material = new THREE.MeshBasicMaterial({
      color: 0xa58aff,
      transparent: true,
      opacity: 0.42,
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
    const desiredCamera = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    const spawnBurst = (clientX: number, clientY: number, strength = 1) => {
      if (reducedMotion) return;
      pointerNdc.set(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const origin = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(projectionPlane, origin)) {
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
      if (composer) {
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);
      }
      bloomPass?.setSize(width, height);
    };

    const updateScroll = () => {
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollTarget = THREE.MathUtils.clamp(window.scrollY / available, 0, 1);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerTarget.set(
        (event.clientX / window.innerWidth - 0.5) * 2,
        (event.clientY / window.innerHeight - 0.5) * 2,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a")) return;
      spawnBurst(event.clientX, event.clientY, 0.8);
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
    window.addEventListener("romance:burst", onBurstEvent);
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
    let lastReducedRender = 0;

    const animate = (timestamp: number) => {
      animationFrame = window.requestAnimationFrame(animate);
      if (document.hidden || renderDisabled) return;
      if (reducedMotion && timestamp - lastReducedRender < 90) return;
      lastReducedRender = timestamp;

      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const motionEase = reducedMotion ? 1 : 0.042;
      scrollCurrent += (scrollTarget - scrollCurrent) * motionEase;
      pointerCurrent.lerp(pointerTarget, reducedMotion ? 1 : 0.045);
      journeyEnergy *= reducedMotion ? 0 : 0.955;
      pulseEnergy *= reducedMotion ? 0 : 0.92;

      galaxyMaterial.uniforms.uTime.value = elapsed;
      foregroundMaterial.uniforms.uTime.value = elapsed;
      galaxyMaterial.uniforms.uEnergy.value = journeyEnergy;
      foregroundMaterial.uniforms.uEnergy.value = journeyEnergy;

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

      const introBlend = smoothstep(0.02, 0.3, scrollCurrent);
      heartGroup.position.x = isMobile ? 0 : THREE.MathUtils.lerp(2.35, 0, introBlend);
      heartGroup.position.y = isMobile
        ? THREE.MathUtils.lerp(1.72, 0.05, introBlend)
        : THREE.MathUtils.lerp(0.46, 0.05, introBlend);
      heartGroup.position.z = THREE.MathUtils.lerp(0.1, 0.75, smoothstep(0.76, 1, scrollCurrent));
      const finalScale = 1 + smoothstep(0.78, 1, scrollCurrent) * 0.18;
      const heartbeat = reducedMotion ? 1 : 1 + Math.sin(elapsed * 2.1) * 0.024;
      heartGroup.scale.setScalar(finalScale * heartbeat);

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

      planetGroup.rotation.z = Math.sin(elapsed * 0.13) * 0.025;
      pulseLight.intensity = pulseEnergy * 72;
      heartMaterial.emissiveIntensity = 1.45 + pulseEnergy * 1.4;
      if (bloomPass) {
        bloomPass.strength = (isMobile ? 0.72 : 1.12) + pulseEnergy * 0.22 + journeyEnergy * 0.28;
      }

      cameraPath.getPointAt(scrollCurrent, desiredCamera);
      targetPath.getPointAt(scrollCurrent, desiredTarget);
      desiredCamera.x += pointerCurrent.x * (isMobile ? 0.18 : 0.52);
      desiredCamera.y -= pointerCurrent.y * (isMobile ? 0.12 : 0.34);
      desiredCamera.z -= journeyEnergy * 1.45;
      camera.position.lerp(desiredCamera, reducedMotion ? 1 : 0.055);
      currentLookTarget.lerp(desiredTarget, reducedMotion ? 1 : 0.06);
      camera.fov += (50 + journeyEnergy * 10 - camera.fov) * 0.08;
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
      window.removeEventListener("romance:burst", onBurstEvent);
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
