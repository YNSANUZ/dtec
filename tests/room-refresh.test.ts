import { describe, expect, it } from "vitest";
import { WORKSTATIONS, PUFF_COLOR, danceLean, characterMotion } from "@/lib/room/scene-layout";
import { BIRTHDAY_BADGE_MS, BIRTHDAY_CYCLE_MS } from "@/lib/birthdays/celebration";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("approved room refresh", () => {
  it("uses a genuinely square platform and matching walls, independent of camera rotation", () => {
    const source=readFileSync(join(process.cwd(),"components/office-scene.tsx"),"utf8");
    expect(source).toContain("box(28, 0.5, 28,");
    expect(source).toContain("box(0.45, 4, 28,");
    expect(source).toContain("0xf4efe6, 0, 2, -11.9");
    expect(source).not.toContain("box(28, 0.5, 19,");
  });
  it("has exactly two rows of five PCs and one dark blue puff per PC", () => {
    expect(WORKSTATIONS).toHaveLength(10);
    const rows = new Map<number, number>();
    WORKSTATIONS.forEach(({ z }) => rows.set(z, (rows.get(z) ?? 0) + 1));
    expect([...rows.values()]).toEqual([5, 5]);
    expect(new Set(WORKSTATIONS.map(({ x, z }) => `${x}:${z}`)).size).toBe(10);
    expect(PUFF_COLOR).toBe(0x243b60);
  });
  it("shows a birthday badge for twenty seconds followed by two whole minutes off", () => {
    expect(BIRTHDAY_BADGE_MS).toBe(20_000);
    expect(BIRTHDAY_CYCLE_MS).toBe(140_000);
  });
  it("allows translation while dancing, without enabling walking leg animation", () => {
    expect(characterMotion(true, true, false)).toEqual({ move: true, clip: "emote-yes" });
    expect(characterMotion(true, false, false)).toEqual({ move: true, clip: "walk" });
    expect(characterMotion(false, false, true)).toEqual({ move: false, clip: "sit" });
  });
  it("sways on either side of the feet and resets when not dancing", () => {
    expect(danceLean(false, 0.5)).toBe(0);
    expect(danceLean(true, 0.25)).toBeGreaterThan(0);
    expect(danceLean(true, 0.75)).toBeLessThan(0);
    expect(Math.abs(danceLean(true, 0.25))).toBeLessThanOrEqual(0.14);
  });
});
