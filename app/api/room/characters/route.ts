import { NextResponse } from "next/server";
import { visitorSpawn } from "@/lib/room/visitor-spawn";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "room_unavailable" }, { status: 503 });

  const { data: claims } = await supabase.auth.getClaims();
  const authenticated = typeof claims?.claims?.sub === "string";
  const [profileResult, presenceResult] = await Promise.all([
    authenticated
      ? supabase.from("profiles").select("user_id, display_name, avatar_id, title")
      : supabase.from("profiles").select("user_id, display_name, avatar_id"),
    supabase.from("room_presence").select("user_id, x, z, action, last_seen"),
  ]);
  if (profileResult.error || presenceResult.error) {
    return NextResponse.json({ error: "room_characters_read_failed" }, { status: 500 });
  }

  const profiles = (profileResult.data ?? []) as Array<{
    user_id: string;
    display_name: string;
    avatar_id: string;
    title?: string | null;
  }>;
  const presences = presenceResult.data ?? [];
  const presenceById = new Map(presences.map((presence) => [presence.user_id, presence]));
  const rolesById = new Map<string, "owner" | "leader">();
  if (authenticated) {
    const { data: roles, error } = await supabase.from("room_roles").select("user_id, role");
    if (error) return NextResponse.json({ error: "room_roles_read_failed" }, { status: 500 });
    for (const role of roles ?? []) {
      if (role.role === "owner" || role.role === "leader") rolesById.set(role.user_id, role.role);
    }
  }

  const onlineCutoff = Date.now() - 45_000;
  const users = profiles.map((profile) => {
    const presence = presenceById.get(profile.user_id);
    const spawn = visitorSpawn(profile.user_id);
    const online = Boolean(presence && Date.parse(presence.last_seen) > onlineCutoff);
    return {
      userId: profile.user_id,
      name: profile.display_name,
      avatar: profile.avatar_id,
      ...(authenticated ? { title: profile.title ?? "", role: rolesById.get(profile.user_id) ?? "member" } : {}),
      x: presence?.x ?? spawn.x,
      z: presence?.z ?? spawn.z,
      action: online ? presence!.action : "idle",
      online,
    };
  });

  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
