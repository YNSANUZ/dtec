import { listRoomPeople } from "@/lib/rooms/people-server";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return listRoomPeople((await params).slug);
}
