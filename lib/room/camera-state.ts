export type RoomCameraState = { radius: number; phi: number; theta: number; zoom: number };

export function resolveRoomCameraState(saved: RoomCameraState | null, initial: Omit<RoomCameraState, "zoom">): RoomCameraState {
  return saved ?? { ...initial, zoom: 1 };
}
