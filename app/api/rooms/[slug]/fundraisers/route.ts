import { listRoomFundraisers, saveRoomFundraiser } from "@/lib/rooms/fundraiser-server";
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, { params }: Context) { return listRoomFundraisers((await params).slug); }
export async function POST(request: Request, { params }: Context) { return saveRoomFundraiser(request, (await params).slug); }
