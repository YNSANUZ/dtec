import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("profiles")
    .select("user_id, display_name, avatar_id, title, birth_day_month")
    .not("birth_day_month", "is", null);
  if (error) return NextResponse.json({ error: "birthdays_read_failed" }, { status: 500 });

  return NextResponse.json({ birthdays: (data ?? []).map((profile) => ({
    userId: profile.user_id,
    name: profile.display_name,
    avatar: profile.avatar_id,
    title: profile.title ?? "",
    birthDayMonth: profile.birth_day_month,
  })) });
}
