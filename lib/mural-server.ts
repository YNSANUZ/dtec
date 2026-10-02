import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getMuralUserContext() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) return null;
  return { supabase, userId, displayName: profile.display_name };
}
