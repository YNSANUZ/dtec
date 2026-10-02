import { readRoomChat, sendRoomChat } from "@/lib/rooms/chat-server";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  return readRoomChat(slug);
}

export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;
  return sendRoomChat(slug, request);
}
