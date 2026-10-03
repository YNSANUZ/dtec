import { createRoomEvent, listRoomEvents } from "@/lib/rooms/events-server";
type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Context) {
  const search = new URL(request.url).searchParams;
  return listRoomEvents((await params).slug, search.get("includeArchived") === "1", search.get("folder") ?? undefined);
}
export async function POST(request: Request, { params }: Context) { return createRoomEvent(request, (await params).slug); }
