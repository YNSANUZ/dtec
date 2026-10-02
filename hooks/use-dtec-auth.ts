"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { resolveAuthViewState } from "@/lib/auth/view-state";
import type { AvatarId } from "@/lib/profile/validation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type DtecProfile = { displayName: string; avatarId: AvatarId; title: string; bio: string; birthDayMonth: string | null; whatsapp: string };

const authMessages: Record<string, string> = {
  cancelled: "A entrada com Google foi cancelada.",
  invalid_callback: "Não foi possível concluir a entrada com Google.",
  unavailable: "A entrada com Google ainda não está disponível.",
};

export function useDtecAuth() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DtecProfile | null>(null);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async (authenticatedUser: User) => {
    setUser(authenticatedUser);
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar seu personagem.");
    const body = await response.json() as { profile: DtecProfile | null };
    setProfile(body.profile);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      window.setTimeout(() => setError(authMessages[authError] ?? "Não foi possível entrar."), 0);
      params.delete("auth_error");
      const clean = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", clean);
    }

    if (!supabase) {
      window.setTimeout(() => setLoading(false), 0);
      return;
    }

    let active = true;
    const restore = async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !data.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        await loadProfile(data.user);
      } catch (profileError) {
        if (active) setError(profileError instanceof Error ? profileError.message : "Falha ao carregar perfil.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void restore();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile, supabase]);

  const saveProfile = useCallback(async (nextProfile: Omit<DtecProfile, "birthDayMonth"> & { birthDayMonth: string }) => {
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextProfile),
    });
    const body = await response.json() as { profile?: DtecProfile; error?: string };
    if (!response.ok || !body.profile) throw new Error(body.error ?? "Não foi possível salvar seu personagem.");
    setProfile(body.profile);
    setError("");
    return body.profile;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.replace("/");
    router.refresh();
  }, [router, supabase]);

  return {
    state: resolveAuthViewState({ loading, authenticated: Boolean(user), hasProfile: Boolean(profile) }),
    user,
    profile,
    error,
    clearError: () => setError(""),
    saveProfile,
    signOut,
  };
}
