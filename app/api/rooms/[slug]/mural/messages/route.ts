import { createRoomNotice, listRoomNotices } from "@/lib/rooms/mural-server";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, { params }: Context) {
  return listRoomNotices((await params).slug);
}
export async function POST(request: Request, { params }: Context) {
  return createRoomNotice(request, (await params).slug);
}
