import { readRoomPerson } from "@/lib/rooms/people-server";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return readRoomPerson(slug, id);
}
