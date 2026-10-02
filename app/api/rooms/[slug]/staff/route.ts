import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { hasRoomRole, type MuralUser } from "@/lib/rooms/authorization";
import { normalizeRoomSlug } from "@/lib/rooms/slug";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";

type RouteContext = { params: Promise<{ slug: string }> };
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

type Access = { ok: false; response: NextResponse } | { ok: true; user: MuralUser; slug: string };

async function authorize(context: RouteContext): Promise<Access> {
  let slug: string;
  try { slug = normalizeRoomSlug((await context.params).slug); }
  catch { return { ok: false, response: json({ error: "invalid_room" }, 400) }; }
  const user = await getMuralUserContext();
  if (!user) return { ok: false, response: json({ error: "unauthorized" }, 401) };
  const { data: room, error: roomError } = await user.supabase.from("rooms").select("slug").eq("slug", slug).maybeSingle();
  if (roomError) return { ok: false, response: json({ error: "room_read_failed" }, 500) };
  if (!room) return { ok: false, response: json({ error: "room_not_found" }, 404) };
  const owner = await hasRoomRole(user, slug, ["owner"]);
  if (owner.failed) return { ok: false, response: json({ error: "room_role_check_failed" }, 500) };
  if (!owner.allowed) return { ok: false, response: json({ error: "forbidden" }, 403) };
  return { ok: true, user, slug };
}

async function targetId(request: Request) {
  const body = await request.json().catch(() => null) as { userId?: unknown } | null;
  return typeof body?.userId === "string" && userIdPattern.test(body.userId) ? body.userId : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await getRoomMuralContext((await context.params).slug);
  if (!access.ok) return access.response;
  const { data, error } = await access.context.supabase.from("room_staff")
    .select("role").eq("room_slug", access.slug).eq("user_id", access.context.userId).maybeSingle();
  if (error) return json({ error: "room_role_read_failed" }, 500);
  return json({ role: data?.role ?? null, canManage: data?.role === "owner" || data?.role === "leader" });
}

export async function POST(request: Request, context: RouteContext) {
  const access = await authorize(context);
  if (!access.ok) return access.response;
  const userId = await targetId(request);
  if (!userId) return json({ error: "invalid_user_id" }, 400);
  const { data: profile, error: profileError } = await access.user.supabase.from("profiles")
    .select("user_id").eq("user_id", userId).maybeSingle();
  if (profileError) return json({ error: "profile_read_failed" }, 500);
  if (!profile) return json({ error: "profile_not_found" }, 404);
  const { data: existing, error: existingError } = await access.user.supabase.from("room_staff")
    .select("role").eq("room_slug", access.slug).eq("user_id", userId).maybeSingle();
  if (existingError) return json({ error: "room_role_check_failed" }, 500);
  if (existing?.role === "owner") return json({ error: "adm_role_fixed" }, 403);
  if (existing?.role === "leader") return json({ ok: true, isLeader: true });
  const { error } = await access.user.supabase.from("room_staff").insert({
    room_slug: access.slug, user_id: userId, role: "leader", appointed_by: access.user.userId,
  });
  if (error?.code === "23505") return json({ ok: true, isLeader: true });
  if (error) return json({ error: "room_role_update_failed" }, 500);
  return json({ ok: true, isLeader: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await authorize(context);
  if (!access.ok) return access.response;
  const userId = await targetId(request);
  if (!userId) return json({ error: "invalid_user_id" }, 400);
  const { data: existing, error: existingError } = await access.user.supabase.from("room_staff")
    .select("role").eq("room_slug", access.slug).eq("user_id", userId).maybeSingle();
  if (existingError) return json({ error: "room_role_check_failed" }, 500);
  if (!existing) return json({ error: "room_staff_not_found" }, 404);
  if (existing.role === "owner") return json({ error: "adm_role_fixed" }, 403);
  const { error } = await access.user.supabase.from("room_staff").delete()
    .eq("room_slug", access.slug).eq("user_id", userId).eq("role", "leader");
  if (error) return json({ error: "room_role_update_failed" }, 500);
  return json({ ok: true, isLeader: false });
}
