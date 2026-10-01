export type AuthViewState = "loading" | "anonymous" | "authenticated-needs-profile" | "ready";

type AuthViewInput = {
  loading: boolean;
  authenticated: boolean;
  hasProfile: boolean;
};

export function resolveAuthViewState(input: AuthViewInput): AuthViewState {
  if (input.loading) return "loading";
  if (!input.authenticated) return "anonymous";
  return input.hasProfile ? "ready" : "authenticated-needs-profile";
}
