export type RoomPositionState = {
  ownerId: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  facing: number;
  automatic: boolean;
  sitting: boolean;
  interactive: boolean;
};

export function resolveRoomPositionState(
  saved: RoomPositionState | null,
  ownerId: string,
  initial: { x: number; z: number },
  interactive: boolean,
): RoomPositionState {
  // A loading/visitor frame is not the authenticated character's restored
  // position. Once restoration finishes, replace that temporary snapshot.
  if (saved?.ownerId === ownerId && !(interactive && !saved.interactive)) {
    return saved.interactive === interactive ? saved : { ...saved, interactive };
  }
  return {
    ownerId,
    x: initial.x,
    z: initial.z,
    targetX: initial.x,
    targetZ: initial.z,
    facing: 0,
    automatic: interactive,
    sitting: false,
    interactive,
  };
}
