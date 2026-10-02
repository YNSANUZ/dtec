// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3, type AnimationClip, type Camera, type Object3D, type Scene, type Sprite, type SpriteMaterial } from "three";
import OfficeScene from "@/components/office-scene";

// Only the GPU and asset I/O are replaced: the scene, camera, sprites, movement
// loop and React lifecycle below are the actual production implementations.
const gpu = vi.hoisted(() => ({ scene: null as Scene | null, camera: null as Camera | null }));
const assets = vi.hoisted(() => ({ deferred: false, skinned: false, pending: [] as Array<{ path: string; resolve: () => void; reject: () => void }> }));
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  return { ...three, WebGLRenderer: class {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    outputColorSpace = "";
    setPixelRatio() {}
    setSize() {}
    dispose() {}
    render(scene: Scene, camera: Camera) { gpu.scene = scene; gpu.camera = camera; }
  } };
});
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  const { Group, Mesh, SkinnedMesh, Bone, Skeleton, BoxGeometry, MeshBasicMaterial, AnimationClip, NumberKeyframeTrack } = await import("three");
  return { GLTFLoader: class {
    load(path: string, loaded: (asset: { scene: Object3D; animations: AnimationClip[] }) => void, _progress?: unknown, failed?: (error: Error) => void) {
      const resolve = () => {
        const scene = new Group();
        scene.userData.assetPath = path;
        const part = assets.skinned
          ? new SkinnedMesh(new BoxGeometry(.5, 1, .5), new MeshBasicMaterial())
          : new Mesh(new BoxGeometry(.5, 1, .5), new MeshBasicMaterial());
        if (part instanceof SkinnedMesh) {
          const bone = new Bone();
          part.add(bone);
          part.bind(new Skeleton([bone]));
        }
        part.name = "part";
        scene.add(part);
        const animations = ["idle", "walk", "sit", "emote-yes"].map(name => new AnimationClip(name, 1, [
          new NumberKeyframeTrack("part.rotation[x]", [0, 1], [0, .5]),
        ]));
        loaded({ scene, animations });
      };
      if (assets.deferred) assets.pending.push({ path, resolve, reject: () => failed?.(new Error("Asset unavailable")) });
      else resolve();
    }
  } };
});

let nextFrame: FrameRequestCallback;
let now: number;
beforeEach(() => {
  gpu.scene = null;
  gpu.camera = null;
  assets.deferred = false;
  assets.skinned = false;
  assets.pending = [];
  now = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1280);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, "setPointerCapture").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720,
    toJSON: () => ({}),
  });
  const get2dContext = function (this: HTMLCanvasElement) {
    const drawn = this.dataset;
    return new Proxy({
      fillText(text: string) { drawn.drawnText = text; },
      measureText(text: string) { return { width: text.length * 20 }; },
      arc() { drawn.dot = "yes"; },
    }, { get(target, key) { return Reflect.get(target, key) ?? (() => {}); } }) as unknown as CanvasRenderingContext2D;
  };
  // The DOM overload list ends with WebGPU; this fixture implements only the
  // 2D drawing boundary used by production canvas labels.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(get2dContext as unknown as HTMLCanvasElement["getContext"]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const remote = { userId: "ana", name: "Ana Silva", avatar: "b", x: 7, z: 2, action: "idle", message: "", online: true, birthdayToday: false };
const props = {
  environment: "lobby" as const, name: "Meu Perfil", avatar: "a", action: "idle" as const,
  message: "", created: true, initialPosition: { x: 1, z: 4 }, birthdayToday: false,
  positionOwnerId: "me", onStateChange: () => {}, onCharacterClick: () => {}, onMuralClick: () => {},
};
function tick(time: number) { act(() => { now = time; nextFrame(time); }); }
function remoteObject() { return gpu.scene!.children.find((object) => object.userData.roomUserId === "ana")!; }
function label(object = remoteObject()) { return object.children.find((child) => (child as Sprite).isSprite) as Sprite; }
function image(sprite: Sprite) { return (sprite.material as SpriteMaterial).map!.image as HTMLCanvasElement; }
function model(object = remoteObject()) {
  let result: Object3D | undefined;
  object.traverse(child => { if (child.userData.assetPath) result = child; });
  return result!;
}
function finishAsset(path: string) {
  const index = assets.pending.findIndex(load => load.path.endsWith(`/character-${path}.glb`));
  expect(index, `expected a pending load of character ${path}`).toBeGreaterThanOrEqual(0);
  const [load] = assets.pending.splice(index, 1);
  act(load.resolve);
}

describe("live remote labels", () => {
  it("restores the new position even if the loading phase's avatar has not finished loading", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[]} />);
    tick(2_000);
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} created={false} avatar="c" initialPosition={{ x: 0, z: 5 }} remoteUsers={[]} />);
    assets.deferred = false;
    view.rerender(<OfficeScene {...props} created avatar="f" initialPosition={{ x: 8, z: -2 }} remoteUsers={[]} />);
    const mine = gpu.scene!.children.find(object => object.type === "Group" && !object.userData.roomUserId)!;
    expect(mine.position.toArray()).toEqual([8, 0, -2]);
  });

  it("restores persisted coordinates after the loading visitor frame instead of publishing the temporary spawn", () => {
    const publish = vi.fn();
    const view = render(<OfficeScene {...props} created={false} initialPosition={{ x: 0, z: 5 }} remoteUsers={[]} onStateChange={publish} />);
    tick(2_000);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    const projection = gpu.camera!.projectionMatrix.clone();
    view.rerender(<OfficeScene {...props} created initialPosition={{ x: 8, z: -2 }} remoteUsers={[]} onStateChange={publish} />);
    const mine = gpu.scene!.children.find(object => object.type === "Group" && !object.userData.roomUserId)!;
    expect(mine.position.toArray()).toEqual([8, 0, -2]);
    expect(gpu.camera!.projectionMatrix.equals(projection)).toBe(true);
    tick(4_000);
    expect(publish).toHaveBeenCalledWith(8, -2, "idle");
  });

  it("continues a click-to-walk path and keeps zoom when chat and presence refresh", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const scene = gpu.scene!;
    const camera = gpu.camera!;
    const mine = scene.children.find(object => object.type === "Group" && !object.userData.roomUserId)!;
    const spawn = mine.position.clone();
    const point = new Vector3(5, 0, 7).project(camera);
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0, clientX: (point.x + 1) * 640, clientY: (1 - point.y) * 360 };
    const canvas = view.container.querySelector(".office-canvas canvas")!;
    fireEvent.pointerDown(canvas, pointer);
    fireEvent.pointerUp(canvas, pointer);
    tick(3_000);
    const walked = mine.position.distanceTo(spawn);
    expect(walked).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    const projection = camera.projectionMatrix.clone();

    view.rerender(<OfficeScene {...props} message="Olá" remoteUsers={[{ ...remote }]}
      onStateChange={() => {}} onCharacterClick={() => {}} onMuralClick={() => {}} />);
    tick(5_000);

    expect(gpu.scene).toBe(scene);
    expect(gpu.camera).toBe(camera);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
    expect(scene.children).toContain(mine);
    expect(mine.position.distanceTo(spawn)).toBeGreaterThan(walked);
    expect(mine.children.some(child => (child as Sprite).isSprite && image(child as Sprite).dataset.drawnText === "Olá")).toBe(true);
  });

  it("updates a renamed online member without resetting the scene, camera or avatar pose", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const scene = gpu.scene!;
    const camera = gpu.camera!;
    const person = remoteObject();
    const position = person.position.clone();
    person.rotation.y = 1.3;
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    const projection = camera.projectionMatrix.clone();
    expect(image(label()).dataset.drawnText).toBe("Ana Silva");

    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, name: "Ana Lima" }]} />);
    tick(4_000);

    expect(image(label()).dataset.drawnText).toBe("Ana Lima");
    expect(gpu.scene).toBe(scene);
    expect(gpu.camera).toBe(camera);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
    expect(remoteObject()).toBe(person);
    expect(person.position.equals(position)).toBe(true);
    expect(person.rotation.y).toBe(1.3);
    expect(image(label()).dataset.dot).toBe("yes");
  });

  it("keeps the same label on unchanged presence polls", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const original = label();
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote }]} />);
    tick(4_000);
    expect(label()).toBe(original);
  });

  it("releases the replaced label's private texture and material", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const original = label();
    let texturesReleased = 0;
    let materialsReleased = 0;
    original.material.map!.addEventListener("dispose", () => { texturesReleased++; });
    original.material.addEventListener("dispose", () => { materialsReleased++; });
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, name: "Ana Lima" }]} />);
    tick(4_000);
    expect(texturesReleased).toBe(1);
    expect(materialsReleased).toBe(1);
    expect(original.parent).toBeNull();
  });

  it("updates an offline member name and still refreshes the online dot", () => {
    const offline = { ...remote, online: false };
    const view = render(<OfficeScene {...props} remoteUsers={[offline]} />);
    tick(2_000);
    expect(image(label()).dataset.dot).toBeUndefined();
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...offline, name: "Ana Lima" }]} />);
    tick(4_000);
    expect(image(label()).dataset.drawnText).toBe("Ana Lima");
    expect(image(label()).dataset.dot).toBeUndefined();
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, name: "Ana Lima" }]} />);
    tick(6_000);
    expect(image(label()).dataset.dot).toBe("yes");
  });
});

describe("live remote avatar replacement", () => {
  it("uses the latest profile and location when the initial model finishes loading", () => {
    assets.deferred = true;
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c", name: "Ana Lima", x: 9, z: 6 }]} />);
    tick(3_100);
    finishAsset("c");
    finishAsset("b");
    expect(model().userData.assetPath).toBe("/models/kenney/character-c.glb");
    expect(remoteObject().position.toArray()).toEqual([9, 0, 6]);
    expect(image(label()).dataset.drawnText).toBe("Ana Lima");
    expect(gpu.scene!.children.filter(child => child.userData.roomUserId === "ana")).toHaveLength(1);
  });

  it("does not resurrect a remote user who left during a pending load", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c" }]} />);
    tick(3_100);
    view.rerender(<OfficeScene {...props} remoteUsers={[]} />);
    tick(4_200);
    finishAsset("c");
    expect(remoteObject()).toBeUndefined();
  });

  it("does not resurrect either self or remote avatars after the initial scene unmounts", () => {
    assets.deferred = true;
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const scene = gpu.scene!;
    const count = scene.children.length;
    view.unmount();
    finishAsset("a");
    finishAsset("b");
    expect(scene.children).toHaveLength(count);
  });

  it("replaces the chosen skin in place, preserving label, chat, facing, zoom and position", () => {
    const talking = { ...remote, message: "Bom dia" };
    const view = render(<OfficeScene {...props} remoteUsers={[talking]} />);
    tick(2_000);
    tick(3_100);
    const scene = gpu.scene!;
    const camera = gpu.camera!;
    const person = remoteObject();
    person.rotation.y = .9;
    const position = person.position.clone();
    const nameTag = label();
    const chat = person.children.find(child => (child as Sprite).isSprite && image(child as Sprite).dataset.drawnText === "Bom dia")!;
    expect(chat).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    const projection = camera.projectionMatrix.clone();
    expect(model().userData.assetPath).toBe("/models/kenney/character-b.glb");

    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...talking, avatar: "c" }]} />);
    tick(4_200);

    expect(model().userData.assetPath).toBe("/models/kenney/character-c.glb");
    expect(remoteObject()).toBe(person);
    expect(person.position.equals(position)).toBe(true);
    expect(person.rotation.y).toBe(.9);
    expect(label()).toBe(nameTag);
    expect(person.children).toContain(chat);
    expect(gpu.scene).toBe(scene);
    expect(gpu.camera).toBe(camera);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
  });

  it("keeps walking toward the current destination while a new skin loads", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const person = remoteObject();
    const start = person.position.clone();
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c", x: 10 }]} />);
    tick(3_100);
    tick(4_200);
    // A slow asset must not start duplicate loads on each presence poll.
    expect(assets.pending).toHaveLength(1);
    expect(person.position.distanceTo(start)).toBeGreaterThan(0);
    expect(model().userData.assetPath).toBe("/models/kenney/character-b.glb");
    const during = person.position.clone();
    finishAsset("c");
    expect(remoteObject()).toBe(person);
    expect(person.position.equals(during)).toBe(true);
    tick(5_300);
    expect(person.position.distanceTo(start)).toBeGreaterThan(during.distanceTo(start));
    expect(model().userData.assetPath).toBe("/models/kenney/character-c.glb");
  });

  it("animates the replacement model and stops the old mixer without disposing shared asset resources", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[{ ...remote, action: "dance" }]} />);
    tick(2_000);
    tick(3_100);
    const oldModel = model();
    const oldPart = oldModel.getObjectByName("part")!;
    let disposed = 0;
    const mesh = oldPart as import("three").Mesh<import("three").BoxGeometry, import("three").MeshBasicMaterial>;
    mesh.geometry.addEventListener("dispose", () => { disposed++; });
    mesh.material.addEventListener("dispose", () => { disposed++; });
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, action: "dance", avatar: "c" }]} />);
    tick(4_200);
    const oldPose = oldPart.rotation.x;
    tick(5_300);
    tick(6_400);
    expect(model().getObjectByName("part")!.rotation.x).toBeGreaterThan(0);
    expect(oldPart.rotation.x).toBe(oldPose);
    expect(oldModel.parent).toBeNull();
    expect(disposed).toBe(0);
  });

  it("releases only the retired clone's private skeleton texture", () => {
    assets.skinned = true;
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const oldPart = model().getObjectByName("part") as import("three").SkinnedMesh;
    oldPart.skeleton.computeBoneTexture();
    const oldTexture = oldPart.skeleton.boneTexture!;
    let disposed = 0;
    oldTexture.addEventListener("dispose", () => { disposed++; });
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c" }]} />);
    tick(3_100);
    const replacement = model().getObjectByName("part") as import("three").SkinnedMesh;
    expect(replacement.skeleton).not.toBe(oldPart.skeleton);
    expect(disposed).toBe(1);
    expect(oldPart.skeleton.boneTexture).toBeNull();
    replacement.skeleton.computeBoneTexture();
    expect(replacement.skeleton.boneTexture).not.toBe(oldTexture);
  });

  it("ignores an obsolete load if the user returns to the already displayed skin", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const original = model();
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c" }]} />);
    tick(3_100);
    view.rerender(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(4_200);
    finishAsset("c");
    expect(model()).toBe(original);
  });

  it("discards out-of-order model responses instead of undoing the latest selection", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c" }]} />);
    tick(3_100);
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "f" }]} />);
    tick(4_200);
    finishAsset("f");
    finishAsset("c");
    expect(model().userData.assetPath).toBe("/models/kenney/character-f.glb");
  });

  it("keeps the old visible skin on a failed load and can retry on a later poll", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c" }]} />);
    tick(3_100);
    expect(assets.pending.length).toBe(1);
    act(assets.pending.shift()!.reject);
    expect(model().userData.assetPath).toBe("/models/kenney/character-b.glb");
    tick(4_200);
    finishAsset("c");
    expect(model().userData.assetPath).toBe("/models/kenney/character-c.glb");
  });

  it("does not add a late model to a scene that has been unmounted", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />);
    tick(2_000);
    const scene = gpu.scene!;
    const oldModel = model();
    assets.deferred = true;
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c" }]} />);
    tick(3_100);
    view.unmount();
    finishAsset("c");
    expect(model(scene.children.find(child => child.userData.roomUserId === "ana")!).userData.assetPath).toBe(oldModel.userData.assetPath);
  });
});
