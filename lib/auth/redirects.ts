type CallbackInput = {
  code: string | null;
  error: string | null;
  returnTo: string | null;
};

export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }

  try {
    decodeURI(value);
    const parsed = new URL(value, "https://dtec.local");
    return parsed.origin === "https://dtec.local" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}

export function authCallbackDestination({ code, error, returnTo }: CallbackInput): string {
  if (error === "access_denied") return "/?auth_error=cancelled";
  if (error || !code) return "/?auth_error=invalid_callback";
  return safeReturnPath(returnTo);
}
