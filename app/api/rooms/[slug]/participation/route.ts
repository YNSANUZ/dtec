import { roomParticipation } from "@/lib/rooms/participation-server";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return roomParticipation(request, (await params).slug);
}
