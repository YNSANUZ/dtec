import { NextResponse } from "next/server";
import { getRoomMuralContext } from "@/lib/rooms/mural-server";
import { readGooglePhotos } from "@/lib/rooms/google-photos";
import type { MuralUser } from "@/lib/rooms/authorization";

type Section = "notices" | "events" | "fundraisers";
type Resource = { id: string; author_id?: string };
type Profile = { user_id: string; display_name: string; avatar_id: string; title: string | null };
const sectionNames: Section[] = ["notices", "events", "fundraisers"];
const PAGE = 100;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error("participation_read_failed");
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

async function collect(user: MuralUser, slug: string, section: Section) {
  const table = section === "notices" ? "mural_messages" : section === "events" ? "room_events" : "fundraisers";
  const resources = await readAll<Resource>((from, to) => {
    const query = section === "notices"
      ? user.supabase.from("mural_messages").select("id, author_id").eq("room_slug", slug)
      : user.supabase.from(table).select("id").eq("room_slug", slug).eq("status", "open");
    return query.order("id").range(from, to);
  });
  const people = new Set<string>();
  if (section === "notices") for (const resource of resources) if (resource.author_id) people.add(resource.author_id);
  const association = section === "notices" ? "mural_message_reactions" : section === "events" ? "room_event_interests" : "fundraiser_participants";
  const parent = section === "notices" ? "message_id" : section === "events" ? "event_id" : "fundraiser_id";
  // Scope parent IDs first: an association to another room must never enter the roster.
  for (const group of chunks(resources.map((resource) => resource.id), PAGE)) {
    const rows = await readAll<{ user_id: string }>((from, to) => {
      let query = user.supabase.from(association).select("user_id").in(parent, group);
      if (section === "fundraisers") query = query.eq("active", true);
      return query.order(parent).order("user_id").range(from, to);
    });
    for (const row of rows) people.add(row.user_id);
  }
  return people;
}

export async function roomParticipation(request: Request, slugInput: string) {
  const access = await getRoomMuralContext(slugInput);
  if (!access.ok) return access.response;
  const selected = new URL(request.url).searchParams.get("section");
  if (selected !== null && !sectionNames.includes(selected as Section)) return json({ error: "invalid_section" }, 400);
  const requested = selected === null ? sectionNames : [selected as Section];
  try {
    const idsBySection = new Map(await Promise.all(requested.map(async (section) => [section, await collect(access.context, access.slug, section)] as const)));
    const ids = [...new Set([...idsBySection.values()].flatMap((people) => [...people]))];
    const profiles: Profile[] = [];
    for (const group of chunks(ids, PAGE)) profiles.push(...await readAll<Profile>((from, to) => access.context.supabase.from("profiles")
      .select("user_id, display_name, avatar_id, title").in("user_id", group).order("user_id").range(from, to)));
    const profilesById = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const rosterFor = (section: Section) => [...(idsBySection.get(section) ?? [])].flatMap((id) => {
      const profile = profilesById.get(id);
      return profile ? [{ userId: id, name: profile.display_name, avatar: profile.avatar_id, title: profile.title ?? "" }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const rosters = new Map(requested.map((section) => [section, rosterFor(section)]));
    const photoIds = requested.flatMap((section) => {
      const people = rosters.get(section) ?? [];
      return (selected === null ? people.slice(0, 6) : people).map((person) => person.userId);
    });
    const photos = await readGooglePhotos(access.context.supabase, photoIds);
    if (selected !== null) return json({ people: (rosters.get(selected as Section) ?? []).map((person) => ({ ...person, photoUrl: photos.get(person.userId) ?? null })) });
    return json({ sections: Object.fromEntries(requested.map((section) => {
      const people = rosters.get(section) ?? [];
      return [section, { count: people.length, photos: people.slice(0, 6).map((person) => ({ photoUrl: photos.get(person.userId) ?? null })) }];
    })) });
  } catch { return json({ error: "participation_read_failed" }, 500); }
}
