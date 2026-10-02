import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createThumbnailCache, thumbnailModel, thumbnailModels } from "@/scripts/avatar-thumbnail-cache";
import { frameThumbnail } from "@/scripts/avatar-thumbnail-render";
import { avatarThumbnailUrl } from "@/lib/avatar-thumbnail";

it("coalesces duplicate requests and caches the rendered raster", async () => {
  const render = vi.fn(async () => "data:image/png;base64,fixture");
  const get = createThumbnailCache(render);
  const first = get("a", true);
  expect(get("a", true)).toBe(first);
  await first;
  await get("a", true);
  expect(render).toHaveBeenCalledTimes(1);
});

it("serializes different variants, keeping only one render job active", async () => {
  let finish!: (value: string) => void;
  const render = vi.fn().mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; })).mockResolvedValue("second");
  const get = createThumbnailCache(render);
  const first = get("a", true);
  const second = get("c", true);
  await Promise.resolve();
  expect(render).toHaveBeenCalledTimes(1);
  finish("first");
  expect(await first).toBe("first");
  expect(await second).toBe("second");
  expect(render).toHaveBeenCalledTimes(2);
});

it("does not poison the queue after failure and allows retry", async () => {
  const render = vi.fn().mockRejectedValueOnce(new Error("No WebGL")).mockResolvedValue("ok");
  const get = createThumbnailCache(render);
  await expect(get("a", true)).rejects.toThrow("No WebGL");
  expect(await get("c", true)).toBe("ok");
  expect(await get("a", true)).toBe("ok");
  expect(render).toHaveBeenCalledTimes(3);
});

it("limits arbitrary model strings to trusted assets and separates body/head", async () => {
  const render = vi.fn(async (model: string, head: boolean) => `${model}:${head}`);
  const get = createThumbnailCache(render);
  expect(thumbnailModel("../../other")).toBe("r");
  await get("../../other", true);
  await get("r", true);
  await get("r", false);
  expect(render).toHaveBeenCalledTimes(2);
});

it("all six shipped assets contain an independently named head", () => {
  for (const model of thumbnailModels) {
    const buffer = readFileSync(`public/models/kenney/character-${model}.glb`);
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
    expect(json.nodes.some((node: { name: string; mesh?: number }) => node.name === "head" && typeof node.mesh === "number")).toBe(true);
  }
});

it("ships twelve correctly sized PNGs, with trusted static asset URLs", () => {
  for (const model of thumbnailModels) for (const head of [true, false]) {
    const url = avatarThumbnailUrl(model, head);
    const bytes = readFileSync(`public${url}`);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(176);
    expect(bytes.readUInt32BE(20)).toBe(176);
  }
  expect(avatarThumbnailUrl("../remote", true)).toBe("/avatars/character-r-head.png");
});

it("frames only the head, preserves ancestor transforms and leaves the source untouched", () => {
  const source = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 4; torso.scale.setScalar(2);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1, 1.3, 1), new THREE.MeshBasicMaterial());
  head.name = "head"; head.position.y = 2;
  torso.add(head); source.add(torso);
  const { object, camera } = frameThumbnail(source, true);
  expect(object.name).toBe("head");
  expect(object.scale.x).toBe(2);
  expect(head.parent).toBe(torso);
  expect(head.position.y).toBe(2);
  camera.updateMatrixWorld(); object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(0.001);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const corner = new THREE.Vector3(x, y, z).project(camera);
    expect(Math.abs(corner.x)).toBeLessThan(1);
    expect(Math.abs(corner.y)).toBeLessThan(1);
  }
  head.geometry.dispose(); (head.material as THREE.Material).dispose();
});

it("supports a full-body thumbnail without removing the source meshes", () => {
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial()));
  const { object } = frameThumbnail(source, false);
  expect(object.children.length).toBe(1);
  expect(source.children.length).toBe(1);
});
