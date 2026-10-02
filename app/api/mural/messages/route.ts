import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeMuralMessage } from "@/lib/mural-validation";

export async function GET() {
  const context = await getMuralUserContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows, error } = await context.supabase
    .from("mural_messages")
    .select("id, author_id, content, is_pinned, created_at, updated_at")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "mural_read_failed" }, { status: 500 });
  const authorIds = [...new Set((rows ?? []).map((row) => row.author_id))];
  const { data: profiles, error: profilesError } = authorIds.length
    ? await context.supabase.from("profiles").select("user_id, display_name").in("user_id", authorIds)
    : { data: [], error: null };

  if (profilesError) return NextResponse.json({ error: "mural_authors_read_failed" }, { status: 500 });
  const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name]));
  const messages = (rows ?? []).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: names.get(row.author_id) ?? "Colega",
    content: row.content,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const context = await getMuralUserContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let message;
  try {
    message = normalizeMuralMessage(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recado inválido." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("mural_messages")
    .insert({ author_id: context.userId, content: message.content })
    .select("id, author_id, content, is_pinned, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "mural_save_failed" }, { status: 500 });
  return NextResponse.json({
    message: {
      id: data.id,
      authorId: data.author_id,
      authorName: context.displayName,
      content: data.content,
      isPinned: data.is_pinned,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  }, { status: 201 });
}
