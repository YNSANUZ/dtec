import type { getMuralUserContext } from "@/lib/mural-server";

type Supabase = NonNullable<Awaited<ReturnType<typeof getMuralUserContext>>>["supabase"];

export function validGooglePhoto(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
      && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")) ? url.href : null;
  } catch { return null; }
}

export async function readGooglePhotos(supabase: Supabase, ids: string[]) {
  const unique = [...new Set(ids)];
  const photos = new Map<string, string | null>();
  for (let start = 0; start < unique.length; start += 200) {
    const group = unique.slice(start, start + 200);
    try {
      const { data, error } = await supabase.rpc("room_google_photos", { p_user_ids: group });
      if (error) continue;
      for (const row of (data ?? []) as Array<{ user_id: string; photo_url: unknown }>) {
        // A stale/invalid RPC result must not introduce another person's image.
        if (group.includes(row.user_id)) photos.set(row.user_id, validGooglePhoto(row.photo_url));
      }
    } catch { /* Optional pictures never prevent reading the event. */ }
  }
  return photos;
}
