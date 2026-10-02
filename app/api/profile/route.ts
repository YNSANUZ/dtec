import { NextResponse } from "next/server";
import { normalizeProfile } from "@/lib/profile/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function authenticatedContext() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { supabase, userId };
}

export async function GET() {
  const context = await authenticatedContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await context.supabase
    .from("profiles")
    .select("display_name, avatar_id, title, bio, birth_day_month, whatsapp, instagram")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ profile: null });
  let profile;
  try {
    profile = normalizeProfile({
      displayName: data.display_name,
      avatarId: data.avatar_id,
      title: data.title ?? "",
      bio: data.bio ?? "",
      birthDayMonth: data.birth_day_month ? `${data.birth_day_month.slice(3, 5)}/${data.birth_day_month.slice(0, 2)}` : "",
      whatsapp: data.whatsapp ?? "",
      instagram: data.instagram ?? "",
    });
  } catch {
    // Existing profiles that do not yet match the two-name format complete onboarding again.
    return NextResponse.json({ profile: null });
  }
  return NextResponse.json({
    profile: {
      ...profile,
      birthDayMonth: profile.birthDayMonth ? `${profile.birthDayMonth.slice(3, 5)}/${profile.birthDayMonth.slice(0, 2)}` : null,
    },
  });
}

export async function PUT(request: Request) {
  const context = await authenticatedContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let profile;
  try {
    profile = normalizeProfile(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }

  const profileFields = {
    display_name: profile.displayName,
    avatar_id: profile.avatarId,
    title: profile.title,
    bio: profile.bio,
    birth_day_month: profile.birthDayMonth,
    whatsapp: profile.whatsapp,
    instagram: profile.instagram,
    updated_at: new Date().toISOString(),
  };

  // Keep INSERT and UPDATE separate: the database intentionally does not grant
  // UPDATE on user_id, while PostgREST upsert may include it in the UPDATE set.
  const { data: existingProfile, error: lookupError } = await context.supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (lookupError) {
    console.error("Profile lookup before save failed", lookupError);
    return NextResponse.json({ error: "profile_save_failed" }, { status: 500 });
  }

  const saveQuery = existingProfile
    ? context.supabase.from("profiles").update(profileFields).eq("user_id", context.userId)
    : context.supabase.from("profiles").insert({ user_id: context.userId, ...profileFields });

  const { data, error } = await saveQuery
    .select("display_name, avatar_id, title, bio, birth_day_month, whatsapp, instagram")
    .single();

  if (error) {
    console.error("Profile save failed", error);
    return NextResponse.json({ error: "profile_save_failed" }, { status: 500 });
  }
  return NextResponse.json({
    profile: { displayName: data.display_name, avatarId: data.avatar_id, title: data.title ?? "", bio: data.bio ?? "", birthDayMonth: data.birth_day_month ? `${data.birth_day_month.slice(3, 5)}/${data.birth_day_month.slice(0, 2)}` : null, whatsapp: data.whatsapp ?? "", instagram: data.instagram ?? "" },
  });
}
