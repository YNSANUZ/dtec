import { roomFundraiserAudit, saveRoomFundraiser } from "@/lib/rooms/fundraiser-server";
import { archiveRoomContent } from "@/lib/rooms/archive-content";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return roomFundraiserAudit("dtec", (await params).id); }
export async function PATCH(request: Request, { params }: Context) { return saveRoomFundraiser(request, "dtec", (await params).id); }
export async function DELETE(_request: Request, { params }: Context) { return archiveRoomContent("dtec", (await params).id, "fundraisers"); }
