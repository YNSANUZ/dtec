import { z } from "zod";

export const avatarIds = ["a", "c", "f", "j", "n", "r"] as const;
export type AvatarId = (typeof avatarIds)[number];

const profileInput = z.object({
  displayName: z.string().transform((value) => value.trim().slice(0, 18)),
  avatarId: z.enum(avatarIds),
}).strip();

export function normalizeProfile(input: unknown): { displayName: string; avatarId: AvatarId } {
  const result = profileInput.safeParse(input);
  if (!result.success) {
    const avatarIssue = result.error.issues.some((issue) => issue.path[0] === "avatarId");
    throw new Error(avatarIssue ? "Escolha um personagem válido." : "Informe um nome válido.");
  }
  if (!result.data.displayName) throw new Error("Informe um nome válido.");
  return result.data;
}
