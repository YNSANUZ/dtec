import { roomFundraiserAudit, saveRoomFundraiser } from "@/lib/rooms/fundraiser-server";
type Context = { params: Promise<{ slug: string; id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { slug, id } = await params; return roomFundraiserAudit(slug, id);
}
export async function PATCH(request: Request, { params }: Context) {
  const { slug, id } = await params; return saveRoomFundraiser(request, slug, id);
}
