import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";

type RouteContext = { params: Promise<{ id: string }> };
type MuralUser = NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>;
type AuthorizedEventResult = { user: MuralUser; event: { id: string; status: string }; request: Request; response?: never }
  | { response: NextResponse; user?: never; event?: never; request?: never };
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

async function getEventState(supabase: NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>["supabase"], eventId: string) {
  const { data, error } = await supabase.from("room_events").select("id, status").eq("id", eventId).maybeSingle();
  if (error) return { event: null, failed: true };
  return { event: data, failed: false };
}

async function getAuthorizedEvent(request: Request, context: RouteContext): Promise<AuthorizedEventResult> {
  const user = await getMuralUserContext();
  if (!user) return { response: json({ error: "unauthorized" }, 401) } as const;
  const { id } = await context.params;
  const { event, failed } = await getEventState(user.supabase, id);
  if (failed) return { response: json({ error: "event_read_failed" }, 500) } as const;
  if (!event) return { response: json({ error: "event_not_found" }, 404) } as const;
  return { user, event, request };
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const result = await getAuthorizedEvent(request, context);
  if (result.response) return result.response;

  const { data: rows, error } = await result.user.supabase
    .from("room_event_interests")
    .select("user_id, created_at")
    .eq("event_id", result.event.id)
    .order("created_at", { ascending: true });
  if (error) return json({ error: "event_interest_read_failed" }, 500);
  const userIds = [...new Set((rows ?? []).map((row) => row.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await result.user.supabase.from("profiles").select("user_id, display_name, avatar_id, title").in("user_id", userIds)
    : { data: [], error: null };
  if (profilesError) return json({ error: "event_interest_profiles_read_failed" }, 500);
  const byUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const interested = (rows ?? []).flatMap((row) => {
    const profile = byUserId.get(row.user_id);
    return profile ? [{ userId: row.user_id, name: profile.display_name, avatar: profile.avatar_id, title: profile.title ?? "" }] : [];
  });
  return json({ interested, isInterested: userIds.includes(result.user.userId) });
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const result = await getAuthorizedEvent(request, context);
  if (result.response) return result.response;
  if (result.event.status !== "open") return json({ error: "event_closed" }, 409);
  const { error } = await result.user.supabase.from("room_event_interests").insert({
    event_id: result.event.id,
    user_id: result.user.userId,
  });
  if (error && error.code !== "23505") return json({ error: "event_interest_save_failed" }, 500);
  return json({ ok: true, isInterested: true });
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const result = await getAuthorizedEvent(request, context);
  if (result.response) return result.response;
  if (result.event.status !== "open") return json({ error: "event_closed" }, 409);
  const { error } = await result.user.supabase.from("room_event_interests")
    .delete()
    .eq("event_id", result.event.id)
    .eq("user_id", result.user.userId);
  if (error) return json({ error: "event_interest_remove_failed" }, 500);
  return json({ ok: true, isInterested: false });
}
