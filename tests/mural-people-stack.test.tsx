import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MuralPeopleStack } from "@/components/mural/people-stack";

describe("mural people preview", () => {
  it("shows Google photo circles and a remainder count without names", () => {
    const html = renderToStaticMarkup(<MuralPeopleStack
      title="Kart"
      count={8}
      photos={Array.from({ length: 6 }, (_, index) => ({ photoUrl: `https://lh3.googleusercontent.com/${index}` }))}
      onClick={() => {}}
    />);
    expect(html).toContain("Ver 8 pessoas em Kart");
    expect(html).toContain("+2");
    expect((html.match(/<img /g) ?? [])).toHaveLength(6);
    expect(html).not.toContain("Ana Silva");
  });

  it("uses a neutral placeholder when a Google photo is missing", () => {
    const html = renderToStaticMarkup(<MuralPeopleStack
      title="Vaquinhas" count={1} photos={[{ photoUrl: null }]} onClick={() => {}}
    />);
    expect(html).toContain("Ver 1 pessoa em Vaquinhas");
    expect(html).toContain("mural-people-placeholder");
    expect(html).not.toContain("<img ");
  });
});
