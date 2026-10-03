import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeProfile } from "@/lib/profile/validation";

export async function getMuralUserContext() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, avatar_id, title, bio, birth_day_month, whatsapp, instagram")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) return null;
  // Match onboarding: a legacy row can exist while its profile still needs setup.
  try {
    normalizeProfile({
      displayName: profile.display_name,
      avatarId: profile.avatar_id,
      title: profile.title ?? "",
      bio: profile.bio ?? "",
      birthDayMonth: profile.birth_day_month ? `${profile.birth_day_month.slice(3, 5)}/${profile.birth_day_month.slice(0, 2)}` : "",
      whatsapp: profile.whatsapp ?? "",
      instagram: profile.instagram ?? "",
    });
  } catch {
    return null;
  }
  return { supabase, userId, displayName: profile.display_name };
}
