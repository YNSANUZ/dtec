"use client";
import { isGuestToken } from "@/lib/rooms/admission";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import type { useRoomMembership } from "@/hooks/use-room-membership";

export function RoomJoinRequest({ membership }: { membership: ReturnType<typeof useRoomMembership> }) {
  const [open, setOpen] = useState(false),[token,setToken]=useState("");
  if (membership.active) return null;
  if (membership.loading) return <p>Conferindo participação…</p>;
  if (membership.status === "banned") return <p>Seu acesso a esta sala está bloqueado. Fale com um ADM.</p>;
  return <>
    {membership.status === "pending" ? <p role="status">Solicitação enviada. Aguarde um ADM ou MOD aceitar sua entrada.</p> : <button type="button" disabled={membership.busy} onClick={() => setOpen(true)}>Participar do grupo</button>}
    {membership.error && <p role="alert">{membership.error}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="welcome-dialog" showCloseButton={false}>
      <DialogClose aria-label="Fechar participação">×</DialogClose><DialogTitle>Participar do grupo</DialogTitle>
      <DialogDescription>{membership.entryMode==="public"?"Este grupo permite entrada pública após login Google. Confirme para participar.":"Insira um token de convite ou solicite entrada e aguarde aprovação de um ADM ou MOD."}</DialogDescription>
      {membership.entryMode==="protected"&&<><label>Token de convite<input aria-label="Token de convite" placeholder="ab12" autoComplete="off" maxLength={4} value={token} onChange={event=>setToken(event.target.value.toLowerCase())}/></label><button type="button" disabled={membership.busy||!isGuestToken(token)} onClick={async()=>{if(await membership.join(token))setOpen(false);}}>Entrar com token</button></>}
      <small>Solicitar entrada em um grupo protegido não libera painéis antes da aprovação.</small>
      <button type="button" className="mural-primary-button" disabled={membership.busy} onClick={async () => { if (await membership.join()) setOpen(false); }}>{membership.busy ? "Enviando…" : membership.entryMode==="public"?"Participar agora":"Solicitar entrada"}</button>
    </DialogContent></Dialog>
  </>;
}
