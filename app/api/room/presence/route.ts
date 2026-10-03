import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function context() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return error || typeof userId !== "string" ? null : { supabase, userId };
}

export async function GET() {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const membership=await auth.supabase.from("room_memberships").select("status").eq("room_slug","dtec").eq("user_id",auth.userId).maybeSingle();
  if(membership.error)return NextResponse.json({error:"membership_read_failed"},{status:500});
  if(membership.data?.status!=="active")return NextResponse.json({error:"room_membership_required"},{status:403});
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data: presence, error } = await auth.supabase.from("room_presence")
    .select("user_id, x, z, action, last_seen").gt("last_seen", cutoff);
  if (error) return NextResponse.json({ error: "presence_read_failed" }, { status: 500 });
  const ids = [...new Set((presence ?? []).map((row) => row.user_id))];
  if (!ids.length) return NextResponse.json({ users: [] });
  const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
    auth.supabase.from("profiles").select("user_id, display_name, avatar_id, title").in("user_id", ids),
    auth.supabase.from("room_staff").select("user_id, role").eq("room_slug", "dtec").in("user_id", ids),
  ]);
  if (profileError || roleError) return NextResponse.json({ error: "presence_profiles_read_failed" }, { status: 500 });
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const roleById = new Map((roles ?? []).map((role) => [role.user_id, role.role]));
  const users = (presence ?? []).flatMap((item) => {
    const profile = profileById.get(item.user_id);
    return profile ? [{
      userId: item.user_id,
      name: profile.display_name,
      avatar: profile.avatar_id,
      title: profile.title ?? "",
      role: roleById.get(item.user_id) ?? "member",
      x: item.x,
      z: item.z,
      action: item.action,
      lastSeen: item.last_seen,
    }] : [];
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.x !== "number" || !Number.isFinite(input.x) || input.x < -13 || input.x > 13
    || typeof input.z !== "number" || !Number.isFinite(input.z) || input.z < -7 || input.z > 11
    || !["idle", "walk", "sit", "dance"].includes(String(input.action))) {
    return NextResponse.json({ error: "invalid_presence" }, { status: 400 });
  }
  const { error } = await auth.supabase.from("room_presence").upsert({
    user_id: auth.userId,
    x: input.x,
    z: input.z,
    action: input.action,
    last_seen: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "presence_save_failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE() {
  const auth = await context();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Retain the last room coordinates so the member's character remains in the
  // office while offline; an old last_seen value removes the green status dot.
  const { error } = await auth.supabase.from("room_presence").update({
    action: "idle",
    last_seen: new Date(0).toISOString(),
  }).eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: "presence_clear_failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
