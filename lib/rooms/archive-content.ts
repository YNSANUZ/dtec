import { NextResponse } from "next/server";
import { getRoomMuralContext } from "./mural-server";
import { canChangeRoomContent } from "./content-permissions";
import { normalizeMuralMessageId } from "@/lib/mural-validation";

// Exclusion from the active area is deliberately reversible in storage:
// interests, cycles, contributions and audit records retain their original IDs.
export async function archiveRoomContent(slug: string, inputId: string, table: "room_events" | "fundraisers") {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const access = await getRoomMuralContext(slug);
  if (!access.ok) return access.response;
  let id: string;
  try { id = normalizeMuralMessageId(inputId); } catch { return json({ error: "invalid_id" }, 400); }
  const { data, error } = await access.context.supabase.from(table).select("id, created_by")
    .eq("room_slug", access.slug).eq("id", id).maybeSingle();
  if (error) return json({ error: "content_read_failed" }, 500);
  if (!data) return json({ error: "not_found" }, 404);
  const permission = await canChangeRoomContent(access.context, access.slug, data.created_by);
  if (permission.failed) return json({ error: "permission_check_failed" }, 500);
  if (!permission.allowed) return json({ error: "forbidden" }, 403);
  const result = await access.context.supabase.from(table).update({ deleted_at: new Date().toISOString(), status: "cancelled" })
    .eq("room_slug", access.slug).eq("id", id).select("id").maybeSingle();
  if (result.error) return json({ error: "content_archive_failed" }, result.error.code === "42501" ? 403 : 500);
  if (!result.data) return json({ error: "not_found_or_forbidden" }, 404);
  return json({ ok: true });
}
