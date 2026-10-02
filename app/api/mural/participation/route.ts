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
const PAGE_SIZE = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await page(from, from + PAGE_SIZE - 1);
    if (result.error) return null;
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

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
    const [messages, fundraisers] = await Promise.all([
      readAll((from, to) => supabase.from("mural_messages").select("id, author_id").eq("room_slug", "dtec").order("id").range(from, to)),
      readAll((from, to) => supabase.from("fundraisers").select("id").eq("room_slug", "dtec").eq("status", "open").order("id").range(from, to)),
    ]);
    if (!messages || !fundraisers) return null;
    for (const row of messages) folders.recados.add(row.author_id);
    const reactionGroups = await Promise.all(chunks(messages.map((row) => row.id), PAGE_SIZE).map((group) => readAll((from, to) => supabase.from("mural_message_reactions")
      .select("user_id").in("message_id", group).order("message_id").order("user_id").range(from, to))));
    if (reactionGroups.some((group) => group === null)) return null;
    for (const group of reactionGroups) for (const row of group ?? []) folders.recados.add(row.user_id);
    const ids = fundraisers.map((row) => row.id);
    if (ids.length) {
      const participantGroups = await Promise.all(chunks(ids, PAGE_SIZE).map((group) => readAll((from, to) => supabase.from("fundraiser_participants")
        .select("user_id").in("fundraiser_id", group).eq("active", true)
        .order("fundraiser_id").order("user_id").range(from, to))));
      if (participantGroups.some((group) => group === null)) return null;
      for (const group of participantGroups) for (const row of group ?? []) folders.vaquinhas.add(row.user_id);
    }
    return folders;
  }

  const events = await readAll((from, to) => supabase.from("room_events")
    .select("id, category").eq("room_slug", "dtec").eq("status", "open").order("id").range(from, to));
  if (!events) return null;
  const categoryById = new Map(events.map((row) => [row.id, row.category]));
  if (!categoryById.size) return folders;
  const interestGroups = await Promise.all(chunks([...categoryById.keys()], PAGE_SIZE).map((group) => readAll((from, to) => supabase.from("room_event_interests")
    .select("event_id, user_id").in("event_id", group).order("event_id").order("user_id").range(from, to))));
  if (interestGroups.some((group) => group === null)) return null;
  for (const group of interestGroups) for (const row of group ?? []) {
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
  const profileGroups = await Promise.all(chunks(userIds, PAGE_SIZE).map((group) => readAll((from, to) => user.supabase.from("profiles")
    .select("user_id, display_name, title").in("user_id", group).order("user_id").range(from, to))));
  if (profileGroups.some((group) => group === null)) return json({ error: "participation_profiles_read_failed" }, 500);
  const profiles = profileGroups.flatMap((group) => group ?? []);
  const photoGroups = await Promise.all(chunks(profiles.map((profile) => profile.user_id), 200)
    .map((group) => user.supabase.rpc("room_google_photos", { p_user_ids: group })));
  const photoRows = photoGroups.flatMap((result) => (result.data ?? []) as Array<{ user_id: string; photo_url: string | null }>);
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
