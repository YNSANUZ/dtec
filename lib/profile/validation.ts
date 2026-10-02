import { z } from "zod";

export const avatarIds = ["a", "c", "f", "j", "n", "r"] as const;
export type AvatarId = (typeof avatarIds)[number];

const profileInput = z.object({
  displayName: z.string().transform((value) => value.trim().replace(/\s+/g, " ")).refine((value) => value.length <= 48, "Use no máximo 48 caracteres no nome."),
  avatarId: z.enum(avatarIds),
  title: z.string().optional().default("").transform((value) => value.trim().slice(0, 48)),
  bio: z.string().optional().default("").transform((value) => value.trim().slice(0, 280)),
  birthDayMonth: z.string().optional().default("").transform((value) => value.trim()).refine((value) => !value || /^\d{2}\/\d{2}$/.test(value), "Informe dia e mês no formato DD/MM."),
  whatsapp: z.string().optional().default("").transform((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  }).refine((value) => !value || /^\d{10,15}$/.test(value), "Informe um WhatsApp com DDI e DDD, usando de 10 a 15 dígitos."),
  instagram: z.string().optional().default("").transform((value) => value.trim().replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, ""))
    .refine((value) => !value || /^[A-Za-z0-9._]{1,30}$/.test(value), "Informe apenas o usuário do Instagram, com até 30 caracteres."),
}).strip();

export type NormalizedProfile = { displayName: string; avatarId: AvatarId; title: string; bio: string; birthDayMonth: string | null; whatsapp: string; instagram: string };

export function normalizeProfile(input: unknown): NormalizedProfile {
  const result = profileInput.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue?.path[0] === "avatarId") throw new Error("Escolha um personagem válido.");
    if (issue?.path[0] === "displayName") throw new Error(issue.message);
    if (issue?.path[0] === "whatsapp" || issue?.path[0] === "birthDayMonth" || issue?.path[0] === "instagram") throw new Error(issue.message);
    if (issue?.path[0] === "bio") throw new Error("A biografia deve ter até 280 caracteres.");
    throw new Error("Informe um nome válido.");
  }
  const nameParts = result.data.displayName.split(" ");
  if (nameParts.length !== 2 || nameParts.some((part) => part.length < 2)) {
    throw new Error("Informe seu nome e sobrenome, com dois nomes no total.");
  }
  let birthDayMonth: string | null = null;
  if (result.data.birthDayMonth) {
    const [, dayText, monthText] = result.data.birthDayMonth.match(/^(\d{2})\/(\d{2})$/) ?? [];
    const day = Number(dayText);
    const month = Number(monthText);
    const maxDay = new Date(Date.UTC(2000, month, 0)).getUTCDate();
    if (!day || !month || month > 12 || day > maxDay) {
      throw new Error("Informe um dia e mês válidos.");
    }
    birthDayMonth = `${monthText}-${dayText}`;
  }
  return { ...result.data, birthDayMonth };
}
