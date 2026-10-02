import { changeRoomPayment } from "@/lib/rooms/fundraiser-server";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; id: string; userId: string }> }) {
  const { slug, id, userId } = await params; return changeRoomPayment(request, slug, id, userId);
}
