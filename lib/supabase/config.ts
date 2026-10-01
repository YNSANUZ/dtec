export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function hasSupabaseConfig(): boolean {
  return getPublicSupabaseConfig() !== null;
}
