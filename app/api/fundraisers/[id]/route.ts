import { roomFundraiserAudit, saveRoomFundraiser } from "@/lib/rooms/fundraiser-server";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return roomFundraiserAudit("dtec", (await params).id); }
export async function PATCH(request: Request, { params }: Context) { return saveRoomFundraiser(request, "dtec", (await params).id); }
