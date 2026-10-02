import { NextResponse } from "next/server";
import { normalizeMuralMessageId } from "@/lib/mural-validation";
import { normalizeFundraiser, normalizeFundraiserPatch } from "@/lib/fundraisers/validation";
import { hasRoomRole, type MuralUser } from "@/lib/rooms/authorization";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
import { readGooglePhotos } from "@/lib/rooms/google-photos";
const fields = "id, title, description, monthly_amount_cents, due_day, pix_key, payment_instructions, status, created_by, created_at, updated_at";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function listRoomFundraisers(slugInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const user = access.context;
  const { data: campaigns, error } = await user.supabase
    .from("fundraisers")
    .select("id, title, description, monthly_amount_cents, due_day, pix_key, payment_instructions, status, created_by, created_at, updated_at")
    .eq("room_slug", access.slug)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) return json({ error: "fundraisers_read_failed" }, 500);

  const results = await Promise.all((campaigns ?? []).map(async (campaign) => {
    const { data: cycleDueDate, error: cycleError } = await user.supabase.rpc("ensure_room_fundraiser_current_cycle", {
      p_room_slug: access.slug,
      p_fundraiser_id: campaign.id,
    });
    if (cycleError || typeof cycleDueDate !== "string") return { error: "fundraiser_cycle_read_failed" } as const;
    const [{ data: participants, error: participantsError }, { data: payments, error: paymentsError }] = await Promise.all([
      user.supabase.from("fundraiser_participants")
        .select("user_id")
        .eq("fundraiser_id", campaign.id)
        .eq("active", true),
      user.supabase.from("fundraiser_contributions")
        .select("user_id, status, marked_at")
        .eq("fundraiser_id", campaign.id)
        .eq("cycle_due_date", cycleDueDate),
    ]);
    if (participantsError || paymentsError) return { error: "fundraiser_roster_read_failed" } as const;
    const participantIds = [...new Set((participants ?? []).map((participant) => participant.user_id))];
    const { data: profiles, error: profilesError } = participantIds.length
      ? await user.supabase.from("profiles").select("user_id, display_name, avatar_id, title").in("user_id", participantIds)
      : { data: [], error: null };
    if (profilesError) return { error: "fundraiser_profiles_read_failed" } as const;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    const paymentById = new Map((payments ?? []).map((payment) => [payment.user_id, payment]));
    const roster = participantIds.flatMap((userId) => {
      const profile = profileById.get(userId);
      if (!profile) return [];
      const payment = paymentById.get(userId);
      return [{
        userId,
        name: profile.display_name,
        avatar: profile.avatar_id,
        title: profile.title ?? "",
        status: payment?.status === "paid" ? "paid" : "pending",
        markedAt: payment?.marked_at ?? null,
      }];
    });
    const sortByName = (left: typeof roster[number], right: typeof roster[number]) => left.name.localeCompare(right.name, "pt-BR");
    const toPublicPerson = ({ userId, name, avatar, title, markedAt }: typeof roster[number]) => ({
      userId, name, avatar, title, markedAt,
    });
    const previewIds = [...roster].sort(sortByName).slice(0, 6).map((person) => person.userId);
    const photoById = await readGooglePhotos(user.supabase, previewIds);
    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      monthlyAmountCents: Number(campaign.monthly_amount_cents),
      dueDay: campaign.due_day,
      pixKey: campaign.pix_key,
      paymentInstructions: campaign.payment_instructions,
      status: campaign.status,
      currentCycleDueDate: cycleDueDate,
      isParticipant: participantIds.includes(user.userId),
      photos: previewIds.map((userId) => ({ photoUrl: photoById.get(userId) ?? null })),
      paid: roster.filter((person) => person.status === "paid").sort(sortByName).map(toPublicPerson),
      pending: roster.filter((person) => person.status === "pending").sort(sortByName).map(toPublicPerson),
    };
  }));
  if (results.some((result) => "error" in result)) return json({ error: "fundraiser_roster_read_failed" }, 500);
  return json({ fundraisers: results });
}

export async function getRoomFundraiser(context: MuralUser, slug: string, id: string) {
  return context.supabase.from("fundraisers").select(fields).eq("room_slug", slug).eq("id", id).maybeSingle();
}

async function campaignAccess(slugInput: string, idInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access;
  let id;
  try { id = normalizeMuralMessageId(idInput); }
  catch { return { ok: false as const, response: json({ error: "invalid_fundraiser_id" }, 400) }; }
  const { data, error } = await getRoomFundraiser(access.context, access.slug, id);
  if (error) return { ok: false as const, response: json({ error: "fundraiser_read_failed" }, 500) };
  if (!data) return { ok: false as const, response: json({ error: "fundraiser_not_found" }, 404) };
  return { ...access, id, campaign: data };
}

export async function saveRoomFundraiser(request: Request, slugInput: string, idInput?: string) {
  const access = idInput === undefined ? await getRoomMuralContext(slugInput) : await campaignAccess(slugInput, idInput);
  if (!access.ok) return access.response;
  const manager = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
  if (manager.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
  if (!manager.allowed) return json({ error: "forbidden" }, 403);
  let input;
  try { input = idInput === undefined ? normalizeFundraiser(await request.json()) : normalizeFundraiserPatch(await request.json()); }
  catch { return json({ error: "invalid_fundraiser" }, 400); }
  const patch = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.monthlyAmountCents !== undefined ? { monthly_amount_cents: input.monthlyAmountCents } : {}),
    ...(input.dueDay !== undefined ? { due_day: input.dueDay } : {}),
    ...(input.pixKey !== undefined ? { pix_key: input.pixKey } : {}),
    ...(input.paymentInstructions !== undefined ? { payment_instructions: input.paymentInstructions } : {}),
    ...("status" in input && input.status !== undefined ? { status: input.status } : {}),
    ...(idInput === undefined ? {} : { updated_at: new Date().toISOString() }),
  };
  const result = idInput === undefined
    ? await access.context.supabase.from("fundraisers").insert({ ...patch, room_slug: access.slug, created_by: access.context.userId }).select(fields).single()
    : await access.context.supabase.from("fundraisers").update(patch).eq("room_slug", access.slug).eq("id", idInput).select(fields).maybeSingle();
  if (result.error) return json({ error: "fundraiser_save_failed" }, result.error.code === "42501" ? 403 : 500);
  if (!result.data) return json({ error: "fundraiser_not_found" }, 404);
  return json({ fundraiser: result.data }, idInput === undefined ? 201 : 200);
}

export async function changeRoomParticipation(request: Request, slugInput: string, idInput: string, join: boolean) {
  const access = await campaignAccess(slugInput, idInput);
  if (!access.ok) return access.response;
  let target: string;
  try {
    const body = await request.text();
    const input: unknown = body ? JSON.parse(body) : {};
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    const userId = (input as { userId?: unknown }).userId;
    target = userId === undefined ? access.context.userId : normalizeMuralMessageId(String(userId));
  } catch { return json({ error: "invalid_user_id" }, 400); }
  if (target !== access.context.userId) {
    const role = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
    if (role.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
    if (!role.allowed) return json({ error: "forbidden" }, 403);
  }
  if (join && access.campaign.status !== "open") return json({ error: "fundraiser_not_open" }, 409);
  const { data: profile, error: profileError } = await access.context.supabase.from("profiles").select("user_id").eq("user_id", target).maybeSingle();
  if (profileError) return json({ error: "fundraiser_profile_read_failed" }, 500);
  if (!profile) return json({ error: "profile_not_found" }, 404);
  const { data: participant, error: participantError } = await access.context.supabase.from("fundraiser_participants")
    .select("active").eq("fundraiser_id", access.id).eq("user_id", target).maybeSingle();
  if (participantError) return json({ error: "fundraiser_participant_read_failed" }, 500);
  if ((!participant && !join) || participant?.active === join) return json({ ok: true, active: join });
  const { error } = participant
    ? await access.context.supabase.from("fundraiser_participants").update({ active: join, ended_at: join ? null : new Date().toISOString() })
      .eq("fundraiser_id", access.id).eq("user_id", target)
    : await access.context.supabase.from("fundraiser_participants").insert({ fundraiser_id: access.id, user_id: target });
  if (error && !(join && error.code === "23505")) return json({ error: "fundraiser_participant_save_failed" }, error.code === "42501" ? 403 : 500);
  return json({ ok: true, active: join });
}

export async function changeRoomPayment(request: Request, slugInput: string, idInput: string, participantInput: string) {
  const access = await campaignAccess(slugInput, idInput);
  if (!access.ok) return access.response;
  let participantId;
  try { participantId = normalizeMuralMessageId(participantInput); }
  catch { return json({ error: "invalid_user_id" }, 400); }
  if (participantId !== access.context.userId) {
    const role = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
    if (role.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
    if (!role.allowed) return json({ error: "forbidden" }, 403);
  }
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_payment_state" }, 400);
  const body = input as { paid?: unknown; cycleDueDate?: unknown };
  if (typeof body.paid !== "boolean") return json({ error: "invalid_payment_state" }, 400);
  const { data: cycleDueDate, error: cycleError } = await access.context.supabase.rpc("ensure_room_fundraiser_current_cycle", {
    p_room_slug: access.slug, p_fundraiser_id: access.id,
  });
  if (cycleError || typeof cycleDueDate !== "string") return json({ error: "fundraiser_cycle_read_failed" }, cycleError?.code === "P0002" ? 404 : 500);
  if (body.cycleDueDate !== undefined && body.cycleDueDate !== cycleDueDate) return json({ error: "fundraiser_cycle_changed" }, 409);
  const { data: changed, error } = await access.context.supabase.rpc("set_room_fundraiser_payment", {
    p_room_slug: access.slug, p_fundraiser_id: access.id, p_cycle_due_date: cycleDueDate,
    p_participant_id: participantId, p_paid: body.paid,
  });
  if (error?.code === "42501") return json({ error: "forbidden" }, 403);
  if (error?.code === "22023") return json({ error: "fundraiser_cycle_changed" }, 409);
  if (error?.code === "P0002") return json({ error: "fundraiser_or_participant_not_found" }, 404);
  if (error) return json({ error: "fundraiser_payment_update_failed" }, 500);
  return json({ ok: true, changed: Boolean(changed), paid: body.paid, cycleDueDate });
}

export async function roomFundraiserAudit(slugInput: string, idInput: string) {
  const access = await campaignAccess(slugInput, idInput);
  if (!access.ok) return access.response;
  const manager = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
  if (manager.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
  if (!manager.allowed) return json({ error: "forbidden" }, 403);
  const { data, error } = await access.context.supabase.from("fundraiser_payment_audit")
    .select("id, participant_id, cycle_due_date, previous_status, new_status, actor_id, source, created_at")
    .eq("fundraiser_id", access.id).order("created_at", { ascending: false }).limit(100);
  if (error) return json({ error: "fundraiser_audit_read_failed" }, 500);
  return json({ audit: data ?? [] });
}
