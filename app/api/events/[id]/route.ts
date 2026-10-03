import { updateRoomEvent } from "@/lib/rooms/events-server";
import { archiveRoomContent } from "@/lib/rooms/archive-content";
type Context = { params: Promise<{id:string}> };
export async function PATCH(request:Request,{params}:Context){return updateRoomEvent(request,"dtec",(await params).id);}
export async function DELETE(_request:Request,{params}:Context){return archiveRoomContent("dtec",(await params).id,"room_events");}
