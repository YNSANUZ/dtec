"use client";
import { Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose } from "@/components/ui/dialog";
import { hasPermission,roleIdentity,roomPermissions,type CuboRole } from "@/lib/rooms/permissions";
const roles:CuboRole[]=["owner","leader","member","visitor"];
const pending=new Set(["mute","kick","ban","moderationHistory","permissions","settings","deleteRoom"]);
export function RoomRules({open,onClose}:{open:boolean;onClose:()=>void}){
  return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="room-rules mural-window-retro" showCloseButton={false}>
    <header className="explorer-titlebar"><div><DialogTitle>Regras do CuboChat</DialogTitle><DialogDescription>Cargos e permissões por sala</DialogDescription></div><DialogClose aria-label="Fechar regras">×</DialogClose></header>
    <div className="explorer-body"><p>Uma conta pode participar de vários grupos. Seu cargo vale somente na sala em que foi concedido.</p><h2>CARGOS E PERMISSÕES</h2>
      <div className="permissions-scroll" tabIndex={0} role="region" aria-label="Tabela de cargos e permissões"><table><thead><tr><th>Ação</th>{roles.map(role=><th key={role}>{roleIdentity[role]}</th>)}</tr></thead><tbody>{roomPermissions.map(rule=><tr key={rule.id}><th scope="row">{rule.label}{pending.has(rule.id)&&<small> · em preparação</small>}</th>{roles.map(role=><td key={role} aria-label={hasPermission(role,rule.id)?"Permitido":"Bloqueado"}>{hasPermission(role,rule.id)?"✅":"❌"}</td>)}</tr>)}</tbody></table></div>
      <p>Cargos concedem poderes; títulos como DEV e DESIGN são apenas uma apresentação. Você não pode escolher seu próprio cargo no perfil.</p><p>ADM/MOD moderam conteúdos compartilhados. Notas privadas, equipe e públicas terão controles próprios de visibilidade; essa opção ainda está em preparação.</p><p>Visitantes caminham localmente, sem publicar mensagens ou conteúdos. Visitantes, logados ou não, não podem abrir nenhum painel. Para participar, solicite aprovação de um ADM/MOD ou use um convite válido. Moderadores não podem expulsar ou banir outros MODs nem o proprietário.</p><p>Vaquinhas registram participação e marcações manuais. O CuboChat não realiza transferências. Remover uma campanha da área ativa preserva os registros financeiros.</p>
    </div></DialogContent></Dialog>;
}
