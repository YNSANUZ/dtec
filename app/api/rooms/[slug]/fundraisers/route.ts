import { listRoomFundraisers, saveRoomFundraiser } from "@/lib/rooms/fundraiser-server";
type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Context) { return listRoomFundraisers((await params).slug, new URL(request.url).searchParams.get("folder") ?? undefined); }
export async function POST(request: Request, { params }: Context) { return saveRoomFundraiser(request, (await params).slug); }
