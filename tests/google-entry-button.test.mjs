import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("visitor entry shows the approved Google logo and Entrar label", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /https:\/\/img\.icons8\.com\/color\/1200\/google-logo\.jpg/);
  assert.match(page, /<span className="login-label">Entrar<\/span>/);
});
