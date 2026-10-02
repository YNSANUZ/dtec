"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function AvatarPreview({ model, headOnly = false }: { model: string; headOnly?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(2.8, 0.4, 6.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const sizePx = headOnly ? 64 : 88;
    renderer.setSize(sizePx, sizePx);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x35425a, 3.5));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.set(4, 6, 5);
    scene.add(light);
    let character: THREE.Object3D | null = null;
    new GLTFLoader().load(`/models/kenney/character-${model}.glb`, (gltf) => {
      character = gltf.scene;
      const box = new THREE.Box3().setFromObject(character);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      character.position.sub(center);
      character.rotation.y = -0.32;
      scene.add(character);
      if (headOnly) {
        const head = new THREE.Vector3(0, size.y * 0.34, 0);
        camera.position.set(size.x * 0.2, head.y + size.y * 0.06, size.y * 0.86);
        camera.lookAt(head);
      } else {
        camera.position.set(size.x * 1.2, size.y * 0.08, Math.max(size.y, size.z) * 2.35);
        camera.lookAt(0, 0, 0);
      }
    });
    let frame = 0;
    const draw = () => { frame = requestAnimationFrame(draw); renderer.render(scene, camera); };
    draw();
    return () => { cancelAnimationFrame(frame); renderer.dispose(); element.replaceChildren(); };
  }, [headOnly, model]);
  return <div className={headOnly ? "avatar-preview avatar-head-only" : "avatar-preview"} ref={host} aria-hidden="true" />;
}
