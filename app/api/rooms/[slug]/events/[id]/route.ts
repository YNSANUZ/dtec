import { updateRoomEvent } from "@/lib/rooms/events-server";
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return updateRoomEvent(request, slug, id);
}
