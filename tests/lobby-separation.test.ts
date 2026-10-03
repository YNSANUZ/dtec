import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("public lobby contains no DTEC data requests or room branding", async () => {
  const lobby = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const scene = await readFile(new URL("../components/office-scene.tsx", import.meta.url), "utf8");
  expect(lobby).toContain('environment="lobby"');
  expect(lobby).toContain('href="/dtec"');
  expect(lobby).not.toMatch(/\/api\/(?:mural|fundraisers|events|room\/characters|room\/presence)/);
  expect(lobby).toContain('fetch("/api/rooms"');
  expect(scene).toContain('environment === "lobby" ? []');
  expect(scene).toContain('environment==="lobby"?"CUBOCHAT":"DTEC"');
});
