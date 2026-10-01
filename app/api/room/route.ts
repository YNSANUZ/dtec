import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, presence, profiles } from "@/db/schema";
import { getChatGPTUser } from "@/app/chatgpt-auth";

const avatars = new Set(["a", "c", "f", "j", "n", "r"]);
const actions = new Set(["idle", "walk", "dance", "sit", "wave"]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Entre para acessar a sala." }, { status: 401 });
  const db = getDb();
  const now = Date.now();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.userId)).limit(1);
  const online = await db.select({
    userId: presence.userId, x: presence.x, z: presence.z, action: presence.action,
    message: presence.message, lastSeen: presence.lastSeen, name: profiles.name, avatar: profiles.avatar,
  }).from(presence).innerJoin(profiles, eq(presence.userId, profiles.userId))
    .where(and(gt(presence.lastSeen, now - 30_000), ne(presence.userId, user.userId)));
  const recent = await db.select().from(messages).orderBy(desc(messages.id)).limit(5);
  return Response.json({ profile: profile ?? null, online, messages: recent.reverse(), me: { id: user.userId, name: user.fullName ?? user.displayName } });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Entre para acessar a sala." }, { status: 401 });
  const data = await request.json() as Record<string, unknown>;
  const db = getDb();
  const now = Date.now();
  if (data.type === "profile") {
    const name = String(data.name ?? "").trim().slice(0, 18);
    const avatar = String(data.avatar ?? "r");
    if (!name || !avatars.has(avatar)) return Response.json({ error: "Perfil inválido." }, { status: 400 });
    await db.insert(profiles).values({ userId: user.userId, name, avatar, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: profiles.userId, set: { name, avatar, updatedAt: new Date().toISOString() } });
    return Response.json({ ok: true });
  }
  if (data.type === "state") {
    const x = Math.max(-12.5, Math.min(12.5, Number(data.x) || 0));
    const z = Math.max(-6, Math.min(10, Number(data.z) || 5));
    const action = actions.has(String(data.action)) ? String(data.action) : "idle";
    const message = String(data.message ?? "").trim().slice(0, 100);
    await db.insert(presence).values({ userId: user.userId, x, z, action, message, lastSeen: now })
      .onConflictDoUpdate({ target: presence.userId, set: { x, z, action, message, lastSeen: now } });
    return Response.json({ ok: true });
  }
  if (data.type === "message") {
    const text = String(data.text ?? "").trim().slice(0, 100);
    const name = String(data.name ?? "Colega DTEC").trim().slice(0, 18);
    if (!text) return Response.json({ error: "Mensagem vazia." }, { status: 400 });
    await db.insert(messages).values({ userId: user.userId, name, text, createdAt: now });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
