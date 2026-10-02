import { NextResponse } from "next/server";
import { normalizeMuralMessageId } from "@/lib/mural-validation";
import { normalizeRoomEvent, normalizeRoomEventPatch } from "@/lib/events/validation";
import { hasRoomRole } from "@/lib/rooms/authorization";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
import { readGooglePhotos } from "@/lib/rooms/google-photos";

const fields = "id, title, description, category, starts_at, location, status, created_by, created_at, updated_at";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function listRoomEvents(slugInput: string, includeArchived = false) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const { context, slug } = access;
  let query = context.supabase.from("room_events").select(fields).eq("room_slug", slug);
  if (!includeArchived) query = query.eq("status", "open");
  const { data: rows, error } = await query.order("starts_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) return json({ error: "events_read_failed" }, 500);
  const ids = (rows ?? []).map((r) => r.id);
  const members = new Map<string, Set<string>>();
  for (let start = 0; start < ids.length; start += 100) {
    const group = ids.slice(start, start + 100);
    for (let from = 0; ; from += 100) {
      const { data: interests, error: interestError } = await context.supabase.from("room_event_interests")
        .select("event_id, user_id").in("event_id", group).order("event_id").order("user_id").range(from, from + 99);
      if (interestError) return json({ error: "event_interests_read_failed" }, 500);
      for (const row of interests ?? []) {
        if (!group.includes(row.event_id)) continue;
        const people = members.get(row.event_id) ?? new Set<string>();
        people.add(row.user_id); members.set(row.event_id, people);
      }
      if ((interests ?? []).length < 100) break;
    }
  }
  const previewIds = new Map([...members].map(([id, people]) => [id, [...people].slice(0, 6)]));
  const photos = await readGooglePhotos(context.supabase, [...previewIds.values()].flat());
  return json({ events: (rows ?? []).map((r) => ({ id: r.id, title: r.title, description: r.description, category: r.category,
    startsAt: r.starts_at, location: r.location, status: r.status, interestCount: members.get(r.id)?.size ?? 0,
    photos: (previewIds.get(r.id) ?? []).map((id) => ({ photoUrl: photos.get(id) ?? null })) })) });
}

export async function createRoomEvent(request: Request, slugInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const role = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
  if (role.failed) return json({ error: "event_role_check_failed" }, 500);
  if (!role.allowed) return json({ error: "forbidden" }, 403);
  let event;
  try { event = normalizeRoomEvent(await request.json()); }
  catch { return json({ error: "invalid_event" }, 400); }
  const { data, error } = await access.context.supabase.from("room_events").insert({
    room_slug: access.slug, created_by: access.context.userId, title: event.title, description: event.description,
    category: event.category, starts_at: event.startsAt, location: event.location,
  }).select(fields).single();
  if (error) return json({ error: "event_create_failed" }, error.code === "42501" ? 403 : 500);
  return json({ event: data }, 201);
}

async function getEvent(slugInput: string, idInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access;
  let id;
  try { id = normalizeMuralMessageId(idInput); }
  catch { return { ok: false as const, response: json({ error: "invalid_event_id" }, 400) }; }
  const { data, error } = await access.context.supabase.from("room_events").select("id, status")
    .eq("room_slug", access.slug).eq("id", id).maybeSingle();
  if (error) return { ok: false as const, response: json({ error: "event_read_failed" }, 500) };
  if (!data) return { ok: false as const, response: json({ error: "event_not_found" }, 404) };
  return { ...access, event: data, id };
}

export async function updateRoomEvent(request: Request, slugInput: string, idInput: string) {
  const access = await getEvent(slugInput, idInput);
  if (!access.ok) return access.response;
  const role = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
  if (role.failed) return json({ error: "event_role_check_failed" }, 500);
  if (!role.allowed) return json({ error: "forbidden" }, 403);
  let patch;
  try { patch = normalizeRoomEventPatch(await request.json()); }
  catch { return json({ error: "invalid_event" }, 400); }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.startsAt !== undefined) updates.starts_at = patch.startsAt;
  if (patch.location !== undefined) updates.location = patch.location;
  if (patch.status !== undefined) updates.status = patch.status;
  const { data, error } = await access.context.supabase.from("room_events").update(updates)
    .eq("id", access.id).eq("room_slug", access.slug).select(fields).maybeSingle();
  if (error) return json({ error: "event_update_failed" }, error.code === "42501" ? 403 : 500);
  if (!data) return json({ error: "event_not_found" }, 404);
  return json({ event: data });
}

export async function roomEventInterest(request: Request, slugInput: string, idInput: string, method: "GET" | "POST" | "DELETE") {
  const access = await getEvent(slugInput, idInput);
  if (!access.ok) return access.response;
  const { context, id } = access;
  if (method === "GET") {
    const { data: rows, error } = await context.supabase.from("room_event_interests").select("user_id, created_at")
      .eq("event_id", id).order("created_at", { ascending: true });
    if (error) return json({ error: "event_interest_read_failed" }, 500);
    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profiles, error: profileError } = ids.length
      ? await context.supabase.from("profiles").select("user_id, display_name, avatar_id, title").in("user_id", ids)
      : { data: [], error: null };
    if (profileError) return json({ error: "event_interest_profiles_read_failed" }, 500);
    const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    return json({ interested: (rows ?? []).flatMap((r) => {
      const p = byId.get(r.user_id);
      return p ? [{ userId: p.user_id, name: p.display_name, avatar: p.avatar_id, title: p.title ?? "" }] : [];
    }), isInterested: ids.includes(context.userId) });
  }
  if (access.event.status !== "open") return json({ error: "event_closed" }, 409);
  const { error } = method === "POST"
    ? await context.supabase.from("room_event_interests").insert({ event_id: id, user_id: context.userId })
    : await context.supabase.from("room_event_interests").delete().eq("event_id", id).eq("user_id", context.userId);
  if (error && !(method === "POST" && error.code === "23505")) return json({ error: "event_interest_save_failed" }, error.code === "42501" ? 409 : 500);
  return json({ ok: true, isInterested: method === "POST" });
}
