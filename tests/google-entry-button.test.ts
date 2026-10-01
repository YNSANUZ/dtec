import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("visitor entry shows the approved Google logo and Entrar label", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  expect(page).toMatch(/https:\/\/img\.icons8\.com\/color\/1200\/google-logo\.jpg/);
  expect(page).toMatch(/<span className="login-label">Entrar<\/span>/);
  expect(page).toContain('/auth/login');
  expect(css).toMatch(/\.profile\.google-entry[^}]*background:rgba\(8,15,28,/);
  expect(css).toMatch(/\.profile\.google-entry \.google-logo[^}]*border-radius:50%[^}]*background-color:#fff/);
  expect(css).toMatch(/\.profile\.google-entry \.login-label[^}]*color:#fff/);
});
