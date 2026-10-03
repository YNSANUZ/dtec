"use client";
import React,{useState,useSyncExternalStore} from "react";
import { Bell } from "lucide-react";
import { Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose } from "@/components/ui/dialog";
const welcomeVersion="cubochat-welcome-v1";
const subscribe=(notify:()=>void)=>{window.addEventListener("storage",notify);window.addEventListener(welcomeVersion,notify);return()=>{window.removeEventListener("storage",notify);window.removeEventListener(welcomeVersion,notify);};};
const unreadSnapshot=()=>{try{return localStorage.getItem(welcomeVersion)!=="read";}catch{return true;}};
export function WelcomeBell(){
  const [open,setOpen]=useState(false),[expanded,setExpanded]=useState(false),[readHere,setReadHere]=useState(false);
  const unread=useSyncExternalStore(subscribe,unreadSnapshot,()=>true)&&!readHere;
  const read=()=>{setExpanded(true);setReadHere(true);try{localStorage.setItem(welcomeVersion,"read");window.dispatchEvent(new Event(welcomeVersion));}catch{/* Still usable without storage. */}};
  return <><button type="button" className="welcome-bell" aria-label="Notificações e boas-vindas" onClick={()=>{setExpanded(false);setOpen(true);}}><Bell size={21}/>{unread&&<span className="welcome-unread" aria-label="Nova mensagem"/>}</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="welcome-dialog" showCloseButton={false}><DialogClose aria-label="Fechar boas-vindas">×</DialogClose><DialogTitle>{expanded?"Bem-vindo ao CuboChat!":"Notificações"}</DialogTitle><DialogDescription>Um lugar para seu grupo se encontrar e se organizar.</DialogDescription>
      {!expanded?<button type="button" className="welcome-card" onClick={read}><strong>Bem-vindo ao CuboChat!</strong><span>Conheça o que você pode fazer por aqui.</span></button>:<div className="welcome-copy"><p>O CuboChat é um espaço de convivência online: cada pessoa escolhe um personagem, conversa e participa de uma sala compartilhada.</p><p>Use com a turma da escola ou faculdade, seu condomínio, academia, equipe de trabalho, grupo de corrida, futebol e muitos outros grupos.</p><p>Os painéis ajudam a organizar recados, avisos, lembretes, compromissos, eventos, aniversários e vaquinhas. Cada grupo pode organizar suas pastas do seu jeito.</p><p>Toque no chão para caminhar, em um painel para abrir as pastas e em um membro para conhecer o perfil. Entre com Google e complete seu perfil para participar.</p><small>Vaquinhas registram participação e marcações manuais: o CuboChat não realiza transferências de dinheiro.</small></div>}
    </DialogContent></Dialog></>;
}
