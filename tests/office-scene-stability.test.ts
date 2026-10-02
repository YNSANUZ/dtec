import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/office-scene.tsx"), "utf8");

describe("office scene lifecycle stability", () => {
  it("does not rebuild the Three.js scene when parent callbacks get new identities", () => {
    const lifecycleDependencies = source.match(/\}, \[assetBase, avatar,[^\]]+\]\);/)?.[0] ?? "";
    expect(lifecycleDependencies).not.toContain("onCharacterClick");
    expect(lifecycleDependencies).not.toContain("onMuralClick");
    expect(source).toContain("characterClickRef.current");
    expect(source).toContain("muralClickRef.current");
  });

  it("restores the camera and character facing after a scene rebuild", () => {
    expect(source).toContain("cameraViewRef.current");
    expect(source).toContain("orbit.set(savedCamera.radius, savedCamera.phi, savedCamera.theta)");
    expect(source).toContain("o.rotation.y = savedPosition.facing");
    expect(source).toContain("facing: mine.rotation.y");
  });
});
