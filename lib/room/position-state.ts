export type RoomPositionState = {
  ownerId: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  facing: number;
  automatic: boolean;
  sitting: boolean;
};

export function resolveRoomPositionState(
  saved: RoomPositionState | null,
  ownerId: string,
  initial: { x: number; z: number },
  automatic: boolean,
): RoomPositionState {
  if (saved?.ownerId === ownerId) return saved;
  return {
    ownerId,
    x: initial.x,
    z: initial.z,
    targetX: initial.x,
    targetZ: initial.z,
    facing: 0,
    automatic,
    sitting: false,
  };
}
