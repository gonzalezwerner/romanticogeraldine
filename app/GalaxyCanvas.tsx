"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (34.0 / max(3.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    float halo = smoothstep(0.5, 0.08, distanceToCenter);
    float core = smoothstep(0.17, 0.0, distanceToCenter);
    if (halo < 0.01) discard;
    gl_FragColor = vec4(vColor * (1.0 + core * 0.75), halo * 0.92);
  }
`;

function gaussian() {
  return (
    Math.sqrt(-2 * Math.log(Math.max(0.0001, Math.random()))) *
    Math.cos(Math.PI * 2 * Math.random())
  );
}

function makeGlowTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.18, `${color}99`);
  gradient.addColorStop(0.5, `${color}28`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
      });
    } catch {
      setWebGlFailed(true);
      return;
    }

    renderer.setClearColor(0x080611, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.setAttribute("role", "presentation");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    let renderDisabled = false;
    const camera = new THREE.PerspectiveCamera(51, 1, 0.1, 100);
    camera.position.set(0, 0, 13.4);

    const galaxyGroup = new THREE.Group();
    galaxyGroup.rotation.x = -0.08;
    scene.add(galaxyGroup);

    const isCompact =
      window.innerWidth < 780 ||
      (navigator.hardwareConcurrency !== undefined &&
        navigator.hardwareConcurrency <= 4);
    const particleCount = isCompact ? 2300 : 5200;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const coreColor = new THREE.Color("#ffdca5");
    const roseColor = new THREE.Color("#ff82b6");
    const violetColor = new THREE.Color("#8868ff");
    const workingColor = new THREE.Color();

    for (let index = 0; index < particleCount; index += 1) {
      const radius = Math.pow(Math.random(), 0.62) * 10.5;
      const arm = index % 5;
      const armAngle = (arm / 5) * Math.PI * 2;
      const swirl = radius * 0.73;
      const scatter = gaussian() * (0.14 + radius * 0.035);
      const angle = armAngle + swirl + scatter;
      const radialScatter = gaussian() * (0.08 + radius * 0.022);
      const actualRadius = radius + radialScatter;

      positions[index * 3] = Math.cos(angle) * actualRadius;
      positions[index * 3 + 1] = Math.sin(angle) * actualRadius * 0.72;
      positions[index * 3 + 2] = gaussian() * (0.08 + radius * 0.025);

      const normalizedRadius = radius / 10.5;
      if (normalizedRadius < 0.32) {
        workingColor.copy(coreColor).lerp(roseColor, normalizedRadius / 0.32);
      } else {
        workingColor
          .copy(roseColor)
          .lerp(violetColor, (normalizedRadius - 0.32) / 0.68);
      }
      const brightness = 0.72 + Math.random() * 0.4;
      colors[index * 3] = workingColor.r * brightness;
      colors[index * 3 + 1] = workingColor.g * brightness;
      colors[index * 3 + 2] = workingColor.b * brightness;
      sizes[index] = 0.65 + Math.pow(Math.random(), 4) * 2.8;
    }

    const galaxyGeometry = new THREE.BufferGeometry();
    galaxyGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    galaxyGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    galaxyGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const pointMaterial = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const galaxy = new THREE.Points(galaxyGeometry, pointMaterial);
    galaxyGroup.add(galaxy);

    const backgroundCount = isCompact ? 500 : 1100;
    const backgroundPositions = new Float32Array(backgroundCount * 3);
    for (let index = 0; index < backgroundCount; index += 1) {
      const radius = 19 + Math.random() * 38;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      backgroundPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      backgroundPositions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      backgroundPositions[index * 3 + 2] = radius * Math.cos(phi);
    }
    const backgroundGeometry = new THREE.BufferGeometry();
    backgroundGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(backgroundPositions, 3),
    );
    const backgroundMaterial = new THREE.PointsMaterial({
      color: 0xd9d0ff,
      size: isCompact ? 0.065 : 0.052,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const backgroundStars = new THREE.Points(
      backgroundGeometry,
      backgroundMaterial,
    );
    scene.add(backgroundStars);

    const glowTextures = [
      makeGlowTexture("#c268ff"),
      makeGlowTexture("#ff5f9e"),
      makeGlowTexture("#ffca8e"),
    ].filter((texture): texture is THREE.CanvasTexture => texture !== null);
    const nebulae: THREE.Sprite[] = [];
    glowTextures.forEach((texture, index) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: index === 2 ? 0.16 : 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      const positionsForGlow = [
        new THREE.Vector3(-4.2, 1.8, -1.6),
        new THREE.Vector3(4.4, -1.6, -1.2),
        new THREE.Vector3(0, 0, 0.1),
      ];
      const scales = [11, 10, 4.8];
      sprite.position.copy(positionsForGlow[index]);
      sprite.scale.setScalar(scales[index]);
      galaxyGroup.add(sprite);
      nebulae.push(sprite);
    });

    const heartGroup = new THREE.Group();
    heartGroup.position.set(0, -0.05, 1.15);
    scene.add(heartGroup);

    const heartCount = isCompact ? 150 : 260;
    const heartPositions = new Float32Array(heartCount * 3);
    const heartColors = new Float32Array(heartCount * 3);
    const heartSizes = new Float32Array(heartCount);
    const heartLinePoints: THREE.Vector3[] = [];

    for (let index = 0; index < heartCount; index += 1) {
      const t = (index / heartCount) * Math.PI * 2;
      const jitter = gaussian() * 0.018;
      const x = 16 * Math.pow(Math.sin(t), 3) * 0.067;
      const y =
        (13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)) *
        0.067;
      heartPositions[index * 3] = x + jitter;
      heartPositions[index * 3 + 1] = y + jitter;
      heartPositions[index * 3 + 2] = gaussian() * 0.035;
      const mix = index / heartCount;
      workingColor.copy(roseColor).lerp(coreColor, 0.25 + 0.5 * mix);
      heartColors[index * 3] = workingColor.r;
      heartColors[index * 3 + 1] = workingColor.g;
      heartColors[index * 3 + 2] = workingColor.b;
      heartSizes[index] = 1.2 + Math.random() * 1.8;
      if (index % Math.max(1, Math.floor(heartCount / 72)) === 0) {
        heartLinePoints.push(new THREE.Vector3(x, y, 0));
      }
    }

    const heartGeometry = new THREE.BufferGeometry();
    heartGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(heartPositions, 3),
    );
    heartGeometry.setAttribute("color", new THREE.BufferAttribute(heartColors, 3));
    heartGeometry.setAttribute("aSize", new THREE.BufferAttribute(heartSizes, 1));
    const heartMaterial = pointMaterial.clone();
    heartMaterial.uniforms = { uPixelRatio: { value: 1 } };
    const heartPoints = new THREE.Points(heartGeometry, heartMaterial);
    heartGroup.add(heartPoints);

    const heartLineGeometry = new THREE.BufferGeometry().setFromPoints(
      heartLinePoints,
    );
    const heartLineMaterial = new THREE.LineBasicMaterial({
      color: 0xffb0ca,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const heartLine = new THREE.LineLoop(heartLineGeometry, heartLineMaterial);
    heartGroup.add(heartLine);

    type ShootingStar = {
      line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      velocity: THREE.Vector3;
      life: number;
    };
    const shootingStars: ShootingStar[] = [];
    for (let index = 0; index < 3; index += 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1.7, 0.48, 0),
      ]);
      const material = new THREE.LineBasicMaterial({
        color: index === 2 ? 0xffc4d8 : 0xffe3b5,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geometry, material);
      line.visible = false;
      scene.add(line);
      shootingStars.push({ line, velocity: new THREE.Vector3(), life: 0 });
    }

    type Burst = {
      points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
      velocities: Float32Array;
      life: number;
    };
    const bursts: Burst[] = [];
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const projectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.2);

    let reducedMotion =
      document.documentElement.dataset.motion === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerTarget = new THREE.Vector2();
    const pointerCurrent = new THREE.Vector2();
    let scrollTarget = 0;
    let scrollCurrent = 0;

    const spawnBurst = (clientX: number, clientY: number) => {
      if (reducedMotion) return;
      pointerNdc.set(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const origin = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(projectionPlane, origin)) {
        origin.set(0, 0, 1.2);
      }

      const count = isCompact ? 46 : 76;
      const burstPositions = new Float32Array(count * 3);
      const burstColors = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const t = (index / count) * Math.PI * 2 + Math.random() * 0.08;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy =
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t);
        const direction = new THREE.Vector2(hx, hy).normalize();
        const speed = 0.75 + Math.random() * 1.25;
        velocities[index * 3] = direction.x * speed + gaussian() * 0.08;
        velocities[index * 3 + 1] = direction.y * speed + gaussian() * 0.08;
        velocities[index * 3 + 2] = gaussian() * 0.22;
        burstPositions[index * 3] = origin.x;
        burstPositions[index * 3 + 1] = origin.y;
        burstPositions[index * 3 + 2] = origin.z;
        const burstColor = index % 3 === 0 ? coreColor : roseColor;
        burstColors[index * 3] = burstColor.r;
        burstColors[index * 3 + 1] = burstColor.g;
        burstColors[index * 3 + 2] = burstColor.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(burstPositions, 3),
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(burstColors, 3));
      const material = new THREE.PointsMaterial({
        size: isCompact ? 0.095 : 0.075,
        transparent: true,
        opacity: 1,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);
      bursts.push({ points, velocities, life: 1 });
    };

    const updateSize = () => {
      const width = Math.max(1, mount.clientWidth || window.innerWidth);
      const height = Math.max(1, mount.clientHeight || window.innerHeight);
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        width < 780 ? 1.35 : 1.75,
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      pointMaterial.uniforms.uPixelRatio.value = pixelRatio;
      heartMaterial.uniforms.uPixelRatio.value = pixelRatio;
    };

    const updateScroll = () => {
      const available = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      scrollTarget = Math.min(1, Math.max(0, window.scrollY / available));
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
      if (event.pointerType !== "mouse") {
        pointerTarget.set(
          (event.clientX / window.innerWidth - 0.5) * 1.4,
          (event.clientY / window.innerHeight - 0.5) * 1.4,
        );
      }
      spawnBurst(event.clientX, event.clientY);
    };

    const onBurstEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
      spawnBurst(
        detail?.x ?? window.innerWidth / 2,
        detail?.y ?? window.innerHeight / 2,
      );
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
    window.addEventListener("romance:motion", onMotionEvent);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    updateSize();
    updateScroll();

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let lastShot = 1;
    let nextShotDelay = 3.5 + Math.random() * 4;

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      if (document.hidden || renderDisabled) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      scrollCurrent += (scrollTarget - scrollCurrent) * (reducedMotion ? 1 : 0.035);
      pointerCurrent.lerp(pointerTarget, reducedMotion ? 1 : 0.035);

      if (!reducedMotion) {
        galaxyGroup.rotation.z = elapsed * 0.018 + scrollCurrent * 0.62;
        galaxyGroup.rotation.x =
          -0.08 + scrollCurrent * 0.28 + pointerCurrent.y * 0.035;
        galaxyGroup.rotation.y = pointerCurrent.x * 0.055;
        heartGroup.rotation.z = Math.sin(elapsed * 0.34) * 0.025;
        const heartPulse = 1 + Math.sin(elapsed * 1.45) * 0.018;
        heartGroup.scale.setScalar(heartPulse);
        backgroundStars.rotation.y = elapsed * 0.0025;
      }

      camera.position.x +=
        (pointerCurrent.x * 0.42 + Math.sin(scrollCurrent * Math.PI * 2) * 0.16 -
          camera.position.x) *
        (reducedMotion ? 1 : 0.045);
      camera.position.y +=
        (-pointerCurrent.y * 0.24 + Math.sin(scrollCurrent * Math.PI) * 0.14 -
          camera.position.y) *
        (reducedMotion ? 1 : 0.045);
      camera.position.z +=
        (13.4 - Math.sin(scrollCurrent * Math.PI) * 1.4 - camera.position.z) *
        (reducedMotion ? 1 : 0.025);
      camera.lookAt(0, 0, 0);

      if (!reducedMotion && elapsed - lastShot > nextShotDelay) {
        const availableShot = shootingStars.find((shot) => shot.life <= 0);
        if (availableShot) {
          availableShot.life = 1;
          availableShot.line.visible = true;
          availableShot.line.material.opacity = 0.9;
          availableShot.line.position.set(
            4 + Math.random() * 5,
            2.5 + Math.random() * 4,
            2 + Math.random() * 2,
          );
          availableShot.velocity.set(-5.5 - Math.random() * 2, -1.5, 0);
        }
        lastShot = elapsed;
        nextShotDelay = 4 + Math.random() * 5;
      }

      shootingStars.forEach((shot) => {
        if (shot.life <= 0) return;
        shot.life -= delta * 0.72;
        shot.line.position.addScaledVector(shot.velocity, delta);
        shot.line.material.opacity = Math.max(0, Math.sin(shot.life * Math.PI));
        if (shot.life <= 0) shot.line.visible = false;
      });

      for (let burstIndex = bursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
        const burst = bursts[burstIndex];
        burst.life -= delta * 0.72;
        const attribute = burst.points.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const array = attribute.array as Float32Array;
        for (let index = 0; index < array.length / 3; index += 1) {
          array[index * 3] += burst.velocities[index * 3] * delta;
          array[index * 3 + 1] += burst.velocities[index * 3 + 1] * delta;
          array[index * 3 + 2] += burst.velocities[index * 3 + 2] * delta;
          burst.velocities[index * 3] *= 0.985;
          burst.velocities[index * 3 + 1] *= 0.985;
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

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("romance:burst", onBurstEvent);
      window.removeEventListener("romance:motion", onMotionEvent);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);

      bursts.forEach((burst) => {
        burst.points.geometry.dispose();
        burst.points.material.dispose();
      });
      shootingStars.forEach((shot) => {
        shot.line.geometry.dispose();
        shot.line.material.dispose();
      });
      nebulae.forEach((sprite) => sprite.material.dispose());
      glowTextures.forEach((texture) => texture.dispose());
      galaxyGeometry.dispose();
      pointMaterial.dispose();
      backgroundGeometry.dispose();
      backgroundMaterial.dispose();
      heartGeometry.dispose();
      heartMaterial.dispose();
      heartLineGeometry.dispose();
      heartLineMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="three-canvas" ref={mountRef} aria-hidden="true">
      {webGlFailed ? <div className="galaxy-fallback" /> : null}
    </div>
  );
}
