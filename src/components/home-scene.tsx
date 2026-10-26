'use client';

import { useEffect, useRef, useState } from 'react';

// Original geometry; no third-party scene, textures, scripts or tracking requests.
export function HomeScene() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    const load = async () => {
      try {
        const [THREE, { RoomEnvironment }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x08090b, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4;
        container.appendChild(renderer.domElement);
        renderer.domElement.className = 'absolute inset-0 h-full w-full';
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
        camera.position.set(0, 0, 8.8);
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const environment = pmrem.fromScene(room, 0.04);
        scene.environment = environment.texture;
        room.dispose();
        pmrem.dispose();
        const sculpture = new THREE.Group();
        scene.add(sculpture);
        const geometry = new THREE.TorusGeometry(1, 0.205, 36, 160);
        const material = new THREE.MeshPhysicalMaterial({
          color: 0x8aaadb,
          metalness: 0.76,
          roughness: 0.14,
          clearcoat: 1,
          clearcoatRoughness: 0.07,
          transmission: 0.28,
          thickness: 1.2,
          ior: 1.46,
          iridescence: 0.55,
          iridescenceIOR: 1.3,
          envMapIntensity: 2.4,
        });
        const first = new THREE.Mesh(geometry, material);
        first.position.x = -0.73;
        first.scale.set(1.42, 0.85, 1);
        first.rotation.set(0.6, 0.35, -0.48);
        const second = new THREE.Mesh(geometry, material);
        second.position.x = 0.73;
        second.scale.set(1.42, 0.85, 1);
        second.rotation.set(-0.6, -0.45, 0.48);
        sculpture.add(first, second);
        const key = new THREE.DirectionalLight(0xd8e6ff, 5);
        key.position.set(-3, 3, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x699dff, 8);
        rim.position.set(4, -2, 0);
        scene.add(rim);
        let visible = true;
        let frame = 0;
        let time = 0;
        let last = 0;
        let previous = 0;
        let targetX = 0;
        let targetY = 0;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const resize = () => {
          const { width, height } = container.getBoundingClientRect();
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.position.z = width < 500 ? 8.8 : 6.8;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        };
        const sizeObserver = new ResizeObserver(resize);
        sizeObserver.observe(container);
        resize();
        const pointer = (event: PointerEvent) => {
          const rect = container.getBoundingClientRect();
          targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.14;
          targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 0.14;
        };
        container.addEventListener('pointermove', pointer);
        const tick = (now: number) => {
          frame = 0;
          const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
          previous = now;
          if (visible && !document.hidden && !reduced.matches && now - last > 32) {
            time += delta;
            last = now;
            sculpture.rotation.y = Math.sin(time * 0.24) * 0.17 + targetX;
            sculpture.rotation.x = Math.sin(time * 0.2) * 0.07 + targetY;
            sculpture.position.y = Math.sin(time * 0.65) * 0.07;
            renderer.render(scene, camera);
          }
          if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
        };
        const start = () => {
          if (!frame && visible && !document.hidden && !reduced.matches) {
            previous = 0;
            frame = requestAnimationFrame(tick);
          }
        };
        const visibility = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          if (visible) start();
          else {
            cancelAnimationFrame(frame);
            frame = 0;
          }
        });
        visibility.observe(container);
        document.addEventListener('visibilitychange', start);
        reduced.addEventListener('change', start);
        renderer.domElement.addEventListener('webglcontextlost', lost);
        function lost(event: Event) {
          event.preventDefault();
          cancelAnimationFrame(frame);
          frame = 0;
          setReady(false);
        }
        start();
        setReady(true);
        stop = () => {
          cancelAnimationFrame(frame);
          visibility.disconnect();
          sizeObserver.disconnect();
          document.removeEventListener('visibilitychange', start);
          reduced.removeEventListener('change', start);
          container.removeEventListener('pointermove', pointer);
          renderer.domElement.removeEventListener('webglcontextlost', lost);
          geometry.dispose();
          material.dispose();
          environment.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
      } catch {
        /* Static artwork remains when WebGL is unavailable. */
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer?.disconnect();
          void load();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(container);
    return () => {
      disposed = true;
      observer?.disconnect();
      stop?.();
    };
  }, []);
  return (
    <div
      ref={host}
      aria-hidden="true"
      className="relative mx-auto h-[300px] w-full max-w-5xl sm:h-[320px] md:h-[340px]"
    >
      <div className="pointer-events-none absolute inset-x-[20%] bottom-[18%] h-12 rounded-[100%] bg-ice/10 blur-3xl" />
      <svg
        viewBox="0 0 800 400"
        className={`absolute inset-0 size-full transition-opacity duration-700 ${ready ? 'opacity-0' : 'opacity-100'}`}
      >
        <defs>
          <linearGradient id="glass-loop" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#15243c" />
            <stop offset=".28" stopColor="#d8e8ff" />
            <stop offset=".4" stopColor="#355c87" />
            <stop offset=".62" stopColor="#101a2b" />
            <stop offset=".82" stopColor="#bedaff" />
            <stop offset="1" stopColor="#334c77" />
          </linearGradient>
        </defs>
        <ellipse
          cx="307"
          cy="202"
          rx="170"
          ry="83"
          transform="rotate(-28 307 202)"
          fill="none"
          stroke="url(#glass-loop)"
          strokeWidth="33"
        />
        <ellipse
          cx="493"
          cy="202"
          rx="170"
          ry="83"
          transform="rotate(28 493 202)"
          fill="none"
          stroke="url(#glass-loop)"
          strokeWidth="33"
        />
      </svg>
    </div>
  );
}
