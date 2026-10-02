"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Crown, HelpCircle, Maximize, Star, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AvatarPreview from "@/components/avatar-preview";
import MuralWindow from "@/components/mural-window";
import { useDtecAuth } from "@/hooks/use-dtec-auth";
import type { MuralId } from "@/lib/mural-types";
import { canAppointModerator, roleLabel } from "@/lib/room/roles";
import type { AvatarId } from "@/lib/profile/validation";
import { useRoomChatViewport } from "@/hooks/use-room-chat-viewport";
import chatStyles from "@/components/rooms/dtec-chat.module.css";

const OfficeScene = dynamic(() => import("@/components/office-scene"), { ssr: false });
const avatars: AvatarId[] = ["a", "c", "f", "j", "n", "r"];
type ChatMessage = { id: string; authorId: string; name: string; text: string; createdAt: string };
type OnlineUser = { userId: string; name: string; avatar: AvatarId; title?: string; role?: "owner" | "leader" | "member"; x: number; z: number; action: string; online: boolean; birthdayToday: boolean };
type UserCard = Pick<OnlineUser, "userId" | "name" | "avatar" | "title" | "role"> & { bio: string; birthDayMonth: string | null; whatsapp: string };
type PresenceState = { x: number; z: number; action: string };

function displayBirthday(value: string | null) {
  if (!value) return "";
  const [day, month] = value.split("/").map(Number);
  if (!day || !month) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, month - 1, day)));
}

export default function DtecRoom() {
  const auth = useDtecAuth();
  const ready = auth.state === "ready";
  const [activeMural, setActiveMural] = useState<MuralId | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserCard | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [leaderError, setLeaderError] = useState("");
  const [name, setName] = useState("Você");
  const [avatar, setAvatar] = useState<AvatarId>("r");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [birthDayMonth, setBirthDayMonth] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [action, setAction] = useState<"idle" | "dance" | "wave">("idle");
  const [sceneStart, setSceneStart] = useState({ x: 0, z: 5 });
  // Authentication may be ready before saved coordinates arrive. Keep the
  // scene non-interactive until this authenticated session has been restored.
  const [restoredUser, setRestoredUser] = useState<typeof auth.user>(null);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const { rootRef: chatRootRef, onFocus: chatOnFocus, onBlur: chatOnBlur } = useRoomChatViewport();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatRevision = useRef(0);
  const sendScope = useRef<{ active: boolean; sending: boolean } | null>(null);
  const [bubble, setBubble] = useState("");
  const bubbleTimer = useRef<number | null>(null);
  const presence = useRef<PresenceState>({ x: 0, z: 5, action: "idle" });
  const initializedProfile = useRef<typeof auth.user>(null);

  useEffect(() => {
    const scope = { active: true, sending: false };
    sendScope.current = scope;
    return () => {
      scope.active = false;
      if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
      setChatSending(false);
      setChatError("");
      setBubble("");
      setAction((current) => current === "wave" ? "idle" : current);
    };
  }, [auth.user?.id, auth.state]);

  useEffect(() => {
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const loadChat = async () => {
      if (!active || loading) return;
      loading = true;
      const revision = chatRevision.current;
      try {
        const response = await fetch("/api/rooms/dtec/chat", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as { messages?: ChatMessage[] };
        if (active && revision === chatRevision.current) setMessages(body.messages ?? []);
      } catch { /* retry on next poll */ }
      finally { loading = false; }
    };
    void loadChat();
    const timer = window.setInterval(() => void loadChat(), 2000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    // Removing a focused input does not reliably emit blur on every browser.
    if (!chatOpen || !ready) chatOnBlur();
  }, [chatOpen, ready, chatOnBlur]);

  useEffect(() => {
    if (!auth.user || auth.profile) return;
    const metadata = auth.user.user_metadata ?? {};
    const googleIdentity = auth.user.identities?.find((identity) => identity.provider === "google")?.identity_data ?? {};
    const nameCandidate = [metadata.full_name, metadata.name, `${metadata.given_name ?? ""} ${metadata.family_name ?? ""}`, googleIdentity.full_name, googleIdentity.name]
      .find((candidate) => typeof candidate === "string" && candidate.trim());
    const fullName = String(nameCandidate ?? "")
      .trim().replace(/\s+/g, " ").split(" ").slice(0, 2).join(" ");
    if (fullName) window.setTimeout(() => setName(fullName), 0);
  }, [auth.profile, auth.user]);

  const googlePhoto = String(auth.user?.user_metadata?.avatar_url ?? auth.user?.user_metadata?.picture ?? "");
  const googleAccountName = String(auth.user?.user_metadata?.full_name ?? auth.user?.user_metadata?.name ?? name);

  const sceneName = auth.profile?.displayName ?? name;
  const sceneAvatar = auth.profile?.avatarId ?? avatar;
  const currentRole = onlineUsers.find((user) => user.userId === auth.user?.id)?.role;
  const canManageRoomRoles = canAppointModerator(currentRole);
  const isAdminOrMod = currentRole === "owner" || currentRole === "leader";

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await auth.saveProfile({ displayName: name, avatarId: avatar, title, bio, birthDayMonth, whatsapp, instagram: auth.profile?.instagram ?? "" });
      setCreatorOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  };

  const editProfile = () => {
    if (auth.profile) {
      setName(auth.profile.displayName);
      setAvatar(auth.profile.avatarId);
      setTitle(auth.profile.title);
      setBio(auth.profile.bio);
      setBirthDayMonth(auth.profile.birthDayMonth ?? "");
      setWhatsapp(auth.profile.whatsapp);
    }
    setSaveError("");
    setCreatorOpen(true);
    setAccountOpen(false);
  };

  const characterClick = useCallback((userId: string | null) => {
    if (auth.state === "anonymous") {
      setLoginPromptOpen(true);
      return;
    }
    if (!ready) return;
    if (userId && userId !== auth.user?.id) {
      const user = onlineUsers.find((entry) => entry.userId === userId);
      if (!user) return;
      setSelectedUser({ ...user, title: user.title ?? "", role: user.role ?? "member", bio: "", birthDayMonth: null, whatsapp: "" });
      setProfileLoading(true);
      setLeaderError("");
      return;
    }
    setControlsOpen(true);
  }, [auth.state, auth.user?.id, onlineUsers, ready]);
  const muralClick = useCallback((id: MuralId) => {
    if (ready) setActiveMural(id);
    else if (auth.state === "anonymous") setLoginPromptOpen(true);
  }, [auth.state, ready]);
  const updatePresence = useCallback((x: number, z: number, nextAction: string) => {
    presence.current = { x, z, action: nextAction === "dance" ? "dance" : ["walk", "sit"].includes(nextAction) ? nextAction : "idle" };
  }, []);

  useEffect(() => {
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const loadCharacters = async () => {
      // Serialize the whole read, including JSON parsing, to prevent old polls
      // from replacing a newer remote-character snapshot on slow connections.
      if (!active || loading) return;
      loading = true;
      try {
        const response = await fetch("/api/room/characters", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as { users?: OnlineUser[] };
        if (!active) return;
        const users = body.users ?? [];
        setOnlineUsers(users);
        if (!auth.user) initializedProfile.current = null;
        else if (ready && initializedProfile.current !== auth.user) {
          const own = users.find((user) => user.userId === auth.user?.id);
          if (own) {
            presence.current = { x: own.x, z: own.z, action: "idle" };
            setSceneStart({ x: own.x, z: own.z });
            initializedProfile.current = auth.user;
            setRestoredUser(auth.user);
          }
        }
      } catch { /* retry on the next interval */ }
      finally { loading = false; }
    };
    const publishPresence = () => {
      if (!active || !ready || !auth.user || initializedProfile.current !== auth.user) return;
      const current = presence.current;
      void fetch("/api/room/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current), keepalive: true });
    };
    void loadCharacters().then(publishPresence);
    const listTimer = window.setInterval(() => void loadCharacters(), 5000);
    if (!ready || !auth.user) return () => { active = false; controller.abort(); clearInterval(listTimer); };
    const presenceTimer = window.setInterval(publishPresence, 2500);
    return () => {
      active = false;
      controller.abort();
      clearInterval(listTimer);
      clearInterval(presenceTimer);
      void fetch("/api/room/presence", { method: "DELETE", keepalive: true });
    };
  }, [auth.user, ready]);

  const selectedUserId = selectedUser?.userId;
  useEffect(() => {
    if (!selectedUserId) return;
    let active = true;
    fetch(`/api/room/users/${selectedUserId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { user?: UserCard };
        if (!response.ok || !body.user) throw new Error("Não foi possível carregar o perfil agora.");
        if (active) setSelectedUser(body.user);
      })
      .catch(() => { if (active) setLeaderError("Não foi possível carregar o perfil agora."); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [selectedUserId]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const scope = sendScope.current;
    if (!ready || !scope?.active || scope.sending || chatSending) return;
    const text = chatText.trim().slice(0, 100);
    if (!text) return;
    scope.sending = true;
    setChatSending(true);
    setChatError("");
    try {
      const response = await fetch("/api/rooms/dtec/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      if (!scope.active) return;
      if (!response.ok) throw new Error("Não foi possível enviar a mensagem.");
      const body = await response.json() as { message: ChatMessage };
      if (!scope.active) return;
      // Ignore any snapshot that began before this confirmed send.
      chatRevision.current++;
      setMessages((current) => [...current.filter((message) => message.id !== body.message.id), body.message].slice(-5));
      setBubble(body.message.text);
      setChatText("");
      setAction("wave");
      if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => {
        bubbleTimer.current = null;
        setBubble(""); setAction((current) => current === "wave" ? "idle" : current);
      }, 5000);
    } catch (error) {
      if (scope.active) setChatError(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally { scope.sending = false; if (scope.active) setChatSending(false); }
  };

  const toggleLeader = async () => {
    if (!selectedUser || !canManageRoomRoles) return;
    setLeaderError("");
    const isLeader = selectedUser.role !== "leader";
    try {
      const response = await fetch(`/api/room/users/${selectedUser.userId}/leader`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isLeader }) });
      if (!response.ok) throw new Error("Não foi possível atualizar o papel MOD.");
      const role = isLeader ? "leader" : "member";
      setSelectedUser({ ...selectedUser, role });
      setOnlineUsers((users) => users.map((user) => user.userId === selectedUser.userId ? { ...user, role } : user));
    } catch (error) { setLeaderError(error instanceof Error ? error.message : "Falha ao atualizar."); }
  };

  const chooserOpen = auth.state === "authenticated-needs-profile" || creatorOpen;
  const remoteUsers = onlineUsers.filter((user) => user.userId !== auth.user?.id).map((user) => ({
    ...user,
    message: [...messages].reverse().find((message) => message.authorId === user.userId && Date.now() - Date.parse(message.createdAt) < 5000)?.text ?? "",
  }));
  const ownBirthdayToday = Boolean(auth.user && onlineUsers.find((user) => user.userId === auth.user?.id)?.birthdayToday);
  const onlineCount = onlineUsers.filter((user) => user.online).length;

  return <main ref={chatRootRef} className={`app-shell ${chatStyles.shell}`}>
    <OfficeScene name={sceneName} avatar={sceneAvatar} action={action} message={bubble} created={ready && Boolean(auth.user) && restoredUser === auth.user} initialPosition={sceneStart} remoteUsers={remoteUsers} birthdayToday={ownBirthdayToday} positionOwnerId={auth.user?.id ?? "visitor"} onStateChange={updatePresence} onCharacterClick={characterClick} onMuralClick={muralClick} />
    <div className="shade" />
    <nav className="legal-links" aria-label="Informações legais"><Link href="/politica-de-privacidade">Privacidade</Link><span aria-hidden="true">·</span><Link href="/termos-de-servico">Termos</Link></nav>
    <header className="topbar">
      <div className="brand">DTEC</div><span className="divider" />
      <div className="online-area">
        <button className="online" type="button" aria-expanded={onlineOpen} onClick={() => { setOnlineOpen((open) => !open); setAccountOpen(false); }}>
          <Users size={23} /><b>•</b><span>{onlineCount} na sala</span><ChevronDown size={15} />
        </button>
        {onlineOpen && <section className="online-menu" aria-label="Pessoas online"><header><strong>Na sala agora</strong><button aria-label="Fechar lista" onClick={() => setOnlineOpen(false)}><X size={16} /></button></header>
          {onlineCount === 0 ? <p className="online-empty">Aguardando colegas entrarem…</p> : <ul>{onlineUsers.filter((user) => user.online).map((user) => <li key={user.userId}><button type="button" onClick={() => { setOnlineOpen(false); if (auth.state === "anonymous") { setLoginPromptOpen(true); return; } if (!ready) return; setSelectedUser({ ...user, title: user.title ?? "", role: user.role ?? "member", bio: "", birthDayMonth: null, whatsapp: "" }); setProfileLoading(true); setLeaderError(""); }}><span className="online-marker">{roleLabel(user.role ?? "member") === "ADM" && <span className="online-role-badge"><Crown size={13} aria-hidden="true" />{roleLabel(user.role ?? "member")}</span>}{user.name}{roleLabel(user.role ?? "member") === "MOD" && <span className="online-role-badge"><Star size={13} aria-hidden="true" />{roleLabel(user.role ?? "member")}</span>}{user.userId === auth.user?.id ? " (você)" : ""}</span>{user.title && <small>[{user.title}]</small>}</button></li>)}</ul>}
        </section>}
      </div>
      <div className="top-actions"><button aria-label="Tela cheia" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize /></button><button aria-label="Ajuda" onClick={() => setControlsOpen(ready)}><HelpCircle /></button>
        {auth.state === "anonymous" && <a className="profile google-entry" aria-label="Entrar com Google" href="/auth/login?next=/dtec"><i className="google-logo" style={{ backgroundImage: 'url("https://img.icons8.com/color/1200/google-logo.jpg")' }} aria-hidden="true" /><span className="login-label">Entrar</span></a>}
        {ready && <button className="profile google-entry google-account-entry" type="button" aria-label={`Perfil de ${sceneName.trim().split(/\s+/)[0]}`} aria-expanded={accountOpen} onClick={() => { setAccountOpen((open) => !open); setOnlineOpen(false); }}><span className="google-account-photo">{googlePhoto ? <Image src={googlePhoto} alt="" width={36} height={36} unoptimized referrerPolicy="no-referrer" /> : <i className="google-account-fallback" aria-hidden="true">{sceneName.slice(0, 1).toUpperCase()}</i>}</span><span className="login-label">{sceneName.trim().split(/\s+/)[0]}</span><ChevronDown size={15} aria-hidden="true" /></button>}
      </div>
    </header>
    {auth.error && <div className="auth-notice" role="status">{auth.error}<button aria-label="Fechar aviso" onClick={auth.clearError}>×</button></div>}
    {accountOpen && ready && <div className="account-menu"><strong>{sceneName}</strong><small>{auth.user?.email}</small><button onClick={editProfile}>Meu avatar e perfil</button><Link href="/?create=1" className="account-menu-link">Criar meu CuboChat</Link><button type="button" disabled title="Instalação do aplicativo em preparação">Instalar aplicativo <small>Em breve</small></button><button onClick={() => { setAccountOpen(false); setChatOpen(false); setControlsOpen(false); void auth.signOut(); }}>Sair da conta</button></div>}
    {ready && <nav className="actionbar" aria-label="Ações do personagem"><button onClick={() => setAction(action === "dance" ? "idle" : "dance")}>{action === "dance" ? "Parar" : "Dançar"}</button><button onClick={() => setChatOpen((open) => !open)}>Conversar</button><button onClick={editProfile}>Meu avatar</button></nav>}
    {chatOpen && ready && <form className={`chat-pop ${chatStyles.composer}`} aria-label="Conversar na sala" onSubmit={(event) => void sendMessage(event)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setChatOpen(false); } }}><strong className={chatStyles.title}>Conversar</strong><input value={chatText} onChange={(event) => setChatText(event.target.value)} onFocus={chatOnFocus} onBlur={chatOnBlur} aria-label="Mensagem" autoComplete="off" enterKeyHint="send" placeholder="Digite uma mensagem…" maxLength={100} /><button disabled={chatSending || !chatText.trim()}>{chatSending ? "Enviando…" : "Enviar"}</button><button type="button" className={chatStyles.close} aria-label="Fechar conversa" onClick={() => setChatOpen(false)}><X size={16} /></button>{chatError && <small role="alert">{chatError}</small>}</form>}
    {messages.length > 0 && <aside className="chat-history" aria-label="Últimas mensagens"><h3>Conversas recentes</h3>{messages.map((message) => <p key={message.id}><strong>{message.name}</strong><span>{message.text}</span></p>)}</aside>}
    {controlsOpen && ready && <div className="avatar-pop"><button className="close-mini" onClick={() => setControlsOpen(false)}><X /></button><strong>{sceneName}</strong><small>Você assumiu o controle.</small><p>Clique no chão para caminhar.</p><button onClick={() => setAction(action === "dance" ? "idle" : "dance")}>Dançar</button><button onClick={editProfile}>Editar personagem</button></div>}
    <Dialog open={loginPromptOpen} onOpenChange={setLoginPromptOpen}><DialogContent className="login-prompt-dialog" showCloseButton={false}><button type="button" className="login-prompt-close" aria-label="Fechar" onClick={() => setLoginPromptOpen(false)}><X size={17} /></button><DialogHeader><DialogTitle>Entre para interagir com a sala</DialogTitle><DialogDescription>Faça login com Google para conversar, movimentar seu personagem e ver os detalhes dos colegas.</DialogDescription></DialogHeader><a className="login-prompt-google" href="/auth/login?next=/dtec"><i className="google-logo" aria-hidden="true" />Entrar com Google</a></DialogContent></Dialog>
    <Dialog open={chooserOpen} onOpenChange={(open) => { if (auth.state !== "authenticated-needs-profile") setCreatorOpen(open); }}>
      <DialogContent className="creator-dialog" overlayClassName="creator-overlay"><DialogHeader><DialogTitle>{auth.profile ? "Edite seu perfil" : "Complete seu perfil DTEC"}</DialogTitle><DialogDescription>{auth.profile ? "Atualize as informações que seus colegas veem na sala." : "Confira seu nome e escolha como aparecerá no escritório."}</DialogDescription></DialogHeader>
        {!auth.profile && <div className="google-profile-card">{googlePhoto ? <span className="google-profile-photo" role="img" aria-label="Foto da sua conta Google" style={{ backgroundImage: `url("${googlePhoto}")` }} /> : <span className="google-profile-photo google-profile-fallback">{googleAccountName.slice(0, 1).toUpperCase()}</span>}<span><strong>{googleAccountName}</strong><small>Conta Google conectada</small></span></div>}
        <div className="profile-form-scroll"><label>Nome e sobrenome<input value={name === "Você" ? "" : name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Bruno Leão" maxLength={48} autoComplete="name" /><small>Use dois nomes. Você pode acrescentar uma função abaixo.</small></label>
          <label>Descrição ou cargo <span className="optional-label">opcional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Infraestrutura, Chefe, Apt 201" maxLength={48} /></label>
          <label>Aniversário <span className="optional-label">opcional · somente dia e mês</span><input type="text" inputMode="numeric" autoComplete="off" placeholder="DD/MM" maxLength={5} value={birthDayMonth} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 4); setBirthDayMonth(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits); }} /><small>Não pedimos nem guardamos o ano.</small></label>
          <label>WhatsApp <span className="optional-label">opcional</span><input type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="DDD + número" maxLength={20} autoComplete="tel" /><small>Se não informar o DDI, usaremos +55 para criar o link.</small></label>
          <label>Biografia <span className="optional-label">opcional</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Conte um pouco sobre você…" maxLength={280} rows={3} /></label>
        </div>
        <div className="avatar-grid">{avatars.map((id, index) => <button key={id} type="button" aria-label={`Personagem ${index + 1}`} className={avatar === id ? "selected" : ""} onClick={() => setAvatar(id)}><AvatarPreview model={id} /><b>{index + 1}</b></button>)}</div>
        {saveError && <p className="save-error" role="alert">{saveError}</p>}
        <button className="primary" onClick={() => void save()} disabled={saving}>{saving ? "Salvando…" : auth.profile ? "Salvar perfil" : "Entrar na sala"}</button>
      </DialogContent>
    </Dialog>
    {selectedUser && <Dialog open onOpenChange={(open) => { if (!open) setSelectedUser(null); }}><DialogContent className="person-dialog" showCloseButton={false}><DialogHeader><DialogTitle className="sr-only">Perfil de {selectedUser.name}</DialogTitle><DialogDescription className="sr-only">Informações do colega online.</DialogDescription></DialogHeader>
      <button type="button" className="person-close" aria-label="Fechar perfil" onClick={() => setSelectedUser(null)}><X size={17} /></button>
      <div className="person-identity"><AvatarPreview model={selectedUser.avatar} headOnly /><div><h2>{selectedUser.role === "owner" && <><Crown size={17} aria-hidden="true" />{roleLabel(selectedUser.role)} </>}{selectedUser.name}{selectedUser.role === "leader" && <> <Star size={17} aria-hidden="true" />{roleLabel(selectedUser.role)}</>}</h2>{selectedUser.title && <span>{selectedUser.title}</span>}</div></div>
      {profileLoading ? <p className="person-loading">Carregando perfil…</p> : <div className="person-details">{selectedUser.birthDayMonth && <p><strong>Aniversário</strong><span>{displayBirthday(selectedUser.birthDayMonth)}</span></p>}{selectedUser.bio && <p><strong>Sobre</strong><span>{selectedUser.bio}</span></p>}
        {selectedUser.whatsapp && <a className="whatsapp-link" href={`https://wa.me/${selectedUser.whatsapp.length <= 11 ? `55${selectedUser.whatsapp}` : selectedUser.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {!selectedUser.birthDayMonth && !selectedUser.bio && !selectedUser.whatsapp && <p className="person-empty">Esta pessoa ainda não preencheu outras informações.</p>}
      </div>}
      {canManageRoomRoles && selectedUser.role !== "owner" && <button className="leader-toggle" onClick={() => void toggleLeader()}>{selectedUser.role === "leader" ? "Remover MOD" : "⭐ Designar MOD"}</button>}
      {leaderError && <p className="person-error" role="alert">{leaderError}</p>}
    </DialogContent></Dialog>}
    {activeMural && <MuralWindow key={activeMural} muralId={activeMural} currentUserId={auth.user?.id ?? null} isAdminOrMod={isAdminOrMod} onClose={() => setActiveMural(null)} />}
  </main>;
}
