import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeMuralMessageId } from "@/lib/mural-validation";
import { normalizeMuralReaction } from "@/lib/mural-reactions";

type RouteContext = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

async function getMessageId(context: RouteContext) {
  const { id } = await context.params;
  return normalizeMuralMessageId(id);
}

async function getSummary(supabase: NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>["supabase"], messageId: string) {
  const { data, error } = await supabase.rpc("get_mural_reaction_summary", { p_message_ids: [messageId] });
  if (error) return null;
  const summary = data?.[0];
  return {
    likeCount: Number(summary?.like_count ?? 0),
    dislikeCount: Number(summary?.dislike_count ?? 0),
    myReaction: summary?.my_reaction ?? null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  let messageId: string;
  try { messageId = await getMessageId(context); }
  catch { return json({ error: "message_not_found" }, 400); }
  const type = new URL(request.url).searchParams.get("type");
  if (type !== "like" && type !== "dislike") return json({ error: "invalid_reaction_type" }, 400);

  const { data: message, error: messageError } = await user.supabase.from("mural_messages")
    .select("id").eq("id", messageId).maybeSingle();
  if (messageError) return json({ error: "mural_reaction_read_failed" }, 500);
  if (!message) return json({ error: "message_not_found" }, 404);

  const { data: reactions, error } = await user.supabase.from("mural_message_reactions")
    .select("user_id, created_at").eq("message_id", messageId).eq("reaction", type);
  if (error) return json({ error: "mural_reaction_read_failed" }, 500);
  const userIds = (reactions ?? []).map((reaction) => reaction.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await user.supabase.from("profiles").select("user_id, display_name, avatar_id").in("user_id", userIds)
    : { data: [], error: null };
  if (profilesError) return json({ error: "mural_reaction_profiles_read_failed" }, 500);
  const byId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const people = (reactions ?? []).flatMap((reaction) => {
    const profile = byId.get(reaction.user_id);
    return profile ? [{ userId: profile.user_id, name: profile.display_name, avatar: profile.avatar_id }] : [];
  }).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  return json({ people, count: people.length });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  let messageId: string;
  let reaction: ReturnType<typeof normalizeMuralReaction>;
  try {
    messageId = await getMessageId(context);
    reaction = normalizeMuralReaction(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_reaction" }, 400);
  }
  const { data: myReaction, error } = await user.supabase.rpc("toggle_mural_reaction", {
    p_message_id: messageId,
    p_reaction: reaction,
  });
  if (error) return json({ error: error.code === "P0002" ? "message_not_found" : "mural_reaction_save_failed" }, error.code === "P0002" ? 404 : 500);
  const summary = await getSummary(user.supabase, messageId);
  if (!summary) return json({ error: "mural_reaction_read_failed" }, 500);
  return json({ ...summary, myReaction });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  let messageId: string;
  try { messageId = await getMessageId(context); }
  catch { return json({ error: "message_not_found" }, 400); }
  const { error } = await user.supabase.rpc("clear_mural_reaction", { p_message_id: messageId });
  if (error) return json({ error: error.code === "P0002" ? "message_not_found" : "mural_reaction_save_failed" }, error.code === "P0002" ? 404 : 500);
  const summary = await getSummary(user.supabase, messageId);
  if (!summary) return json({ error: "mural_reaction_read_failed" }, 500);
  return json(summary);
}
