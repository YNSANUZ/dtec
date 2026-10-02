import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ThumbnailModel } from "../lib/avatar-thumbnail";

export function frameThumbnail(source: THREE.Object3D, headOnly: boolean) {
  source.updateMatrixWorld(true);
  const head = headOnly ? source.getObjectByName("head") : undefined;
  const object = (head ?? source).clone(true);
  if (head) head.matrixWorld.decompose(object.position, object.quaternion, object.scale);
  object.rotation.y -= 0.32;
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  object.position.sub(center);
  const half = Math.max(size.x, size.y, 0.1) * 0.65;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 100);
  camera.position.set(0, size.y * 0.06, Math.max(size.z, size.y, 1) * 3);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return { object, camera };
}

export async function renderAvatarThumbnail(model: ThumbnailModel, headOnly: boolean) {
  const gltf = await new GLTFLoader().loadAsync(`/models/kenney/character-${model}.glb`);
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(176, 176);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const { object, camera } = frameThumbnail(gltf.scene, headOnly);
    const scene = new THREE.Scene();
    scene.add(object, new THREE.HemisphereLight(0xffffff, 0x35425a, 3.5));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.set(4, 6, 5);
    scene.add(light);
    renderer.render(scene, camera);
    // Capture immediately, then release the context; no canvas or RAF in the roster.
    return renderer.domElement.toDataURL("image/png");
  } finally {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
