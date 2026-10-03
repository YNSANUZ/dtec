import { describe, expect, it } from "vitest";
import { authCallbackDestination, safeReturnPath } from "@/lib/auth/redirects";

describe("safeReturnPath", () => {
  it.each([
    [null, "/"],
    ["/", "/"],
    ["/sala?painel=mural", "/sala?painel=mural"],
    ["https://evil.example/steal", "/"],
    ["//evil.example/steal", "/"],
    ["not-a-path", "/"],
    ["/%E0%A4%A", "/"],
    ["/a/..//outside.invalid", "/"],
    ["/a/%2e%2e//outside.invalid", "/"],
    ["/a/.%2E///outside.invalid/path", "/"],
    ["/a/../%2foutside.invalid", "/%2foutside.invalid"],
    ["/a/../qa20261002?panel=chat#history", "/qa20261002?panel=chat#history"],
    ["/dtec?next=https://outside.invalid/#history", "/dtec?next=https://outside.invalid/#history"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});

describe("authCallbackDestination", () => {
  it("returns a safe cancellation marker when Google access is cancelled", () => {
    expect(authCallbackDestination({ code: null, error: "access_denied", returnTo: "/" }))
      .toBe("/?auth_error=cancelled");
  });

  it("returns a safe missing-code marker without echoing provider details", () => {
    expect(authCallbackDestination({ code: null, error: null, returnTo: "/sala" }))
      .toBe("/?auth_error=invalid_callback");
  });

  it("returns the validated local destination when a code exists", () => {
    expect(authCallbackDestination({ code: "oauth-code", error: null, returnTo: "/sala" }))
      .toBe("/sala");
  });
});
