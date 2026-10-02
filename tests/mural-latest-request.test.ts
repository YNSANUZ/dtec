import { describe, expect, it } from "vitest";
import { createLatestRequest } from "@/lib/mural/latest-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("mural people detail requests", () => {
  it("ignores a late result for a previously opened folder", async () => {
    const gate = createLatestRequest<string>();
    const kart = deferred<string>();
    const futebol = deferred<string>();
    const shown: string[] = [];
    const first = gate.run(() => kart.promise, (value) => shown.push(value));
    const second = gate.run(() => futebol.promise, (value) => shown.push(value));
    futebol.resolve("Pessoas do Futebol");
    await second;
    kart.resolve("Pessoas do Kart");
    await first;
    expect(shown).toEqual(["Pessoas do Futebol"]);
  });

  it("does not show details after the window is closed", async () => {
    const gate = createLatestRequest<string>();
    const pending = deferred<string>();
    const shown: string[] = [];
    const loading: string[] = [];
    const work = gate.run(() => pending.promise, (value) => shown.push(value), undefined, () => loading.push("done"));
    gate.invalidate();
    pending.resolve("Pessoas antigas");
    await work;
    expect(shown).toEqual([]);
    expect(loading).toEqual([]);
  });
});
