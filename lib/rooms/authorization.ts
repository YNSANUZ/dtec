import { getMuralUserContext } from "@/lib/mural-server";

export type MuralUser = NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>;
export type RoomRole = "owner" | "leader";

export async function hasRoomRole(
  context: MuralUser,
  slug: string,
  roles: readonly RoomRole[],
): Promise<{ allowed: boolean; failed: boolean }> {
  const { data, error } = await context.supabase.from("room_staff")
    .select("role")
    .eq("room_slug", slug)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) return { allowed: false, failed: true };
  return { allowed: roles.includes(data?.role as RoomRole), failed: false };
}
