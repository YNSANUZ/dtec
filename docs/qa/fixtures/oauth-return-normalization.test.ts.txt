import { beforeEach, expect, it, vi } from "vitest";
import { safeReturnPath } from "@/lib/auth/redirects";
const state = vi.hoisted(() => ({ exchangeError: false }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: vi.fn(async () => ({ error: state.exchangeError ? { message: "synthetic failure" } : null })) },
  })),
}));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => { state.exchangeError = false; });
const paths = ["/a/..//outside.invalid", "/a/%2e%2e//outside.invalid"];
const request = (next: string) => {
  const url = new URL("https://preview.invalid/auth/callback");
  url.searchParams.set("code", "fictitious-code");
  url.searchParams.set("next", next);
  return new Request(url);
};
it.each(paths)("normalizes without returning a protocol-relative path: %s", (path) => {
  expect(safeReturnPath(path)).toBe("/");
});
it.each(paths)("keeps the real callback handler on its origin after a synthetic successful exchange: %s", async (path) => {
  const response = await GET(request(path));
  expect(response.headers.get("location")).toBe("https://preview.invalid/");
});
it("preserves an ordinary room return including query and hash", async () => {
  expect((await GET(request("/qa20261002?panel=chat#history"))).headers.get("location"))
    .toBe("https://preview.invalid/qa20261002?panel=chat#history");
});
it("stays local after a failed synthetic exchange", async () => {
  state.exchangeError = true;
  expect((await GET(request(paths[0]))).headers.get("location"))
    .toBe("https://preview.invalid/?auth_error=invalid_callback");
});
