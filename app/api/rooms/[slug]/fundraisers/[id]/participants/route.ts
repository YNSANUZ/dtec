import { changeRoomParticipation } from "@/lib/rooms/fundraiser-server";
type Context = { params: Promise<{ slug: string; id: string }> };
export async function POST(request: Request, { params }: Context) {
  const { slug, id } = await params; return changeRoomParticipation(request, slug, id, true);
}
export async function DELETE(request: Request, { params }: Context) {
  const { slug, id } = await params; return changeRoomParticipation(request, slug, id, false);
}
