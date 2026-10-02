import { describe, expect, it } from "vitest";
import { resolveRoomPositionState, type RoomPositionState } from "@/lib/room/position-state";

describe("resolveRoomPositionState", () => {
  it("replaces only the temporary loading snapshot once authenticated restoration finishes", () => {
    const loading = resolveRoomPositionState(null, "user-a", { x: 0, z: 5 }, false);
    expect(resolveRoomPositionState(loading, "user-a", { x: 8, z: -2 }, true)).toEqual({
      ownerId: "user-a", x: 8, z: -2, targetX: 8, targetZ: -2, facing: 0, automatic: true, sitting: false, interactive: true,
    });
  });

  it("does not restore again after a ready user takes manual control or sits down", () => {
    const sitting: RoomPositionState = { ownerId: "user-a", x: 4, z: 2, targetX: 4, targetZ: 2, facing: 1.2, automatic: false, sitting: true, interactive: true };
    expect(resolveRoomPositionState(sitting, "user-a", { x: 0, z: 5 }, true)).toBe(sitting);
  });

  it("keeps the live position, target, and action state for the same account", () => {
    const live: RoomPositionState = { ownerId: "user-a", x: 4, z: 2, targetX: 7, targetZ: 5, facing: 1.2, automatic: false, sitting: false, interactive: true };
    expect(resolveRoomPositionState(live, "user-a", { x: 0, z: 5 }, true)).toEqual(live);
  });

  it("initializes from saved presence when the account changes", () => {
    const live: RoomPositionState = { ownerId: "user-a", x: 4, z: 2, targetX: 7, targetZ: 5, facing: 1.2, automatic: false, sitting: true, interactive: true };
    expect(resolveRoomPositionState(live, "user-b", { x: -3, z: 6 }, true)).toEqual({
      ownerId: "user-b", x: -3, z: 6, targetX: -3, targetZ: 6, facing: 0, automatic: true, sitting: false, interactive: true,
    });
  });

  it("uses the initial spawn the first time a scene is created", () => {
    expect(resolveRoomPositionState(null, "visitor", { x: 1, z: -2 }, false)).toEqual({
      ownerId: "visitor", x: 1, z: -2, targetX: 1, targetZ: -2, facing: 0, automatic: false, sitting: false, interactive: false,
    });
  });
});
