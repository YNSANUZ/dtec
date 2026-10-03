import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAppointModerator } from "@/lib/room/roles";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  const { data: currentRole, error: roleError } = await supabase.from("room_staff").select("role").eq("room_slug", "dtec").eq("user_id", auth.claims.sub).maybeSingle();
  if (roleError || !canAppointModerator(currentRole?.role)) return NextResponse.json({ error: "adm_only" }, { status: 403 });
  const body = await request.json().catch(() => null) as { isLeader?: unknown } | null;
  if (typeof body?.isLeader !== "boolean") return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  if (id === auth.claims.sub) return NextResponse.json({ error: "adm_role_fixed" }, { status: 400 });
  const { data: targetProfile, error: targetProfileError } = await supabase.from("profiles").select("user_id").eq("user_id", id).maybeSingle();
  if (targetProfileError) return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  if (!targetProfile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  const result=await supabase.rpc("set_room_moderator",{p_room_slug:"dtec",p_user_id:id,p_enabled:body.isLeader});
  if(result.error)return NextResponse.json({error:"role_update_failed"},{status:result.error.code==="42501"?403:500});
  return NextResponse.json({ ok: true, isLeader: body.isLeader });
}
