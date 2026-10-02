import { describe, expect, it } from "vitest";
import { resolveRoomPositionState, type RoomPositionState } from "@/lib/room/position-state";

describe("resolveRoomPositionState", () => {
  it("keeps the live position, target, and action state for the same account", () => {
    const live: RoomPositionState = { ownerId: "user-a", x: 4, z: 2, targetX: 7, targetZ: 5, automatic: false, sitting: false };
    expect(resolveRoomPositionState(live, "user-a", { x: 0, z: 5 }, true)).toEqual(live);
  });

  it("initializes from saved presence when the account changes", () => {
    const live: RoomPositionState = { ownerId: "user-a", x: 4, z: 2, targetX: 7, targetZ: 5, automatic: false, sitting: true };
    expect(resolveRoomPositionState(live, "user-b", { x: -3, z: 6 }, true)).toEqual({
      ownerId: "user-b", x: -3, z: 6, targetX: -3, targetZ: 6, automatic: true, sitting: false,
    });
  });

  it("uses the initial spawn the first time a scene is created", () => {
    expect(resolveRoomPositionState(null, "visitor", { x: 1, z: -2 }, false)).toEqual({
      ownerId: "visitor", x: 1, z: -2, targetX: 1, targetZ: -2, automatic: false, sitting: false,
    });
  });
});
