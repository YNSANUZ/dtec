import { hasRoomRole, type MuralUser } from "./authorization";

export async function canPublishRoomContent(context: MuralUser, slug: string) {
  const { data, error } = await context.supabase.from("room_memberships")
    .select("status").eq("room_slug", slug).eq("user_id", context.userId).maybeSingle();
  return { allowed: data?.status === "active" && !error, failed: Boolean(error) };
}

export async function canChangeRoomContent(context: MuralUser, slug: string, creator: string | null) {
  const staff = await hasRoomRole(context, slug, ["owner", "leader"]);
  if (staff.failed || staff.allowed) return staff;
  if (creator !== context.userId) return { allowed: false, failed: false };
  return canPublishRoomContent(context, slug);
}
