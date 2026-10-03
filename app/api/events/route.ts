import { createRoomEvent, listRoomEvents } from "@/lib/rooms/events-server";
export async function GET(request?: Request) { const search = request ? new URL(request.url).searchParams : new URLSearchParams(); return listRoomEvents("dtec",search.get("includeArchived")==="1",search.get("folder")??undefined); }
export async function POST(request: Request) { return createRoomEvent(request,"dtec"); }
