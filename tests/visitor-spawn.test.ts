import { describe, expect, it } from "vitest";
import { visitorSpawn } from "@/lib/room/visitor-spawn";

describe("visitorSpawn", () => {
  it("assigns the same walkable room spot for a member on every visit", () => {
    expect(visitorSpawn("member-123")).toEqual(visitorSpawn("member-123"));
    const spawn = visitorSpawn("member-123");
    expect(spawn.x).toBeGreaterThanOrEqual(-13);
    expect(spawn.x).toBeLessThanOrEqual(13);
    expect(spawn.z).toBeGreaterThanOrEqual(-7);
    expect(spawn.z).toBeLessThanOrEqual(11);
  });

  it("places different member ids in distinct initial slots when possible", () => {
    const positions = Array.from({ length: 20 }, (_, index) => visitorSpawn(`member-${index}`));
    expect(new Set(positions.map(({ x, z }) => `${x},${z}`)).size).toBeGreaterThan(15);
  });
});
