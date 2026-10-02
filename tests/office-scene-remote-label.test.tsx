// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3, type Camera, type Object3D, type Scene, type Sprite, type SpriteMaterial } from "three";
import OfficeScene from "@/components/office-scene";

// Only the GPU and asset I/O are replaced: the scene, camera, sprites, movement
// loop and React lifecycle below are the actual production implementations.
const gpu = vi.hoisted(() => ({ scene: null as Scene | null, camera: null as Camera | null }));
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
  const { Group } = await import("three");
  return { GLTFLoader: class {
    load(_path: string, loaded: (asset: { scene: Object3D; animations: [] }) => void) {
      loaded({ scene: new Group(), animations: [] });
    }
  } };
});

let nextFrame: FrameRequestCallback;
let now: number;
beforeEach(() => {
  gpu.scene = null;
  gpu.camera = null;
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

describe("live remote labels", () => {
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
