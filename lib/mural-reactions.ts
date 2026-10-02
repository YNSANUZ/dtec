export type MuralReaction = "like" | "dislike";

export function normalizeMuralReaction(input: unknown): MuralReaction {
  if (typeof input !== "object" || input === null || !("reaction" in input)) {
    throw new Error("Escolha curtir ou descurtir.");
  }
  const reaction = input.reaction;
  if (reaction !== "like" && reaction !== "dislike") throw new Error("Reação inválida.");
  return reaction;
}

export function toggleMuralReaction(current: MuralReaction | null, requested: MuralReaction): MuralReaction | null {
  if (current === requested) return null;
  return requested;
}
