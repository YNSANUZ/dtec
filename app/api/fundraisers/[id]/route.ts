import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { hasFundraiserManagerRole } from "@/lib/fundraisers/server";
import { normalizeFundraiserPatch } from "@/lib/fundraisers/validation";

type RouteContext = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const manager = await hasFundraiserManagerRole(user);
  if (manager.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
  if (!manager.allowed) return json({ error: "forbidden" }, 403);
  const { id } = await context.params;
  let campaign;
  try { campaign = normalizeFundraiserPatch(await request.json()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Atualização inválida." }, 400); }

  const patch = {
    ...(campaign.title !== undefined ? { title: campaign.title } : {}),
    ...(campaign.description !== undefined ? { description: campaign.description } : {}),
    ...(campaign.monthlyAmountCents !== undefined ? { monthly_amount_cents: campaign.monthlyAmountCents } : {}),
    ...(campaign.dueDay !== undefined ? { due_day: campaign.dueDay } : {}),
    ...(campaign.pixKey !== undefined ? { pix_key: campaign.pixKey } : {}),
    ...(campaign.paymentInstructions !== undefined ? { payment_instructions: campaign.paymentInstructions } : {}),
    ...(campaign.status !== undefined ? { status: campaign.status } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await user.supabase.from("fundraisers").update(patch).eq("id", id)
    .select("id, title, description, monthly_amount_cents, due_day, pix_key, payment_instructions, status, created_by, created_at, updated_at")
    .maybeSingle();
  if (error) return json({ error: "fundraiser_update_failed" }, 500);
  if (!data) return json({ error: "fundraiser_not_found" }, 404);
  return json({ fundraiser: data });
}
