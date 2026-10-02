import { changeRoomNotice } from "@/lib/rooms/mural-server";
type Context = { params: Promise<{ slug: string; id: string }> };
export async function PATCH(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return changeRoomNotice(request, slug, id);
}
export async function DELETE(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return changeRoomNotice(request, slug, id, true);
}
