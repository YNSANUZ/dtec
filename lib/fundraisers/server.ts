import { getMuralUserContext } from "@/lib/mural-server";

export type MuralUser = NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>;

export async function hasFundraiserManagerRole(user: MuralUser) {
  const { data, error } = await user.supabase
    .from("room_roles")
    .select("role")
    .eq("user_id", user.userId)
    .maybeSingle();
  if (error) return { allowed: false, failed: true };
  return { allowed: data?.role === "owner" || data?.role === "leader", failed: false };
}
