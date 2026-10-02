import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeRoomSlug } from "@/lib/rooms/slug";
import GenericRoom from "@/components/generic-room";

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  let slug;
  try { slug = normalizeRoomSlug(rawSlug); } catch { notFound(); }
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.from("rooms")
    .select("slug, title, description")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) notFound();
  return <GenericRoom room={data} />;
}
