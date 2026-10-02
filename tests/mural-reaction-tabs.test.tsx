import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MuralReactionTabs } from "@/components/mural/reaction-tabs";

describe("reaction list filter", () => {
  it("shows one selected list with both accessible choices available", () => {
    const html = renderToStaticMarkup(<MuralReactionTabs selected="like" onSelect={() => {}} />);
    expect(html).toContain("Curtiram");
    expect(html).toContain("Descurtiram");
    expect((html.match(/aria-pressed="true"/g) ?? [])).toHaveLength(1);
    expect((html.match(/aria-pressed="false"/g) ?? [])).toHaveLength(1);
  });

  it("moves the selected state to dislikes without adding a second list", () => {
    const html = renderToStaticMarkup(<MuralReactionTabs selected="dislike" onSelect={() => {}} />);
    expect(html).toMatch(/Descurtiram[^<]*<\/button>/);
    expect(html).toContain("aria-pressed=\"true\"");
  });
});
