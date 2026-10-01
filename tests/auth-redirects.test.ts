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
