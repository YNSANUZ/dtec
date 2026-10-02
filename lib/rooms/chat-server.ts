import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeRoomSlug } from "@/lib/rooms/slug";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ChatRow = { id: string; author_id: string; content: string; created_at: string };

function checkedSlug(rawSlug: string): string | null {
  try { return normalizeRoomSlug(rawSlug); } catch { return null; }
}

export async function readRoomChat(rawSlug: string) {
  const slug = checkedSlug(rawSlug);
  if (!slug) return NextResponse.json({ error: "invalid_room_id" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "room_unavailable" }, { status: 503 });

  const { data, error } = await supabase.from("room_chat_messages")
    .select("id, author_id, content, created_at")
    .eq("room_slug", slug)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5);
  if (error) return NextResponse.json({ error: "chat_read_failed" }, { status: 500 });

  const rows = (data ?? []) as ChatRow[];
  const ids = [...new Set(rows.map((row) => row.author_id))];
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ids)
    : { data: [], error: null };
  if (profileError) return NextResponse.json({ error: "chat_authors_read_failed" }, { status: 500 });
  const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name]));

  return NextResponse.json({ messages: rows.reverse().map((row) => ({
    id: row.id,
    authorId: row.author_id,
    name: names.get(row.author_id) ?? "Colega",
    text: row.content,
    createdAt: row.created_at,
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function sendRoomChat(rawSlug: string, request: Request) {
  const slug = checkedSlug(rawSlug);
  if (!slug) return NextResponse.json({ error: "invalid_room_id" }, { status: 400 });
  const context = await getMuralUserContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let content: string;
  try {
    const body = await request.json() as { text?: unknown };
    content = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_chat_message" }, { status: 400 });
  }
  if (!content || content.length > 100) return NextResponse.json({ error: "invalid_chat_message" }, { status: 400 });

  const { data, error } = await context.supabase.from("room_chat_messages")
    .insert({ room_slug: slug, author_id: context.userId, content })
    .select("id, author_id, content, created_at")
    .single();
  if (error?.code === "23503") return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  if (error) return NextResponse.json({ error: "chat_send_failed" }, { status: 500 });

  return NextResponse.json({ message: {
    id: data.id,
    authorId: data.author_id,
    name: context.displayName,
    text: data.content,
    createdAt: data.created_at,
  } }, { status: 201 });
}
