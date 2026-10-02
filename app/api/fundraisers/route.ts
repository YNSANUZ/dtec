import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { hasFundraiserManagerRole } from "@/lib/fundraisers/server";
import { normalizeFundraiser } from "@/lib/fundraisers/validation";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function GET() {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: campaigns, error } = await user.supabase
    .from("fundraisers")
    .select("id, title, description, monthly_amount_cents, due_day, pix_key, payment_instructions, status, created_by, created_at, updated_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) return json({ error: "fundraisers_read_failed" }, 500);

  const results = await Promise.all((campaigns ?? []).map(async (campaign) => {
    const { data: cycleDueDate, error: cycleError } = await user.supabase.rpc("ensure_fundraiser_current_cycle", {
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
    const participantIds = (participants ?? []).map((participant) => participant.user_id);
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
      paid: roster.filter((person) => person.status === "paid").sort(sortByName).map(toPublicPerson),
      pending: roster.filter((person) => person.status === "pending").sort(sortByName).map(toPublicPerson),
    };
  }));
  if (results.some((result) => "error" in result)) return json({ error: "fundraiser_roster_read_failed" }, 500);
  return json({ fundraisers: results });
}

export async function POST(request: Request) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const manager = await hasFundraiserManagerRole(user);
  if (manager.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
  if (!manager.allowed) return json({ error: "forbidden" }, 403);

  let campaign;
  try { campaign = normalizeFundraiser(await request.json()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Dados da vaquinha inválidos." }, 400); }

  const { data, error } = await user.supabase.from("fundraisers").insert({
    title: campaign.title,
    description: campaign.description,
    monthly_amount_cents: campaign.monthlyAmountCents,
    due_day: campaign.dueDay,
    pix_key: campaign.pixKey,
    payment_instructions: campaign.paymentInstructions,
    created_by: user.userId,
  }).select("id, title, description, monthly_amount_cents, due_day, pix_key, payment_instructions, status, created_by, created_at, updated_at").single();
  if (error) return json({ error: "fundraiser_create_failed" }, 500);
  return json({ fundraiser: data }, 201);
}
