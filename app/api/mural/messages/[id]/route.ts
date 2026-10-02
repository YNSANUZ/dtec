import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";
import { normalizeMuralMessage, normalizeMuralMessageId } from "@/lib/mural-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const context = await getMuralUserContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let id: string;
  let message;
  try {
    id = normalizeMuralMessageId((await params).id);
    message = normalizeMuralMessage(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("mural_messages")
    .update({ content: message.content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("author_id", context.userId)
    .eq("is_pinned", false)
    .select("id, author_id, content, is_pinned, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "mural_update_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 });
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
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const context = await getMuralUserContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let id: string;
  try {
    id = normalizeMuralMessageId((await params).id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recado não encontrado." }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("mural_messages")
    .delete()
    .eq("id", id)
    .eq("author_id", context.userId)
    .eq("is_pinned", false)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "mural_delete_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
