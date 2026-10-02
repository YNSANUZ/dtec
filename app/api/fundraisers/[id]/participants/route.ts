import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { hasFundraiserManagerRole } from "@/lib/fundraisers/server";

type RouteContext = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

function isUserId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTarget(request: Request, currentUserId: string) {
  const body = await request.json().catch(() => ({})) as { userId?: unknown };
  if (body.userId === undefined) return { userId: currentUserId };
  return isUserId(body.userId) ? { userId: body.userId } : { error: "invalid_user_id" };
}

async function canManageTarget(user: NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>, targetUserId: string) {
  if (targetUserId === user.userId) return { allowed: true, failed: false };
  const result = await hasFundraiserManagerRole(user);
  return result;
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const target = await resolveTarget(request, user.userId);
  if ("error" in target) return json({ error: target.error }, 400);
  const permission = await canManageTarget(user, target.userId);
  if (permission.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
  if (!permission.allowed) return json({ error: "forbidden" }, 403);
  const { id } = await context.params;
  const [{ data: campaign, error: campaignError }, { data: profile, error: profileError }] = await Promise.all([
    user.supabase.from("fundraisers").select("status").eq("id", id).maybeSingle(),
    user.supabase.from("profiles").select("user_id").eq("user_id", target.userId).maybeSingle(),
  ]);
  if (campaignError || profileError) return json({ error: "fundraiser_participant_read_failed" }, 500);
  if (!campaign || campaign.status !== "open") return json({ error: "fundraiser_not_open" }, 409);
  if (!profile) return json({ error: "profile_not_found" }, 404);
  const { data: participant, error: participantError } = await user.supabase.from("fundraiser_participants")
    .select("active")
    .eq("fundraiser_id", id)
    .eq("user_id", target.userId)
    .maybeSingle();
  if (participantError) return json({ error: "fundraiser_participant_read_failed" }, 500);
  if (participant?.active) return json({ ok: true, active: true });
  if (participant) {
    const { error } = await user.supabase.from("fundraiser_participants").update({ active: true, ended_at: null })
      .eq("fundraiser_id", id).eq("user_id", target.userId);
    if (error) return json({ error: "fundraiser_participant_update_failed" }, 500);
    return json({ ok: true, active: true });
  }
  const { error } = await user.supabase.from("fundraiser_participants").insert({ fundraiser_id: id, user_id: target.userId });
  if (error && error.code !== "23505") return json({ error: "fundraiser_participant_add_failed" }, 500);
  return json({ ok: true, active: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const target = await resolveTarget(request, user.userId);
  if ("error" in target) return json({ error: target.error }, 400);
  const permission = await canManageTarget(user, target.userId);
  if (permission.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
  if (!permission.allowed) return json({ error: "forbidden" }, 403);
  const { id } = await context.params;
  const { data: participant, error: participantError } = await user.supabase.from("fundraiser_participants")
    .select("active")
    .eq("fundraiser_id", id)
    .eq("user_id", target.userId)
    .maybeSingle();
  if (participantError) return json({ error: "fundraiser_participant_read_failed" }, 500);
  if (!participant || !participant.active) return json({ ok: true, active: false });
  const { error } = await user.supabase.from("fundraiser_participants").update({ active: false, ended_at: new Date().toISOString() })
    .eq("fundraiser_id", id)
    .eq("user_id", target.userId);
  if (error) return json({ error: "fundraiser_participant_remove_failed" }, 500);
  return json({ ok: true, active: false });
}
