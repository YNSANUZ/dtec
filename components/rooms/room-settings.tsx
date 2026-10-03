"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose } from "@/components/ui/dialog";
import { inviteLifetimes,admissionSettings,isGuestToken,type EntryMode,type InviteLifetime } from "@/lib/rooms/admission";
import { roomIdentity } from "@/lib/rooms/identity";
import { RoomHistory } from "./room-history";
import { RoomAdmissions } from "./room-admissions";

export function RoomSettings({roomSlug,onClose,onIdentitySaved}:{roomSlug:string;onClose:()=>void;onIdentitySaved?:()=>void}){
  const [title,setTitle]=useState(""),[description,setDescription]=useState("");
  const [mode,setMode]=useState<EntryMode>("public"),[lifetime,setLifetime]=useState<InviteLifetime>("10m");
  const [savedMode,setSavedMode]=useState<EntryMode>(),[savedLifetime,setSavedLifetime]=useState<InviteLifetime>();
  const [token,setToken]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const scopeRef=useRef<{active:boolean;writing:boolean}>({active:false,writing:false});
  useEffect(()=>{
    const scope={active:true,writing:false};scopeRef.current=scope;
    const controller=new AbortController();
    void(async()=>{try{
      const response=await fetch(`/api/rooms/${roomSlug}/settings`,{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error();const body:unknown=await response.json();const settings=admissionSettings(body);const identity=roomIdentity(body);
      if(scope.active){setTitle(identity.title);setDescription(identity.description);setMode(settings.entryMode);setSavedMode(settings.entryMode);setLifetime(settings.inviteLifetime);setSavedLifetime(settings.inviteLifetime);}
    }catch{if(scope.active)setError("Não foi possível carregar as configurações.");}})();
    return()=>{scope.active=false;controller.abort();};
  },[roomSlug]);
  const write=async(reset:boolean)=>{
    const scope=scopeRef.current;if(!scope.active||scope.writing||!savedMode)return;
    if(!window.confirm(reset?"Redefinir o token? O anterior deixará de funcionar. Membros existentes permanecerão no grupo.":"Salvar a entrada da sala? Convites anteriores serão invalidados; membros existentes permanecerão."))return;
    scope.writing=true;setBusy(true);setError("");setNotice("");setToken("");
    try{
      const response=await fetch(`/api/rooms/${roomSlug}/settings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reset?{intent:"reset"}:{intent:"save",entryMode:mode,inviteLifetime:lifetime})});
      if(!response.ok)throw new Error();const body:unknown=await response.json();if(!scope.active)return;
      if(reset){const value=body&&typeof body==="object"?(body as Record<string,unknown>).token:null;if(!isGuestToken(value))throw new Error();setToken(value);setNotice("Token novo: várias pessoas podem entrar até vencer ou ser redefinido. Ele não será exibido novamente ao reabrir este painel.");}
      else{const settings=admissionSettings(body);setSavedMode(settings.entryMode);setSavedLifetime(settings.inviteLifetime);setNotice("Configurações salvas. Os membros existentes foram preservados.");}
    }catch{if(scope.active)setError("Não foi possível salvar. Confira suas permissões e atualize o painel.");}
    finally{scope.writing=false;if(scope.active)setBusy(false);}
  };
  const saveIdentity=async()=>{
    const scope=scopeRef.current;if(!scope.active||scope.writing||!savedMode)return;
    let identity;try{identity=roomIdentity({title,description});}catch{setError("Nome: 3–60 caracteres. Descrição: até 280.");return;}
    scope.writing=true;setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(`/api/rooms/${roomSlug}/settings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intent:"identity",...identity})});
      if(!response.ok)throw new Error();const saved=roomIdentity(await response.json());
      if(scope.active){setTitle(saved.title);setDescription(saved.description);setNotice("Nome e descrição salvos. O endereço e os registros da sala foram preservados.");onIdentitySaved?.();}
    }catch{if(scope.active)setError("Não foi possível salvar o nome e a descrição.");}
    finally{scope.writing=false;if(scope.active)setBusy(false);}
  };
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="room-settings room-explorer mural-window-retro" showCloseButton={false}>
    <header className="explorer-titlebar"><div><DialogTitle>Configurações da sala</DialogTitle><DialogDescription>Administração de /{roomSlug} · ADM e MOD</DialogDescription></div><DialogClose aria-label="Fechar configurações">×</DialogClose></header>
    <div className="explorer-body">
      <fieldset disabled={busy||!savedMode}><legend>Identidade da sala</legend><label>Nome da sala<input value={title} maxLength={60} onChange={event=>setTitle(event.target.value)}/></label><label>Descrição na parede<textarea value={description} maxLength={280} onChange={event=>setDescription(event.target.value)}/></label><button type="button" onClick={()=>void saveIdentity()}>Salvar nome e descrição</button></fieldset>
      <fieldset disabled={busy||!savedMode}><legend>Entrada no grupo</legend>
        <label><input type="radio" name="entry-mode" checked={mode==="public"} onChange={()=>{setMode("public");setToken("");}}/> Entrada pública</label>
        <label><input type="radio" name="entry-mode" checked={mode==="protected"} onChange={()=>{setMode("protected");setToken("");}}/> Senha de convidado ativada</label>
        <p>Entrada pública exige login Google e participação explícita. Visitantes não abrem painéis.</p>
        <label>Validade do convite<select value={lifetime} onChange={event=>{setLifetime(event.target.value as InviteLifetime);setToken("");}}>{Object.entries(inviteLifetimes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" className="mural-primary-button" onClick={()=>void write(false)}>Salvar configuração de entrada</button>
      </fieldset>
      {savedMode==="protected"&&<section><h2>Senha de convidado</h2><p>Formato: duas letras minúsculas e dois números. Várias entradas até vencer ou redefinir; por proteção, após 20 tentativas erradas será necessário redefinir.</p><button type="button" disabled={busy||mode!==savedMode||lifetime!==savedLifetime} onClick={()=>void write(true)}>Redefinir token da sala</button>{token&&<label>Token novo<input readOnly value={token} aria-label="Token novo" autoComplete="off"/></label>}</section>}
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <RoomAdmissions roomSlug={roomSlug}/>
      <RoomHistory key={`${roomSlug}:messages`} roomSlug={roomSlug} kind="messages"/>
      <RoomHistory key={`${roomSlug}:entries`} roomSlug={roomSlug} kind="entries"/>
    </div></DialogContent></Dialog>;
}
