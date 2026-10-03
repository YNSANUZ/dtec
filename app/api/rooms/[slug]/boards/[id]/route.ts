import { changeRoomBoard } from "@/lib/rooms/board-server";
type Context={params:Promise<{slug:string;id:string}>};
export async function PATCH(request:Request,{params}:Context){const {slug,id}=await params;return changeRoomBoard(request,slug,id);}
export async function DELETE(request:Request,{params}:Context){const {slug,id}=await params;return changeRoomBoard(request,slug,id,true);}
