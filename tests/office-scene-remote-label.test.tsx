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
      fill() { drawn.background ??= String(this.fillStyle); },
      fillStyle: "",
      createRadialGradient() { return { addColorStop() {} }; },
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
  it("updates the small shield after a role change without replacing the remote model, transform or camera",()=>{
    const view=render(<OfficeScene {...props} remoteUsers={[{...remote,role:"member"}]}/>);tick(2000);
    const object=remoteObject(),oldModel=model(),camera=gpu.camera!,oldLabel=label(),position=object.position.clone();
    const dispose=vi.spyOn(oldLabel.material.map!,"dispose");
    view.rerender(<OfficeScene {...props} remoteUsers={[{...remote,role:"owner"}]}/>);tick(3100);
    expect(label().userData.roleBadge).toBe("owner");expect(image(label()).dataset.drawnText).toBe(remote.name);
    expect(dispose).toHaveBeenCalledOnce();expect(model()).toBe(oldModel);expect(object.position.equals(position)).toBe(true);expect(gpu.camera).toBe(camera);
  });
  it("updates the local shield independently of the world and marks a local nonmember as visitor",()=>{
    const view=render(<OfficeScene {...props} role="member" remoteUsers={[]}/>);tick(500);
    const scene=gpu.scene!,mine=scene.children.find(object=>object.type==="Group"&&!object.userData.roomUserId)!;
    expect(label(mine).userData.roleBadge).toBe("member");
    view.rerender(<OfficeScene {...props} role="leader" remoteUsers={[]}/>);tick(600);
    expect(gpu.scene).toBe(scene);expect(label(mine).userData.roleBadge).toBe("leader");
    view.rerender(<OfficeScene {...props} created={false} remoteUsers={[]}/>);tick(700);
    const visitor=gpu.scene!.children.find(object=>object.type==="Group"&&!object.userData.roomUserId)!;
    expect(label(visitor).userData.roleBadge).toBe("visitor");expect(image(label(visitor)).dataset.background).toBe("#64748b");
  });
  it("repaints the wall identity without reconstructing the camera or avatar",()=>{
    const view=render(<OfficeScene {...props} roomIdentity={{title:"Primeiro",description:"Minha turma"}} remoteUsers={[remote]}/>);tick(2000);
    const scene=gpu.scene!,camera=gpu.camera!,object=remoteObject(),oldModel=model();
    const textures=()=>scene.children.flatMap(child=>{const map=(child as unknown as {material?:{map?:{image?:HTMLCanvasElement}}}).material?.map;return map?.image?[map.image.dataset.drawnText]:[];});
    expect(textures()).toContain("Minha turma");
    view.rerender(<OfficeScene {...props} roomIdentity={{title:"Novo grupo",description:"Novo ambiente"}} remoteUsers={[remote]}/>);tick(3100);
    expect(textures()).toContain("Novo ambiente");expect(textures()).not.toContain("Minha turma");expect(gpu.scene).toBe(scene);expect(gpu.camera).toBe(camera);expect(model(object)).toBe(oldModel);
  });
  it("shares one painted LED glow across twelve fixtures, adds no dynamic light, and releases it once",()=>{
    const view=render(<OfficeScene {...props} remoteUsers={[]}/>);tick(500);
    const scene=gpu.scene!;
    const glows=scene.children.filter(child=>{const mesh=child as unknown as {geometry?:{parameters?:{width:number;height:number}};material?:{map?:{image?:HTMLCanvasElement}}};return mesh.material?.map?.image?.width===128&&mesh.geometry?.parameters?.width===2.4;}) as unknown as {material:{map:{dispose:()=>void};dispose:()=>void};geometry:{dispose:()=>void}}[];
    expect(glows).toHaveLength(12);expect(new Set(glows.map(glow=>glow.material))).toHaveProperty("size",1);
    expect(scene.children.filter(child=>(child as unknown as {isLight?:boolean}).isLight)).toHaveLength(2);
    const textureDispose=vi.spyOn(glows[0].material.map,"dispose"),materialDispose=vi.spyOn(glows[0].material,"dispose"),geometryDispose=vi.spyOn(glows[0].geometry,"dispose");
    view.unmount();expect(textureDispose).toHaveBeenCalledOnce();expect(materialDispose).toHaveBeenCalledOnce();expect(geometryDispose).toHaveBeenCalledOnce();
  });
  it("keeps a birthday badge during local walking, stops it at twenty seconds, and frees its private texture on unmount", () => {
    const view = render(<OfficeScene {...props} birthdayToday remoteUsers={[]} />); tick(500);
    const scene = gpu.scene!; const camera = gpu.camera!; const mine = scene.children.find(object => object.type === "Group" && !object.userData.roomUserId)!;
    const start = mine.position.clone();
    const badge = mine.children.find(child => child.userData.popStartedAt !== undefined) as Sprite; expect(badge).toBeTruthy();
    const point = new Vector3(5, 0, 7).project(camera);
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0, clientX: (point.x + 1) * 640, clientY: (1 - point.y) * 360 };
    const canvas = view.container.querySelector(".office-canvas canvas")!; fireEvent.pointerDown(canvas, pointer); fireEvent.pointerUp(canvas, pointer); tick(600);
    expect(mine.position.distanceTo(start)).toBeGreaterThan(0); expect(mine.children).toContain(badge);
    tick(19_999); expect(mine.children).toContain(badge); tick(20_000); expect(mine.children).not.toContain(badge); tick(140_000);
    const nextBadge = mine.children.find(child => child.userData.popStartedAt !== undefined) as Sprite; expect(nextBadge).toBeTruthy();
    const dispose = vi.spyOn(nextBadge.material.map!, "dispose"); view.unmount(); expect(dispose).toHaveBeenCalledOnce();
  });

  it("removes the badge immediately when the birthday signal changes without recreating the remote model", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[{ ...remote, birthdayToday: true }]} />); tick(2_000);
    const object = remoteObject(); const oldModel = model(); const badge = object.children.find(child => child.userData.popStartedAt !== undefined) as Sprite; expect(badge).toBeTruthy();
    const dispose = vi.spyOn(badge.material.map!, "dispose");
    view.rerender(<OfficeScene {...props} remoteUsers={[remote]} />); tick(2_100);
    expect(dispose).toHaveBeenCalledOnce(); expect(object.children).not.toContain(badge); expect(model()).toBe(oldModel);
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, birthdayToday: true }]} />); tick(2_200);
    expect(object.children.some(child => child.userData.popStartedAt !== undefined)).toBe(true);
  });
  it("starts a delayed birthday signal immediately, keeps the cycle across polls and disposes expired badges without resetting the camera", () => {
    const view = render(<OfficeScene {...props} remoteUsers={[remote]} />); tick(10_000);
    const scene = gpu.scene!; const camera = gpu.camera!; const object = remoteObject(); const position = object.position.clone();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" })); const projection = camera.projectionMatrix.clone();
    const birthday = { ...remote, birthdayToday: true };
    view.rerender(<OfficeScene {...props} remoteUsers={[birthday]} />); tick(10_100);
    const badge = object.children.find(child => child.userData.popStartedAt !== undefined) as Sprite;
    expect(badge).toBeTruthy(); const textureDispose = vi.spyOn(badge.material.map!, "dispose"); const materialDispose = vi.spyOn(badge.material, "dispose");
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...birthday }]} />); tick(30_099);
    expect(object.children).toContain(badge); tick(30_100); expect(object.children).not.toContain(badge);
    expect(textureDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
    tick(150_099); expect(object.children.some(child => child.userData.popStartedAt !== undefined)).toBe(false);
    tick(150_100); expect(object.children.some(child => child.userData.popStartedAt !== undefined)).toBe(true);
    expect(gpu.scene).toBe(scene); expect(gpu.camera).toBe(camera); expect(camera.projectionMatrix.equals(projection)).toBe(true); expect(object.position.equals(position)).toBe(true);
  });

  it("starts the badge when a slow GLTF becomes visible and releases it when the member disappears", () => {
    assets.deferred = true;
    const view = render(<OfficeScene {...props} remoteUsers={[{ ...remote, avatar: "c", birthdayToday: true }]} />); tick(10_000);
    finishAsset("c"); tick(10_100);
    const object = remoteObject(); const badge = object.children.find(child => child.userData.popStartedAt !== undefined) as Sprite;
    expect(badge).toBeTruthy(); const dispose = vi.spyOn(badge.material.map!, "dispose");
    view.rerender(<OfficeScene {...props} remoteUsers={[]} />); tick(12_000); expect(dispose).toHaveBeenCalledOnce();
  });
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
    expect(image(label()).dataset.background).toBe("#15803d");
    expect(image(label()).dataset.dot).toBeUndefined();
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

  it("updates an offline gray label and turns the entire label green online", () => {
    const offline = { ...remote, online: false };
    const view = render(<OfficeScene {...props} remoteUsers={[offline]} />);
    tick(2_000);
    expect(image(label()).dataset.dot).toBeUndefined();
    expect(image(label()).dataset.background).toBe("#64748b");
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...offline, name: "Ana Lima" }]} />);
    tick(4_000);
    expect(image(label()).dataset.drawnText).toBe("Ana Lima");
    expect(image(label()).dataset.dot).toBeUndefined();
    view.rerender(<OfficeScene {...props} remoteUsers={[{ ...remote, name: "Ana Lima" }]} />);
    tick(6_000);
    expect(image(label()).dataset.background).toBe("#15803d");
    expect(image(label()).dataset.dot).toBeUndefined();
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
