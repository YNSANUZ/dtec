import { listRoomFundraisers, saveRoomFundraiser } from "@/lib/rooms/fundraiser-server";
export async function GET() { return listRoomFundraisers("dtec"); }
export async function POST(request: Request) { return saveRoomFundraiser(request, "dtec"); }
