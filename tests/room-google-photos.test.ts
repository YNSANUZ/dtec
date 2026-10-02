import { expect, it, vi } from "vitest";
import { readGooglePhotos, validGooglePhoto } from "@/lib/rooms/google-photos";

it("allows only HTTPS Google-hosted photos without credentials or arbitrary ports", () => {
  for (const value of ["https://lh3.googleusercontent.com/image", "https://googleusercontent.com/image"]) expect(validGooglePhoto(value)).toBe(value);
  for (const value of [null, 42, "http://lh3.googleusercontent.com/a", "https://googleusercontent.com.evil.test/a", "https://evilgoogleusercontent.com/a", "data:image/png;base64,AA", "https://user:password@lh3.googleusercontent.com/a", "https://lh3.googleusercontent.com:8080/a", "x".repeat(2049)]) expect(validGooglePhoto(value)).toBeNull();
});
it("deduplicates and batches permitted IDs, discarding unsolicited rows and unsafe URLs", async () => {
  const ids = Array.from({ length: 205 }, (_, i) => `id${i}`);
  const rpc = vi.fn(async (_name: string, args: { p_user_ids: string[] }) => ({ error: null, data: [
    ...args.p_user_ids.map(user_id => ({ user_id, photo_url: "https://lh3.googleusercontent.com/a" })),
    { user_id: "intruder", photo_url: "https://lh3.googleusercontent.com/foreign" },
  ] }));
  const client = { rpc } as unknown as Parameters<typeof readGooglePhotos>[0];
  const result = await readGooglePhotos(client, [...ids, ids[0]]);
  expect(rpc.mock.calls.map(([, args]) => args.p_user_ids.length)).toEqual([200, 5]);
  expect(result.size).toBe(205);
  expect(result.has("intruder")).toBe(false);
});
it("does not call the photo service for an empty set and tolerates failures", async () => {
  const rpc = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ data: [{ user_id: "id", photo_url: "https://foreign.test/a" }], error: null });
  const client = { rpc } as unknown as Parameters<typeof readGooglePhotos>[0];
  expect((await readGooglePhotos(client, [])).size).toBe(0);
  expect(rpc).not.toHaveBeenCalled();
  expect((await readGooglePhotos(client, ["id"])).size).toBe(0);
  expect((await readGooglePhotos(client, ["id"])).get("id")).toBeNull();
});
