import { readRoomBoard, changeRoomBoard } from "@/lib/rooms/board-server";
type Context={params:Promise<{slug:string}>};
export async function GET(_request:Request,{params}:Context){return readRoomBoard((await params).slug);}
export async function POST(request:Request,{params}:Context){return changeRoomBoard(request,(await params).slug);}
