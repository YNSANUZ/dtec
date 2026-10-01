import { NextResponse } from "next/server";
import { safeReturnPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeReturnPath(url.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.redirect(new URL("/?auth_error=unavailable", url.origin));

  const callback = new URL("/auth/callback", url.origin);
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/?auth_error=unavailable", url.origin));
  }
  return NextResponse.redirect(data.url);
}
