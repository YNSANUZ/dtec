import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
  const [{ data: profile, error }, { data: role, error: roleError }] = await Promise.all([
    supabase.from("profiles").select("user_id, display_name, avatar_id, title, bio, birth_day_month, whatsapp").eq("user_id", id).maybeSingle(),
    supabase.from("room_roles").select("role").eq("user_id", id).maybeSingle(),
  ]);
  if (error || roleError) return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ user: {
    userId: profile.user_id,
    name: profile.display_name,
    avatar: profile.avatar_id,
    title: profile.title ?? "",
    bio: profile.bio ?? "",
    birthDayMonth: profile.birth_day_month ? `${profile.birth_day_month.slice(3, 5)}/${profile.birth_day_month.slice(0, 2)}` : null,
    whatsapp: profile.whatsapp ?? "",
    role: role?.role ?? "member",
  } });
}
