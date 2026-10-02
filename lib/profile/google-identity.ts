type GoogleUser = { user_metadata?: Record<string, unknown>; identities?: Array<{ provider: string; identity_data?: Record<string, unknown> }> };

export function googleIdentity(user: GoogleUser | null) {
  const metadata = user?.user_metadata ?? {};
  const identity = user?.identities?.find((entry) => entry.provider === "google")?.identity_data ?? {};
  const name = [metadata.full_name, metadata.name, identity.full_name, identity.name]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const photo = [metadata.avatar_url, metadata.picture, identity.avatar_url, identity.picture]
    .find((value) => typeof value === "string" && safeGooglePhoto(value)) as string | undefined;
  return { name: name?.trim() ?? "", suggestedName: name?.trim().split(/\s+/).slice(0, 2).join(" ") ?? "", photo: photo ?? "" };
}

function safeGooglePhoto(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"));
  } catch { return false; }
}
