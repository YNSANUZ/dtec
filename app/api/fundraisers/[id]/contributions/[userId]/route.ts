import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { hasFundraiserManagerRole } from "@/lib/fundraisers/server";

type RouteContext = { params: Promise<{ id: string; userId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { id, userId: participantId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(participantId)) {
    return json({ error: "invalid_user_id" }, 400);
  }
  if (participantId !== user.userId) {
    const manager = await hasFundraiserManagerRole(user);
    if (manager.failed) return json({ error: "fundraiser_role_check_failed" }, 500);
    if (!manager.allowed) return json({ error: "forbidden" }, 403);
  }
  const body = await request.json().catch(() => null) as { paid?: unknown } | null;
  if (typeof body?.paid !== "boolean") return json({ error: "invalid_payment_state" }, 400);

  const { data: cycleDueDate, error: cycleError } = await user.supabase.rpc("ensure_fundraiser_current_cycle", {
    p_fundraiser_id: id,
  });
  if (cycleError || typeof cycleDueDate !== "string") return json({ error: "fundraiser_cycle_read_failed" }, 500);
  const { data: changed, error } = await user.supabase.rpc("set_fundraiser_payment", {
    p_fundraiser_id: id,
    p_cycle_due_date: cycleDueDate,
    p_participant_id: participantId,
    p_paid: body.paid,
  });
  if (error?.code === "42501") return json({ error: "forbidden" }, 403);
  if (error?.code === "22023") return json({ error: "fundraiser_cycle_changed" }, 409);
  if (error?.code === "P0002") return json({ error: "fundraiser_or_participant_not_found" }, 404);
  if (error) return json({ error: "fundraiser_payment_update_failed" }, 500);
  return json({ ok: true, changed: Boolean(changed), paid: body.paid, cycleDueDate });
}
