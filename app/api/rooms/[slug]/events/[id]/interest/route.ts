import { roomEventInterest } from "@/lib/rooms/events-server";
type Context = { params: Promise<{ slug: string; id: string }> };
export async function GET(request: Request, { params }: Context) {
  const { slug, id } = await params; return roomEventInterest(request, slug, id, "GET");
}
export async function POST(request: Request, { params }: Context) {
  const { slug, id } = await params; return roomEventInterest(request, slug, id, "POST");
}
export async function DELETE(request: Request, { params }: Context) {
  const { slug, id } = await params; return roomEventInterest(request, slug, id, "DELETE");
}
