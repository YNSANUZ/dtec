import { changeRoomPayment } from "@/lib/rooms/fundraiser-server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return changeRoomPayment(request, "dtec", id, userId);
}
