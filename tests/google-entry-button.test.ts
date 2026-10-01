import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("visitor entry shows the approved Google logo and Entrar label", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  expect(page).toMatch(/https:\/\/img\.icons8\.com\/color\/1200\/google-logo\.jpg/);
  expect(page).toMatch(/<span className="login-label">Entrar<\/span>/);
});
