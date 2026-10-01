import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/supabase/config";

describe("public Supabase configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports unavailable when either required public variable is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(hasSupabaseConfig()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    expect(hasSupabaseConfig()).toBe(false);
  });

  it("returns only the browser-safe URL and publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-never-reach-browser");

    expect(hasSupabaseConfig()).toBe(true);
    expect(getPublicSupabaseConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
    expect(JSON.stringify(getPublicSupabaseConfig())).not.toContain("must-never-reach-browser");
  });
});
