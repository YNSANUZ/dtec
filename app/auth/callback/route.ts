import { NextResponse } from "next/server";
import { authCallbackDestination } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const next = url.searchParams.get("next");
  const destination = authCallbackDestination({ code, error, returnTo: next });

  if (!code || error) return NextResponse.redirect(new URL(destination, url.origin));

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.redirect(new URL("/?auth_error=unavailable", url.origin));
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/?auth_error=invalid_callback", url.origin));
  }
  return NextResponse.redirect(new URL(destination, url.origin));
}
