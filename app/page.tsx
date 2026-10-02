"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CakeSlice, ChevronDown, HelpCircle, Maximize, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AvatarPreview from "@/components/avatar-preview";
import { useDtecAuth } from "@/hooks/use-dtec-auth";
import type { AvatarId } from "@/lib/profile/validation";

const OfficeScene = dynamic(() => import("@/components/office-scene"), { ssr: false });
const birthdays = [{ name:"Ana",date:"05 de outubro",color:"#f6a0a9",initial:"A" },{ name:"Bruno",date:"12 de outubro",color:"#9cb7f6",initial:"B" },{ name:"Carla",date:"28 de outubro",color:"#f0756e",initial:"C" }];
const avatars: AvatarId[] = ["a", "c", "f", "j", "n", "r"];
type ChatMessage={id:number;name:string;text:string};

export default function Home(){
 const auth=useDtecAuth(),ready=auth.state==="ready";
 const [birthdayOpen,setBirthdayOpen]=useState(false),[creatorOpen,setCreatorOpen]=useState(false),[controlsOpen,setControlsOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[chatOpen,setChatOpen]=useState(false);
 const [name,setName]=useState("Você"),[avatar,setAvatar]=useState<AvatarId>("r"),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(""),[action,setAction]=useState<"idle"|"dance"|"wave">("idle"),[chatText,setChatText]=useState(""),[messages,setMessages]=useState<ChatMessage[]>([]),[bubble,setBubble]=useState("");

 useEffect(()=>{const id=window.setTimeout(()=>{const history=localStorage.getItem("dtec-chat");if(history)try{setMessages(JSON.parse(history).slice(-5))}catch{}},0);return()=>clearTimeout(id)},[]);
 const sceneName=auth.profile?.displayName??name,sceneAvatar=auth.profile?.avatarId??avatar;

 const save=async()=>{setSaving(true);setSaveError("");try{await auth.saveProfile({displayName:name,avatarId:avatar});setCreatorOpen(false)}catch(error){setSaveError(error instanceof Error?error.message:"Não foi possível salvar.")}finally{setSaving(false)}};
 const editProfile=()=>{if(auth.profile){setName(auth.profile.displayName);setAvatar(auth.profile.avatarId)}setSaveError("");setCreatorOpen(true);setAccountOpen(false)};
 const avatarClick=useCallback(()=>{if(ready)setControlsOpen(true)},[ready]),birthdayClick=useCallback(()=>setBirthdayOpen(true),[]);
 const sendMessage=(e:React.FormEvent)=>{e.preventDefault();if(!ready)return;const text=chatText.trim().slice(0,100);if(!text)return;const next=[...messages,{id:Date.now(),name:sceneName,text}].slice(-5);setMessages(next);setBubble(text);setChatText("");setAction("wave");localStorage.setItem("dtec-chat",JSON.stringify(next));window.setTimeout(()=>{setBubble("");setAction("idle")},5000)};
 const chooserOpen=auth.state==="authenticated-needs-profile"||creatorOpen;

 return <main className="app-shell"><OfficeScene name={sceneName} avatar={sceneAvatar} action={action} message={bubble} created={ready} remoteUsers={[]} onStateChange={()=>{}} onAvatarClick={avatarClick} onBirthdayClick={birthdayClick}/><div className="shade"/><nav className="legal-links" aria-label="Informações legais"><Link href="/politica-de-privacidade">Privacidade</Link><span aria-hidden="true">·</span><Link href="/termos-de-servico">Termos</Link></nav>
 <header className="topbar"><div className="brand">DTEC</div><span className="divider"/><div className="online"><Users size={23}/><b>•</b><span>8 na sala</span></div><div className="top-actions"><button aria-label="Tela cheia" onClick={()=>document.documentElement.requestFullscreen?.()}><Maximize/></button><button aria-label="Ajuda" onClick={()=>setControlsOpen(ready)}><HelpCircle/></button>{auth.state==="anonymous"&&<a className="profile google-entry" aria-label="Entrar com Google" href="/auth/login"><i className="google-logo" style={{backgroundImage:'url("https://img.icons8.com/color/1200/google-logo.jpg")'}} aria-hidden="true"/><span className="login-label">Entrar</span></a>}{ready&&<button className="profile" aria-label="Abrir perfil" onClick={()=>setAccountOpen(v=>!v)}><span>{sceneName.slice(0,2).toUpperCase()}</span><ChevronDown size={17}/></button>}</div></header>
 {auth.error&&<div className="auth-notice" role="status">{auth.error}<button aria-label="Fechar aviso" onClick={auth.clearError}>×</button></div>}
 {accountOpen&&ready&&<div className="account-menu"><strong>{sceneName}</strong><small>{auth.user?.email}</small><button onClick={editProfile}>Meu avatar</button><button onClick={()=>{setAccountOpen(false);setChatOpen(false);setControlsOpen(false);void auth.signOut()}}>Sair da conta</button></div>}
 {ready&&<nav className="actionbar" aria-label="Ações do personagem"><button onClick={()=>setAction(action==="dance"?"idle":"dance")}>{action==="dance"?"Parar":"Dançar"}</button><button onClick={()=>setChatOpen(v=>!v)}>Conversar</button><button onClick={editProfile}>Meu avatar</button></nav>}
 {chatOpen&&ready&&<form className="chat-pop" onSubmit={sendMessage}><strong>Conversar</strong><input autoFocus value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Digite uma mensagem..." maxLength={100}/><button>Enviar</button></form>}
 {messages.length>0&&<aside className="chat-history" aria-label="Últimas mensagens"><h3>Conversas recentes</h3>{messages.map(m=><p key={m.id}><strong>{m.name}</strong><span>{m.text}</span></p>)}</aside>}
 {controlsOpen&&ready&&<div className="avatar-pop"><button className="close-mini" onClick={()=>setControlsOpen(false)}><X/></button><strong>{sceneName}</strong><small>Você assumiu o controle.</small><p>Clique no chão para caminhar.</p><button onClick={()=>setAction(action==="dance"?"idle":"dance")}>Dançar</button><button onClick={editProfile}>Editar personagem</button></div>}
 <Dialog open={chooserOpen} onOpenChange={open=>{if(auth.state!=="authenticated-needs-profile")setCreatorOpen(open)}}><DialogContent className="creator-dialog" overlayClassName="creator-overlay"><DialogHeader><DialogTitle>Escolha seu personagem</DialogTitle><DialogDescription>O escritório continua ativo enquanto você escolhe.</DialogDescription></DialogHeader><label>Seu nome<input value={name==="Você"?"":name} onChange={e=>setName(e.target.value)} placeholder="Digite seu nome" maxLength={18}/></label><div className="avatar-grid">{avatars.map((id,i)=><button key={id} type="button" aria-label={`Personagem ${i+1}`} className={avatar===id?"selected":""} onClick={()=>setAvatar(id)}><AvatarPreview model={id}/><b>{i+1}</b></button>)}</div>{saveError&&<p className="save-error" role="alert">{saveError}</p>}<button className="primary" onClick={()=>void save()} disabled={saving}>{saving?"Salvando...":"Entrar na sala"}</button></DialogContent></Dialog>
 <Dialog open={birthdayOpen} onOpenChange={setBirthdayOpen}><DialogContent className="birthday-dialog"><DialogHeader><div className="birthday-title"><CakeSlice/><DialogTitle>Aniversariantes<br/><em>de Outubro</em></DialogTitle></div><DialogDescription>Vamos celebrar quem faz aniversário neste mês.</DialogDescription></DialogHeader><div className="birthday-list">{birthdays.map(i=><article key={i.name}><span style={{background:i.color}}>{i.initial}</span><div><strong>{i.name}</strong><p>{i.date}</p></div></article>)}</div><footer>Parabéns a todos!<small>Que seja um novo ciclo incrível! ♥</small></footer></DialogContent></Dialog></main>}
