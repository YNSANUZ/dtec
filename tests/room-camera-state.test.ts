import { describe, expect, it } from "vitest";
import { resolveRoomCameraState } from "@/lib/room/camera-state";

describe("resolveRoomCameraState", () => {
  it("starts with the framing camera when there is no saved view", () => {
    expect(resolveRoomCameraState(null, { radius: 35, phi: 1, theta: 0.5 })).toEqual({ radius: 35, phi: 1, theta: 0.5, zoom: 1 });
  });

  it("preserves orbit and zoom across a scene rebuild", () => {
    const view = { radius: 35, phi: 1.8, theta: -0.9, zoom: 1.7 };
    expect(resolveRoomCameraState(view, { radius: 35, phi: 1, theta: 0.5 })).toEqual(view);
  });
});
