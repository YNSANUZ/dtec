"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CuboRole } from "@/lib/rooms/permissions";
type Status = "active" | "left" | "kicked" | "banned" | "pending" | "visitor";
type Scope = { key: string };
type Runtime = { scope: Scope; alive: boolean; writing: boolean; readRevision: number };
type Membership = { scope: Scope; status: Status; role: CuboRole; entryMode?: "public"|"protected" };

export function useRoomMembership(roomSlug: string, userId: string | null) {
  const key = `${roomSlug}:${userId ?? "visitor"}`;
  // Returning to A must not make an earlier A response current again.
  const scope = useMemo<Scope>(() => ({ key }), [key]);
  const scopeRef = useRef<Runtime | null>(null);
  const [result, setResult] = useState<Membership>();
  const [failure, setFailure] = useState<{ scope: Scope; message: string }>();
  const [pending, setPending] = useState<Scope>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const isCurrent = (runtime: Runtime) => runtime.alive && scopeRef.current === runtime && runtime.scope === scope;
  useLayoutEffect(() => {
    const runtime = { scope, alive: true, writing: false, readRevision: 0 };
    scopeRef.current = runtime;
    return () => { runtime.alive = false; };
  }, [scope]);
  useEffect(() => {
    if (!userId) return;
    const runtime = scopeRef.current;
    if (!runtime || runtime.scope !== scope) return;
    let active = true, loading = false;
    const controller = new AbortController();
    const read = async () => {
      if (!active || loading || runtime.writing) return;
      loading = true;
      const readRevision = runtime.readRevision;
      const accept = () => active && runtime.alive && scopeRef.current === runtime && readRevision === runtime.readRevision;
      try {
        const response = await fetch(`/api/rooms/${roomSlug}/membership`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json() as { status: Status; role: CuboRole; entryMode?: "public"|"protected" };
        if (body.entryMode !== undefined && !["public","protected"].includes(body.entryMode)) throw new Error();
        if ((body.status==="active") === (body.role==="visitor")) throw new Error();
        if (!["active", "left", "kicked", "banned", "pending", "visitor"].includes(body.status) || !["owner", "leader", "member", "visitor"].includes(body.role)) throw new Error();
        if (accept()) {
          setResult(previous => previous?.scope === scope && previous.status === body.status && previous.role === body.role && previous.entryMode === body.entryMode ? previous : { ...body, scope });
          setFailure(undefined);
        }
      } catch {
        if (accept()) {
          setResult({ scope, status: "visitor", role: "visitor" });
          setFailure({ scope, message: "Não foi possível conferir sua participação na sala." });
        }
      } finally { loading = false; }
    };
    void read();
    const timer = setInterval(() => void read(), 10000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [scope, roomSlug, userId, revision]);
  const current = result?.scope === scope && userId ? result : undefined;
  const change = async (leave: boolean, token?:string) => {
    const runtime = scopeRef.current;
    if (!userId || !runtime || !isCurrent(runtime) || runtime.writing) return false;
    runtime.writing = true;
    runtime.readRevision++;
    setPending(scope);
    setFailure(undefined);
    try {
      const response = await fetch(`/api/rooms/${roomSlug}/membership`, { method: leave ? "DELETE" : "POST", ...(token ? {headers:{"Content-Type":"application/json"},body:JSON.stringify({token})}: {}) });
      if (!isCurrent(runtime)) return false;
      if (!response.ok) throw new Error(response.status === 403 ? "Esta ação não é permitida para sua conta nesta sala." : "Não foi possível atualizar sua participação.");
      const body = leave ? { status: "left" as Status, role: "visitor" as CuboRole, entryMode:current?.entryMode } : await response.json() as {status: Status; role: CuboRole; entryMode?: "public"|"protected"};
      if (!isCurrent(runtime)) return false;
      if (!["active","pending"].includes(body.status) && !leave) throw new Error("Resposta de participação inválida.");
      if (!["owner","leader","member","visitor"].includes(body.role)) throw new Error("Resposta de participação inválida.");
      if (body.entryMode !== undefined && !["public","protected"].includes(body.entryMode)) throw new Error("Resposta de participação inválida.");
      if ((body.status==="active") === (body.role==="visitor")) throw new Error("Resposta de participação inválida.");
      setResult({ scope, ...body });
      refresh();
      return true;
    } catch (reason) {
      if (isCurrent(runtime)) setFailure({ scope, message: reason instanceof Error ? reason.message : "Falha ao atualizar." });
      return false;
    } finally {
      runtime.writing = false;
      if (isCurrent(runtime)) setPending(undefined);
    }
  };
  return { active: current?.status === "active", role: current?.role ?? "visitor", status: current?.status ?? "visitor", loading: Boolean(userId && !current), error: failure?.scope === scope ? failure.message : "", busy: pending === scope, entryMode:current?.entryMode??"public", join: (token?:string) => change(false,token), leave: () => change(true), refresh };
}
