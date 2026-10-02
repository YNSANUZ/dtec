import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const validActivity = (value: string | null) => value === "kart";

async function getUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return error || typeof userId !== "string" ? null : { supabase, userId };
}

export async function GET(request: Request) {
  const auth = await getUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const activity = new URL(request.url).searchParams.get("activity");
  if (!validActivity(activity)) return NextResponse.json({ error: "invalid_activity" }, { status: 400 });
  const { data: interests, error } = await auth.supabase.from("activity_interests").select("user_id, created_at").eq("activity_key", activity).order("created_at");
  if (error) return NextResponse.json({ error: "interest_read_failed" }, { status: 500 });
  const ids = [...new Set((interests ?? []).map((item) => item.user_id))];
  if (!ids.length) return NextResponse.json({ interested: [] });
  const { data: profiles, error: profileError } = await auth.supabase.from("profiles").select("user_id, display_name, avatar_id, title").in("user_id", ids);
  if (profileError) return NextResponse.json({ error: "interest_profiles_read_failed" }, { status: 500 });
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const interested = (interests ?? []).flatMap((item) => {
    const profile = profilesById.get(item.user_id);
    return profile ? [{ userId: item.user_id, name: profile.display_name, avatar: profile.avatar_id, title: profile.title ?? "" }] : [];
  });
  return NextResponse.json({ interested, isInterested: ids.includes(auth.userId) });
}

export async function POST(request: Request) {
  const auth = await getUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { activity?: unknown } | null;
  if (!validActivity(typeof body?.activity === "string" ? body.activity : null)) return NextResponse.json({ error: "invalid_activity" }, { status: 400 });
  const { error } = await auth.supabase.from("activity_interests").insert({ activity_key: body!.activity, user_id: auth.userId });
  if (error && error.code !== "23505") return NextResponse.json({ error: "interest_save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, isInterested: true });
}

export async function DELETE(request: Request) {
  const auth = await getUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const activity = new URL(request.url).searchParams.get("activity");
  if (!validActivity(activity)) return NextResponse.json({ error: "invalid_activity" }, { status: 400 });
  const { error } = await auth.supabase.from("activity_interests").delete().eq("activity_key", activity).eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: "interest_remove_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, isInterested: false });
}
