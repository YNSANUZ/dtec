import { readRoomChat, sendRoomChat } from "@/lib/rooms/chat-server";

// Compatibility endpoint for the original DTEC room.
export async function GET() { return readRoomChat("dtec"); }
export async function POST(request: Request) { return sendRoomChat("dtec", request); }
