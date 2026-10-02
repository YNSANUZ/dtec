import { z } from "zod";

const categories = ["futebol", "paintball", "kart", "outro"] as const;

const eventTimestamp = z.string()
  .datetime({ offset: true })
  .refine((value) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return false;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day <= daysInMonth;
  }, "Informe uma data e hora válidas.")
  .transform((value) => new Date(value).toISOString());

const roomEventInput = z.object({
  title: z.string().trim().min(1, "Informe o título do evento.").max(80, "O título deve ter até 80 caracteres."),
  description: z.string().trim().max(1000, "A descrição deve ter até 1000 caracteres.").default(""),
  category: z.enum(categories).default("outro"),
  startsAt: eventTimestamp.nullable().default(null),
  location: z.string().trim().max(160, "O local deve ter até 160 caracteres.").default(""),
}).strip();

const roomEventPatchInput = z.object({
  title: roomEventInput.shape.title.optional(),
  description: roomEventInput.shape.description.optional(),
  category: roomEventInput.shape.category.optional(),
  startsAt: eventTimestamp.nullable().optional(),
  location: roomEventInput.shape.location.optional(),
  status: z.enum(["open", "closed", "cancelled"]).optional(),
}).strip().refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export type NormalizedRoomEvent = {
  title: string;
  description: string;
  category: typeof categories[number];
  startsAt: string | null;
  location: string;
};

export function normalizeRoomEvent(input: unknown): NormalizedRoomEvent {
  const result = roomEventInput.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Evento inválido.");
  }
  return result.data;
}

export type NormalizedRoomEventPatch = Partial<NormalizedRoomEvent> & {
  status?: "open" | "closed" | "cancelled";
};

export function normalizeRoomEventPatch(input: unknown): NormalizedRoomEventPatch {
  const result = roomEventPatchInput.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Atualização de evento inválida.");
  }
  return result.data;
}
