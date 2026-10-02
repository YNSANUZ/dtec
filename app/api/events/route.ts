import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeRoomEvent } from "@/lib/events/validation";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

async function hasEventManagerRole(supabase: NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>["supabase"], userId: string) {
  const { data, error } = await supabase
    .from("room_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { allowed: false, failed: true };
  return { allowed: data?.role === "owner" || data?.role === "leader", failed: false };
}

export async function GET() {
  const context = await getMuralUserContext();
  if (!context) return json({ error: "unauthorized" }, 401);

  const { data: rows, error } = await context.supabase
    .from("room_events")
    .select("id, title, description, category, starts_at, location, status, created_by, created_at, updated_at")
    .eq("status", "open")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return json({ error: "events_read_failed" }, 500);

  const eventIds = (rows ?? []).map((row) => row.id);
  const { data: interestRows, error: interestsError } = eventIds.length
    ? await context.supabase.from("room_event_interests").select("event_id").in("event_id", eventIds)
    : { data: [], error: null };
  if (interestsError) return json({ error: "event_interests_read_failed" }, 500);

  const interestCounts = new Map<string, number>();
  for (const row of interestRows ?? []) interestCounts.set(row.event_id, (interestCounts.get(row.event_id) ?? 0) + 1);
  const events = (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    startsAt: row.starts_at,
    location: row.location,
    status: row.status,
    interestCount: interestCounts.get(row.id) ?? 0,
  }));
  return json({ events });
}

export async function POST(request: Request) {
  const context = await getMuralUserContext();
  if (!context) return json({ error: "unauthorized" }, 401);
  const manager = await hasEventManagerRole(context.supabase, context.userId);
  if (manager.failed) return json({ error: "event_role_check_failed" }, 500);
  if (!manager.allowed) return json({ error: "forbidden" }, 403);

  let event;
  try {
    event = normalizeRoomEvent(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Evento inválido." }, 400);
  }

  const { data, error } = await context.supabase
    .from("room_events")
    .insert({
      title: event.title,
      description: event.description,
      category: event.category,
      starts_at: event.startsAt,
      location: event.location,
      created_by: context.userId,
    })
    .select("id, title, description, category, starts_at, location, status, created_by, created_at, updated_at")
    .single();
  if (error) return json({ error: "event_create_failed" }, 500);
  return json({ event: data }, 201);
}
