import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeMuralMessage, normalizeMuralMessageId } from "@/lib/mural-validation";
import { normalizeMuralReaction } from "@/lib/mural-reactions";
import { hasRoomRole, type MuralUser } from "@/lib/rooms/authorization";
import { normalizeRoomSlug } from "@/lib/rooms/slug";

const fields = "id, author_id, content, is_pinned, created_at, updated_at";
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
type Access = { ok: true; context: MuralUser; slug: string } | { ok: false; response: NextResponse };
type Message = { id: string; author_id: string; content: string; is_pinned: boolean; created_at: string; updated_at: string };
type Summary = { message_id: string; like_count: number; dislike_count: number; my_reaction: "like" | "dislike" | null };

export async function getRoomMuralContext(input: string): Promise<Access> {
  const context = await getMuralUserContext();
  if (!context) return { ok: false, response: json({ error: "unauthorized" }, 401) };
  let slug: string;
  try { slug = normalizeRoomSlug(input); }
  catch { return { ok: false, response: json({ error: "invalid_room" }, 400) }; }
  const { data, error } = await context.supabase.from("rooms").select("slug").eq("slug", slug).maybeSingle();
  if (error) return { ok: false, response: json({ error: "room_read_failed" }, 500) };
  if (!data) return { ok: false, response: json({ error: "room_not_found" }, 404) };
  return { ok: true, context, slug };
}

function serialize(row: Message, name: string, summary?: Summary) {
  return { id: row.id, authorId: row.author_id, authorName: name, content: row.content,
    isPinned: row.is_pinned, createdAt: row.created_at, updatedAt: row.updated_at,
    likeCount: Number(summary?.like_count ?? 0), dislikeCount: Number(summary?.dislike_count ?? 0),
    myReaction: summary?.my_reaction ?? null };
}

export async function listRoomNotices(slugInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const { context, slug } = access;
  const { data, error } = await context.supabase.from("mural_messages").select(fields)
    .eq("room_slug", slug).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (error) return json({ error: "mural_read_failed" }, 500);
  const rows = (data ?? []) as Message[];
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const { data: profiles, error: profileError } = authorIds.length
    ? await context.supabase.from("profiles").select("user_id, display_name").in("user_id", authorIds)
    : { data: [], error: null };
  if (profileError) return json({ error: "mural_authors_read_failed" }, 500);
  const names = new Map<string, string>((profiles ?? []).map((p) => [p.user_id, p.display_name]));
  const { data: summaries, error: summaryError } = rows.length
    ? await context.supabase.rpc("get_room_mural_reaction_summary", { p_room_slug: slug, p_message_ids: rows.map((row) => row.id) })
    : { data: [], error: null };
  if (summaryError) return json({ error: "mural_reactions_read_failed" }, 500);
  const byId = new Map(((summaries ?? []) as Summary[]).map((s) => [s.message_id, s]));
  return json({ messages: rows.map((row) => serialize(row, names.get(row.author_id) ?? "Colega", byId.get(row.id))) });
}

export async function createRoomNotice(request: Request, slugInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  let content: string;
  try { content = normalizeMuralMessage(await request.json()).content; }
  catch { return json({ error: "invalid_message" }, 400); }
  const { context, slug } = access;
  const { data, error } = await context.supabase.from("mural_messages")
    .insert({ room_slug: slug, author_id: context.userId, content }).select(fields).single();
  if (error || !data) return json({ error: "mural_save_failed" }, 500);
  return json({ message: serialize(data, context.displayName) }, 201);
}

async function findNotice(access: Extract<Access, { ok: true }>, idInput: string) {
  let id: string;
  try { id = normalizeMuralMessageId(idInput); }
  catch { return { ok: false as const, response: json({ error: "invalid_message_id" }, 400) }; }
  const { data, error } = await access.context.supabase.from("mural_messages").select(fields)
    .eq("room_slug", access.slug).eq("id", id).maybeSingle();
  if (error) return { ok: false as const, response: json({ error: "mural_read_failed" }, 500) };
  if (!data) return { ok: false as const, response: json({ error: "message_not_found" }, 404) };
  return { ok: true as const, row: data as Message, id };
}

export async function changeRoomNotice(request: Request, slugInput: string, idInput: string, remove = false) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const found = await findNotice(access, idInput);
  if (!found.ok) return found.response;
  const role = await hasRoomRole(access.context, access.slug, ["owner", "leader"]);
  if (role.failed) return json({ error: "room_role_read_failed" }, 500);
  if (!role.allowed && (found.row.author_id !== access.context.userId || found.row.is_pinned)) return json({ error: "forbidden" }, 403);
  const patch: { content?: string; is_pinned?: boolean; updated_at: string } = { updated_at: new Date().toISOString() };
  if (!remove) {
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
      const body = input as Record<string, unknown>;
      if (Object.hasOwn(body, "content")) patch.content = normalizeMuralMessage(body).content;
      if (Object.hasOwn(body, "isPinned")) {
        if (typeof body.isPinned !== "boolean") throw new Error();
        if (!role.allowed) return json({ error: "forbidden" }, 403);
        patch.is_pinned = body.isPinned;
      }
      if (patch.content === undefined && patch.is_pinned === undefined) throw new Error();
    } catch { return json({ error: "invalid_message" }, 400); }
  }
  let query = remove ? access.context.supabase.from("mural_messages").delete()
    : access.context.supabase.from("mural_messages").update(patch);
  query = query.eq("room_slug", access.slug).eq("id", found.id);
  // Preserve author/pinned restrictions through the write, including concurrent changes.
  if (!role.allowed) query = query.eq("author_id", access.context.userId).eq("is_pinned", false);
  const { data, error } = await query.select(fields).maybeSingle();
  if (error) return json({ error: "mural_write_failed" }, 500);
  if (!data) return json({ error: "not_found_or_forbidden" }, 404);
  if (remove) return json({ ok: true });
  const { data: author, error: authorError } = await access.context.supabase.from("profiles")
    .select("display_name").eq("user_id", data.author_id).maybeSingle();
  if (authorError) return json({ error: "mural_authors_read_failed" }, 500);
  return json({ message: serialize(data, author?.display_name ?? "Colega") });
}

export async function roomNoticeReactions(request: Request, slugInput: string, idInput: string, method: "GET" | "PUT" | "DELETE") {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const found = await findNotice(access, idInput);
  if (!found.ok) return found.response;
  const { context, slug } = access;
  if (method === "GET") {
    const type = new URL(request.url).searchParams.get("type");
    if (type !== "like" && type !== "dislike") return json({ error: "invalid_reaction_type" }, 400);
    const { data: reactions, error } = await context.supabase.from("mural_message_reactions")
      .select("user_id").eq("message_id", found.id).eq("reaction", type);
    if (error) return json({ error: "mural_reaction_read_failed" }, 500);
    const userIds = (reactions ?? []).map((r) => r.user_id);
    const { data: profiles, error: profilesError } = userIds.length
      ? await context.supabase.from("profiles").select("user_id, display_name, avatar_id").in("user_id", userIds)
      : { data: [], error: null };
    if (profilesError) return json({ error: "mural_reaction_profiles_read_failed" }, 500);
    const people = (profiles ?? []).map((p) => ({ userId: p.user_id, name: p.display_name, avatar: p.avatar_id }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return json({ people, count: people.length });
  }
  let mutation;
  if (method === "PUT") {
    let reaction;
    try { reaction = normalizeMuralReaction(await request.json()); }
    catch { return json({ error: "invalid_reaction" }, 400); }
    mutation = await context.supabase.rpc("toggle_room_mural_reaction", { p_room_slug: slug, p_message_id: found.id, p_reaction: reaction });
  } else {
    mutation = await context.supabase.rpc("clear_room_mural_reaction", { p_room_slug: slug, p_message_id: found.id });
  }
  if (mutation.error) return json({ error: "mural_reaction_save_failed" }, mutation.error.code === "P0002" ? 404 : mutation.error.code === "42501" ? 403 : 500);
  const { data, error } = await context.supabase.rpc("get_room_mural_reaction_summary", { p_room_slug: slug, p_message_ids: [found.id] });
  if (error) return json({ error: "mural_reaction_read_failed" }, 500);
  const summary = data?.[0];
  if (!summary) return json({ error: "message_not_found" }, 404);
  return json({ likeCount: Number(summary.like_count), dislikeCount: Number(summary.dislike_count), myReaction: summary.my_reaction });
}
