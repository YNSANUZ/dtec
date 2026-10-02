import { NextResponse } from "next/server";
import { normalizeRoomSlug } from "@/lib/rooms/slug";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ slug: string }> };

async function roomSlug(context: Context) {
  try { return normalizeRoomSlug((await context.params).slug); } catch { return null; }
}

export async function GET(_request: Request, context: Context) {
  const slug = await roomSlug(context);
  if (!slug) return NextResponse.json({ error: "invalid_room_id" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "room_unavailable" }, { status: 503 });
  const { data: positions, error } = await supabase.from("room_member_presence")
    .select("user_id, x, z, action, last_seen")
    .eq("room_slug", slug);
  if (error) return NextResponse.json({ error: "presence_read_failed" }, { status: 500 });
  const ids = [...new Set((positions ?? []).map((row) => row.user_id))];
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("profiles").select("user_id, display_name, avatar_id").in("user_id", ids)
    : { data: [], error: null };
  if (profileError) return NextResponse.json({ error: "presence_profiles_read_failed" }, { status: 500 });
  const { data: birthdays, error: birthdayError } = ids.length
    ? await supabase.rpc("birthday_today_user_ids") : { data: [], error: null };
  if (birthdayError) return NextResponse.json({ error: "room_birthday_signal_read_failed" }, { status: 500 });
  const birthdayIds = new Set((birthdays ?? []).map((entry: { user_id: string }) => entry.user_id));
  const byId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const cutoff = Date.now() - 45_000;
  return NextResponse.json({ users: (positions ?? []).flatMap((position) => {
    const profile = byId.get(position.user_id);
    if (!profile) return [];
    const online = Date.parse(position.last_seen) > cutoff;
    return [{ userId: position.user_id, name: profile.display_name, avatar: profile.avatar_id,
      x: position.x, z: position.z, action: online ? position.action : "idle", online,
      birthdayToday: birthdayIds.has(position.user_id), message: "" }];
  }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const slug = await roomSlug(context);
  if (!slug) return NextResponse.json({ error: "invalid_room_id" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "room_unavailable" }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let input: Record<string, unknown>;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    input = body as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  if (typeof input.x !== "number" || !Number.isFinite(input.x) || input.x < -13 || input.x > 13
    || typeof input.z !== "number" || !Number.isFinite(input.z) || input.z < -7 || input.z > 11
    || !["idle", "walk", "sit", "dance"].includes(String(input.action))) {
    return NextResponse.json({ error: "invalid_presence" }, { status: 400 });
  }
  const { error } = await supabase.from("room_member_presence").upsert({
    room_slug: slug, user_id: userId, x: input.x, z: input.z, action: input.action,
    last_seen: new Date().toISOString(),
  }, { onConflict: "room_slug,user_id" });
  if (error?.code === "23503") return NextResponse.json({ error: "room_or_profile_not_found" }, { status: 404 });
  if (error) return NextResponse.json({ error: "presence_save_failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
