import { expect, it } from "vitest";
import { googleIdentity } from "@/lib/profile/google-identity";

it("suggests exactly the first two Google names and uses a Google photo", () => {
  expect(googleIdentity({ user_metadata: { full_name: " Ana Maria Silva ", avatar_url: "https://lh3.googleusercontent.com/photo" } }))
    .toEqual({ name: "Ana Maria Silva", suggestedName: "Ana Maria", photo: "https://lh3.googleusercontent.com/photo" });
});
it("falls back to the Google identity, rejecting unsafe or unrelated image URLs", () => {
  expect(googleIdentity({ user_metadata: { picture: "https://googleusercontent.com.evil.test/photo" }, identities: [{ provider: "google", identity_data: { name: "Beto Lima", picture: "https://lh3.googleusercontent.com/photo" } }] }))
    .toMatchObject({ suggestedName: "Beto Lima", photo: "https://lh3.googleusercontent.com/photo" });
  for (const picture of ["javascript:alert(1)", "http://lh3.googleusercontent.com/photo", "https://name:pass@lh3.googleusercontent.com/photo", "not-a-url"]) {
    expect(googleIdentity({ user_metadata: { picture } }).photo).toBe("");
  }
});
it("handles visitors and missing Google metadata without requesting anything", () => {
  expect(googleIdentity(null)).toEqual({ name: "", suggestedName: "", photo: "" });
});
