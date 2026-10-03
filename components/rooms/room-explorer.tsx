"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Folder, Plus, Pencil, Trash2, ArrowLeft, CakeSlice } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { boardPath, type BoardNode } from "@/lib/rooms/board-types";
import type { useRoomBoard } from "@/hooks/use-room-board";
import { Notices } from "./room-board";
import { EventsFolder } from "@/components/mural/events-folder";
import { FundraisersFolder } from "@/components/mural/fundraisers-folder";
import { RoomBirthdays } from "./room-birthdays";

type Props={roomSlug:string;currentUserId:string|null;initialNodeId?:string|null;board:ReturnType<typeof useRoomBoard>;onClose:()=>void};
type Editor={node?:BoardNode;title:string;contentKind:BoardNode["contentKind"];parentId:string|null;order:number;kind:BoardNode["kind"]};
export function RoomExplorer(props:Props){return <ScopedExplorer key={`${props.roomSlug}:${props.currentUserId??"visitor"}`} {...props}/>;}
function ScopedExplorer({roomSlug,currentUserId,initialNodeId,board,onClose}:Props){
  const [selected,setSelected]=useState<string|null>(initialNodeId&&initialNodeId!=="__create_panel__"?initialNodeId:null);
  const [editor,setEditor]=useState<Editor|null>(initialNodeId==="__create_panel__"?{title:"",contentKind:null,parentId:null,order:0,kind:"panel"}:null);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const node=board.nodes.find(n=>n.id===selected),path=boardPath(board.nodes,selected);
  const children=board.nodes.filter(n=>n.parentId===(node?.id??null)).sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title,"pt-BR"));
  const folders=(kind:BoardNode["contentKind"])=>board.nodes.filter(n=>n.contentKind===kind).map(n=>({id:n.id,title:boardPath(board.nodes,n.id).map(p=>p.title).join(" › ")}));
  const mutate=async(url:string,method:string,body?:unknown)=>{
    if(busy)return false;setBusy(true);setError("");
    try{const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error(response.status===409?"Não foi possível remover ou mover. A pasta precisa estar vazia e a organização não pode formar um ciclo.":response.status===403?"Somente ADM/MOD desta sala organiza painéis e pastas.":"Não foi possível salvar a organização.");board.refresh();return true;}
    catch(reason){setError(reason instanceof Error?reason.message:"Falha ao salvar.");return false;}finally{setBusy(false);}
  };
  const beginCreate=()=>setEditor({title:"",contentKind:null,parentId:node?.id??null,order:children.length,kind:node?"folder":"panel"});
  const remove=async(item:BoardNode)=>{if(!window.confirm(`Remover “${item.title}”? Mova ou remova primeiro os conteúdos. Históricos não serão apagados.`))return;if(await mutate(`/api/rooms/${roomSlug}/boards/${item.id}`,"DELETE")){if(item.id===selected)setSelected(item.parentId);}};
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className="room-explorer mural-window-retro" overlayClassName="mural-overlay" showCloseButton={false}>
      <header className="explorer-titlebar"><div><DialogTitle>{editor?editor.node?"Editar pasta ou painel":"Criar pasta ou painel":node?.title??"Painéis da sala"}</DialogTitle><DialogDescription>Organização compartilhada · /{roomSlug}</DialogDescription></div><DialogClose aria-label="Fechar painel">×</DialogClose></header>
      <nav className="explorer-path" aria-label="Caminho da pasta"><button type="button" onClick={()=>{setSelected(null);setEditor(null);}}>Painéis</button>{path.map((p,index)=><React.Fragment key={p.id}><span aria-hidden="true">›</span><button type="button" aria-current={index===path.length-1?"page":undefined} onClick={()=>{setSelected(p.id);setEditor(null);}}>{p.title}</button></React.Fragment>)}{selected&&<button type="button" className="explorer-back" aria-label="Voltar à pasta anterior" onClick={()=>{setSelected(node?.parentId??null);setEditor(null);}}><ArrowLeft size={14}/>Voltar</button>}</nav>
      <div className="explorer-body">
        {!currentUserId?<div className="mural-access-note"><p>Você não tem permissão para abrir este painel. Fale com um ADM ou MOD.</p><Link href={`/auth/login?next=/${roomSlug}`}>Entrar com Google para solicitar participação</Link></div>:board.loading?<p>Carregando painéis…</p>:board.error?<p role="alert">{board.error}</p>:<>
          {error&&<p role="alert" className="mural-form-error">{error}</p>}
          {editor&&board.canManage?<form className="explorer-editor" onSubmit={async event=>{event.preventDefault();const {node:existing,...body}=editor;const ok=await mutate(`/api/rooms/${roomSlug}/boards${existing?`/${existing.id}`:""}`,existing?"PATCH":"POST",existing?{title:body.title,...(existing.kind==="folder"?{parentId:body.parentId}:{}),order:body.order}:body);if(ok)setEditor(null);}}>
            <label>Nome<input autoFocus required maxLength={60} value={editor.title} onChange={event=>setEditor({...editor,title:event.target.value})}/></label>
            {editor.kind==="folder"&&<label>Dentro de<select value={editor.parentId??""} onChange={event=>setEditor({...editor,parentId:event.target.value})}>{board.nodes.filter(n=>!n.contentKind&&n.id!==editor.node?.id).map(n=><option key={n.id} value={n.id}>{boardPath(board.nodes,n.id).map(p=>p.title).join(" › ")}</option>)}</select></label>}
            {!editor.node&&editor.kind==="folder"&&<label>Conteúdo<select value={editor.contentKind??"folder"} onChange={event=>setEditor({...editor,contentKind:event.target.value==="folder"?null:event.target.value as BoardNode["contentKind"]})}><option value="folder">Subpastas</option><option value="notes">Notas, avisos e lembretes</option><option value="events">Eventos</option><option value="fundraisers">Vaquinhas</option><option value="birthdays">Aniversariantes da sala</option></select></label>}
            <label>Ordem<input type="number" min={0} max={999} value={editor.order} onChange={event=>setEditor({...editor,order:Number(event.target.value)})}/></label>
            <div><button type="submit" className="mural-primary-button" disabled={busy}>Salvar</button><button type="button" onClick={()=>setEditor(null)}>Cancelar</button></div>
          </form>:<>
            {board.canManage&&<div className="explorer-tools">{!node?.contentKind&&<button type="button" onClick={beginCreate}><Plus size={15}/>{node?"Criar pasta":"Criar painel"}</button>}{node&&<><button type="button" onClick={()=>setEditor({node,title:node.title,parentId:node.parentId,contentKind:node.contentKind,kind:node.kind,order:node.order})}><Pencil size={14}/>Editar / mover</button>{(node.kind!=="panel"||board.canRemovePanels)&&<button type="button" disabled={busy} onClick={()=>void remove(node)}><Trash2 size={14}/>Remover</button>}</>}</div>}
            {!node?.contentKind&&<div className="explorer-grid">{children.map(child=><button className="explorer-folder" key={child.id} type="button" onClick={()=>{setSelected(child.id);setError("");}}>{child.contentKind==="birthdays"?<CakeSlice size={42}/>:<Folder size={52} fill="#ffdb76" stroke="#b77b16"/>}<strong>{child.title}</strong></button>)}{!children.length&&<p>Nenhuma pasta aqui. O ADM/MOD pode organizar este espaço.</p>}</div>}
            {node?.contentKind==="notes"&&<Notices key={node.id} roomSlug={roomSlug} currentUserId={currentUserId} canManage={board.canManage} folderId={node.id} folderOptions={folders("notes")}/>}
            {node?.contentKind==="events"&&<EventsFolder key={node.id} roomSlug={roomSlug} currentUserId={currentUserId} canManage={board.canManage} folderId={node.id} folderOptions={folders("events")}/>}
            {node?.contentKind==="fundraisers"&&<FundraisersFolder key={node.id} roomSlug={roomSlug} currentUserId={currentUserId} isAdminOrMod={board.canManage} folderId={node.id} folderOptions={folders("fundraisers")}/>}
            {node?.contentKind==="birthdays"&&<RoomBirthdays roomSlug={roomSlug} currentUserId={currentUserId}/>}
          </>}
        </>}
      </div><footer className="explorer-status">Pastas organizam conteúdos; remover um painel não apaga históricos.</footer>
    </DialogContent>
  </Dialog>;
}
