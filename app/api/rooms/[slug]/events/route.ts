import { createRoomEvent, listRoomEvents } from "@/lib/rooms/events-server";
type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Context) {
  return listRoomEvents((await params).slug, new URL(request.url).searchParams.get("includeArchived") === "1");
}
export async function POST(request: Request, { params }: Context) { return createRoomEvent(request, (await params).slug); }
