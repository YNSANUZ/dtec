import { z } from "zod";

const messageInput = z.object({
  content: z.string().trim().min(1, "Escreva um recado.").max(1000, "O recado deve ter até 1000 caracteres."),
}).strip();

export function normalizeMuralMessage(input: unknown): { content: string } {
  const result = messageInput.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Recado inválido.");
  }
  return result.data;
}

export function normalizeMuralMessageId(input: string): string {
  const result = z.string().uuid().safeParse(input);
  if (!result.success) throw new Error("Recado não encontrado.");
  return result.data;
}
