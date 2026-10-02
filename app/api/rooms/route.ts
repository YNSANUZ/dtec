import { NextResponse } from "next/server";
import { normalizeNewRoom } from "@/lib/rooms/validation";
import { getMuralUserContext } from "@/lib/mural-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "rooms_unavailable" }, { status: 503 });
  const { data, error } = await supabase.from("rooms")
    .select("slug, title, description, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "rooms_read_failed" }, { status: 500 });
  return NextResponse.json({ rooms: (data ?? []).map((room) => ({
    slug: room.slug,
    title: room.title,
    description: room.description,
    createdAt: room.created_at,
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await getMuralUserContext();
  if (!context) return NextResponse.json({ error: "profile_required" }, { status: 401 });
  let room;
  try {
    room = normalizeNewRoom(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid_room" }, { status: 400 });
  }

  const { data, error } = await context.supabase.from("rooms")
    .insert({ slug: room.slug, title: room.title, description: room.description, created_by: context.userId })
    .select("slug, title, description, created_at")
    .single();
  if (error?.code === "23505") return NextResponse.json({ error: "room_id_taken" }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: "room_create_failed" }, { status: 500 });
  return NextResponse.json({ room: {
    slug: data.slug, title: data.title, description: data.description, createdAt: data.created_at,
  } }, { status: 201 });
}
