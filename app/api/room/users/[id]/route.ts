import { readRoomPerson } from "@/lib/rooms/people-server";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  return readRoomPerson("dtec",(await params).id);
}
