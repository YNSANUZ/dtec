import { listRoomBirthdays } from "@/lib/rooms/people-server";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return listRoomBirthdays((await params).slug);
}
