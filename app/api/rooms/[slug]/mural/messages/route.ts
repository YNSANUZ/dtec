import { createRoomNotice, listRoomNotices } from "@/lib/rooms/mural-server";
type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Context) {
  return listRoomNotices((await params).slug,new URL(request.url).searchParams.get("folder")??undefined);
}
export async function POST(request: Request, { params }: Context) {
  return createRoomNotice(request, (await params).slug);
}
