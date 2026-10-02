import { describe, expect, it } from "vitest";
import { toggleMuralReaction } from "@/lib/mural-reactions";

describe("toggleMuralReaction", () => {
  it("adds either reaction from no current reaction", () => {
    expect(toggleMuralReaction(null, "like")).toBe("like");
    expect(toggleMuralReaction(null, "dislike")).toBe("dislike");
  });

  it("toggles the same reaction off", () => {
    expect(toggleMuralReaction("like", "like")).toBeNull();
    expect(toggleMuralReaction("dislike", "dislike")).toBeNull();
  });

  it("switches to the other reaction", () => {
    expect(toggleMuralReaction("like", "dislike")).toBe("dislike");
    expect(toggleMuralReaction("dislike", "like")).toBe("like");
  });
});
