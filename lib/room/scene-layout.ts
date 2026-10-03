// Stable geometry configuration: presence polls never recreate the room.
export const PUFF_COLOR = 0x243b60;
export const WORKSTATIONS = [1.5, 5.5].flatMap(z => [-4, -1.5, 1, 3.5, 6].map(x => ({ x, z })));
export function danceLean(dancing: boolean, seconds: number) {
  return dancing ? Math.sin(seconds * Math.PI * 2) * 0.12 : 0;
}
export function characterMotion(moving: boolean, dancing: boolean, sitting: boolean) {
  return { move: moving, clip: dancing ? "emote-yes" : moving ? "walk" : sitting ? "sit" : "idle" };
}
