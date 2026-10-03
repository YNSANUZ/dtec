import { updateRoomEvent } from "@/lib/rooms/events-server";
import { archiveRoomContent } from "@/lib/rooms/archive-content";
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return updateRoomEvent(request, slug, id);
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return archiveRoomContent(slug, id, "room_events");
}
