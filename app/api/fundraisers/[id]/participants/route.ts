import { changeRoomParticipation } from "@/lib/rooms/fundraiser-server";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) { return changeRoomParticipation(request, "dtec", (await params).id, true); }
export async function DELETE(request: Request, { params }: Context) { return changeRoomParticipation(request, "dtec", (await params).id, false); }
