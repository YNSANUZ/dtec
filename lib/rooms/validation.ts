import { z } from "zod";
import { normalizeRoomSlug } from "@/lib/rooms/slug";

const roomInput = z.object({
  slug: z.string(),
  title: z.string().trim().min(3).max(60),
  description: z.string().trim().max(280).optional().default(""),
});

export function normalizeNewRoom(input: unknown) {
  const parsed = roomInput.safeParse(input);
  if (!parsed.success) throw new Error("Informe nome e ID válidos para a sala.");
  return { ...parsed.data, slug: normalizeRoomSlug(parsed.data.slug) };
}
