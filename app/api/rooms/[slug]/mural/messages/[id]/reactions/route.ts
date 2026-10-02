import { roomNoticeReactions } from "@/lib/rooms/mural-server";
type Context = { params: Promise<{ slug: string; id: string }> };
export async function GET(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return roomNoticeReactions(request, slug, id, "GET");
}
export async function PUT(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return roomNoticeReactions(request, slug, id, "PUT");
}
export async function DELETE(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return roomNoticeReactions(request, slug, id, "DELETE");
}
