import { NextResponse } from "next/server";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
import { normalizeMuralMessageId } from "@/lib/mural-validation";
import { normalizeRoomRole } from "@/lib/room/roles";
import { normalizeProfile } from "@/lib/profile/validation";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const publicFields = "user_id, display_name, avatar_id, title";
const profileFields = `${publicFields}, bio, birth_day_month, whatsapp, instagram`;
type Profile = { user_id: string; display_name: string; avatar_id: string; title: string; bio?: string; birth_day_month?: string | null; whatsapp?: string; instagram?: string };
type Staff = { user_id: string; role: string };
const serialize = (profile: Profile, role: unknown) => ({ userId: profile.user_id, name: profile.display_name, avatar: profile.avatar_id, title: profile.title ?? "", role: normalizeRoomRole(role) });

async function getPeopleContext(slugInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access;
  const { data, error } = await access.context.supabase.from("profiles").select(profileFields).eq("user_id", access.context.userId).maybeSingle();
  if (error) return { ok: false as const, response: json({ error: "profile_read_failed" }, 500) };
  try {
    if (!data) throw new Error();
    normalizeProfile({ displayName: data.display_name, avatarId: data.avatar_id, title: data.title ?? "", bio: data.bio ?? "", birthDayMonth: data.birth_day_month ? `${data.birth_day_month.slice(3, 5)}/${data.birth_day_month.slice(0, 2)}` : "", whatsapp: data.whatsapp ?? "", instagram: data.instagram ?? "" });
  } catch { return { ok: false as const, response: json({ error: "profile_required" }, 401) }; }
  return access;
}

export async function listRoomPeople(slugInput: string) {
  const access = await getPeopleContext(slugInput);
  if (!access.ok) return access.response;
  const { context, slug } = access;
  const { data: presence, error } = await context.supabase.from("room_member_presence").select("user_id").eq("room_slug", slug);
  if (error) return json({ error: "room_people_read_failed" }, 500);
  const ids = (presence ?? []).map((row) => row.user_id);
  if (!ids.length) return json({ users: [] });
  const { data: profiles, error: profileError } = await context.supabase.from("profiles").select(publicFields).in("user_id", ids);
  const { data: staff, error: staffError } = await context.supabase.from("room_staff").select("user_id, role").eq("room_slug", slug).in("user_id", ids);
  if (profileError || staffError) return json({ error: "room_people_read_failed" }, 500);
  const roles = new Map((staff as Staff[] ?? []).map((row) => [row.user_id, row.role]));
  return json({ users: (profiles as Profile[] ?? []).map((profile) => serialize(profile, roles.get(profile.user_id))) });
}

export async function listRoomBirthdays(slugInput: string) {
  const access = await getPeopleContext(slugInput);
  if (!access.ok) return access.response;
  const { context, slug } = access;
  // Persisted membership includes offline people, never members of another room.
  const { data: presence, error } = await context.supabase.from("room_member_presence").select("user_id").eq("room_slug", slug);
  if (error) return json({ error: "room_birthdays_read_failed" }, 500);
  const ids = [...new Set((presence ?? []).map((row) => row.user_id))];
  if (!ids.length) return json({ birthdays: [] });
  const { data, error: profileError } = await context.supabase.from("profiles").select(`${publicFields}, birth_day_month`).in("user_id", ids);
  if (profileError) return json({ error: "room_birthdays_read_failed" }, 500);
  return json({ birthdays: (data as Profile[] ?? []).flatMap((profile) => {
    const date = profile.birth_day_month;
    if (!date || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return [];
    const [month, day] = date.split("-").map(Number);
    const sample = new Date(Date.UTC(2000, month - 1, day));
    if (sample.getUTCMonth() !== month - 1 || sample.getUTCDate() !== day) return [];
    return [{ userId: profile.user_id, name: profile.display_name, avatar: profile.avatar_id, title: profile.title ?? "", birthDayMonth: date }];
  }) });
}

export async function readRoomPerson(slugInput: string, idInput: string) {
  const access = await getPeopleContext(slugInput);
  if (!access.ok) return access.response;
  let id: string;
  try { id = normalizeMuralMessageId(idInput); }
  catch { return json({ error: "invalid_user_id" }, 400); }
  const { context, slug } = access;
  // Check this room before looking up the global profile, even for an ADM elsewhere.
  const { data: presence, error } = await context.supabase.from("room_member_presence").select("user_id").eq("room_slug", slug).eq("user_id", id).maybeSingle();
  if (error) return json({ error: "room_people_read_failed" }, 500);
  if (!presence) return json({ error: "user_not_found" }, 404);
  const { data: profile, error: profileError } = await context.supabase.from("profiles").select(profileFields).eq("user_id", id).maybeSingle();
  const { data: staff, error: staffError } = await context.supabase.from("room_staff").select("role").eq("room_slug", slug).eq("user_id", id).maybeSingle();
  if (profileError || staffError) return json({ error: "room_people_read_failed" }, 500);
  if (!profile) return json({ error: "user_not_found" }, 404);
  const birthday = profile.birth_day_month?.match(/^(\d{2})-(\d{2})$/);
  return json({ user: { ...serialize(profile, staff?.role), bio: profile.bio ?? "", birthDayMonth: birthday ? `${birthday[2]}/${birthday[1]}` : null, whatsapp: profile.whatsapp ?? "", instagram: profile.instagram ?? "" } });
}
