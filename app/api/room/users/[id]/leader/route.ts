import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  const { data: currentRole, error: roleError } = await supabase.from("room_roles").select("role").eq("user_id", auth.claims.sub).maybeSingle();
  if (roleError || currentRole?.role !== "owner") return NextResponse.json({ error: "owner_only" }, { status: 403 });
  const body = await request.json().catch(() => null) as { isLeader?: unknown } | null;
  if (typeof body?.isLeader !== "boolean") return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  if (id === auth.claims.sub) return NextResponse.json({ error: "owner_role_fixed" }, { status: 400 });
  const result = body.isLeader
    ? await supabase.from("room_roles").insert({ user_id: id, role: "leader", appointed_by: auth.claims.sub })
    : await supabase.from("room_roles").delete().eq("user_id", id).eq("role", "leader");
  if (body.isLeader && result.error?.code === "23505") return NextResponse.json({ ok: true, isLeader: true });
  if (result.error) return NextResponse.json({ error: "role_update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, isLeader: body.isLeader });
}
