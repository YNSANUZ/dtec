export function visitorSpawn(userId: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < userId.length; index += 1) {
    hash = Math.imul(hash ^ userId.charCodeAt(index), 16_777_619) >>> 0;
  }
  const slot = hash % 35;
  return {
    x: -10.5 + (slot % 7) * 3.5,
    z: -4 + Math.floor(slot / 7) * 3,
  };
}
