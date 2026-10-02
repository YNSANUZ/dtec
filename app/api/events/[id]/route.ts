import { NextResponse } from "next/server";
import { z } from "zod";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeRoomEventPatch } from "@/lib/events/validation";
import { hasRoomRole } from "@/lib/rooms/authorization";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getMuralUserContext();
  if (!context) return json({ error: "unauthorized" }, 401);

  const role = await hasRoomRole(context, "dtec", ["owner", "leader"]);
  if (role.failed) return json({ error: "event_role_check_failed" }, 500);
  if (!role.allowed) return json({ error: "forbidden" }, 403);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return json({ error: "invalid_event_id" }, 400);

  let patch;
  try {
    patch = normalizeRoomEventPatch(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Atualização de evento inválida." }, 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.startsAt !== undefined) updates.starts_at = patch.startsAt;
  if (patch.location !== undefined) updates.location = patch.location;
  if (patch.status !== undefined) updates.status = patch.status;

  const { data, error } = await context.supabase
    .from("room_events")
    .update(updates)
    .eq("id", id)
    .eq("room_slug", "dtec")
    .select("id, title, description, category, starts_at, location, status, created_by, created_at, updated_at")
    .maybeSingle();
  if (error) return json({ error: "event_update_failed" }, 500);
  if (!data) return json({ error: "event_not_found" }, 404);
  return json({ event: data });
}
