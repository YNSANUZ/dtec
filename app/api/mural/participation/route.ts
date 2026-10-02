import { NextResponse } from "next/server";
import { getMuralUserContext } from "@/lib/mural-server";

type Mural = "information" | "demands" | "leisure";
type FolderIds = Record<string, Set<string>>;
type Supabase = NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>["supabase"];

const folderNames: Record<Mural, string[]> = {
  information: ["recados", "comunicados", "lembretes", "vaquinhas"],
  demands: ["equipamentos", "solicitacoes", "atividades"],
  leisure: ["futebol", "paintball", "kart", "confraternizacoes"],
};
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

function validGooglePhoto(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))
      ? url.href : null;
  } catch { return null; }
}

async function collectPeople(supabase: Supabase, mural: Mural): Promise<FolderIds | null> {
  const folders: FolderIds = Object.fromEntries(folderNames[mural].map((name) => [name, new Set<string>()]));
  if (mural === "demands") return folders;

  if (mural === "information") {
    const [messages, reactions, fundraisers] = await Promise.all([
      supabase.from("mural_messages").select("author_id"),
      supabase.from("mural_message_reactions").select("user_id"),
      supabase.from("fundraisers").select("id").eq("status", "open"),
    ]);
    if (messages.error || reactions.error || fundraisers.error) return null;
    for (const row of messages.data ?? []) folders.recados.add(row.author_id);
    for (const row of reactions.data ?? []) folders.recados.add(row.user_id);
    const ids = (fundraisers.data ?? []).map((row) => row.id);
    if (ids.length) {
      const participants = await supabase.from("fundraiser_participants")
        .select("user_id").in("fundraiser_id", ids).eq("active", true);
      if (participants.error) return null;
      for (const row of participants.data ?? []) folders.vaquinhas.add(row.user_id);
    }
    return folders;
  }

  const events = await supabase.from("room_events").select("id, category").eq("status", "open");
  if (events.error) return null;
  const categoryById = new Map((events.data ?? []).map((row) => [row.id, row.category]));
  if (!categoryById.size) return folders;
  const interests = await supabase.from("room_event_interests")
    .select("event_id, user_id").in("event_id", [...categoryById.keys()]);
  if (interests.error) return null;
  for (const row of interests.data ?? []) {
    const category = categoryById.get(row.event_id);
    if (category && folders[category]) folders[category].add(row.user_id);
  }
  return folders;
}

export async function GET(request: Request) {
  const user = await getMuralUserContext();
  if (!user) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const muralValue = url.searchParams.get("mural");
  if (muralValue !== "information" && muralValue !== "demands" && muralValue !== "leisure") {
    return json({ error: "invalid_mural" }, 400);
  }
  const folder = url.searchParams.get("folder");
  if (folder && !folderNames[muralValue].includes(folder)) return json({ error: "invalid_folder" }, 400);

  const idsByFolder = await collectPeople(user.supabase, muralValue);
  if (!idsByFolder) return json({ error: "participation_read_failed" }, 500);
  const userIds = [...new Set(Object.values(idsByFolder).flatMap((ids) => [...ids]))];
  const profilesResult = userIds.length
    ? await user.supabase.from("profiles").select("user_id, display_name, title").in("user_id", userIds)
    : { data: [], error: null };
  if (profilesResult.error) return json({ error: "participation_profiles_read_failed" }, 500);
  const profiles = profilesResult.data ?? [];
  const photosResult = profiles.length
    ? await user.supabase.rpc("room_google_photos", { p_user_ids: profiles.map((profile) => profile.user_id) })
    : { data: [], error: null };
  const photoRows = (photosResult.data ?? []) as Array<{ user_id: string; photo_url: string | null }>;
  const photoById = new Map(photoRows.map((row) => [row.user_id, validGooglePhoto(row.photo_url)]));
  const peopleById = new Map(profiles.map((profile) => [profile.user_id, {
    userId: profile.user_id,
    name: profile.display_name,
    title: profile.title ?? "",
    photoUrl: photoById.get(profile.user_id) ?? null,
  }]));
  const peopleFor = (name: string) => [...idsByFolder[name]].flatMap((id) => {
    const person = peopleById.get(id);
    return person ? [person] : [];
  }).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  if (folder) return json({ people: peopleFor(folder) });
  const folders = Object.fromEntries(folderNames[muralValue].map((name) => {
    const people = peopleFor(name);
    return [name, { count: people.length, photos: people.slice(0, 6).map((person) => ({ photoUrl: person.photoUrl })) }];
  }));
  return json({ folders });
}
